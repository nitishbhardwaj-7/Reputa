import crypto from "crypto";

/**
 * Builds a stable dedupe key for a scraped item so the same post/comment
 * is never analyzed twice. Preference order:
 *   1) an explicit id from the source data
 *   2) the item's URL
 *   3) a content hash of (keyword + type + text + author) as a last resort
 * Prefixed with the keyword + type so identical text under different
 * keywords/types doesn't collide.
 */
export function buildSourceKey(parts: {
  keyword: string;
  type: "post" | "comment";
  id?: string | null;
  url?: string | null;
  text?: string | null;
  author?: string | null;
}): string {
  const { keyword, type, id, url, text, author } = parts;
  const base = `${keyword.toLowerCase().trim()}::${type}`;

  if (id) return `${base}::id:${id}`;
  if (url) return `${base}::url:${url}`;

  const contentBasis = `${text ?? ""}::${author ?? ""}`;
  const hash = crypto.createHash("sha256").update(contentBasis).digest("hex").slice(0, 32);
  return `${base}::hash:${hash}`;
}
