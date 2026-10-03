import { prisma } from "../lib/prisma";

/**
 * Per-card numbers for the Sources and Competitors pages. A card is one keyword on one
 * platform; a comment takes its platform from the thread it belongs to.
 */
type Row = { keyword: string; platform: string; sentiment: string | null; n: number };

async function rows(orgId: string, competitor: boolean): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT k."term" AS keyword, lower(coalesce(p."platform", '')) AS platform, p."sentiment"::text AS sentiment, count(*)::int AS n
    FROM "Post" p JOIN "Keyword" k ON k."id" = p."keywordId"
    WHERE p."organizationId" = ${orgId} AND p."isCompetitor" = ${competitor}
    GROUP BY 1, 2, 3
    UNION ALL
    SELECT k."term", lower(coalesce(p."platform", '')), c."sentiment"::text, count(*)::int
    FROM "Comment" c JOIN "Keyword" k ON k."id" = c."keywordId" LEFT JOIN "Post" p ON p."id" = c."postId"
    WHERE c."organizationId" = ${orgId} AND c."isCompetitor" = ${competitor}
    GROUP BY 1, 2, 3
  `;
}

export interface CardStats {
  mentions: number;
  positive: number;
  negative: number;
  neutral: number;
}

const empty = (): CardStats => ({ mentions: 0, positive: 0, negative: 0, neutral: 0 });

function add(target: CardStats, sentiment: string | null, n: number) {
  target.mentions += n;
  if (sentiment === "POSITIVE") target.positive += n;
  else if (sentiment === "NEGATIVE") target.negative += n;
  else if (sentiment === "NEUTRAL") target.neutral += n;
}

const cardKey = (platform: string, keyword: string) => `${platform.toLowerCase()}|${keyword.trim().toLowerCase()}`;

/** Looks up the numbers for one card. */
export async function cardStatsLookup(orgId: string, competitor: boolean): Promise<(platform: string, keyword: string) => CardStats> {
  const map = new Map<string, CardStats>();
  for (const r of await rows(orgId, competitor)) {
    const key = cardKey(r.platform, r.keyword);
    if (!map.has(key)) map.set(key, empty());
    add(map.get(key)!, r.sentiment, r.n);
  }
  return (platform, keyword) => map.get(cardKey(platform, keyword)) ?? empty();
}

/** One row per competitor name, across every platform it is tracked on. */
export async function competitorBreakdown(orgId: string): Promise<({ keyword: string } & CardStats)[]> {
  const map = new Map<string, { keyword: string } & CardStats>();
  for (const r of await rows(orgId, true)) {
    const key = r.keyword.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { keyword: r.keyword, ...empty() });
    add(map.get(key)!, r.sentiment, r.n);
  }
  return Array.from(map.values()).sort((a, b) => b.mentions - a.mentions);
}
