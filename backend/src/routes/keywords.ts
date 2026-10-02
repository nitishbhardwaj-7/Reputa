import { Router } from "express";
import { runScrapeForKeyword, PipelineError } from "../services/pipelineService";
import { getKeywords } from "../services/queryService";
import { ApifyError } from "../services/apifyService";
import { ConfigError } from "../config/env";
import { prisma } from "../lib/prisma";
import { orgOf } from "../middleware/auth";

export const keywordsRouter = Router();

// GET / — this tenant's keywords with counts
keywordsRouter.get("/", async (req, res, next) => {
  try {
    res.json({ keywords: await getKeywords(orgOf(req)) });
  } catch (err) {
    next(err);
  }
});

// POST /scrape { keyword } — Apify-backed pipeline (only when the platform has Apify configured)
keywordsRouter.post("/scrape", async (req, res) => {
  const keyword = String(req.body?.keyword ?? "").trim();
  if (!keyword) return res.status(400).json({ error: "A keyword is required." });

  try {
    res.json(await runScrapeForKeyword(orgOf(req), keyword));
  } catch (err) {
    if (err instanceof ConfigError) return res.status(503).json({ error: err.message });
    if (err instanceof PipelineError) return res.status(502).json({ error: err.message, scrapeRunId: err.scrapeRunId });
    if (err instanceof ApifyError) return res.status(err.status ?? 502).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Unexpected error while running the scrape pipeline." });
  }
});

// DELETE /:id — removes a keyword and everything found under it
keywordsRouter.delete("/:id", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const kw = await prisma.keyword.findFirst({ where: { id: req.params.id, organizationId: orgId }, select: { id: true } });
    if (!kw) return res.status(404).json({ error: "Keyword not found." });
    // Cascades remove posts, comments and runs.
    await prisma.keyword.delete({ where: { id: kw.id } });
    res.json({ ok: true, message: "Keyword and its mentions deleted." });
  } catch (err) {
    next(err);
  }
});
