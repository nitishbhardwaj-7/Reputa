import { Router } from "express";
import { runScrapeForKeyword, PipelineError } from "../services/pipelineService";
import { getKeywords } from "../services/queryService";
import { ApifyError } from "../services/apifyService";
import { ConfigError } from "../config/env";
import { prisma } from "../lib/prisma";

export const keywordsRouter = Router();

// GET /api/keywords — list all keywords searched so far, with counts.
keywordsRouter.get("/", async (_req, res) => {
  const keywords = await getKeywords();
  res.json({ keywords });
});

// POST /api/keywords/scrape { keyword: string }
// Triggers the full pipeline: Apify -> normalize -> store -> AI sentiment -> store.
keywordsRouter.post("/scrape", async (req, res) => {
  const keyword = String(req.body?.keyword ?? "").trim();
  if (!keyword) {
    return res.status(400).json({ error: "Request body must include a non-empty 'keyword' string." });
  }

  try {
    const result = await runScrapeForKeyword(keyword);
    res.json(result);
  } catch (err) {
    if (err instanceof ConfigError) {
      return res.status(503).json({ error: err.message });
    }
    if (err instanceof PipelineError) {
      return res.status(502).json({ error: err.message, scrapeRunId: err.scrapeRunId });
    }
    if (err instanceof ApifyError) {
      return res.status(err.status ?? 502).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Unexpected server error while running the scrape pipeline." });
  }
});

// DELETE /api/keywords/:id — delete a keyword and its associated items
keywordsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.comment.deleteMany({ where: { keywordId: id } });
    await prisma.post.deleteMany({ where: { keywordId: id } });
    await prisma.scrapeRun.deleteMany({ where: { keywordId: id } });
    await prisma.keyword.delete({ where: { id } });

    res.json({ ok: true, message: "Keyword deleted successfully." });
  } catch (err) {
    next(err);
  }
});
