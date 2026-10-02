import { Router } from "express";
import { prisma } from "../lib/prisma";
import { runPythonSocialScraper } from "../services/pythonScraperService";
import { runManualScrapePipeline } from "./manualScraper";
import { getCronStatus, executeHourlyScrapeCycle } from "../services/cronScheduler";

export const platformKeywordsRouter = Router();

// Default seed keyword cards if none registered yet
const DEFAULT_SEEDS = [
  { platform: "reddit", keyword: "eb1aexperts.com", searchUrl: "https://www.reddit.com/search/?type=comments&q=eb1aexperts.com&sort=relevance&safe=0" },
  { platform: "quora", keyword: "eb1aexperts.com", searchUrl: "https://www.quora.com/search?q=eb1aexperts.com" },
  { platform: "teamblind", keyword: "eb1aexperts.com", searchUrl: "https://www.teamblind.com/search/eb1aexperts.com" },
  { platform: "trustpilot", keyword: "eb1aexperts.com", searchUrl: "https://www.trustpilot.com/review/eb1aexperts.com" },
  { platform: "linkedin", keyword: "eb1aexperts.com", searchUrl: "https://www.linkedin.com/search/results/content/?keywords=eb1aexperts.com" },
];

// GET /api/platform-keywords — list all registered keyword cards
platformKeywordsRouter.get("/", async (_req, res, next) => {
  try {
    let cards = await (prisma as any).platformKeyword.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Seed defaults if empty
    if (cards.length === 0) {
      for (const seed of DEFAULT_SEEDS) {
        try {
          await (prisma as any).platformKeyword.create({ data: seed });
        } catch (e) {
          // ignore duplicate race
        }
      }
      cards = await (prisma as any).platformKeyword.findMany({
        orderBy: { createdAt: "desc" },
      });
    }

    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform-keywords — add a new keyword card for a platform
platformKeywordsRouter.post("/", async (req, res, next) => {
  try {
    const { platform, keyword, searchUrl } = req.body ?? {};
    if (!platform || !keyword) {
      return res.status(400).json({ error: "Platform and keyword are required." });
    }

    const cleanPlatform = String(platform).toLowerCase();
    const cleanKeyword = String(keyword).trim();

    if (!["reddit", "quora", "teamblind", "trustpilot", "linkedin"].includes(cleanPlatform)) {
      return res.status(400).json({ error: "Invalid platform. Must be reddit, quora, teamblind, trustpilot, or linkedin." });
    }

    let defaultUrl = searchUrl ? String(searchUrl).trim() : "";
    if (!defaultUrl) {
      const encoded = encodeURIComponent(cleanKeyword);
      if (cleanPlatform === "quora") defaultUrl = `https://www.quora.com/search?q=${encoded}`;
      else if (cleanPlatform === "teamblind") defaultUrl = `https://www.teamblind.com/search/${encoded}`;
      else if (cleanPlatform === "trustpilot") {
        const domain = cleanKeyword.replace("https://", "").replace("http://", "").replace("www.trustpilot.com/review/", "").split("/")[0];
        defaultUrl = `https://www.trustpilot.com/review/${domain}`;
      } else if (cleanPlatform === "linkedin") {
        defaultUrl = `https://www.linkedin.com/search/results/content/?keywords=${encoded}`;
      } else {
        defaultUrl = `https://www.reddit.com/search/?type=comments&q=${encoded}&sort=relevance&safe=0`;
      }
    }

    const created = await (prisma as any).platformKeyword.create({
      data: {
        platform: cleanPlatform,
        keyword: cleanKeyword,
        searchUrl: defaultUrl,
        enabled: true,
      },
    });

    res.json({ ok: true, card: created });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "This keyword is already added for this platform." });
    }
    next(err);
  }
});

// DELETE /api/platform-keywords/:id — delete a keyword card
platformKeywordsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    try {
      await (prisma as any).platformKeyword.delete({ where: { id } });
    } catch (e) {
      // ignore if already deleted
    }
    res.json({ ok: true, message: "Keyword card deleted successfully." });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/platform-keywords/:id/toggle — toggle enabled status
platformKeywordsRouter.patch("/:id/toggle", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await (prisma as any).platformKeyword.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Keyword card not found." });

    const updated = await (prisma as any).platformKeyword.update({
      where: { id },
      data: { enabled: !existing.enabled },
    });

    res.json({ ok: true, card: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform-keywords/run-card/:id — run a single card immediately with bulletproof fallback
platformKeywordsRouter.post("/run-card/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { platform: bodyPlatform, keyword: bodyKeyword, searchUrl: bodySearchUrl } = req.body ?? {};

    let card = await (prisma as any).platformKeyword.findUnique({ where: { id } });

    if (!card && bodyPlatform && bodyKeyword) {
      card = await (prisma as any).platformKeyword.findFirst({
        where: { platform: bodyPlatform, keyword: bodyKeyword },
      });
    }

    const targetPlatform = card?.platform || bodyPlatform;
    const targetKeyword = card?.keyword || bodyKeyword;
    const targetUrl = card?.searchUrl || bodySearchUrl || undefined;

    if (!targetPlatform || !targetKeyword) {
      return res.status(404).json({ error: "Keyword card not found." });
    }

    const rawItems = await runPythonSocialScraper({
      keyword: targetKeyword,
      url: targetUrl,
      limit: 100,
      platform: targetPlatform as any,
    });

    const result = await runManualScrapePipeline(targetKeyword, targetPlatform as any, rawItems);

    if (card?.id) {
      try {
        await (prisma as any).platformKeyword.update({
          where: { id: card.id },
          data: { lastRunAt: new Date() },
        });
      } catch (e) {
        // ignore update
      }
    }

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform-keywords/run-all — run all active keyword cards across all platforms
platformKeywordsRouter.post("/run-all", async (_req, res, next) => {
  try {
    const cycleResult = await executeHourlyScrapeCycle();
    res.json(cycleResult);
  } catch (err) {
    next(err);
  }
});

// GET /api/platform-keywords/cron-status — get status of background hourly cron
platformKeywordsRouter.get("/cron-status", (_req, res) => {
  res.json(getCronStatus());
});
