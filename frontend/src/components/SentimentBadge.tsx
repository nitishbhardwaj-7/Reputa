import type { Sentiment } from "../api/types";

export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) return <span className="badge NEUTRAL">UNANALYZED</span>;
  return <span className={`badge ${sentiment}`}>{sentiment}</span>;
}

export function ConfidenceBar({ confidence }: { confidence: number | null }) {
  if (confidence === null || confidence === undefined) return <span style={{ color: "var(--text-dim)" }}>—</span>;
  const pct = Math.round(confidence * 100);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="confidence-bar">
        <div style={{ width: `${pct}%` }} />
      </span>
      <span>{pct}%</span>
    </span>
  );
}
