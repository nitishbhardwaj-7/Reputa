// Internal normalized shapes produced by the DataNormalizer from whatever
// the Apify actor returned. Every field except `raw` is best-effort: Apify
// actors vary wildly in field names, so anything we couldn't confidently
// extract is left undefined rather than guessed.

export interface NormalizedComment {
  id?: string | null;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  authorUrl?: string | null;
  publishedAt?: string | null; // ISO string if parseable
  likes?: number | null;
  // Threading, when the source exposes it (Reddit): the scraper-side id of the
  // parent comment, and how deep this reply sits. Top-level = null / 0.
  parentId?: string | null;
  depth?: number | null;
  raw: unknown; // the untouched original item
}

export interface NormalizedPost {
  id?: string | null;
  platform?: string | null;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  authorUrl?: string | null;
  publishedAt?: string | null;
  likes?: number | null;
  shares?: number | null;
  commentsCount?: number | null;
  comments: NormalizedComment[];
  raw: unknown;
}

export interface NormalizationResult {
  posts: NormalizedPost[];
  // Comments that arrived as their own top-level dataset items (not nested
  // under a post) and could not be matched to a known post.
  standaloneComments: NormalizedComment[];
  warnings: string[];
}

export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface SentimentResult {
  sentiment: SentimentLabel;
  confidence: number | null;
}
