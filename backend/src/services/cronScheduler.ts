import { prisma } from "../lib/prisma";
import { runPythonSocialScraper } from "./pythonScraperService";
import { runManualScrapePipeline } from "../routes/manualScraper";
import { runSearchScanForOrg } from "../routes/googleScraper";
import { analyzeBacklog, sendPendingAlerts } from "./pipelineService";
import { isSmtpConfigured } from "./emailService";
import { env } from "../config/env";

export interface CronLog {
  timestamp: string;
  platform: string;
  keyword: string;
  status: "SUCCESS" | "FAILED";
  newItems: number;
  message: string;
}

const HOURLY_MS = 60 * 60 * 1000;
const MAX_LOGS_PER_ORG = 100;

let cronTimer: NodeJS.Timeout | null = null;
let globalRunning = false;
let lastCronRunAt: Date | null = null;
let nextCronRunAt: Date | null = null;

// Logs and "running" flags are kept per tenant so one tenant never sees another's keywords.
const logsByOrg = new Map<string, CronLog[]>();
const runningOrgs = new Set<string>();

function pushLog(orgId: string, platform: string, keyword: string, status: CronLog["status"], newItems: number, message: string) {
  const list = logsByOrg.get(orgId) ?? [];
  list.push({ timestamp: new Date().toISOString(), platform, keyword, status, newItems, message });
  if (list.length > MAX_LOGS_PER_ORG) list.splice(0, list.length - MAX_LOGS_PER_ORG);
  logsByOrg.set(orgId, list);
}

/** Milliseconds until the next top of the hour, so runs land on :00 regardless of boot time. */
function msUntilNextHour(): number {
  return HOURLY_MS - (Date.now() % HOURLY_MS);
}

function scheduleNextRun() {
  const delay = msUntilNextHour();
  nextCronRunAt = new Date(Date.now() + delay);
  cronTimer = setTimeout(async () => {
    try {
      await executeHourlyScrapeCycle();
    } catch (err: any) {
      console.error("⚠ [Cron] Cycle crashed:", err?.message || err);
    } finally {
      if (cronTimer) scheduleNextRun();
    }
  }, delay);
}

export function startHourlyScraperCron() {
  if (cronTimer) return;
  scheduleNextRun();
  console.log(`⏰ Hourly monitoring cron started. Next run: ${nextCronRunAt?.toISOString()}`);
}

export function stopHourlyScraperCron() {
  if (cronTimer) {
    clearTimeout(cronTimer);
    cronTimer = null;
    nextCronRunAt = null;
  }
}

export function getCronStatus(orgId: string) {
  return {
    isRunning: runningOrgs.has(orgId),
    cronEnabled: cronTimer !== null,
    lastCronRunAt,
    nextCronRunAt,
    logs: (logsByOrg.get(orgId) ?? []).slice(-20),
  };
}

/** Scrapes every enabled keyword card for one tenant, then its brand search scan. */
export async function runOrganizationCycle(orgId: string) {
  if (runningOrgs.has(orgId)) {
    return { ok: false, message: "A scan is already in progress for your workspace.", newItems: 0 };
  }
  runningOrgs.add(orgId);

  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { brandName: true } });
    const cards = await prisma.platformKeyword.findMany({ where: { organizationId: orgId, enabled: true } });
    let totalNewItems = 0;

    for (const card of cards) {
      try {
        const rawItems = await runPythonSocialScraper({ keyword: card.keyword, url: card.searchUrl || undefined, limit: 100, platform: card.platform as any });
        const result = await runManualScrapePipeline(orgId, card.keyword, card.platform, rawItems);
        const newCount = (result.postsCreated || 0) + (result.commentsCreated || 0);
        totalNewItems += newCount;
        await prisma.platformKeyword.update({ where: { id: card.id }, data: { lastRunAt: new Date() } });
        pushLog(orgId, card.platform, card.keyword, "SUCCESS", newCount,
          `Added ${newCount} new mentions (${(result.postsSkippedExisting ?? 0) + (result.commentsSkippedExisting ?? 0)} already known).`);
      } catch (err: any) {
        pushLog(orgId, card.platform, card.keyword, "FAILED", 0, err?.message || "Scrape failed.");
      }
    }

    // Brand search scan (Google / Bing / YouTube / News) when the platform has a search key.
    if (org?.brandName && env.SERPER_API_KEY) {
      try {
        const { ingest } = await runSearchScanForOrg(orgId, org.brandName);
        totalNewItems += ingest.postsCreated;
        pushLog(orgId, "search", org.brandName, "SUCCESS", ingest.postsCreated,
          `Added ${ingest.postsCreated} new search mentions (${ingest.postsSkipped} already known, ${ingest.analyzed} analyzed).`);
      } catch (err: any) {
        pushLog(orgId, "search", org.brandName, "FAILED", 0, err?.message || "Search scan failed.");
      }
    }

    // Anything left unanalyzed for this tenant (earlier failures, rate limits, restarts).
    try {
      const backlog = await analyzeBacklog(200, orgId);
      if (backlog.total > 0) {
        pushLog(orgId, "ai", "backlog", backlog.analyzed === 0 && backlog.failed > 0 ? "FAILED" : "SUCCESS", backlog.analyzed,
          `Analyzed ${backlog.analyzed}/${backlog.total} pending items.`);
      }
    } catch (err: any) {
      pushLog(orgId, "ai", "backlog", "FAILED", 0, err?.message || "Backlog analysis failed.");
    }

    // Alerts whose email never went out.
    try {
      if (await isSmtpConfigured()) {
        const alerts = await sendPendingAlerts(50, orgId);
        if (alerts.pending > 0) {
          pushLog(orgId, "email", "alerts", alerts.sent < alerts.pending ? "FAILED" : "SUCCESS", alerts.sent,
            `Sent ${alerts.sent}/${alerts.pending} pending negative-mention alerts.`);
        }
      }
    } catch (err: any) {
      pushLog(orgId, "email", "alerts", "FAILED", 0, err?.message || "Alert delivery failed.");
    }

    return { ok: true, message: `Cycle complete. ${totalNewItems} new mentions found.`, newItems: totalNewItems };
  } finally {
    runningOrgs.delete(orgId);
  }
}

/** The hourly tick: every organization that has something to monitor, one after another. */
export async function executeHourlyScrapeCycle() {
  if (globalRunning) {
    console.log("⏰ [Cron] Skipped: previous cycle still running.");
    return;
  }
  globalRunning = true;
  lastCronRunAt = new Date();

  try {
    const orgs = await prisma.organization.findMany({
      where: { OR: [{ platformKeywords: { some: { enabled: true } } }, { brandName: { not: "" } }] },
      select: { id: true, name: true },
    });
    console.log(`⏰ [Cron] Running cycle for ${orgs.length} organization(s).`);
    for (const org of orgs) {
      try {
        const r = await runOrganizationCycle(org.id);
        console.log(`✓ [Cron] ${org.name}: ${r.message}`);
      } catch (err: any) {
        console.error(`⚠ [Cron] ${org.name} failed:`, err?.message || err);
      }
    }
  } finally {
    globalRunning = false;
  }
}
