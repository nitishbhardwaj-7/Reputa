import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { FeedItem } from "../api/types";
import { sourceOf } from "../brand";
import { SentimentBadge, SourceIcon, severityOf, timeAgo } from "../components/ui";
import { MentionDrawer } from "../components/MentionDrawer";

type Tab = "all" | "negative" | "high" | "changes" | "keywords";

export function AlertsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<FeedItem | null>(null);

  const [all, setAll] = useState<FeedItem[]>([]);

  useEffect(() => {
    setLoading(true);
    api.getNegative({ pageSize: 200 }).then((r) => setAll(r.items)).finally(() => setLoading(false));
  }, []);

  // The window is about when we *detected* the mention, not when it was published.
  useEffect(() => {
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    setItems(all.filter((i) => new Date(i.analyzedAt ?? i.createdAt).getTime() >= cutoff));
  }, [all, days]);

  const high = useMemo(() => items.filter((i) => severityOf(i.confidence) === "high"), [items]);
  const openItems = useMemo(() => items.filter((i) => !i.resolvedAt), [items]);
  const rows = tab === "all" ? openItems : tab === "high" ? high : tab === "changes" || tab === "keywords" ? [] : items;
  const openCount = openItems.length;

  const reason = (i: FeedItem) => {
    const sev = severityOf(i.confidence);
    if (sev === "high") return "Strongly negative sentiment";
    if (i.type === "comment") return "Negative reply in a thread";
    return "Negative sentiment";
  };

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "all", label: "All alerts", n: openCount },
    { id: "negative", label: "Negative mentions", n: items.length },
    { id: "high", label: "High-impact", n: high.length },
    { id: "changes", label: "Sentiment changes" },
    { id: "keywords", label: "Keyword alerts" },
  ];

  return (
    <>
      <div className="page-head">
        <div><h1>Alerts</h1><p>Stay ahead of conversations that require attention.</p></div>
        <div className="actions">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>Detected in last 24 hours</option><option value={7}>Detected in last 7 days</option><option value={30}>Detected in last 30 days</option><option value={0}>All time</option></select>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}{t.n !== undefined && <span className="n">{t.n}</span>}
          </button>
        ))}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th style={{ width: 36 }}><input type="checkbox" disabled /></th><th>Source</th><th>Mention</th><th>Severity</th><th>Detected</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7}><div className="empty"><span className="spinner" /></div></td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7}><div className="empty">
                {tab === "changes" ? "Sentiment-change alerts fire when a keyword's negative share jumps week over week. None detected in this window."
                  : tab === "keywords" ? "Keyword alerts notify you when a watched phrase appears. Add keywords in Sources to enable them."
                  : tab === "all" ? "No open alerts in this window. Everything negative has been reviewed." : "No negative mentions in this window. Nice."}
              </div></td></tr>
            )}
            {!loading && rows.map((it) => {
              const sev = severityOf(it.confidence);
              return (
                <tr key={it.id} className="clickable" onClick={() => setOpen(it)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" /></td>
                  <td><span className="src"><SourceIcon platform={it.platform} url={it.url} />{sourceOf(it.platform, it.url).label}</span></td>
                  <td className="mention"><span className="q">"{it.text || "—"}"</span></td>
                  <td><span className={`badge ${sev}`}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</span></td>
                  <td className="muted num" style={{ whiteSpace: "nowrap" }}>{timeAgo(it.analyzedAt ?? it.createdAt)}</td>
                  <td className="muted">{reason(it)}</td>
                  <td>{it.resolvedAt ? <span className="badge quiet">Reviewed</span> : <span className="badge negative">Open</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <>
          <div style={{ display: "none" }}><SentimentBadge sentiment={open.sentiment} /></div>
          <MentionDrawer item={open} onClose={() => setOpen(null)} onChange={(u) => setAll((xs) => xs.map((i) => (i.id === u.id ? u : i)))} />
        </>
      )}
    </>
  );
}
