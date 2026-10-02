import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ItemList } from "../components/ItemList";

export function FailedPage() {
  const [data, setData] = useState<{ posts: any[]; comments: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.getFailed()
      .then((r) => setData(r))
      .catch((err) => console.error("Failed to load failed items:", err))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleRetryAll() {
    setRetryingAll(true);
    setStatusMessage("Retrying AI sentiment analysis for all failed items...");
    try {
      const res = await api.retryAllFailed();
      setStatusMessage(`✓ Re-analyzed ${res.analyzed} items successfully! (${res.failed} remaining failed).`);
      load();
    } catch (err: any) {
      setStatusMessage(`⚠ Error retrying analysis: ${err.message || String(err)}`);
    } finally {
      setRetryingAll(false);
    }
  }

  async function handleClearAll() {
    if (!data) return;
    const totalCount = data.posts.length + data.comments.length;
    if (!window.confirm(`Are you sure you want to permanently delete all ${totalCount} failed items? This cannot be undone.`)) {
      return;
    }
    setClearingAll(true);
    setStatusMessage("Clearing all failed items...");
    try {
      const res = await api.clearAllFailed();
      setStatusMessage(`✓ Permanently deleted ${res.totalDeleted} failed items (${res.deletedPosts} posts, ${res.deletedComments} comments).`);
      load();
    } catch (err: any) {
      setStatusMessage(`⚠ Error clearing failed items: ${err.message || String(err)}`);
    } finally {
      setClearingAll(false);
    }
  }

  const items = data
    ? [
        ...data.posts.map((p) => ({ ...p, type: "post" as const, keyword: p.keyword?.term ?? p.keyword })),
        ...data.comments.map((c) => ({ ...c, type: "comment" as const, keyword: c.keyword?.term ?? c.keyword })),
      ]
    : [];

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>Failed Items</h2>
          <p style={{ color: "var(--text-dim)", margin: "4px 0 0", fontSize: 13 }}>
            Items whose AI sentiment analysis failed (e.g. AI API key issue or rate limit). The original scraped data is preserved — retry re-runs sentiment analysis without re-scraping.
          </p>
        </div>

        {items.length > 0 && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="secondary"
              onClick={handleClearAll}
              disabled={clearingAll || retryingAll}
              style={{ height: 38, padding: "0 18px", whiteSpace: "nowrap", color: "#f87171", borderColor: "rgba(239, 68, 68, 0.4)" }}
            >
              {clearingAll ? (
                <>
                  <span className="spinner" style={{ marginRight: 8 }} />
                  Clearing…
                </>
              ) : (
                `🗑 Clear All (${items.length})`
              )}
            </button>

            <button
              type="button"
              onClick={handleRetryAll}
              disabled={retryingAll || clearingAll}
              style={{ height: 38, padding: "0 18px", whiteSpace: "nowrap" }}
            >
              {retryingAll ? (
                <>
                  <span className="spinner" style={{ marginRight: 8 }} />
                  Retrying {items.length} Items…
                </>
              ) : (
                `🚀 Retry All (${items.length} Items)`
              )}
            </button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className={`banner ${statusMessage.startsWith("✓") ? "info" : "warn"}`} style={{ marginBottom: 20 }}>
          {statusMessage}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">No failed items 🎉</div>
      ) : (
        <ItemList items={items} onRetried={load} />
      )}
    </div>
  );
}
