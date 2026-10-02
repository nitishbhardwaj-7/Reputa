import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  getItems,
  getOverview,
  getNegativeItems,
  getNeutralItems,
  getPositiveItems,
  globalSearch,
  getFailedItems,
  ItemFilters,
} from "../services/queryService";
import { orgOf } from "../middleware/auth";

export const itemsRouter = Router();

export function parseFilters(query: any): ItemFilters {
  const f: ItemFilters = {};
  if (query.keyword) f.keyword = String(query.keyword);
  if (query.sentiment && ["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(String(query.sentiment).toUpperCase())) {
    f.sentiment = String(query.sentiment).toUpperCase() as ItemFilters["sentiment"];
  }
  if (query.type && ["post", "comment", "both"].includes(String(query.type))) f.type = query.type;
  if (query.platform && /^[a-z0-9_-]{1,30}$/i.test(String(query.platform))) f.platform = String(query.platform).toLowerCase();
  if (query.source && ["scraper", "google"].includes(String(query.source).toLowerCase())) {
    f.source = String(query.source).toLowerCase() as ItemFilters["source"];
  }
  if (query.author) f.author = String(query.author);
  if (query.search) f.search = String(query.search);
  if (query.dateFrom) f.dateFrom = new Date(String(query.dateFrom));
  if (query.dateTo) f.dateTo = new Date(String(query.dateTo));
  if (query.page) f.page = Number(query.page);
  if (query.pageSize) f.pageSize = Number(query.pageSize);
  return f;
}

// GET /overview?keyword=&platform=&dateFrom=&dateTo=&source=
itemsRouter.get("/overview", async (req, res, next) => {
  try {
    const f = parseFilters(req.query);
    res.json(await getOverview(orgOf(req), f.keyword, f.platform, f.dateFrom, f.dateTo, f.source));
  } catch (err) {
    next(err);
  }
});

itemsRouter.get("/items", async (req, res, next) => {
  try { res.json(await getItems(orgOf(req), parseFilters(req.query))); } catch (err) { next(err); }
});

itemsRouter.get("/items/negative", async (req, res, next) => {
  try { res.json(await getNegativeItems(orgOf(req), parseFilters(req.query))); } catch (err) { next(err); }
});

itemsRouter.get("/items/neutral", async (req, res, next) => {
  try { res.json(await getNeutralItems(orgOf(req), parseFilters(req.query))); } catch (err) { next(err); }
});

itemsRouter.get("/items/positive", async (req, res, next) => {
  try { res.json(await getPositiveItems(orgOf(req), parseFilters(req.query))); } catch (err) { next(err); }
});

itemsRouter.get("/items/failed", async (req, res, next) => {
  try { res.json(await getFailedItems(orgOf(req))); } catch (err) { next(err); }
});

// GET /search?q=
itemsRouter.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "");
    if (!q.trim()) return res.json({ posts: [], comments: [], keywords: [] });
    res.json(await globalSearch(orgOf(req), q));
  } catch (err) {
    next(err);
  }
});

// DELETE /items/post/:id — removes a post and its comments (tenant-scoped)
itemsRouter.delete("/items/post/:id", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const post = await prisma.post.findFirst({ where: { id: req.params.id, organizationId: orgId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: "Post not found." });
    await prisma.comment.deleteMany({ where: { postId: post.id } });
    await prisma.post.delete({ where: { id: post.id } });
    res.json({ ok: true, id: post.id });
  } catch (err) {
    next(err);
  }
});

// DELETE /items/comment/:id
itemsRouter.delete("/items/comment/:id", async (req, res, next) => {
  try {
    const result = await prisma.comment.deleteMany({ where: { id: req.params.id, organizationId: orgOf(req) } });
    if (result.count === 0) return res.status(404).json({ error: "Comment not found." });
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});
