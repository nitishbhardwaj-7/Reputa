import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Sentiment, SentimentValue } from "../types/status";

export interface ItemFilters {
  keyword?: string;
  sentiment?: SentimentValue;
  type?: "post" | "comment" | "both";
  // Any platform label present in the data (reddit, quora, news, youtube, web, ...) or "all".
  platform?: string;
  // Which subsystem found the mention: "scraper", "google", or undefined for both.
  source?: "scraper" | "google";
  dateFrom?: Date;
  dateTo?: Date;
  author?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const SCRAPER_PLATFORMS = ["reddit", "quora", "teamblind", "trustpilot", "linkedin"] as const;

function postWhere(orgId: string, f: ItemFilters): Prisma.PostWhereInput {
  const conditions: Prisma.PostWhereInput[] = [{ organizationId: orgId }, { isCompetitor: false }];

  if (f.source) conditions.push({ source: f.source });

  if (f.keyword && f.keyword.trim()) {
    conditions.push({ keyword: { term: { equals: f.keyword.trim(), mode: "insensitive" } } });
  }
  if (f.sentiment) conditions.push({ sentiment: f.sentiment });

  if (f.platform && f.platform !== "all") {
    const p = f.platform.toLowerCase().trim();
    conditions.push({
      OR: [
        { platform: { equals: p, mode: "insensitive" } },
        { url: { contains: p, mode: "insensitive" } },
      ],
    });
  }

  if (f.dateFrom || f.dateTo) {
    const dateFilter: Prisma.DateTimeNullableFilter = {};
    if (f.dateFrom) dateFilter.gte = f.dateFrom;
    if (f.dateTo) dateFilter.lte = f.dateTo;
    conditions.push({ publishedAt: dateFilter });
  }

  if (f.author && f.author.trim()) {
    conditions.push({ author: { contains: f.author.trim(), mode: "insensitive" } });
  }

  if (f.search && f.search.trim()) {
    const s = f.search.trim();
    conditions.push({
      OR: [
        { text: { contains: s, mode: "insensitive" } },
        { author: { contains: s, mode: "insensitive" } },
        { title: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

function commentWhere(orgId: string, f: ItemFilters): Prisma.CommentWhereInput {
  const conditions: Prisma.CommentWhereInput[] = [{ organizationId: orgId }, { isCompetitor: false }];

  if (f.source === "google") {
    // Google SERP results are posts only; no comment can match this filter.
    conditions.push({ id: { equals: "__never__" } });
  }

  if (f.keyword && f.keyword.trim()) {
    conditions.push({ keyword: { term: { equals: f.keyword.trim(), mode: "insensitive" } } });
  }
  if (f.sentiment) conditions.push({ sentiment: f.sentiment });

  if (f.platform && f.platform !== "all") {
    const p = f.platform.toLowerCase().trim();
    conditions.push({
      OR: [
        { post: { platform: { equals: p, mode: "insensitive" } } },
        { url: { contains: p, mode: "insensitive" } },
      ],
    });
  }

  if (f.dateFrom || f.dateTo) {
    const dateFilter: Prisma.DateTimeNullableFilter = {};
    if (f.dateFrom) dateFilter.gte = f.dateFrom;
    if (f.dateTo) dateFilter.lte = f.dateTo;
    conditions.push({ publishedAt: dateFilter });
  }

  if (f.author && f.author.trim()) {
    conditions.push({ author: { contains: f.author.trim(), mode: "insensitive" } });
  }

  if (f.search && f.search.trim()) {
    const s = f.search.trim();
    conditions.push({
      OR: [
        { text: { contains: s, mode: "insensitive" } },
        { author: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

const lastSyncByOrg = new Map<string, number>();

/**
 * Keeps isCompetitor in step with the tenant's competitor cards: anything found under a
 * keyword that matches a competitor card is a competitor mention. Throttled per tenant.
 */
export async function syncCompetitorFlags(orgId: string, force = false) {
  const now = Date.now();
  if (!force && now - (lastSyncByOrg.get(orgId) ?? 0) < 30_000) return;
  lastSyncByOrg.set(orgId, now);

  try {
    const cards = await prisma.competitorCard.findMany({ where: { organizationId: orgId }, select: { keyword: true } });
    const competitorTerms = new Set(cards.map((c) => c.keyword.toLowerCase().trim()));

    const keywords = await prisma.keyword.findMany({ where: { organizationId: orgId }, select: { id: true, term: true } });
    const brandIds = keywords.filter((k) => !competitorTerms.has(k.term.toLowerCase().trim())).map((k) => k.id);
    const compIds = keywords.filter((k) => competitorTerms.has(k.term.toLowerCase().trim())).map((k) => k.id);

    if (brandIds.length) {
      await prisma.post.updateMany({ where: { organizationId: orgId, keywordId: { in: brandIds }, isCompetitor: true }, data: { isCompetitor: false } });
      await prisma.comment.updateMany({ where: { organizationId: orgId, keywordId: { in: brandIds }, isCompetitor: true }, data: { isCompetitor: false } });
    }
    if (compIds.length) {
      await prisma.post.updateMany({ where: { organizationId: orgId, keywordId: { in: compIds }, isCompetitor: false }, data: { isCompetitor: true } });
      await prisma.comment.updateMany({ where: { organizationId: orgId, keywordId: { in: compIds }, isCompetitor: false }, data: { isCompetitor: true } });
    }
  } catch (e) {
    console.warn("Notice syncing competitor flags:", e);
  }
}

export interface TrendBucket {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface TrendChange {
  abs: number;
  /** Percent change vs the previous window; null when that window was empty. */
  pct: number | null;
}

async function countWindow(orgId: string, f: ItemFilters, from: Date, to: Date): Promise<TrendBucket> {
  const windowed: ItemFilters = { ...f, dateFrom: from, dateTo: to };
  const [postAgg, commentAgg] = await Promise.all([
    prisma.post.groupBy({ by: ["sentiment"], where: postWhere(orgId, windowed), _count: true }),
    prisma.comment.groupBy({ by: ["sentiment"], where: commentWhere(orgId, windowed), _count: true }),
  ]);

  const bucket: TrendBucket = { total: 0, positive: 0, negative: 0, neutral: 0 };
  for (const row of [...postAgg, ...commentAgg]) {
    bucket.total += row._count;
    if (row.sentiment === Sentiment.POSITIVE) bucket.positive += row._count;
    else if (row.sentiment === Sentiment.NEGATIVE) bucket.negative += row._count;
    else if (row.sentiment === Sentiment.NEUTRAL) bucket.neutral += row._count;
  }
  return bucket;
}

function change(current: number, previous: number): TrendChange {
  return {
    abs: current - previous,
    // A jump from zero has no meaningful percentage, so report null rather than Infinity.
    pct: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10,
  };
}

/**
 * Week-over-week momentum by publish date, deliberately independent of the date range
 * picked in the UI so the arrows always mean the same thing.
 */
export async function getTrend(orgId: string, f: ItemFilters = {}, windowDays = 7) {
  const now = new Date();
  const spanMs = windowDays * 24 * 60 * 60 * 1000;
  const currentFrom = new Date(now.getTime() - spanMs);
  const previousFrom = new Date(now.getTime() - spanMs * 2);

  const base: ItemFilters = { ...f, dateFrom: undefined, dateTo: undefined };
  const [current, previous] = await Promise.all([
    countWindow(orgId, base, currentFrom, now),
    countWindow(orgId, base, previousFrom, currentFrom),
  ]);

  return {
    windowDays,
    current,
    previous,
    change: {
      total: change(current.total, previous.total),
      positive: change(current.positive, previous.positive),
      negative: change(current.negative, previous.negative),
      neutral: change(current.neutral, previous.neutral),
    },
  };
}

export async function getOverview(
  orgId: string,
  keyword?: string,
  platform?: string,
  dateFrom?: Date,
  dateTo?: Date,
  source?: ItemFilters["source"]
) {
  await syncCompetitorFlags(orgId).catch(() => {});

  const f: ItemFilters = { keyword, platform: platform && platform !== "all" ? platform : undefined, dateFrom, dateTo, source };
  const pWhere = postWhere(orgId, f);
  const cWhere = commentWhere(orgId, f);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [totalPosts, totalComments, postAgg, commentAgg, sourceAgg, platformAgg, trend, openAlertPosts, openAlertComments, alerts24hPosts, alerts24hComments] =
    await Promise.all([
      prisma.post.count({ where: pWhere }),
      prisma.comment.count({ where: cWhere }),
      prisma.post.groupBy({ by: ["sentiment"], where: pWhere, _count: true }),
      prisma.comment.groupBy({ by: ["sentiment"], where: cWhere, _count: true }),
      prisma.post.groupBy({ by: ["source"], where: pWhere, _count: true }),
      prisma.post.groupBy({ by: ["platform"], where: pWhere, _count: true }),
      getTrend(orgId, f),
      prisma.post.count({ where: { AND: [pWhere, { sentiment: "NEGATIVE", resolvedAt: null }] } }),
      prisma.comment.count({ where: { AND: [cWhere, { sentiment: "NEGATIVE", resolvedAt: null }] } }),
      prisma.post.count({ where: { AND: [pWhere, { sentiment: "NEGATIVE", alertSent: true, analyzedAt: { gte: dayAgo } }] } }),
      prisma.comment.count({ where: { AND: [cWhere, { sentiment: "NEGATIVE", alertSent: true, analyzedAt: { gte: dayAgo } }] } }),
    ]);

  const counts: Record<string, number> = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
  for (const row of [...postAgg, ...commentAgg]) {
    if (row.sentiment) counts[row.sentiment] += row._count;
  }

  const totalAnalyzed = counts.POSITIVE + counts.NEGATIVE + counts.NEUTRAL;
  const pct = (n: number) => (totalAnalyzed > 0 ? Math.round((n / totalAnalyzed) * 1000) / 10 : 0);

  const googlePosts = sourceAgg.find((r) => r.source === "google")?._count ?? 0;
  const byPlatform: Record<string, number> = {};
  for (const row of platformAgg) {
    if (row.platform) {
      const key = row.platform.toLowerCase();
      byPlatform[key] = (byPlatform[key] || 0) + row._count;
    }
  }

  return {
    totalPosts,
    totalComments,
    totalMentions: totalPosts + totalComments,
    trend,
    bySource: { scraper: totalPosts - googlePosts + totalComments, google: googlePosts },
    byPlatform,
    // Negative mentions nobody has marked handled yet, and alerts emailed in the last day.
    openAlerts: openAlertPosts + openAlertComments,
    alertsSent24h: alerts24hPosts + alerts24hComments,
    totalAnalyzed,
    positive: counts.POSITIVE,
    negative: counts.NEGATIVE,
    neutral: counts.NEUTRAL,
    positivePct: pct(counts.POSITIVE),
    negativePct: pct(counts.NEGATIVE),
    neutralPct: pct(counts.NEUTRAL),
  };
}

export async function getItems(orgId: string, f: ItemFilters) {
  await syncCompetitorFlags(orgId).catch(() => {});

  const page = f.page && f.page > 0 ? f.page : 1;
  const pageSize = f.pageSize && f.pageSize > 0 ? Math.min(f.pageSize, 200) : 50;
  const skip = (page - 1) * pageSize;

  const wantPosts = f.type !== "comment";
  const wantComments = f.type !== "post";
  const pWhere = postWhere(orgId, f);
  const cWhere = commentWhere(orgId, f);

  const [posts, comments, postCount, commentCount] = await Promise.all([
    wantPosts
      ? prisma.post.findMany({ where: pWhere, include: { keyword: true }, orderBy: { publishedAt: "desc" }, skip, take: pageSize })
      : Promise.resolve([]),
    wantComments
      ? prisma.comment.findMany({
          where: cWhere,
          include: { keyword: true, post: { select: { url: true, text: true } } },
          orderBy: { publishedAt: "desc" },
          skip,
          take: pageSize,
        })
      : Promise.resolve([]),
    wantPosts ? prisma.post.count({ where: pWhere }) : Promise.resolve(0),
    wantComments ? prisma.comment.count({ where: cWhere }) : Promise.resolve(0),
  ]);

  const items = [
    ...posts.map((p) => ({ type: "post" as const, ...p, keyword: p.keyword.term })),
    ...comments.map((c) => ({ type: "comment" as const, ...c, keyword: c.keyword.term })),
  ]
    .sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return db - da;
    })
    .slice(0, pageSize);

  return {
    items,
    pagination: { page, pageSize, totalPosts: postCount, totalComments: commentCount, total: postCount + commentCount },
  };
}

/** Brand keywords (competitor terms excluded) with mention counts. */
export async function getKeywords(orgId: string) {
  await syncCompetitorFlags(orgId).catch(() => {});

  const cards = await prisma.competitorCard.findMany({ where: { organizationId: orgId }, select: { keyword: true } });
  const competitorTerms = new Set(cards.map((c) => c.keyword.toLowerCase().trim()));

  const all = await prisma.keyword.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { posts: true, comments: true } } },
  });

  return all.filter((kw) => !competitorTerms.has(kw.term.toLowerCase().trim()));
}

export async function getSentimentDistribution(orgId: string, keyword?: string, platform?: string, dateFrom?: Date, dateTo?: Date) {
  return getOverview(orgId, keyword, platform, dateFrom, dateTo);
}

export async function getSentimentByKeyword(orgId: string) {
  const keywords = await getKeywords(orgId);
  const results = [];
  for (const kw of keywords) {
    const overview = await getOverview(orgId, kw.term);
    if (overview.totalMentions > 0) results.push({ keyword: kw.term, ...overview });
  }
  return results;
}

export async function getSentimentByPlatform(orgId: string, keyword?: string, dateFrom?: Date, dateTo?: Date) {
  const results = [];
  for (const p of SCRAPER_PLATFORMS) {
    const overview = await getOverview(orgId, keyword, p, dateFrom, dateTo);
    results.push({ platform: p, ...overview });
  }
  return results;
}

export async function getSentimentOverTime(orgId: string, keyword?: string, platform?: string, dateFrom?: Date, dateTo?: Date) {
  const f: ItemFilters = { keyword, platform: platform && platform !== "all" ? platform : undefined, dateFrom, dateTo };
  const pWhere = { ...postWhere(orgId, f), publishedAt: { not: null }, sentiment: { not: null } };
  const cWhere = { ...commentWhere(orgId, f), publishedAt: { not: null }, sentiment: { not: null } };

  const [posts, comments] = await Promise.all([
    prisma.post.findMany({ where: pWhere, select: { publishedAt: true, sentiment: true } }),
    prisma.comment.findMany({ where: cWhere, select: { publishedAt: true, sentiment: true } }),
  ]);

  const buckets = new Map<string, { date: string; POSITIVE: number; NEGATIVE: number; NEUTRAL: number }>();
  for (const row of [...posts, ...comments]) {
    if (!row.publishedAt || !row.sentiment) continue;
    const day = row.publishedAt.toISOString().slice(0, 10);
    if (!buckets.has(day)) buckets.set(day, { date: day, POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 });
    buckets.get(day)![row.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"]++;
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getNegativeItems(orgId: string, f: Omit<ItemFilters, "sentiment">) {
  return getItems(orgId, { ...f, sentiment: Sentiment.NEGATIVE });
}

export async function getNeutralItems(orgId: string, f: Omit<ItemFilters, "sentiment">) {
  return getItems(orgId, { ...f, sentiment: Sentiment.NEUTRAL });
}

export async function getPositiveItems(orgId: string, f: Omit<ItemFilters, "sentiment">) {
  return getItems(orgId, { ...f, sentiment: Sentiment.POSITIVE });
}

export async function globalSearch(orgId: string, q: string, limit = 50) {
  const query = q.trim();
  if (!query) return { posts: [], comments: [], keywords: [] };

  const textMatch = { OR: [{ text: { contains: query, mode: "insensitive" as const } }, { author: { contains: query, mode: "insensitive" as const } }] };
  const [posts, comments, keywords] = await Promise.all([
    prisma.post.findMany({ where: { organizationId: orgId, ...textMatch }, include: { keyword: true }, take: limit, orderBy: { publishedAt: "desc" } }),
    prisma.comment.findMany({ where: { organizationId: orgId, ...textMatch }, include: { keyword: true }, take: limit, orderBy: { publishedAt: "desc" } }),
    prisma.keyword.findMany({ where: { organizationId: orgId, term: { contains: query, mode: "insensitive" } } }),
  ]);

  return { posts, comments, keywords };
}

export async function getFailedItems(orgId: string) {
  const [posts, comments] = await Promise.all([
    prisma.post.findMany({ where: { organizationId: orgId, status: "FAILED" }, include: { keyword: true } }),
    prisma.comment.findMany({ where: { organizationId: orgId, status: "FAILED" }, include: { keyword: true } }),
  ]);
  return { posts, comments };
}
