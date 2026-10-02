import { Router } from "express";
import {
  getItems,
  getOverview,
  getNegativeItems,
  getNeutralItems,
  getPositiveItems,
  globalSearch,
  getFailedItems,
} from "../services/queryService";
import { ItemFilters } from "../services/queryService";

export const itemsRouter = Router();

function parseFilters(query: any): ItemFilters {
  const f: ItemFilters = {};
  if (query.keyword) f.keyword = String(query.keyword);
  if (query.sentiment && ["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(String(query.sentiment).toUpperCase())) {
    f.sentiment = String(query.sentiment).toUpperCase() as ItemFilters["sentiment"];
  }
  if (query.type && ["post", "comment", "both"].includes(String(query.type))) {
    f.type = query.type;
  }
  // Any platform label the data actually contains is allowed now that Google SERP
  // mentions (news, web, youtube, ...) live in the same table as the scraper feeds.
  if (query.platform && /^[a-z0-9_-]{1,30}$/i.test(String(query.platform))) {
    f.platform = String(query.platform).toLowerCase();
  }
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

// GET /api/overview?keyword=...&platform=...&dateFrom=...&dateTo=...
itemsRouter.get("/overview", async (req, res) => {
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const platform = req.query.platform ? String(req.query.platform) : undefined;
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
  const source = ["scraper", "google"].includes(String(req.query.source || "").toLowerCase())
    ? (String(req.query.source).toLowerCase() as "scraper" | "google")
    : undefined;
  const overview = await getOverview(keyword, platform, dateFrom, dateTo, source);
  res.json(overview);
});

// GET /api/items?keyword=&sentiment=&type=&dateFrom=&dateTo=&author=&search=&page=&pageSize=
itemsRouter.get("/items", async (req, res) => {
  const result = await getItems(parseFilters(req.query));
  res.json(result);
});

// GET /api/items/negative
itemsRouter.get("/items/negative", async (req, res) => {
  const result = await getNegativeItems(parseFilters(req.query));
  res.json(result);
});

// GET /api/items/neutral
itemsRouter.get("/items/neutral", async (req, res) => {
  const result = await getNeutralItems(parseFilters(req.query));
  res.json(result);
});

// GET /api/items/positive
itemsRouter.get("/items/positive", async (req, res) => {
  const result = await getPositiveItems(parseFilters(req.query));
  res.json(result);
});

// GET /api/items/failed — items that failed AI analysis and can be retried.
itemsRouter.get("/items/failed", async (_req, res) => {
  const result = await getFailedItems();
  res.json(result);
});

// GET /api/search?q=...
itemsRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "");
  if (!q.trim()) return res.json({ posts: [], comments: [], keywords: [] });
  const result = await globalSearch(q);
  res.json(result);
});

// DELETE /api/items/post/:id or /api/post/:id — delete a specific post & its comments
itemsRouter.delete(["/items/post/:id", "/post/:id"], async (req, res) => {
  try {
    const id = req.params.id;
    const { prisma } = await import("../lib/prisma");
    await prisma.comment.deleteMany({ where: { postId: id } });
    await prisma.post.delete({ where: { id } });
    res.json({ ok: true, message: "Post deleted successfully", id });
  } catch (err: any) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: err?.message || "Failed to delete post" });
  }
});

// DELETE /api/items/comment/:id or /api/comment/:id — delete a specific comment
itemsRouter.delete(["/items/comment/:id", "/comment/:id"], async (req, res) => {
  try {
    const id = req.params.id;
    const { prisma } = await import("../lib/prisma");
    await prisma.comment.delete({ where: { id } });
    res.json({ ok: true, message: "Comment deleted successfully", id });
  } catch (err: any) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ error: err?.message || "Failed to delete comment" });
  }
});

