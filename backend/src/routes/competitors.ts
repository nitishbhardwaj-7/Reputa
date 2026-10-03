import { cardStatsLookup, competitorBreakdown } from "../services/cardStats";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { runPythonSocialScraper } from "../services/pythonScraperService";
import { normalizeApifyItems } from "../services/dataNormalizer";
import { buildSourceKey } from "../lib/hash";
import { boundedRaw } from "../lib/raw";
import { ProcessingStatus } from "../types/status";
import { analyzePost, analyzeComment, upsertKeyword } from "../services/pipelineService";
import { syncCompetitorFlags } from "../services/queryService";
import { orgOf } from "../middleware/auth";
import { assertCanAddCompetitor, assertCanScan } from "../services/billingService";
import { isScraperPlatform } from "./manualScraper";

export const competitorsRouter = Router();

/**
 * Stores scraped competitor items and runs sentiment on them like brand mentions.
 * Competitor items are excluded from negative-mention email alerts — those exist to
 * flag the tenant's own reputation, not a rival's.
 */
export async function runCompetitorScrapePipeline(orgId: string, term: string, platformName: string, rawPayload: any[]) {
  const normalized = normalizeApifyItems(rawPayload);
  const dbKeyword = await upsertKeyword(orgId, term);

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      organizationId: orgId,
      keywordId: dbKeyword.id,
      status: ProcessingStatus.ANALYZED,
      rawResponse: boundedRaw(rawPayload),
      itemCount: normalized.posts.length + normalized.standaloneComments.length,
      completedAt: new Date(),
    },
  });

  let postsCreated = 0;
  let postsSkippedExisting = 0;
  let commentsCreated = 0;
  let commentsSkippedExisting = 0;
  const createdPostIds: string[] = [];
  const createdCommentIds: string[] = [];
  const commentIdMap = new Map<string, string>();

  for (const post of normalized.posts) {
    const sourceKey = buildSourceKey({ keyword: term, type: "post", id: post.id, url: post.url, text: post.text, author: post.author });

    const existing = await prisma.post.findFirst({
      where: {
        organizationId: orgId,
        OR: [{ sourceKey }, { AND: [{ keywordId: dbKeyword.id }, { url: post.url, NOT: { url: null } }] }],
      },
    });

    let currentPostId: string | null = null;
    if (existing) {
      postsSkippedExisting++;
      currentPostId = existing.id;
      if (!existing.isCompetitor) await prisma.post.update({ where: { id: existing.id }, data: { isCompetitor: true } });
    } else {
      const created = await prisma.post.create({
        data: {
          organizationId: orgId,
          sourceKey,
          keywordId: dbKeyword.id,
          scrapeRunId: scrapeRun.id,
          platform: post.platform || platformName,
          title: post.text ? post.text.slice(0, 100) : null,
          text: post.text || null,
          url: post.url || null,
          author: post.author || null,
          authorUrl: post.authorUrl || null,
          publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
          likes: post.likes ?? null,
          shares: post.shares ?? null,
          commentsCount: post.commentsCount ?? null,
          rawItem: JSON.stringify(post.raw || {}),
          status: ProcessingStatus.RECEIVED,
          isCompetitor: true,
        },
      });
      postsCreated++;
      currentPostId = created.id;
      createdPostIds.push(created.id);
    }

    for (const c of post.comments ?? []) {
      const cSourceKey = buildSourceKey({ keyword: term, type: "comment", id: c.id, url: c.url, text: c.text, author: c.author });
      const existingC = await prisma.comment.findFirst({
        where: {
          organizationId: orgId,
          OR: [{ sourceKey: cSourceKey }, { AND: [{ keywordId: dbKeyword.id }, { url: c.url, NOT: { url: null } }] }],
        },
      });

      if (existingC) {
        commentsSkippedExisting++;
        if (c.id) commentIdMap.set(c.id, existingC.id);
        if (!existingC.isCompetitor) await prisma.comment.update({ where: { id: existingC.id }, data: { isCompetitor: true } });
      } else {
        const createdComment = await prisma.comment.create({
          data: {
            organizationId: orgId,
            sourceKey: cSourceKey,
            keywordId: dbKeyword.id,
            scrapeRunId: scrapeRun.id,
            postId: currentPostId,
            parentCommentId: c.parentId ? commentIdMap.get(c.parentId) ?? null : null,
            depth: c.depth ?? 0,
            text: c.text || null,
            url: c.url || null,
            author: c.author || null,
            authorUrl: c.authorUrl || null,
            publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
            likes: c.likes ?? null,
            rawItem: JSON.stringify(c.raw || {}),
            status: ProcessingStatus.RECEIVED,
            isCompetitor: true,
          },
        });
        commentsCreated++;
        createdCommentIds.push(createdComment.id);
        if (c.id) commentIdMap.set(c.id, createdComment.id);
      }
    }
  }

  for (const c of normalized.standaloneComments) {
    const sourceKey = buildSourceKey({ keyword: term, type: "comment", id: c.id, url: c.url, text: c.text, author: c.author });
    const existing = await prisma.comment.findFirst({
      where: {
        organizationId: orgId,
        OR: [{ sourceKey }, { AND: [{ keywordId: dbKeyword.id }, { url: c.url, NOT: { url: null } }] }],
      },
    });

    if (existing) {
      commentsSkippedExisting++;
      if (!existing.isCompetitor) await prisma.comment.update({ where: { id: existing.id }, data: { isCompetitor: true } });
    } else {
      const createdStandalone = await prisma.comment.create({
        data: {
          organizationId: orgId,
          sourceKey,
          keywordId: dbKeyword.id,
          scrapeRunId: scrapeRun.id,
          text: c.text || null,
          url: c.url || null,
          author: c.author || null,
          authorUrl: c.authorUrl || null,
          publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
          likes: c.likes ?? null,
          rawItem: JSON.stringify(c.raw || {}),
          status: ProcessingStatus.RECEIVED,
          isCompetitor: true,
        },
      });
      commentsCreated++;
      createdCommentIds.push(createdStandalone.id);
    }
  }

  let analyzed = 0;
  let failed = 0;
  for (const id of createdPostIds) (await analyzePost(id)) ? analyzed++ : failed++;
  for (const id of createdCommentIds) (await analyzeComment(id)) ? analyzed++ : failed++;

  return { scrapeRunId: scrapeRun.id, postsCreated, postsSkippedExisting, commentsCreated, commentsSkippedExisting, analyzed, failed };
}

function defaultSearchUrl(platform: string, keyword: string): string {
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

// GET /cards
competitorsRouter.get("/cards", async (req, res, next) => {
  try {
    const cards = await prisma.competitorCard.findMany({ where: { organizationId: orgOf(req) }, orderBy: { createdAt: "desc" } });
    const statsFor = await cardStatsLookup(orgOf(req), true);
    res.json({ cards: cards.map((c) => ({ ...c, stats: statsFor(c.platform, c.keyword) })) });
  } catch (err) {
    next(err);
  }
});

// POST /cards { platform, keyword, searchUrl? }
competitorsRouter.post("/cards", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const { platform, keyword, searchUrl } = req.body ?? {};
    const cleanPlatform = String(platform ?? "").toLowerCase().trim();
    const cleanKeyword = typeof keyword === "string" ? keyword.trim() : "";
    if (!isScraperPlatform(cleanPlatform) || !cleanKeyword) {
      return res.status(400).json({ error: "A valid platform and a competitor name are required." });
    }
    const cleanUrl = typeof searchUrl === "string" && searchUrl.trim() ? searchUrl.trim() : defaultSearchUrl(cleanPlatform, cleanKeyword);
    const already = await prisma.competitorCard.findFirst({ where: { organizationId: orgId, platform: cleanPlatform, keyword: cleanKeyword }, select: { id: true } });
    if (!already) await assertCanAddCompetitor(orgId);

    const card = await prisma.competitorCard.upsert({
      where: { organizationId_platform_keyword: { organizationId: orgId, platform: cleanPlatform, keyword: cleanKeyword } },
      create: { organizationId: orgId, platform: cleanPlatform, keyword: cleanKeyword, searchUrl: cleanUrl, enabled: true },
      update: { searchUrl: cleanUrl, enabled: true },
    });
    await syncCompetitorFlags(orgId, true);
    res.json({ ok: true, card });
  } catch (err) {
    next(err);
  }
});

// DELETE /cards/:id
competitorsRouter.delete("/cards/:id", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const result = await prisma.competitorCard.deleteMany({ where: { id: req.params.id, organizationId: orgId } });
    if (result.count === 0) return res.status(404).json({ error: "Competitor not found." });
    await syncCompetitorFlags(orgId, true);
    res.json({ ok: true, message: "Competitor removed." });
  } catch (err) {
    next(err);
  }
});

// PATCH /cards/:id/toggle
competitorsRouter.patch("/cards/:id/toggle", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const card = await prisma.competitorCard.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!card) return res.status(404).json({ error: "Competitor not found." });
    const updated = await prisma.competitorCard.update({ where: { id: card.id }, data: { enabled: !card.enabled } });
    res.json({ ok: true, card: updated });
  } catch (err) {
    next(err);
  }
});

// POST /cards/run-card/:id
competitorsRouter.post("/cards/run-card/:id", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const card = await prisma.competitorCard.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!card) return res.status(404).json({ error: "Competitor not found." });
    await assertCanScan(orgId);

    const rawItems = await runPythonSocialScraper({ keyword: card.keyword, url: card.searchUrl || undefined, limit: 100, platform: card.platform as any });
    const result = await runCompetitorScrapePipeline(orgId, card.keyword, card.platform, rawItems);
    await syncCompetitorFlags(orgId, true);
    await prisma.competitorCard.update({ where: { id: card.id }, data: { lastRunAt: new Date() } });
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

// POST /cards/run-all
competitorsRouter.post("/cards/run-all", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const activeCards = await prisma.competitorCard.findMany({ where: { organizationId: orgId, enabled: true } });
    if (activeCards.length === 0) return res.json({ ok: true, message: "No active competitors to scan.", newItems: 0 });
    await assertCanScan(orgId);

    let totalNew = 0;
    for (const card of activeCards) {
      try {
        const rawItems = await runPythonSocialScraper({ keyword: card.keyword, url: card.searchUrl || undefined, limit: 100, platform: card.platform as any });
        const r = await runCompetitorScrapePipeline(orgId, card.keyword, card.platform, rawItems);
        totalNew += r.postsCreated + r.commentsCreated;
        await prisma.competitorCard.update({ where: { id: card.id }, data: { lastRunAt: new Date() } });
      } catch (err: any) {
        console.error(`Competitor card "${card.keyword}" failed:`, err?.message);
      }
    }
    await syncCompetitorFlags(orgId, true);
    res.json({ ok: true, message: `Scanned ${activeCards.length} competitor card(s).`, newItems: totalNew });
  } catch (err) {
    next(err);
  }
});

// GET /items?platform=&search=&page=&pageSize=
competitorsRouter.get("/items", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const platform = String(req.query.platform ?? "all");
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const wherePost: any = { organizationId: orgId, isCompetitor: true };
    const whereComment: any = { organizationId: orgId, isCompetitor: true };
    const andPost: any[] = [];
    const andComment: any[] = [];

    if (platform !== "all") {
      const p = platform.toLowerCase().trim();
      andPost.push({ platform: { equals: p, mode: "insensitive" } });
      andComment.push({ OR: [{ post: { platform: { equals: p, mode: "insensitive" } } }, { url: { contains: p, mode: "insensitive" } }] });
    }
    if (search) {
      andPost.push({ OR: [{ text: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { author: { contains: search, mode: "insensitive" } }] });
      andComment.push({ OR: [{ text: { contains: search, mode: "insensitive" } }, { author: { contains: search, mode: "insensitive" } }] });
    }
    if (andPost.length) wherePost.AND = andPost;
    if (andComment.length) whereComment.AND = andComment;

    const [posts, comments] = await Promise.all([
      prisma.post.findMany({ where: wherePost, include: { keyword: true }, orderBy: { publishedAt: "desc" } }),
      prisma.comment.findMany({ where: whereComment, include: { keyword: true, post: true }, orderBy: { publishedAt: "desc" } }),
    ]);

    const inferPlatform = (itemUrl: string | null, postPlat?: string | null) => {
      if (postPlat) return postPlat;
      const u = (itemUrl || "").toLowerCase();
      if (u.includes("quora")) return "quora";
      if (u.includes("teamblind")) return "teamblind";
      if (u.includes("trustpilot")) return "trustpilot";
      if (u.includes("linkedin")) return "linkedin";
      if (u.includes("reddit")) return "reddit";
      return "web";
    };

    const allItems = [
      ...posts.map((p) => ({
        id: p.id, type: "post" as const, platform: inferPlatform(p.url, p.platform), keyword: p.keyword.term,
        text: p.text || p.title || "", url: p.url, author: p.author, authorUrl: p.authorUrl,
        publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
        likes: p.likes, shares: p.shares, commentsCount: p.commentsCount,
        status: p.status, sentiment: p.sentiment, confidence: p.confidence,
      })),
      ...comments.map((c) => ({
        id: c.id, type: "comment" as const, platform: inferPlatform(c.url, c.post?.platform), keyword: c.keyword.term,
        text: c.text || "", url: c.url, author: c.author, authorUrl: c.authorUrl,
        publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
        likes: c.likes, shares: null, commentsCount: null,
        status: c.status, sentiment: c.sentiment, confidence: c.confidence,
      })),
    ].sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0));

    const start = (page - 1) * pageSize;
    res.json({ items: allItems.slice(start, start + pageSize), pagination: { page, pageSize, total: allItems.length } });
  } catch (err) {
    next(err);
  }
});

// GET /overview
competitorsRouter.get("/overview", async (req, res, next) => {
  try {
    const orgId = orgOf(req);
    const [totalPosts, totalComments, activeCardsCount, totalCardsCount, sentimentPosts, sentimentComments] = await Promise.all([
      prisma.post.count({ where: { organizationId: orgId, isCompetitor: true } }),
      prisma.comment.count({ where: { organizationId: orgId, isCompetitor: true } }),
      prisma.competitorCard.count({ where: { organizationId: orgId, enabled: true } }),
      prisma.competitorCard.count({ where: { organizationId: orgId } }),
      prisma.post.groupBy({ by: ["sentiment"], where: { organizationId: orgId, isCompetitor: true }, _count: true }),
      prisma.comment.groupBy({ by: ["sentiment"], where: { organizationId: orgId, isCompetitor: true }, _count: true }),
    ]);

    const counts: Record<string, number> = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
    for (const row of [...sentimentPosts, ...sentimentComments]) if (row.sentiment) counts[row.sentiment] += row._count;

    res.json({
      totalMentions: totalPosts + totalComments,
      totalPosts,
      totalComments,
      activeCardsCount,
      totalCardsCount,
      positive: counts.POSITIVE,
      negative: counts.NEGATIVE,
      neutral: counts.NEUTRAL,
      // One row per competitor, for the side-by-side comparison.
      competitors: await competitorBreakdown(orgId),
    });
  } catch (err) {
    next(err);
  }
});
