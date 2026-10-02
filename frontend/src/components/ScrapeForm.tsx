import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { ScrapeResult } from "../api/types";

export function ScrapeForm({ onComplete }: { onComplete?: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.scrapeKeyword(keyword.trim());
      setResult(res);
      onComplete?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to run scrape.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form className="scrape-form" onSubmit={submit}>
        <input
          type="text"
          placeholder='Keyword, e.g. "Dubai real estate"'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <button type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : "Run Apify Scrape"}
        </button>
      </form>
      {error && <div className="banner warn" style={{ marginTop: 10 }}>{error}</div>}
      {result && (
        <div className="banner info" style={{ marginTop: 10 }}>
          Fetched {result.itemsReceived} item(s) from Apify for "{result.keyword}" — {result.postsCreated} new
          post(s), {result.commentsCreated} new comment(s) stored ({result.postsSkippedExisting +
            result.commentsSkippedExisting}{" "}
          already known, skipped). {result.analyzed} analyzed, {result.failed} failed sentiment analysis.
          {result.warnings.length > 0 && (
            <ul style={{ margin: "6px 0 0 18px" }}>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
