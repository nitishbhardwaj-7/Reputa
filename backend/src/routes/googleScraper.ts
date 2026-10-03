import { assertCanScan, assertFeature } from "../services/billingService";
import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import { prisma } from "../lib/prisma";
import { buildSourceKey } from "../lib/hash";
import { boundedRaw } from "../lib/raw";
import { ProcessingStatus } from "../types/status";
import { analyzePost, upsertKeyword } from "../services/pipelineService";
import { generateGoogleExcelReport, GoogleExportItem, GoogleExcelExportOptions } from "../services/excelService";
import { orgOf } from "../middleware/auth";
import { env } from "../config/env";

export const googleScraperRouter = Router();
export const GOOGLE_SOURCE = "google";

const scriptPath = path.resolve(__dirname, "../../scripts/google_scraper.py");
const pythonCmd = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");

/**
 * google_scraper.py keeps its own dedupe cache in MongoDB. Each tenant gets its own
 * database there so one tenant's "already seen" never hides a result from another.
 */
function pythonEnvFor(orgId: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    MONGODB_URI: env.MONGODB_URI,
    MONGODB_DB: `${env.MONGODB_DB}_${orgId}`,
    SERPER_API_KEY: env.SERPER_API_KEY,
  };
}

export function runPythonCommand(orgId: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, [scriptPath, ...args], { env: pythonEnvFor(orgId) });
    let stdoutData = "";
    let stderrData = "";
    proc.stdout.on("data", (chunk) => (stdoutData += chunk.toString("utf-8")));
    proc.stderr.on("data", (chunk) => (stderrData += chunk.toString("utf-8")));
    proc.on("error", (err) => reject(new Error(`Failed to start python process: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Search scan exited with code ${code}. ${stderrData.slice(0, 400)}`));
      try {
        const trimmed = stdoutData.trim();
        resolve(trimmed ? JSON.parse(trimmed) : {});
      } catch (err: any) {
        reject(new Error(`Failed to parse scan output: ${err.message}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Per-tenant scan state + SSE subscribers
// ---------------------------------------------------------------------------

interface ScanState {
  running: boolean;
  log: string[];
  finished: string | null;
  error: string | null;
  added: number;
}

const scanStates = new Map<string, ScanState>();
const sseClients = new Map<string, Response[]>();

function stateFor(orgId: string): ScanState {
  let s = scanStates.get(orgId);
  if (!s) {
    s = { running: false, log: [], finished: null, error: null, added: 0 };
    scanStates.set(orgId, s);
  }
  return s;
}

function broadcast(orgId: string, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients.get(orgId) ?? []) {
    try { res.write(payload); } catch { /* client gone */ }
  }
}

function safeParseDate(val: any, snippetFallback?: string): Date | null {
  let str = (typeof val === "string" ? val : "").trim();
  if (!str && snippetFallback) {
    const prefix = snippetFallback.match(/^([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*[—\-–.]/);
    if (prefix) str = prefix[1].trim();
    else {
      const rel = snippetFallback.match(/^(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)\s*[—\-–.]/i);
      if (rel) str = rel[1].trim();
    }
  }
  if (!str) return null;

  const relMatch = str.toLowerCase().match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const now = new Date();
    if (unit === "second") now.setSeconds(now.getSeconds() - num);
    else if (unit === "minute") now.setMinutes(now.getMinutes() - num);
    else if (unit === "hour") now.setHours(now.getHours() - num);
    else if (unit === "day") now.setDate(now.getDate() - num);
    else if (unit === "week") now.setDate(now.getDate() - num * 7);
    else if (unit === "month") now.setMonth(now.getMonth() - num);
    else if (unit === "year") now.setFullYear(now.getFullYear() - num);
    return now;
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** A stored Google-sourced Post rendered in the shape the search page expects. */
function toGoogleMention(post: any) {
  let raw: any = {};
  try { raw = post.rawItem ? JSON.parse(post.rawItem) : {}; } catch { raw = {}; }
  const text: string = post.text || "";
  const splitIdx = text.indexOf("\n\n");
  return {
    id: post.id,
    url: post.url || raw.url || "",
    title: raw.title || (splitIdx > 0 ? text.slice(0, splitIdx) : text).slice(0, 300),
    snippet: raw.snippet ?? (splitIdx > 0 ? text.slice(splitIdx + 2) : ""),
    domain: post.author || raw.domain || "",
    platform: raw.platform || post.platform || "Web",
    engine: raw.engine,
    query: raw.query,
    published: post.publishedAt ? post.publishedAt.toISOString() : raw.published || "",
    first_seen: post.createdAt ? post.createdAt.toISOString() : raw.first_seen || "",
    sentiment: post.sentiment,
    confidence: post.confidence,
    keyword: post.keyword?.term,
  };
}

export async function fetchGoogleMentions(orgId: string, platform = "All", query = "", limit = 2000) {
  const base = { organizationId: orgId, source: GOOGLE_SOURCE, isCompetitor: false };
  const where: any = { ...base };
  if (platform && platform.toLowerCase() !== "all") where.platform = { equals: platform, mode: "insensitive" };
  if (query && query.trim()) {
    const q = query.trim();
    where.OR = [
      { text: { contains: q, mode: "insensitive" } },
      { url: { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total, byPlatform, org] = await Promise.all([
    prisma.post.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 5000), include: { keyword: { select: { term: true } } } }),
    prisma.post.count({ where: base }),
    prisma.post.groupBy({ by: ["platform"], where: base, _count: true }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { brandName: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of byPlatform) {
    const label = row.platform ? row.platform.charAt(0).toUpperCase() + row.platform.slice(1) : "Web";
    counts[label] = (counts[label] || 0) + row._count;
  }

  const mentions = rows.map(toGoogleMention);
  return { brand: org?.brandName ?? "", total, shown: mentions.length, counts, mentions };
}

/** Ingests SERP items as Posts for one tenant and analyzes the new ones. */
export async function autoIngestGoogleItems(orgId: string, items: any[], keyword: string) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: true, keyword, itemsReceived: 0, postsCreated: 0, postsSkipped: 0, analyzed: 0, failed: 0, message: "Nothing to ingest." };
  }

  const term = keyword.trim();
  const dbKeyword = await upsertKeyword(orgId, term);
  const scrapeRun = await prisma.scrapeRun.create({
    data: { organizationId: orgId, keywordId: dbKeyword.id, status: ProcessingStatus.RECEIVED, rawResponse: boundedRaw(items), itemCount: items.length },
  });

  let postsCreated = 0;
  let postsSkipped = 0;
  const createdPostIds: string[] = [];

  for (const item of items) {
    const sourceKey = buildSourceKey({
      keyword: term, type: "post",
      id: item.id || item.norm_url || item.url, url: item.url,
      text: item.snippet || item.title, author: item.domain || "google",
    });

    const existing = await prisma.post.findFirst({
      where: { organizationId: orgId, OR: [{ sourceKey }, { AND: [{ keywordId: dbKeyword.id }, { url: item.url, NOT: { url: null } }] }] },
    });
    if (existing) { postsSkipped++; continue; }

    const created = await prisma.post.create({
      data: {
        organizationId: orgId,
        sourceKey,
        keywordId: dbKeyword.id,
        scrapeRunId: scrapeRun.id,
        platform: String(item.platform || "Web").toLowerCase(),
        text: `${item.title || ""}\n\n${item.snippet || ""}`.trim(),
        url: item.url || null,
        author: item.domain || null,
        publishedAt: safeParseDate(item.published, item.snippet),
        rawItem: JSON.stringify(item),
        status: ProcessingStatus.RECEIVED,
        source: GOOGLE_SOURCE,
      },
    });
    postsCreated++;
    createdPostIds.push(created.id);
  }

  let analyzed = 0;
  let failed = 0;
  for (const id of createdPostIds) (await analyzePost(id)) ? analyzed++ : failed++;

  await prisma.scrapeRun.update({ where: { id: scrapeRun.id }, data: { status: ProcessingStatus.ANALYZED, completedAt: new Date() } });

  return { ok: true, keyword: term, itemsReceived: items.length, postsCreated, postsSkipped, analyzed, failed, message: `Ingested ${postsCreated} new mention(s).` };
}

/** Runs a full search scan for a tenant and ingests the results. Used by the cron and the manual trigger. */
export async function runSearchScanForOrg(orgId: string, keyword: string, engine?: string, onLog?: (line: string) => void) {
  const args = ["--action", "scan", "--json", "--keyword", keyword];
  if (engine && engine !== "all") args.push("--engine", engine);

  const items: any[] = await new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, [scriptPath, ...args], { env: pythonEnvFor(orgId) });
    let stdoutData = "";
    proc.stdout.on("data", (chunk) => (stdoutData += chunk.toString("utf-8")));
    proc.stderr.on("data", (chunk) => {
      for (const line of chunk.toString("utf-8").split(/\r?\n/).filter(Boolean)) onLog?.(line);
    });
    proc.on("error", (err) => reject(new Error(`Failed to start scan: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Scan exited with code ${code}`));
      try { resolve(JSON.parse(stdoutData.trim() || "[]")); } catch (e: any) { reject(new Error(`Bad scan output: ${e.message}`)); }
    });
  });

  const ingest = await autoIngestGoogleItems(orgId, Array.isArray(items) ? items : [], keyword);
  return { items: Array.isArray(items) ? items : [], ingest };
}

// GET /mentions?platform=&q=&limit=
googleScraperRouter.get("/mentions", async (req, res, next) => {
  try {
    const platform = String(req.query.platform ?? "All");
    const query = String(req.query.q ?? req.query.query ?? "");
    const limit = Number(req.query.limit) || 2000;
    res.json(await fetchGoogleMentions(orgOf(req), platform, query, limit));
  } catch (err) {
    next(err);
  }
});

// GET /stats
googleScraperRouter.get("/stats", async (req, res, next) => {
  try {
    const { total, counts } = await fetchGoogleMentions(orgOf(req), "All", "", 1);
    res.json({ total, counts });
  } catch (err) {
    next(err);
  }
});

// GET /stream — SSE of scan progress for this tenant.
googleScraperRouter.get("/stream", (req: Request, res: Response) => {
  const orgId = orgOf(req);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const list = sseClients.get(orgId) ?? [];
  list.push(res);
  sseClients.set(orgId, list);

  res.write(`event: hello\ndata: ${JSON.stringify(stateFor(orgId))}\n\n`);

  req.on("close", () => {
    const current = sseClients.get(orgId) ?? [];
    const idx = current.indexOf(res);
    if (idx !== -1) current.splice(idx, 1);
  });
});

// POST /scan { keyword?, engine? }
googleScraperRouter.post("/scan", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const state = stateFor(orgId);
    if (state.running) return res.status(409).json({ error: "A scan is already running." });
    await assertFeature(orgId, "searchScanning");
    await assertCanScan(orgId);

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { brandName: true } });
    const { keyword, engine } = req.body ?? {};
    const term = typeof keyword === "string" && keyword.trim() ? keyword.trim() : org?.brandName ?? "";
    if (!term) return res.status(400).json({ error: "Set your brand name in Settings or provide a keyword." });

    state.running = true;
    state.log = [];
    state.finished = null;
    state.error = null;
    state.added = 0;
    broadcast(orgId, "start", { running: true, log: [] });
    res.json({ ok: true, message: "Scan started." });

    // Runs asynchronously; progress is streamed over SSE.
    runSearchScanForOrg(orgId, term, typeof engine === "string" ? engine : undefined, (line) => {
      state.log.push(line);
      if (state.log.length > 50) state.log.shift();
      broadcast(orgId, "log", { line });
    })
      .then(async ({ items, ingest }) => {
        state.added = items.length;
        items.forEach((item) => broadcast(orgId, "mention", item));
        broadcast(orgId, "log", { line: `[SYS] Ingested ${ingest.postsCreated} new mention(s), ${ingest.analyzed} analyzed.` });
        const stats = await fetchGoogleMentions(orgId, "All", "", 1).catch(() => null);
        if (stats) broadcast(orgId, "stats", { total: stats.total, counts: stats.counts });
      })
      .catch((err: any) => {
        state.error = err?.message || "Scan failed.";
      })
      .finally(() => {
        state.running = false;
        state.finished = new Date().toISOString();
        broadcast(orgId, "done", { running: false, error: state.error, added: state.added, finished: state.finished, log: state.log });
      });
  } catch (err) {
    stateFor(orgOf(req)).running = false;
    next(err);
  }
});

// POST /export-excel { items?, filters? }
googleScraperRouter.post("/export-excel", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    await assertFeature(orgId, "exports");
    const { items, filters } = req.body ?? {};
    let exportItems: GoogleExportItem[] = Array.isArray(items) ? items : [];
    if (exportItems.length === 0) {
      const result = await fetchGoogleMentions(orgId, String(filters?.platform ?? "All"), String(filters?.query ?? filters?.q ?? ""), Number(filters?.limit) || 5000);
      exportItems = result.mentions as GoogleExportItem[];
    }
    const options: GoogleExcelExportOptions = {
      platform: filters?.platform || "All",
      dateRangeLabel: filters?.dateRangeLabel,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
      query: filters?.query,
    };
    sendXlsx(res, await generateGoogleExcelReport(exportItems, options), options.platform || "All");
  } catch (err) {
    next(err);
  }
});

// GET /export-excel?platform=&q=&dateFrom=&dateTo=
googleScraperRouter.get("/export-excel", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    await assertFeature(orgId, "exports");
    const platform = String(req.query.platform ?? "All");
    const query = String(req.query.q ?? req.query.query ?? "");
    const exportItems = (await fetchGoogleMentions(orgId, platform, query, Number(req.query.limit) || 5000)).mentions as GoogleExportItem[];
    const buffer = await generateGoogleExcelReport(exportItems, {
      platform,
      dateRangeLabel: req.query.dateRangeLabel ? String(req.query.dateRangeLabel) : undefined,
      dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
      dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
      query,
    });
    sendXlsx(res, buffer, platform);
  } catch (err) {
    next(err);
  }
});

function sendXlsx(res: Response, buffer: Buffer, platform: string) {
  const safePlat = platform.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Search_Mentions_${safePlat}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}
