import { Router } from "express";
import { prisma } from "../lib/prisma";
import { runPythonSocialScraper } from "../services/pythonScraperService";
import { normalizeApifyItems } from "../services/dataNormalizer";
import { buildSourceKey } from "../lib/hash";
import { boundedRaw } from "../lib/raw";
import { ProcessingStatus } from "../types/status";
import { analyzePost, analyzeComment, upsertKeyword } from "../services/pipelineService";
import { orgOf } from "../middleware/auth";
import { SCRAPER_PLATFORMS } from "../services/queryService";

export const manualScraperRouter = Router();

export type ScraperPlatform = (typeof SCRAPER_PLATFORMS)[number];

export function isScraperPlatform(p: unknown): p is ScraperPlatform {
  return typeof p === "string" && (SCRAPER_PLATFORMS as readonly string[]).includes(p);
}

/** Stores a scraper payload for one tenant, dedupes it, and analyzes whatever is new. */
export async function runManualScrapePipeline(orgId: string, term: string, platformStr: string, rawItems: any[]) {
  const dbKeyword = await upsertKeyword(orgId, term);

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      organizationId: orgId,
      keywordId: dbKeyword.id,
      status: ProcessingStatus.RECEIVED,
      rawResponse: boundedRaw(rawItems),
      itemCount: rawItems.length,
    },
  });

  if (rawItems.length === 0) {
    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: { status: ProcessingStatus.ANALYZED, completedAt: new Date() },
    });
    return {
      ok: true, keyword: term, itemsReceived: 0, postsCreated: 0, commentsCreated: 0,
      postsSkippedExisting: 0, commentsSkippedExisting: 0, analyzed: 0, failed: 0,
      posts: [], comments: [], message: "The scraper returned zero results for this query.",
    };
  }

  const { posts, standaloneComments, warnings } = normalizeApifyItems(rawItems);

  let postsCreated = 0;
  let commentsCreated = 0;
  let postsSkippedExisting = 0;
  let commentsSkippedExisting = 0;
  const createdPostIds: string[] = [];
  const createdCommentIds: string[] = [];
  // Scraper-side comment id -> stored DB id, so replies can point at their parent.
  // Scrapers emit depth-first, so a parent is always seen before its children.
  const commentIdMap = new Map<string, string>();

  for (const post of posts) {
    const sourceKey = buildSourceKey({ keyword: term, type: "post", id: post.id, url: post.url, text: post.text, author: post.author });

    let postId = "";
    const existing = await prisma.post.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { sourceKey },
          { AND: [{ keywordId: dbKeyword.id }, { url: post.url, NOT: { url: null } }] },
          { AND: [{ keywordId: dbKeyword.id }, { text: post.text, NOT: { text: null } }] },
        ],
      },
    });

    if (existing) {
      postId = existing.id;
      postsSkippedExisting++;
    } else {
      const created = await prisma.post.create({
        data: {
          organizationId: orgId,
          sourceKey,
          keywordId: dbKeyword.id,
          scrapeRunId: scrapeRun.id,
          platform: post.platform || platformStr,
          text: post.text ?? null,
          url: post.url ?? null,
          author: post.author ?? null,
          authorUrl: post.authorUrl ?? null,
          publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
          likes: post.likes ?? null,
          shares: post.shares ?? null,
          commentsCount: post.commentsCount ?? null,
          rawItem: JSON.stringify(post.raw),
          status: ProcessingStatus.RECEIVED,
        },
      });
      postsCreated++;
      postId = created.id;
      createdPostIds.push(created.id);
    }

    for (const c of post.comments) {
      const cSourceKey = buildSourceKey({ keyword: term, type: "comment", id: c.id, url: c.url, text: c.text, author: c.author });

      const existingComment = await prisma.comment.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            { sourceKey: cSourceKey },
            { AND: [{ keywordId: dbKeyword.id }, { text: c.text, NOT: { text: null } }] },
          ],
        },
      });

      if (existingComment) {
        commentsSkippedExisting++;
        if (c.id) commentIdMap.set(c.id, existingComment.id);
      } else {
        const createdComment = await prisma.comment.create({
          data: {
            organizationId: orgId,
            sourceKey: cSourceKey,
            keywordId: dbKeyword.id,
            scrapeRunId: scrapeRun.id,
            postId,
            parentCommentId: c.parentId ? commentIdMap.get(c.parentId) ?? null : null,
            depth: c.depth ?? 0,
            text: c.text ?? null,
            url: c.url ?? null,
            author: c.author ?? null,
            authorUrl: c.authorUrl ?? null,
            publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
            likes: c.likes ?? null,
            rawItem: JSON.stringify(c.raw),
            status: ProcessingStatus.RECEIVED,
          },
        });
        commentsCreated++;
        createdCommentIds.push(createdComment.id);
        if (c.id) commentIdMap.set(c.id, createdComment.id);
      }
    }
  }

  for (const c of standaloneComments) {
    const cSourceKey = buildSourceKey({ keyword: term, type: "comment", id: c.id, url: c.url, text: c.text, author: c.author });

    const existingComment = await prisma.comment.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { sourceKey: cSourceKey },
          { AND: [{ keywordId: dbKeyword.id }, { text: c.text, NOT: { text: null } }] },
        ],
      },
    });

    if (existingComment) {
      commentsSkippedExisting++;
    } else {
      const createdComment = await prisma.comment.create({
        data: {
          organizationId: orgId,
          sourceKey: cSourceKey,
          keywordId: dbKeyword.id,
          scrapeRunId: scrapeRun.id,
          postId: null,
          text: c.text ?? null,
          url: c.url ?? null,
          author: c.author ?? null,
          authorUrl: c.authorUrl ?? null,
          publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
          likes: c.likes ?? null,
          rawItem: JSON.stringify(c.raw),
          status: ProcessingStatus.RECEIVED,
        },
      });
      commentsCreated++;
      createdCommentIds.push(createdComment.id);
    }
  }

  let analyzed = 0;
  let failed = 0;
  for (const id of createdPostIds) (await analyzePost(id)) ? analyzed++ : failed++;
  for (const id of createdCommentIds) (await analyzeComment(id)) ? analyzed++ : failed++;

  await prisma.scrapeRun.update({
    where: { id: scrapeRun.id },
    data: { status: ProcessingStatus.ANALYZED, completedAt: new Date() },
  });

  const [dbPosts, dbComments] = await Promise.all([
    prisma.post.findMany({ where: { organizationId: orgId, keywordId: dbKeyword.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.comment.findMany({ where: { organizationId: orgId, keywordId: dbKeyword.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return {
    ok: true, keyword: term, scrapeRunId: scrapeRun.id, itemsReceived: rawItems.length,
    postsCreated, commentsCreated, postsSkippedExisting, commentsSkippedExisting, analyzed, failed, warnings,
    posts: dbPosts, comments: dbComments,
  };
}

// POST /api/manual-scraper/scrape { keyword, platform, url?, limit? }
manualScraperRouter.post("/scrape", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const { keyword, url, limit, platform } = req.body ?? {};
    const term = typeof keyword === "string" ? keyword.trim() : "";
    if (!term) return res.status(400).json({ error: "A keyword is required." });
    if (!isScraperPlatform(platform)) {
      return res.status(400).json({ error: `Platform must be one of: ${SCRAPER_PLATFORMS.join(", ")}.` });
    }

    const rawItems = await runPythonSocialScraper({
      keyword: term,
      url: typeof url === "string" ? url : undefined,
      limit: typeof limit === "number" ? Math.min(Math.max(limit, 1), 200) : 100,
      platform,
    });

    res.json(await runManualScrapePipeline(orgId, term, platform, rawItems));
  } catch (err) {
    next(err);
  }
});
