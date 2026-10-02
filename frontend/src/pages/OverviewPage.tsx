import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { FeedItem, Overview, SentimentOverTimeRow } from "../api/types";
import { sourceOf } from "../brand";
import { Donut, Icons, SentimentBadge, SourceIcon, Sparkline, timeAgo, useCountUp, type DonutSlice } from "../components/ui";
import { MentionDrawer } from "../components/MentionDrawer";

const SRC_COLORS: Record<string, string> = {
  reddit: "#E8705C", google: "#7EA6F0", trustpilot: "#3DBE8B", linkedin: "#6FA3D8", quora: "#C96B6B", youtube: "#D96C6C", teamblind: "#8A8F98", other: "#5A5F66",
};

function Metric({ label, value, change, good = "up", series, color, sub }: { label: string; value: number; change?: { abs: number; pct: number | null } | null; good?: "up" | "down"; series?: number[]; color?: string; sub?: string }) {
  const n = useCountUp(value);
  const dir = change ? (change.abs > 0 ? "up" : change.abs < 0 ? "down" : "flat") : "flat";
  const cls = dir === "flat" ? "" : dir === good ? "up" : "down";
  return (
    <div className="metric">
      <div>
        <div className="l">{label}</div>
        <div className="v num">{n.toLocaleString()}</div>
        {change ? (
          <div className={`t ${cls}`}>
            {dir !== "flat" && <span style={{ width: 11, height: 11, display: "inline-flex" }}>{dir === "up" ? Icons.up : Icons.down}</span>}
            {change.pct === null ? (change.abs === 0 ? "No change" : `+${change.abs} new`) : `${Math.abs(change.pct)}%`}
          </div>
        ) : (
          <div className="t">{sub}</div>
        )}
      </div>
      {series && <Sparkline values={series} color={color ?? "#9a9fa6"} />}
    </div>
  );
}

export function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SentimentOverTimeRow[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const [tab, setTab] = useState<"recent" | "all" | "flagged">("recent");
  const [srcFilter, setSrcFilter] = useState("all");
  const [sentFilter, setSentFilter] = useState("all");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getOverview(), api.getOverTime(), api.getItems({ pageSize: 60 })])
      .then(([o, t, i]) => { setOverview(o); setSeries(t); setItems(i.items); })
      .catch((e) => setError(e?.message || "Could not load your dashboard."))
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    const cutoff = Date.now() - range * 86400000;
    const byDay = new Map(series.map((r) => [r.date, r]));
    const out: { date: string; label: string; Positive: number; Neutral: number; Negative: number }[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const r = byDay.get(key);
      out.push({ date: key, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), Positive: r?.POSITIVE ?? 0, Neutral: r?.NEUTRAL ?? 0, Negative: r?.NEGATIVE ?? 0 });
    }
    return out.filter((r) => new Date(r.date).getTime() >= cutoff - 86400000);
  }, [series, range]);

  const spark = (k: "Positive" | "Negative" | "total") => chartData.slice(-14).map((r) => (k === "total" ? r.Positive + r.Neutral + r.Negative : r[k]));

  const slices: DonutSlice[] = useMemo(() => {
    const agg = new Map<string, number>();
    for (const [plat, n] of Object.entries(overview?.byPlatform ?? {})) {
      const id = sourceOf(plat).id;
      const key = SRC_COLORS[id] ? id : "other";
      agg.set(key, (agg.get(key) ?? 0) + n);
    }
    return Array.from(agg.entries()).sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ label: id === "other" ? "Others" : sourceOf(id).label, value, color: SRC_COLORS[id] }));
  }, [overview]);
  const sliceTotal = slices.reduce((a, s) => a + s.value, 0);

  const rows = useMemo(() => {
    let r = items.slice();
    if (tab === "flagged") r = r.filter((i) => i.sentiment === "NEGATIVE");
    if (srcFilter !== "all") r = r.filter((i) => sourceOf(i.platform, i.url).id === srcFilter);
    if (sentFilter !== "all") r = r.filter((i) => i.sentiment === sentFilter);
    r.sort((a, b) => (new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime()) * (sort === "new" ? 1 : -1));
    return tab === "recent" ? r.slice(0, 8) : r;
  }, [items, tab, srcFilter, sentFilter, sort]);

  const sources = useMemo(() => Array.from(new Set(items.map((i) => sourceOf(i.platform, i.url).id))), [items]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your reputation at a glance.</h1>
          <p>Real-time mentions, sentiment analysis, and instant alerts — all in one place.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => api.exportToExcel({ scope: "brand" })}>
            <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.download}</span>Export report
          </button>
        </div>
      </div>

      {error && <div className="banner err">{error}</div>}

      <div className="metrics">
        <Metric label="Total mentions" value={overview?.totalMentions ?? 0} change={overview?.trend?.change.total} series={spark("total")} color="#9a9fa6" />
        <Metric label="Positive" value={overview?.positive ?? 0} change={overview?.trend?.change.positive} series={spark("Positive")} color="#34b37d" />
        <Metric label="Negative" value={overview?.negative ?? 0} change={overview?.trend?.change.negative} good="down" series={spark("Negative")} color="#e46464" />
        <Metric label="Alerts sent" value={overview?.alertsSent24h ?? 0} sub="Last 24 hours" series={spark("Negative").map((v) => Math.min(v, 9))} color="#9a9fa6" />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Mentions over time</h3>
            <div className="row" style={{ gap: 14 }}>
              <div className="legend"><span><i className="dot" style={{ color: "#34b37d" }} />Positive</span><span><i className="dot" style={{ color: "#8a8f98" }} />Neutral</span><span><i className="dot" style={{ color: "#e46464" }} />Negative</span></div>
              <select value={range} onChange={(e) => setRange(Number(e.target.value) as 7 | 30 | 90)} style={{ height: 28, fontSize: 12 }}>
                <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>
          <div className="card-body" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  {[["p", "#34b37d"], ["n", "#8a8f98"], ["g", "#e46464"]].map(([id, c]) => (
                    <linearGradient key={id} id={`g-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.22} /><stop offset="100%" stopColor={c} stopOpacity={0} /></linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#292c30" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#6b7078", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: "#6b7078", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1c1f23", border: "1px solid #33373c", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "#9a9fa6" }} />
                <Area type="monotone" dataKey="Positive" stroke="#34b37d" strokeWidth={1.6} fill="url(#g-p)" dot={false} activeDot={{ r: 3 }} />
                <Area type="monotone" dataKey="Neutral" stroke="#8a8f98" strokeWidth={1.4} fill="url(#g-n)" dot={false} activeDot={{ r: 3 }} />
                <Area type="monotone" dataKey="Negative" stroke="#e46464" strokeWidth={1.6} fill="url(#g-g)" dot={false} activeDot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Mentions by source</h3></div>
          <div className="card-body">
            {loading ? (
              <div className="empty"><span className="spinner" /></div>
            ) : sliceTotal === 0 ? (
              <div className="empty">No mentions yet. Add sources to start scanning.</div>
            ) : (
              <div className="donut-wrap">
                <Donut slices={slices} total={sliceTotal} label="Mentions" />
                <div className="donut-legend">
                  {slices.map((s) => (
                    <div key={s.label}><i className="dot" style={{ color: s.color }} /><span>{s.label}</span><span className="pct">{Math.round((s.value / sliceTotal) * 100)}%</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={`tab${tab === "recent" ? " active" : ""}`} onClick={() => setTab("recent")}>Recent mentions</button>
        <button type="button" className={`tab${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>All mentions</button>
        <button type="button" className={`tab${tab === "flagged" ? " active" : ""}`} onClick={() => setTab("flagged")}>Flagged <span className="n">{items.filter((i) => i.sentiment === "NEGATIVE").length}</span></button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", paddingBottom: 6 }}>
          <select value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)} style={{ height: 28, fontSize: 12 }}>
            <option value="all">All sources</option>{sources.map((s) => <option key={s} value={s}>{sourceOf(s).label}</option>)}
          </select>
          <select value={sentFilter} onChange={(e) => setSentFilter(e.target.value)} style={{ height: 28, fontSize: 12 }}>
            <option value="all">All sentiment</option><option value="POSITIVE">Positive</option><option value="NEUTRAL">Neutral</option><option value="NEGATIVE">Negative</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "old")} style={{ height: 28, fontSize: 12 }}>
            <option value="new">Newest first</option><option value="old">Oldest first</option>
          </select>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th style={{ width: 150 }}>Source</th><th>Mention</th><th style={{ width: 110 }}>Sentiment</th><th style={{ width: 90 }}>Time</th><th style={{ width: 110 }}>Alert</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5}><div className="empty"><span className="spinner" /></div></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5}><div className="empty">Nothing here yet. Mentions appear as soon as the first scan completes.</div></td></tr>}
            {rows.map((it) => (
              <tr key={it.id} className="clickable" onClick={() => setOpen(it)}>
                <td><span className="src"><SourceIcon platform={it.platform} url={it.url} />{sourceOf(it.platform, it.url).label}</span></td>
                <td className="mention"><span className="q">"{it.text || "—"}"</span></td>
                <td><SentimentBadge sentiment={it.sentiment} /></td>
                <td className="muted num">{timeAgo(it.publishedAt ?? it.createdAt)}</td>
                <td>{it.alertSent ? <span className="badge info">Alert sent</span> : <span className="faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <MentionDrawer item={open} onClose={() => setOpen(null)} onChange={(u) => setItems((all) => all.map((i) => (i.id === u.id ? u : i)))} />}
    </>
  );
}
