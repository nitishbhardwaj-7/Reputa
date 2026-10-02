import { prisma } from "../lib/prisma";
import { ProcessingStatus } from "../types/status";
import { buildSourceKey } from "../lib/hash";
import { boundedRaw } from "../lib/raw";
import { fetchApifyResults, ApifyError } from "./apifyService";
import { normalizeApifyItems } from "./dataNormalizer";
import { classifySentiment } from "./sentimentService";
import { sendNegativeMentionAlert } from "./emailService";
import { NormalizedComment } from "../types/normalized";

export interface RunScrapeResult {
  keyword: string;
  scrapeRunId: string;
  itemsReceived: number;
  postsCreated: number;
  commentsCreated: number;
  postsSkippedExisting: number;
  commentsSkippedExisting: number;
  analyzed: number;
  failed: number;
  warnings: string[];
}

/** Finds or creates the tenant's Keyword row for a term. */
export async function upsertKeyword(orgId: string, term: string) {
  return prisma.keyword.upsert({
    where: { organizationId_term: { organizationId: orgId, term } },
    create: { organizationId: orgId, term },
    update: {},
  });
}

/** Apify-backed pipeline (legacy path; the Playwright scrapers are the primary source). */
export async function runScrapeForKeyword(orgId: string, keywordTerm: string): Promise<RunScrapeResult> {
  const term = keywordTerm.trim();
  if (!term) throw new Error("Keyword must not be empty.");

  const keyword = await upsertKeyword(orgId, term);

  let rawItems: unknown[];
  try {
    rawItems = await fetchApifyResults(term);
  } catch (err) {
    const failedRun = await prisma.scrapeRun.create({
      data: {
        organizationId: orgId,
        keywordId: keyword.id,
        status: ProcessingStatus.FAILED,
        rawResponse: "null",
        itemCount: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw new PipelineError(
      err instanceof ApifyError ? err.message : `Apify request failed: ${String(err)}`,
      failedRun.id
    );
  }

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      organizationId: orgId,
      keywordId: keyword.id,
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
      keyword: term, scrapeRunId: scrapeRun.id, itemsReceived: 0, postsCreated: 0, commentsCreated: 0,
      postsSkippedExisting: 0, commentsSkippedExisting: 0, analyzed: 0, failed: 0,
      warnings: ["The source returned zero items for this keyword."],
    };
  }

  const { posts, standaloneComments, warnings } = normalizeApifyItems(rawItems);

  let postsCreated = 0;
  let postsSkipped = 0;
  let commentsCreated = 0;
  let commentsSkipped = 0;
  const createdPostIds: string[] = [];
  const createdCommentIds: string[] = [];

  for (const post of posts) {
    const sourceKey = buildSourceKey({ keyword: term, type: "post", id: post.id, url: post.url, text: post.text, author: post.author });

    const existing = await prisma.post.findUnique({
      where: { organizationId_sourceKey: { organizationId: orgId, sourceKey } },
    });
    if (existing) {
      postsSkipped++;
      for (const c of post.comments) {
        const r = await upsertComment(orgId, c, term, keyword.id, scrapeRun.id, existing.id);
        if (r.created) { commentsCreated++; createdCommentIds.push(r.id); } else commentsSkipped++;
      }
      continue;
    }

    const created = await prisma.post.create({
      data: {
        organizationId: orgId,
        sourceKey,
        keywordId: keyword.id,
        scrapeRunId: scrapeRun.id,
        platform: post.platform ?? null,
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
    createdPostIds.push(created.id);

    for (const c of post.comments) {
      const r = await upsertComment(orgId, c, term, keyword.id, scrapeRun.id, created.id);
      if (r.created) { commentsCreated++; createdCommentIds.push(r.id); } else commentsSkipped++;
    }
  }

  for (const c of standaloneComments) {
    const r = await upsertComment(orgId, c, term, keyword.id, scrapeRun.id, null);
    if (r.created) { commentsCreated++; createdCommentIds.push(r.id); } else commentsSkipped++;
  }

  let analyzed = 0;
  let failed = 0;
  for (const id of createdPostIds) (await analyzePost(id)) ? analyzed++ : failed++;
  for (const id of createdCommentIds) (await analyzeComment(id)) ? analyzed++ : failed++;

  await prisma.scrapeRun.update({
    where: { id: scrapeRun.id },
    data: { status: ProcessingStatus.ANALYZED, completedAt: new Date() },
  });

  return {
    keyword: term, scrapeRunId: scrapeRun.id, itemsReceived: rawItems.length,
    postsCreated, commentsCreated, postsSkippedExisting: postsSkipped, commentsSkippedExisting: commentsSkipped,
    analyzed, failed, warnings,
  };
}

async function upsertComment(
  orgId: string,
  c: NormalizedComment,
  keywordTerm: string,
  keywordId: string,
  scrapeRunId: string,
  postId: string | null
): Promise<{ created: boolean; id: string }> {
  const sourceKey = buildSourceKey({ keyword: keywordTerm, type: "comment", id: c.id, url: c.url, text: c.text, author: c.author });

  const existing = await prisma.comment.findUnique({
    where: { organizationId_sourceKey: { organizationId: orgId, sourceKey } },
  });
  if (existing) return { created: false, id: existing.id };

  const created = await prisma.comment.create({
    data: {
      organizationId: orgId,
      sourceKey,
      keywordId,
      scrapeRunId,
      postId,
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
  return { created: true, id: created.id };
}

function inferPlatform(platform: string | null | undefined, url: string | null | undefined): string {
  if (platform) return platform;
  const u = (url || "").toLowerCase();
  if (u.includes("quora")) return "quora";
  if (u.includes("teamblind")) return "teamblind";
  if (u.includes("trustpilot")) return "trustpilot";
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("reddit")) return "reddit";
  return "web";
}

/** Emails an alert for a NEGATIVE post; marks alertSent only once delivery succeeds so failures retry next cycle. */
async function alertNegativePost(id: string): Promise<boolean> {
  const post = await prisma.post.findUnique({
    where: { id },
    include: { keyword: true, organization: { select: { brandName: true, alertEmails: true } } },
  });
  if (!post || post.sentiment !== "NEGATIVE" || post.alertSent || post.isCompetitor) return false;
  if (post.organization.alertEmails.length === 0) return false;

  const sent = await sendNegativeMentionAlert(
    {
      type: "post",
      keyword: post.keyword.term,
      brandName: post.organization.brandName,
      platform: inferPlatform(post.platform, post.url),
      text: post.text || "",
      author: post.author || "Anonymous",
      url: post.url || "",
      sentiment: "NEGATIVE",
      confidence: post.confidence,
      publishedAt: post.publishedAt || post.createdAt,
    },
    post.organization.alertEmails
  );
  if (sent) await prisma.post.update({ where: { id }, data: { alertSent: true } });
  return sent;
}

/** Emails an alert for a NEGATIVE comment; same delivery-then-mark contract as posts. */
async function alertNegativeComment(id: string): Promise<boolean> {
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { keyword: true, post: true, organization: { select: { brandName: true, alertEmails: true } } },
  });
  if (!comment || comment.sentiment !== "NEGATIVE" || comment.alertSent || comment.isCompetitor) return false;
  if (comment.organization.alertEmails.length === 0) return false;

  const sent = await sendNegativeMentionAlert(
    {
      type: "comment",
      keyword: comment.keyword.term,
      brandName: comment.organization.brandName,
      platform: inferPlatform(comment.post?.platform, comment.url || comment.post?.url),
      text: comment.text || "",
      author: comment.author || "Anonymous",
      url: comment.url || comment.post?.url || "",
      sentiment: "NEGATIVE",
      confidence: comment.confidence,
      publishedAt: comment.publishedAt || comment.createdAt,
    },
    comment.organization.alertEmails
  );
  if (sent) await prisma.comment.update({ where: { id }, data: { alertSent: true } });
  return sent;
}

/** Analyzes a single post by id. Returns true if it ended ANALYZED. Sends an alert when negative. */
export async function analyzePost(id: string): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return false;

  if (!post.text || !post.text.trim()) {
    await prisma.post.update({
      where: { id },
      data: { status: ProcessingStatus.FAILED, processingError: "No text available to analyze." },
    });
    return false;
  }

  await prisma.post.update({ where: { id }, data: { status: ProcessingStatus.PROCESSING } });
  try {
    const result = await classifySentiment(post.text);
    await prisma.post.update({
      where: { id },
      data: {
        status: ProcessingStatus.ANALYZED,
        sentiment: result.sentiment,
        confidence: result.confidence,
        processingError: null,
        analyzedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.post.update({
      where: { id },
      data: { status: ProcessingStatus.FAILED, processingError: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }

  // An email failure must not flip a successful analysis to FAILED.
  await alertNegativePost(id).catch((err) => console.error(`Alert for post ${id} failed:`, err?.message || err));
  return true;
}

/** Analyzes a single comment by id. Returns true if it ended ANALYZED. Sends an alert when negative. */
export async function analyzeComment(id: string): Promise<boolean> {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return false;

  if (!comment.text || !comment.text.trim()) {
    await prisma.comment.update({
      where: { id },
      data: { status: ProcessingStatus.FAILED, processingError: "No text available to analyze." },
    });
    return false;
  }

  await prisma.comment.update({ where: { id }, data: { status: ProcessingStatus.PROCESSING } });
  try {
    const result = await classifySentiment(comment.text);
    await prisma.comment.update({
      where: { id },
      data: {
        status: ProcessingStatus.ANALYZED,
        sentiment: result.sentiment,
        confidence: result.confidence,
        processingError: null,
        analyzedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.comment.update({
      where: { id },
      data: { status: ProcessingStatus.FAILED, processingError: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }

  await alertNegativeComment(id).catch((err) => console.error(`Alert for comment ${id} failed:`, err?.message || err));
  return true;
}

// Items stuck in PROCESSING longer than this are assumed orphaned by a crash/restart.
const STALE_PROCESSING_MS = 30 * 60 * 1000;

function backlogWhere(orgId?: string) {
  return {
    ...(orgId ? { organizationId: orgId } : {}),
    AND: [{ text: { not: null } }, { text: { not: "" } }],
    OR: [
      { status: ProcessingStatus.RECEIVED },
      { status: ProcessingStatus.FAILED },
      { status: ProcessingStatus.PROCESSING, updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    ],
  };
}

/** Analyzes posts/comments that were never analyzed or previously failed. Platform-wide unless an org is given. */
export async function analyzeBacklog(limit = 200, orgId?: string): Promise<{ total: number; analyzed: number; failed: number }> {
  const posts = await prisma.post.findMany({ where: backlogWhere(orgId), select: { id: true }, orderBy: { createdAt: "asc" }, take: limit });
  const comments = await prisma.comment.findMany({
    where: backlogWhere(orgId),
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: Math.max(0, limit - posts.length),
  });

  let analyzed = 0;
  let failed = 0;
  for (const p of posts) (await analyzePost(p.id)) ? analyzed++ : failed++;
  for (const c of comments) (await analyzeComment(c.id)) ? analyzed++ : failed++;
  return { total: posts.length + comments.length, analyzed, failed };
}

/** Retries alerts for NEGATIVE items whose email never went out. Stops at the first failure. */
export async function sendPendingAlerts(limit = 50, orgId?: string): Promise<{ pending: number; sent: number }> {
  const where = { ...(orgId ? { organizationId: orgId } : {}), sentiment: "NEGATIVE", alertSent: false, isCompetitor: false };
  const posts = await prisma.post.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" }, take: limit });
  const comments = await prisma.comment.findMany({
    where,
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: Math.max(0, limit - posts.length),
  });

  let sent = 0;
  for (const p of posts) {
    if (!(await alertNegativePost(p.id))) return { pending: posts.length + comments.length, sent };
    sent++;
  }
  for (const c of comments) {
    if (!(await alertNegativeComment(c.id))) return { pending: posts.length + comments.length, sent };
    sent++;
  }
  return { pending: posts.length + comments.length, sent };
}

export class PipelineError extends Error {
  scrapeRunId?: string;
  constructor(message: string, scrapeRunId?: string) {
    super(message);
    this.name = "PipelineError";
    this.scrapeRunId = scrapeRunId;
  }
}
