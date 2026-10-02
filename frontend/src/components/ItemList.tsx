import { useState } from "react";
import type { FeedItem } from "../api/types";
import { SentimentBadge, ConfidenceBar } from "./SentimentBadge";
import { api } from "../api/client";

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString();
}

export function ItemList({
  items,
  emptyMessage = "No items match the current filters yet.",
  onRetried,
}: {
  items: FeedItem[];
  emptyMessage?: string;
  onRetried?: () => void;
}) {
  if (items.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }
  return (
    <div className="item-list">
      {items.map((item) => (
        <ItemCard key={`${item.type}-${item.id}`} item={item} onRetried={onRetried} />
      ))}
    </div>
  );
}

function ItemCard({ item, onRetried }: { item: FeedItem; onRetried?: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      if (item.type === "post") await api.retryPost(item.id);
      else await api.retryComment(item.id);
      onRetried?.();
    } finally {
      setRetrying(false);
    }
  }

  const isTrustpilot = item.platform === "trustpilot" || item.url?.includes("trustpilot");
  const displayType = isTrustpilot ? "REVIEW" : item.type;

  async function handleDelete() {
    const typeLabel = displayType.toLowerCase();
    if (!window.confirm(`Are you sure you want to permanently delete this ${typeLabel}?`)) return;
    setDeleting(true);
    try {
      if (item.type === "post") await api.deletePost(item.id);
      else await api.deleteComment(item.id);
      onRetried?.();
    } catch (err: any) {
      alert(`Failed to delete item: ${err.message || String(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  const sourceUrl = item.url ?? (item.type === "comment" ? item.post?.url : null) ?? null;
  // Replies are indented a little and tagged, so a nested comment isn't mistaken
  // for a top-level one. Indent is capped so deep threads stay readable.
  const replyDepth = item.type === "comment" ? item.depth ?? 0 : 0;

  return (
    <div className="item-card" style={replyDepth > 0 ? { marginLeft: Math.min(replyDepth, 5) * 14, borderLeft: "2px solid var(--accent, #3b82f6)" } : undefined}>
      <div className="item-meta">
        <span className="item-type" style={{ background: isTrustpilot ? "rgba(0, 182, 122, 0.2)" : undefined, color: isTrustpilot ? "#00b67a" : undefined }}>
          {displayType}
        </span>
        <span>keyword: {item.keyword}</span>
        {item.author && <span>by {item.author}</span>}
        <span>{formatDate(item.publishedAt)}</span>
        {item.platform && <span>{item.platform}</span>}
        {replyDepth > 0 && (
          <span className="item-type" title={`Reply nested ${replyDepth} level${replyDepth > 1 ? "s" : ""} deep`}>
            ↳ NESTED L{replyDepth}
          </span>
        )}
      </div>
      <p className="item-text">{item.text || <em style={{ color: "var(--text-dim)" }}>No text content extracted from this item.</em>}</p>
      <div className="item-footer">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SentimentBadge sentiment={item.sentiment} />
          <ConfidenceBar confidence={item.confidence} />
          {item.status === "FAILED" && <span className="badge FAILED">FAILED: {item.processingError}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              View {isTrustpilot ? "Review" : item.type === "post" ? "Post" : "Comment"} ↗
            </a>
          )}
          {item.status === "FAILED" && (
            <button className="secondary" onClick={retry} disabled={retrying || deleting}>
              {retrying ? <span className="spinner" /> : "Retry analysis"}
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={handleDelete}
            disabled={retrying || deleting}
            title={`Delete this ${displayType.toLowerCase()}`}
            style={{
              color: "#f87171",
              borderColor: "rgba(239, 68, 68, 0.3)",
              background: "rgba(239, 68, 68, 0.05)",
              padding: "4px 10px",
              fontSize: 12,
            }}
          >
            {deleting ? <span className="spinner" /> : "🗑 Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
