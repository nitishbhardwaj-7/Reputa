import { Router } from "express";
import { analyzePost, analyzeComment } from "../services/pipelineService";
import { prisma } from "../lib/prisma";
import { ConfigError } from "../config/env";

export const retryRouter = Router();

// POST /api/retry/all — re-run AI sentiment analysis for ALL failed posts & comments.
retryRouter.post("/all", async (_req, res) => {
  try {
    const failedPosts = await prisma.post.findMany({ where: { status: "FAILED" }, select: { id: true } });
    const failedComments = await prisma.comment.findMany({ where: { status: "FAILED" }, select: { id: true } });

    let analyzed = 0;
    let failed = 0;

    for (const p of failedPosts) {
      const ok = await analyzePost(p.id);
      ok ? analyzed++ : failed++;
    }

    for (const c of failedComments) {
      const ok = await analyzeComment(c.id);
      ok ? analyzed++ : failed++;
    }

    res.json({
      ok: true,
      total: failedPosts.length + failedComments.length,
      analyzed,
      failed,
    });
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/retry/post/:id — re-run AI sentiment analysis for one failed post.
retryRouter.post("/post/:id", async (req, res) => {
  try {
    const ok = await analyzePost(req.params.id);
    res.json({ id: req.params.id, analyzed: ok });
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/retry/comment/:id
retryRouter.post("/comment/:id", async (req, res) => {
  try {
    const ok = await analyzeComment(req.params.id);
    res.json({ id: req.params.id, analyzed: ok });
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /api/retry/all — permanently delete all failed posts & comments.
retryRouter.delete("/all", async (_req, res) => {
  try {
    const deletedComments = await prisma.comment.deleteMany({
      where: {
        OR: [
          { status: "FAILED" },
          { post: { status: "FAILED" } },
        ],
      },
    });

    const deletedPosts = await prisma.post.deleteMany({
      where: { status: "FAILED" },
    });

    res.json({
      ok: true,
      deletedPosts: deletedPosts.count,
      deletedComments: deletedComments.count,
      totalDeleted: deletedPosts.count + deletedComments.count,
    });
  } catch (err) {
    handleError(err, res);
  }
});

retryRouter.delete("/clear-all", async (_req, res) => {
  try {
    const deletedComments = await prisma.comment.deleteMany({
      where: {
        OR: [
          { status: "FAILED" },
          { post: { status: "FAILED" } },
        ],
      },
    });

    const deletedPosts = await prisma.post.deleteMany({
      where: { status: "FAILED" },
    });

    res.json({
      ok: true,
      deletedPosts: deletedPosts.count,
      deletedComments: deletedComments.count,
      totalDeleted: deletedPosts.count + deletedComments.count,
    });
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /api/retry/post/:id — delete a failed post.
retryRouter.delete("/post/:id", async (req, res) => {
  try {
    await prisma.comment.deleteMany({ where: { postId: req.params.id } });
    await prisma.post.delete({ where: { id: req.params.id } });
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /api/retry/comment/:id — delete a failed comment.
retryRouter.delete("/comment/:id", async (req, res) => {
  try {
    await prisma.comment.delete({ where: { id: req.params.id } });
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    handleError(err, res);
  }
});

function handleError(err: unknown, res: any) {
  if (err instanceof ConfigError) return res.status(503).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Unexpected server error while retrying analysis." });
}

