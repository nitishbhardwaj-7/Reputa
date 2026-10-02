import { Router } from "express";
import { analyzePost, analyzeComment } from "../services/pipelineService";
import { prisma } from "../lib/prisma";
import { ConfigError } from "../config/env";
import { orgOf } from "../middleware/auth";

export const retryRouter = Router();

// POST /all — re-run analysis for this tenant's failed items
retryRouter.post("/all", async (req, res) => {
  try {
    const orgId = orgOf(req);
    const failedPosts = await prisma.post.findMany({ where: { organizationId: orgId, status: "FAILED" }, select: { id: true } });
    const failedComments = await prisma.comment.findMany({ where: { organizationId: orgId, status: "FAILED" }, select: { id: true } });

    let analyzed = 0;
    let failed = 0;
    for (const p of failedPosts) (await analyzePost(p.id)) ? analyzed++ : failed++;
    for (const c of failedComments) (await analyzeComment(c.id)) ? analyzed++ : failed++;

    res.json({ ok: true, total: failedPosts.length + failedComments.length, analyzed, failed });
  } catch (err) {
    handleError(err, res);
  }
});

retryRouter.post("/post/:id", async (req, res) => {
  try {
    const post = await prisma.post.findFirst({ where: { id: req.params.id, organizationId: orgOf(req) }, select: { id: true } });
    if (!post) return res.status(404).json({ error: "Post not found." });
    res.json({ id: post.id, analyzed: await analyzePost(post.id) });
  } catch (err) {
    handleError(err, res);
  }
});

retryRouter.post("/comment/:id", async (req, res) => {
  try {
    const comment = await prisma.comment.findFirst({ where: { id: req.params.id, organizationId: orgOf(req) }, select: { id: true } });
    if (!comment) return res.status(404).json({ error: "Comment not found." });
    res.json({ id: comment.id, analyzed: await analyzeComment(comment.id) });
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /all — permanently delete this tenant's failed items
retryRouter.delete("/all", async (req, res) => {
  try {
    const orgId = orgOf(req);
    const deletedComments = await prisma.comment.deleteMany({
      where: { organizationId: orgId, OR: [{ status: "FAILED" }, { post: { status: "FAILED" } }] },
    });
    const deletedPosts = await prisma.post.deleteMany({ where: { organizationId: orgId, status: "FAILED" } });
    res.json({ ok: true, deletedPosts: deletedPosts.count, deletedComments: deletedComments.count, totalDeleted: deletedPosts.count + deletedComments.count });
  } catch (err) {
    handleError(err, res);
  }
});

function handleError(err: unknown, res: any) {
  if (err instanceof ConfigError) return res.status(503).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected server error." });
}
