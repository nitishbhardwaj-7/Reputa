import { NormalizationResult, NormalizedComment, NormalizedPost } from "../types/normalized";

/**
 * DataNormalizer — converts raw Apify dataset items into the app's internal
 * Post/Comment shape. Apify actors (across platforms and authors) do not
 * agree on field names, so this reads a broad set of common variants and
 * takes the first that's present. It never invents data: any field it
 * can't find is left null/undefined, and the original item is always kept
 * as `raw` so nothing is lost.
 *
 * It also does not assume a platform. If nothing in the item indicates a
 * platform (e.g. a "platform"/"source" field, or a recognizable domain in
 * the URL), `platform` is left null rather than guessed.
 */

const POST_TEXT_KEYS = ["text", "caption", "content", "postText", "description", "title", "fullText", "message", "body"];
const COMMENT_TEXT_KEYS = ["text", "commentText", "content", "message", "body"];
const URL_KEYS = ["url", "postUrl", "link", "permalink", "webUrl", "pageUrl", "contentUrl"];
const ID_KEYS = ["id", "postId", "itemId", "shortcode", "guid", "_id", "parsedId"];
const AUTHOR_NAME_KEYS = ["author", "authorName", "username", "userName", "ownerUsername", "user", "handle", "fullName", "name"];
const AUTHOR_URL_KEYS = ["authorUrl", "profileUrl", "userUrl", "authorProfileUrl"];
const DATE_KEYS = ["publishedAt", "timestamp", "date", "createdAt", "createTime", "createdTime", "postedAt", "time"];
const LIKES_KEYS = ["likes", "likesCount", "likeCount", "diggCount", "favoriteCount", "reactionsCount", "upvotes", "upVotes", "score"];
const SHARES_KEYS = ["shares", "sharesCount", "shareCount", "retweetCount", "reposts"];
const COMMENTS_COUNT_KEYS = ["commentsCount", "commentCount", "numComments", "replyCount"];
const COMMENTS_ARRAY_KEYS = ["comments", "latestComments", "topComments", "childComments", "replies"];
const PARENT_ID_KEYS = ["parentId", "parent_id", "parentCommentId", "inReplyTo"];
const DEPTH_KEYS = ["depth", "level", "nestLevel"];
const PLATFORM_KEYS = ["platform", "source", "site", "network"];

// Heuristics that suggest an item is a comment rather than a top-level post
// (used when a dataset mixes both without separate types).
const COMMENT_HINT_KEYS = ["postId", "parentId", "parentCommentId", "in_reply_to", "replyToId"];

export function normalizeApifyItems(items: unknown[]): NormalizationResult {
  const warnings: string[] = [];
  const posts: NormalizedPost[] = [];
  const standaloneComments: NormalizedComment[] = [];

  for (const raw of items) {
    if (!isPlainObject(raw)) {
      warnings.push("Skipped a non-object item in the Apify response.");
      continue;
    }

    if (looksLikeStandaloneComment(raw)) {
      const comment = normalizeComment(raw);
      if (!comment.text) warnings.push(`Comment item ${comment.id ?? "(no id)"} has no extractable text.`);
      standaloneComments.push(comment);
      continue;
    }

    const post = normalizePost(raw);
    if (!post.text) warnings.push(`Post item ${post.id ?? "(no id)"} has no extractable text.`);
    posts.push(post);
  }

  return { posts, standaloneComments, warnings };
}

function looksLikeStandaloneComment(raw: Record<string, unknown>): boolean {
  if (typeof raw.dataType === "string") {
    if (raw.dataType.toLowerCase() === "comment") return true;
    if (raw.dataType.toLowerCase() === "post") return false;
  }
  return COMMENT_HINT_KEYS.some((k) => raw[k] !== undefined && raw[k] !== null);
}

function extractPostText(raw: Record<string, unknown>): string | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : null;
  const body = typeof raw.body === "string" ? raw.body.trim() : null;

  if (title && body && title !== body) {
    return `${title}\n\n${body}`;
  }
  if (body) return body;
  if (title) return title;
  return firstString(raw, POST_TEXT_KEYS);
}

function normalizePost(raw: Record<string, unknown>): NormalizedPost {
  const nestedComments = extractCommentsArray(raw);
  return {
    id: firstString(raw, ID_KEYS),
    platform: firstString(raw, PLATFORM_KEYS) ?? inferPlatformFromUrl(firstString(raw, URL_KEYS)),
    text: extractPostText(raw),
    url: firstString(raw, URL_KEYS),
    author: firstAuthor(raw),
    authorUrl: firstString(raw, AUTHOR_URL_KEYS),
    publishedAt: firstDate(raw, DATE_KEYS),
    likes: firstNumber(raw, LIKES_KEYS),
    shares: firstNumber(raw, SHARES_KEYS),
    commentsCount: firstNumber(raw, COMMENTS_COUNT_KEYS) ?? (nestedComments ? nestedComments.length : null),
    comments: (nestedComments ?? []).map(normalizeComment),
    raw,
  };
}

function normalizeComment(raw: Record<string, unknown>): NormalizedComment {
  return {
    id: firstString(raw, ID_KEYS),
    text: firstString(raw, COMMENT_TEXT_KEYS),
    url: firstString(raw, URL_KEYS),
    author: firstAuthor(raw),
    authorUrl: firstString(raw, AUTHOR_URL_KEYS),
    publishedAt: firstDate(raw, DATE_KEYS),
    likes: firstNumber(raw, LIKES_KEYS),
    parentId: firstString(raw, PARENT_ID_KEYS),
    depth: firstNumber(raw, DEPTH_KEYS),
    raw,
  };
}

function extractCommentsArray(raw: Record<string, unknown>): Record<string, unknown>[] | null {
  for (const key of COMMENTS_ARRAY_KEYS) {
    const val = raw[key];
    if (Array.isArray(val) && val.every(isPlainObject)) {
      return val as Record<string, unknown>[];
    }
  }
  return null;
}

function firstAuthor(raw: Record<string, unknown>): string | null {
  // `user`/`author` are sometimes nested objects rather than strings.
  for (const key of AUTHOR_NAME_KEYS) {
    const val = raw[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (isPlainObject(val)) {
      const nested = firstString(val, ["name", "username", "fullName", "handle"]);
      if (nested) return nested;
    }
  }
  return null;
}

function firstString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number") return String(val);
  }
  return null;
}

function firstNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string" && val.trim() && !Number.isNaN(Number(val))) return Number(val);
  }
  return null;
}

function firstDate(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = raw[key];
    if (val === undefined || val === null || val === "") continue;
    const d = toDate(val);
    if (d) return d.toISOString();
  }
  return null;
}

function toDate(val: unknown): Date | null {
  if (typeof val === "number") {
    // Handle both seconds and milliseconds epoch timestamps.
    const ms = val > 1e12 ? val : val * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === "string") {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function inferPlatformFromUrl(url: string | null): string | null {
  if (!url) return null;
  const domainMap: [RegExp, string][] = [
    [/(twitter\.com|x\.com)/i, "twitter"],
    [/facebook\.com/i, "facebook"],
    [/instagram\.com/i, "instagram"],
    [/tiktok\.com/i, "tiktok"],
    [/linkedin\.com/i, "linkedin"],
    [/youtube\.com|youtu\.be/i, "youtube"],
    [/reddit\.com/i, "reddit"],
  ];
  for (const [re, name] of domainMap) {
    if (re.test(url)) return name;
  }
  return null; // don't guess a platform we can't recognize
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
