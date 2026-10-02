import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { FeedItem, ItemsResponse } from "../api/types";
import { SOURCES, sourceOf } from "../brand";
import { Icons, SentimentBadge, SourceIcon, fmtDate, timeAgo } from "../components/ui";
import { MentionDrawer } from "../components/MentionDrawer";

const PAGE = 25;

export function MentionsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [source, setSource] = useState("all");
  const [sentiment, setSentiment] = useState(params.get("sentiment") ?? "all");
  const [days, setDays] = useState<number>(0);
  const [sort, setSort] = useState<"new" | "old">("new");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [debounced, source, sentiment, days]);
  useEffect(() => { if (debounced) setParams({ q: debounced }, { replace: true }); else if (params.get("q")) setParams({}, { replace: true }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    const dateFrom = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;
    api.getItems({
      search: debounced || undefined,
      platform: source !== "all" ? source : undefined,
      sentiment: sentiment !== "all" ? (sentiment as any) : undefined,
      dateFrom,
      page,
      pageSize: PAGE,
    })
      .then(setData)
      .finally(() => setLoading(false));
  }, [debounced, source, sentiment, days, page]);

  const rows = useMemo(() => {
    const r = (data?.items ?? []).slice();
    r.sort((a, b) => (new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime()) * (sort === "new" ? 1 : -1));
    return r;
  }, [data, sort]);

  const total = data?.pagination.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));

  return (
    <>
      <div className="page-head">
        <div><h1>Mentions</h1><p>All mentions of your brand across the web.</p></div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => api.exportToExcel({ scope: "brand", search: debounced || undefined, platform: source !== "all" ? source : undefined, sentiment: sentiment !== "all" ? sentiment : undefined })}>
            <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.download}</span>Export
          </button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <div className="search" style={{ flex: "1 1 260px" }}>
          <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.search}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mentions…" />
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)}><option value="all">All sources</option>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select value={sentiment} onChange={(e) => setSentiment(e.target.value)}><option value="all">All sentiment</option><option value="POSITIVE">Positive</option><option value="NEUTRAL">Neutral</option><option value="NEGATIVE">Negative</option></select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={0}>All time</option><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select>
        <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "old")}><option value="new">Newest first</option><option value="old">Oldest first</option></select>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th>Source</th><th>Author / Community</th><th>Mention</th><th>Sentiment</th><th>Confidence</th><th>Detected</th><th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <tr><td colSpan={8}><div className="empty"><span className="spinner" /></div></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8}><div className="empty">No mentions match these filters.</div></td></tr>}
            {rows.map((it) => (
              <tr key={it.id} className={`clickable${checked.has(it.id) ? " selected" : ""}`} onClick={() => setOpen(it)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.has(it.id)} onChange={() => setChecked((s) => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n; })} /></td>
                <td><span className="src"><SourceIcon platform={it.platform} url={it.url} />{sourceOf(it.platform, it.url).label}</span></td>
                <td className="muted truncate" style={{ maxWidth: 160 }}>{it.author || "—"}<div className="sub">{it.type === "comment" ? "Comment" : it.type === "post" && sourceOf(it.platform, it.url).id === "trustpilot" ? "Review" : "Post"}</div></td>
                <td className="mention"><span className="q">"{it.text || "—"}"</span></td>
                <td><SentimentBadge sentiment={it.sentiment} /></td>
                <td className="num muted">{it.confidence != null ? it.confidence.toFixed(2) : "—"}</td>
                <td className="num muted" style={{ whiteSpace: "nowrap" }}>{timeAgo(it.analyzedAt ?? it.createdAt)}<div className="sub">{fmtDate(it.publishedAt)}</div></td>
                <td>{it.alertSent ? <span className="badge info">Alert sent</span> : <span className="faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tbl-foot">
          <span>{total.toLocaleString()} mentions{checked.size > 0 ? ` · ${checked.size} selected` : ""}</span>
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="num">Page {page} of {pages}</span>
            <button type="button" className="btn ghost sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        </div>
      </div>

      {open && <MentionDrawer item={open} onClose={() => setOpen(null)} onChange={(u) => setData((d) => d && { ...d, items: d.items.map((i) => (i.id === u.id ? u : i)) })} />}
    </>
  );
}
