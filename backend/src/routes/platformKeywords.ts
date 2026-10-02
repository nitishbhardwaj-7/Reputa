import { Router } from "express";
import { prisma } from "../lib/prisma";
import { runPythonSocialScraper } from "../services/pythonScraperService";
import { runManualScrapePipeline, isScraperPlatform } from "./manualScraper";
import { getCronStatus, runOrganizationCycle } from "../services/cronScheduler";
import { orgOf } from "../middleware/auth";
import { SCRAPER_PLATFORMS } from "../services/queryService";

export const platformKeywordsRouter = Router();

export function defaultSearchUrl(platform: string, keyword: string): string {
  const encoded = encodeURIComponent(keyword);
  switch (platform) {
    case "quora": return `https://www.quora.com/search?q=${encoded}`;
    case "teamblind": return `https://www.teamblind.com/search/${encoded}`;
    case "trustpilot": {
      const domain = keyword.replace(/^https?:\/\//, "").replace("www.trustpilot.com/review/", "").split("/")[0];
      return `https://www.trustpilot.com/review/${domain}`;
    }
    case "linkedin": return `https://www.linkedin.com/search/results/content/?keywords=${encoded}`;
    default: return `https://www.reddit.com/search/?type=comments&q=${encoded}&sort=relevance&safe=0`;
  }
}

// GET / — this tenant's keyword cards
platformKeywordsRouter.get("/", async (req, res, next) => {
  try {
    const cards = await prisma.platformKeyword.findMany({ where: { organizationId: orgOf(req) }, orderBy: { createdAt: "desc" } });
    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

// POST / { platform, keyword, searchUrl? }
platformKeywordsRouter.post("/", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const { platform, keyword, searchUrl } = req.body ?? {};
    const cleanPlatform = String(platform ?? "").toLowerCase().trim();
    const cleanKeyword = typeof keyword === "string" ? keyword.trim() : "";
    if (!cleanKeyword) return res.status(400).json({ error: "A keyword is required." });
    if (!isScraperPlatform(cleanPlatform)) {
      return res.status(400).json({ error: `Platform must be one of: ${SCRAPER_PLATFORMS.join(", ")}.` });
    }

    const created = await prisma.platformKeyword.create({
      data: {
        organizationId: orgId,
        platform: cleanPlatform,
        keyword: cleanKeyword,
        searchUrl: typeof searchUrl === "string" && searchUrl.trim() ? searchUrl.trim() : defaultSearchUrl(cleanPlatform, cleanKeyword),
        enabled: true,
      },
    });
    res.status(201).json({ ok: true, card: created });
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(409).json({ error: "This keyword is already tracked on that platform." });
    next(err);
  }
});

// POST /bulk { keyword, platforms: string[] } — onboarding convenience
platformKeywordsRouter.post("/bulk", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const { keyword, platforms } = req.body ?? {};
    const cleanKeyword = typeof keyword === "string" ? keyword.trim() : "";
    const list: string[] = Array.isArray(platforms) ? platforms.map((p) => String(p).toLowerCase().trim()) : [];
    if (!cleanKeyword || list.length === 0) return res.status(400).json({ error: "A keyword and at least one platform are required." });

    const created = [];
    for (const platform of list) {
      if (!isScraperPlatform(platform)) continue;
      try {
        created.push(
          await prisma.platformKeyword.create({
            data: { organizationId: orgId, platform, keyword: cleanKeyword, searchUrl: defaultSearchUrl(platform, cleanKeyword), enabled: true },
          })
        );
      } catch (err: any) {
        if (err?.code !== "P2002") throw err; // duplicates are fine during onboarding
      }
    }
    res.status(201).json({ ok: true, cards: created });
  } catch (err) {
    next(err);
  }
});

// DELETE /:id
platformKeywordsRouter.delete("/:id", async (req, res, next) => {
  try {
    const result = await prisma.platformKeyword.deleteMany({ where: { id: req.params.id, organizationId: orgOf(req) } });
    if (result.count === 0) return res.status(404).json({ error: "Keyword not found." });
    res.json({ ok: true, message: "Keyword removed." });
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/toggle
platformKeywordsRouter.patch("/:id/toggle", async (req, res, next) => {
  try {
    const card = await prisma.platformKeyword.findFirst({ where: { id: req.params.id, organizationId: orgOf(req) } });
    if (!card) return res.status(404).json({ error: "Keyword not found." });
    const updated = await prisma.platformKeyword.update({ where: { id: card.id }, data: { enabled: !card.enabled } });
    res.json({ ok: true, card: updated });
  } catch (err) {
    next(err);
  }
});

// POST /run-card/:id — scrape one card now
platformKeywordsRouter.post("/run-card/:id", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const card = await prisma.platformKeyword.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!card) return res.status(404).json({ error: "Keyword not found." });

    const rawItems = await runPythonSocialScraper({ keyword: card.keyword, url: card.searchUrl || undefined, limit: 100, platform: card.platform as any });
    const result = await runManualScrapePipeline(orgId, card.keyword, card.platform, rawItems);
    await prisma.platformKeyword.update({ where: { id: card.id }, data: { lastRunAt: new Date() } });
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

// POST /run-all — run this tenant's full cycle now
platformKeywordsRouter.post("/run-all", async (req, res, next) => {
  try {
    res.json(await runOrganizationCycle(orgOf(req)));
  } catch (err) {
    next(err);
  }
});

// GET /cron-status
platformKeywordsRouter.get("/cron-status", (req, res) => {
  res.json(getCronStatus(orgOf(req)));
});
