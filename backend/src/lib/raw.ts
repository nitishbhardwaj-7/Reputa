// ScrapeRun.rawResponse exists for debugging, not as a system of record. Storing the
// entire payload every hour for every tenant was the main driver of database growth
// in the single-tenant version, so it is bounded here.
const MAX_RAW_BYTES = 200_000;

export function boundedRaw(items: unknown): string {
  const full = JSON.stringify(items ?? null);
  if (full.length <= MAX_RAW_BYTES) return full;

  const sample = Array.isArray(items) ? items.slice(0, 10) : null;
  return JSON.stringify({
    truncated: true,
    originalBytes: full.length,
    itemCount: Array.isArray(items) ? items.length : undefined,
    sample,
  });
}
