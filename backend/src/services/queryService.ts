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

function postWhere(f: ItemFilters): Prisma.PostWhereInput {
  const conditions: Prisma.PostWhereInput[] = [
    { isCompetitor: false },
  ];

  if (f.source) {
    conditions.push({ source: f.source });
  }

  if (f.keyword && f.keyword.trim()) {
    const kw = f.keyword.trim();
    conditions.push({
      keyword: {
        term: {
          equals: kw,
          mode: "insensitive",
        },
      },
    });
  }

  if (f.sentiment) {
    conditions.push({ sentiment: f.sentiment });
  }

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
    conditions.push({
      author: { contains: f.author.trim(), mode: "insensitive" },
    });
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

  return conditions.length > 0 ? { AND: conditions } : {};
}

function commentWhere(f: ItemFilters): Prisma.CommentWhereInput {
  const conditions: Prisma.CommentWhereInput[] = [
    { isCompetitor: false },
  ];

  if (f.source === "google") {
    // Google SERP results are posts only; no comment can match this filter.
    conditions.push({ id: { equals: "__never__" } });
  }

  if (f.keyword && f.keyword.trim()) {
    const kw = f.keyword.trim();
    conditions.push({
      keyword: {
        term: {
          equals: kw,
          mode: "insensitive",
        },
      },
    });
  }

  if (f.sentiment) {
    conditions.push({ sentiment: f.sentiment });
  }

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
    conditions.push({
      author: { contains: f.author.trim(), mode: "insensitive" },
    });
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

  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function purgeSeedKeyword() {
  try {
    const seedKws = await prisma.keyword.findMany({
      where: {
        OR: [
          { term: { equals: "seed", mode: "insensitive" } },
          { term: { equals: "Seed", mode: "insensitive" } },
        ],
      },
    });

    for (const kw of seedKws) {
      await prisma.comment.deleteMany({ where: { keywordId: kw.id } });
      await prisma.post.deleteMany({ where: { keywordId: kw.id } });
      await prisma.scrapeRun.deleteMany({ where: { keywordId: kw.id } });
      await prisma.keyword.delete({ where: { id: kw.id } }).catch(() => {});
    }
  } catch (e) {
    // Ignore if DB busy
  }
}

let lastSyncTime = 0;

export async function syncCompetitorFlags() {
  const now = Date.now();
  if (now - lastSyncTime < 30000) return;
  lastSyncTime = now;

  try {
    const competitorCards = await (prisma as any).competitorCard.findMany().catch(() => []);
    const compKeywordTerms = new Set(competitorCards.map((c: any) => c.keyword.toLowerCase().trim()));

    const competitorNames = ["greencard inc.", "manifest law", "smart green card", "ellis porter", "alma law"];
    competitorNames.forEach((n) => compKeywordTerms.add(n));

    const allKeywords = await prisma.keyword.findMany();

    const brandKwIds: string[] = [];
    const compKwIds: string[] = [];

    for (const kw of allKeywords) {
      const termLower = kw.term.toLowerCase().trim();
      if (compKeywordTerms.has(termLower)) {
        compKwIds.push(kw.id);
      } else {
        brandKwIds.push(kw.id);
      }
    }

    if (brandKwIds.length > 0) {
      await prisma.post.updateMany({
        where: { keywordId: { in: brandKwIds } },
        data: { isCompetitor: false },
      });
      await prisma.comment.updateMany({
        where: { keywordId: { in: brandKwIds } },
        data: { isCompetitor: false },
      });
    }

    if (compKwIds.length > 0) {
      await prisma.post.updateMany({
        where: { keywordId: { in: compKwIds } },
        data: { isCompetitor: true },
      });
      await prisma.comment.updateMany({
        where: { keywordId: { in: compKwIds } },
        data: { isCompetitor: true },
      });
    }
  } catch (e) {
    // Ignore error
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

/** Counts mentions in one window, by sentiment. */
async function countWindow(f: ItemFilters, from: Date, to: Date): Promise<TrendBucket> {
  const windowed: ItemFilters = { ...f, dateFrom: from, dateTo: to };
  const [postAgg, commentAgg] = await Promise.all([
    prisma.post.groupBy({ by: ["sentiment"], where: postWhere(windowed), _count: true }),
    prisma.comment.groupBy({ by: ["sentiment"], where: commentWhere(windowed), _count: true }),
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
 * Week-over-week momentum: the last `windowDays` against the `windowDays` before it,
 * by publish date. createdAt would only measure how much scraping we happened to do.
 * Deliberately independent of any date range picked in the UI, so the arrows always
 * mean the same thing.
 */
export async function getTrend(f: ItemFilters = {}, windowDays = 7) {
  const now = new Date();
  const spanMs = windowDays * 24 * 60 * 60 * 1000;
  const currentFrom = new Date(now.getTime() - spanMs);
  const previousFrom = new Date(now.getTime() - spanMs * 2);

  const base: ItemFilters = { ...f, dateFrom: undefined, dateTo: undefined };
  const [current, previous] = await Promise.all([
    countWindow(base, currentFrom, now),
    countWindow(base, previousFrom, currentFrom),
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
  keyword?: string,
  platform?: string,
  dateFrom?: Date,
  dateTo?: Date,
  source?: ItemFilters["source"]
) {
  await syncCompetitorFlags().catch(() => {});

  const f: ItemFilters = {
    keyword,
    platform: platform && platform !== "all" ? platform : undefined,
    dateFrom,
    dateTo,
    source,
  };
  const pWhere = postWhere(f);
  const cWhere = commentWhere(f);

  const [totalPosts, totalComments, postAgg, commentAgg, sourceAgg, platformAgg, trend] = await Promise.all([
    prisma.post.count({ where: pWhere }),
    prisma.comment.count({ where: cWhere }),
    prisma.post.groupBy({ by: ["sentiment"], where: pWhere, _count: true }),
    prisma.comment.groupBy({ by: ["sentiment"], where: cWhere, _count: true }),
    prisma.post.groupBy({ by: ["source"], where: pWhere, _count: true }),
    prisma.post.groupBy({ by: ["platform"], where: pWhere, _count: true }),
    getTrend(f),
  ]);

  const counts: Record<string, number> = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
  for (const row of [...postAgg, ...commentAgg]) {
    if (row.sentiment) counts[row.sentiment] += row._count;
  }

  const totalAnalyzed = counts.POSITIVE + counts.NEGATIVE + counts.NEUTRAL;
  const pct = (n: number) => (totalAnalyzed > 0 ? Math.round((n / totalAnalyzed) * 1000) / 10 : 0);

  // One total, split by where it came from: scraper posts + their comments vs Google SERP posts.
  const googlePosts = sourceAgg.find((r) => r.source === "google")?._count ?? 0;
  const scraperPosts = totalPosts - googlePosts;
  const byPlatform: Record<string, number> = {};
  for (const row of platformAgg) {
    if (row.platform) byPlatform[row.platform.toLowerCase()] = (byPlatform[row.platform.toLowerCase()] || 0) + row._count;
  }

  return {
    totalPosts,
    totalComments,
    totalMentions: totalPosts + totalComments,
    trend,
    bySource: {
      scraper: scraperPosts + totalComments,
      google: googlePosts,
    },
    byPlatform,
    totalAnalyzed,
    positive: counts.POSITIVE,
    negative: counts.NEGATIVE,
    neutral: counts.NEUTRAL,
    positivePct: pct(counts.POSITIVE),
    negativePct: pct(counts.NEGATIVE),
    neutralPct: pct(counts.NEUTRAL),
  };
}

export async function getItems(f: ItemFilters) {
  await syncCompetitorFlags().catch(() => {});

  const page = f.page && f.page > 0 ? f.page : 1;
  const pageSize = f.pageSize && f.pageSize > 0 ? Math.min(f.pageSize, 200) : 50;
  const skip = (page - 1) * pageSize;

  const wantPosts = f.type !== "comment";
  const wantComments = f.type !== "post";

  const [posts, comments, postCount, commentCount] = await Promise.all([
    wantPosts
      ? prisma.post.findMany({
          where: postWhere(f),
          include: { keyword: true },
          orderBy: { publishedAt: "desc" },
          skip,
          take: pageSize,
        })
      : Promise.resolve([]),
    wantComments
      ? prisma.comment.findMany({
          where: commentWhere(f),
          include: { keyword: true, post: { select: { url: true, text: true } } },
          orderBy: { publishedAt: "desc" },
          skip,
          take: pageSize,
        })
      : Promise.resolve([]),
    wantPosts ? prisma.post.count({ where: postWhere(f) }) : Promise.resolve(0),
    wantComments ? prisma.comment.count({ where: commentWhere(f) }) : Promise.resolve(0),
  ]);

  const items = [
    ...posts.map((p) => ({ type: "post" as const, ...p, keyword: p.keyword.term })),
    ...comments.map((c) => ({ type: "comment" as const, ...c, keyword: c.keyword.term })),
  ].sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return db - da;
  }).slice(0, pageSize);

  return {
    items,
    pagination: { page, pageSize, totalPosts: postCount, totalComments: commentCount, total: postCount + commentCount },
  };
}

export async function getKeywords() {
  await purgeSeedKeyword();
  await syncCompetitorFlags().catch(() => {});

  const competitorCards = await (prisma as any).competitorCard.findMany().catch(() => []);
  const competitorTerms = new Set(competitorCards.map((c: any) => c.keyword.toLowerCase().trim()));

  const all = await prisma.keyword.findMany({
    where: {
      term: { notIn: ["seed", "Seed", "SEED"] },
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { posts: true, comments: true } } },
  });

  return all.filter((kw) => !competitorTerms.has(kw.term.toLowerCase().trim()));
}

export async function getSentimentDistribution(keyword?: string, platform?: string, dateFrom?: Date, dateTo?: Date) {
  return getOverview(keyword, platform, dateFrom, dateTo);
}

export async function getSentimentByKeyword() {
  await purgeSeedKeyword();
  await syncCompetitorFlags().catch(() => {});

  const competitorCards = await (prisma as any).competitorCard.findMany().catch(() => []);
  const competitorTerms = new Set(competitorCards.map((c: any) => c.keyword.toLowerCase().trim()));

  const keywords = await prisma.keyword.findMany({
    where: {
      term: { notIn: ["seed", "Seed", "SEED"] },
    },
  });

  const results = [];
  for (const kw of keywords) {
    const termClean = kw.term.toLowerCase().trim();
    if (competitorTerms.has(termClean)) continue;

    const overview = await getOverview(kw.term);
    if (overview.totalMentions > 0) {
      results.push({ keyword: kw.term, ...overview });
    }
  }
  return results;
}

export async function getSentimentByPlatform(keyword?: string, dateFrom?: Date, dateTo?: Date) {
  const platforms = ["reddit", "quora", "teamblind", "trustpilot"];
  const results = [];
  for (const p of platforms) {
    const overview = await getOverview(keyword, p, dateFrom, dateTo);
    results.push({ platform: p, ...overview });
  }
  return results;
}

export async function getSentimentOverTime(keyword?: string, platform?: string, dateFrom?: Date, dateTo?: Date) {
  const f: ItemFilters = {
    keyword,
    platform: (platform && platform !== "all" ? platform : undefined) as any,
    dateFrom,
    dateTo,
  };
  const pWhere = { ...postWhere(f), publishedAt: { not: null }, sentiment: { not: null } };
  const cWhere = { ...commentWhere(f), publishedAt: { not: null }, sentiment: { not: null } };

  const [posts, comments] = await Promise.all([
    prisma.post.findMany({
      where: pWhere,
      select: { publishedAt: true, sentiment: true },
    }),
    prisma.comment.findMany({
      where: cWhere,
      select: { publishedAt: true, sentiment: true },
    }),
  ]);

  const buckets = new Map<string, { date: string; POSITIVE: number; NEGATIVE: number; NEUTRAL: number }>();
  for (const row of [...posts, ...comments]) {
    if (!row.publishedAt || !row.sentiment) continue;
    const day = row.publishedAt.toISOString().slice(0, 10);
    if (!buckets.has(day)) buckets.set(day, { date: day, POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 });
    const sentimentKey = row.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    buckets.get(day)![sentimentKey]++;
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getNegativeItems(f: Omit<ItemFilters, "sentiment">) {
  return getItems({ ...f, sentiment: Sentiment.NEGATIVE });
}

export async function getNeutralItems(f: Omit<ItemFilters, "sentiment">) {
  return getItems({ ...f, sentiment: Sentiment.NEUTRAL });
}

export async function getPositiveItems(f: Omit<ItemFilters, "sentiment">) {
  return getItems({ ...f, sentiment: Sentiment.POSITIVE });
}

export async function globalSearch(q: string, limit = 50) {
  const query = q.trim();
  if (!query) return { posts: [], comments: [], keywords: [] };

  const [posts, comments, keywords] = await Promise.all([
    prisma.post.findMany({
      where: { OR: [{ text: { contains: query } }, { author: { contains: query } }] },
      include: { keyword: true },
      take: limit,
      orderBy: { publishedAt: "desc" },
    }),
    prisma.comment.findMany({
      where: { OR: [{ text: { contains: query } }, { author: { contains: query } }] },
      include: { keyword: true },
      take: limit,
      orderBy: { publishedAt: "desc" },
    }),
    prisma.keyword.findMany({ where: { term: { contains: query } } }),
  ]);

  return { posts, comments, keywords };
}

export async function getFailedItems() {
  const [posts, comments] = await Promise.all([
    prisma.post.findMany({ where: { status: "FAILED" }, include: { keyword: true } }),
    prisma.comment.findMany({ where: { status: "FAILED" }, include: { keyword: true } }),
  ]);
  return { posts, comments };
}
