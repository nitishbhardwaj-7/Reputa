import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { FeedItem, Overview, SentimentByKeywordRow, SentimentOverTimeRow } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { sourceOf } from "../brand";
import { Donut, Icons, SentimentBadge, SourceIcon, Sparkline, type DonutSlice } from "../components/ui";

type Tab = "overview" | "sources" | "sentiment" | "topics" | "top";

function monthRange(offset: number): { from: Date; to: Date; label: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const to = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59);
  const f = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return { from, to, label: `${f(from)} — ${f(to)}` };
}

export function ReportsPage() {
  const { organization } = useAuth();
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [ov, setOv] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SentimentOverTimeRow[]>([]);
  const [byKeyword, setByKeyword] = useState<SentimentByKeywordRow[]>([]);
  const [top, setTop] = useState<FeedItem[]>([]);
  const [bySource, setBySource] = useState<{ id: string; ov: Overview }[]>([]);
  const range = useMemo(() => monthRange(offset), [offset]);

  useEffect(() => {
    const from = range.from.toISOString();
    const to = range.to.toISOString();
    Promise.all([
      api.getOverview(undefined, undefined, from, to),
      api.getOverTime(undefined, undefined, from, to),
      api.getByKeyword(),
      api.getItems({ dateFrom: from, dateTo: to, type: "post", pageSize: 200 }),
    ]).then(async ([o, t, k, items]) => {
      setOv(o); setSeries(t); setByKeyword(k);
      setTop(items.items.slice().sort((a, b) => ((b as any).commentsCount ?? 0) + ((b as any).likes ?? 0) - (((a as any).commentsCount ?? 0) + ((a as any).likes ?? 0))).slice(0, 8));
      const ids = Object.keys(o.byPlatform ?? {}).map((p) => sourceOf(p).id);
      const uniq = Array.from(new Set(ids));
      const ovs = await Promise.all(uniq.map((id) => api.getOverview(undefined, id, from, to).then((x) => ({ id, ov: x })).catch(() => null)));
      setBySource(ovs.filter(Boolean) as { id: string; ov: Overview }[]);
    }).catch(() => {});
  }, [range]);

  const chart = useMemo(() => series.map((r) => ({ label: new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), Positive: r.POSITIVE, Neutral: r.NEUTRAL, Negative: r.NEGATIVE })), [series]);
  const spark = (k: keyof SentimentOverTimeRow) => series.slice(-20).map((r) => Number(r[k]) || 0);
  const slices: DonutSlice[] = ov ? [{ label: "Positive", value: ov.positive, color: "#15966a" }, { label: "Neutral", value: ov.neutral, color: "#8a8f98" }, { label: "Negative", value: ov.negative, color: "#e5484d" }] : [];
  const srcMax = Math.max(1, ...bySource.map((s) => s.ov.totalMentions));

  const tabs: { id: Tab; label: string }[] = [{ id: "overview", label: "Overview" }, { id: "sources", label: "Sources" }, { id: "sentiment", label: "Sentiment" }, { id: "topics", label: "Topics" }, { id: "top", label: "Top mentions" }];

  const Stat = ({ label, value, pct, color, k }: { label: string; value: number; pct?: number; color: string; k: keyof SentimentOverTimeRow }) => (
    <div className="metric">
      <div><div className="l">{label}</div><div className="v num">{value.toLocaleString()}</div><div className="t" style={{ color }}>{pct !== undefined ? `${pct}% of analyzed` : "in period"}</div></div>
      <Sparkline values={spark(k)} color={color} />
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>Reputation report</h1><p>A comprehensive overview of {organization?.brandName ?? "your brand"}'s online reputation.</p></div>
        <div className="actions">
          <select value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((o) => <option key={o} value={o}>{monthRange(o).label}</option>)}
          </select>
          <button type="button" className="btn secondary" onClick={() => window.print()}><span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.download}</span>Export PDF</button>
          <button type="button" className="btn secondary" onClick={() => api.exportToExcel({ scope: "brand", dateFrom: range.from.toISOString(), dateTo: range.to.toISOString() })}>Export Excel</button>
        </div>
      </div>

      <div className="tabs">{tabs.map((t) => <button key={t.id} type="button" className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>

      {(tab === "overview" || tab === "sentiment") && ov && (
        <div className="metrics">
          <Stat label="Total mentions" value={ov.totalMentions} color="#9a9ea4" k="POSITIVE" />
          <Stat label="Positive" value={ov.positive} pct={ov.positivePct} color="#15966a" k="POSITIVE" />
          <Stat label="Neutral" value={ov.neutral} pct={ov.neutralPct} color="#8a8f98" k="NEUTRAL" />
          <Stat label="Negative" value={ov.negative} pct={ov.negativePct} color="#e5484d" k="NEGATIVE" />
        </div>
      )}

      {tab === "overview" && (
        <div className="grid-eq">
          <div className="card"><div className="card-head"><h3>Sentiment distribution</h3></div><div className="card-body">
            {ov && ov.totalAnalyzed > 0 ? (
              <div className="donut-wrap"><Donut slices={slices} total={ov.totalAnalyzed} label="Analyzed" /><div className="donut-legend">{slices.map((s) => <div key={s.label}><i className="dot" style={{ color: s.color }} /><span>{s.label}</span><span className="pct">{Math.round((s.value / ov.totalAnalyzed) * 100)}%</span></div>)}</div></div>
            ) : <div className="empty">No analyzed mentions in this period.</div>}
          </div></div>
          <div className="card"><div className="card-head"><h3>Mentions by source</h3></div><div className="card-body">
            {bySource.length === 0 ? <div className="empty">No mentions in this period.</div> : (
              <div className="bars">{bySource.sort((a, b) => b.ov.totalMentions - a.ov.totalMentions).map((s) => (
                <div className="b" key={s.id}><span className="src"><SourceIcon platform={s.id} size={16} />{sourceOf(s.id).label}</span><div className="track"><div className="fill" style={{ width: `${(s.ov.totalMentions / srcMax) * 100}%` }} /></div><span className="n num">{s.ov.totalMentions}</span></div>
              ))}</div>
            )}
          </div></div>
        </div>
      )}

      {tab === "sources" && (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Source</th><th className="r">Mentions</th><th className="r">Positive</th><th className="r">Neutral</th><th className="r">Negative</th><th>Trend</th></tr></thead>
          <tbody>{bySource.length === 0 && <tr><td colSpan={6}><div className="empty">No mentions in this period.</div></td></tr>}
          {bySource.map((s) => (
            <tr key={s.id}><td><span className="src"><SourceIcon platform={s.id} />{sourceOf(s.id).label}</span></td><td className="r num">{s.ov.totalMentions}</td><td className="r num pos">{s.ov.positive}</td><td className="r num">{s.ov.neutral}</td><td className="r num neg">{s.ov.negative}</td>
            <td className={`num ${s.ov.trend && s.ov.trend.change.negative.abs < 0 ? "pos" : s.ov.trend && s.ov.trend.change.negative.abs > 0 ? "neg" : "muted"}`}>{s.ov.trend?.change.negative.pct != null ? `${s.ov.trend.change.negative.abs <= 0 ? "▼" : "▲"} ${Math.abs(s.ov.trend.change.negative.pct)}% negative` : "—"}</td></tr>
          ))}</tbody>
        </table></div>
      )}

      {tab === "sentiment" && (
        <div className="grid-eq">
          <div className="card"><div className="card-head"><h3>Negative trends</h3></div><div className="card-body" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="rgba(15,18,20,0.08)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#70747a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} /><YAxis tick={{ fill: "#70747a", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: "#fff", border: "1px solid rgba(15,18,20,0.14)", boxShadow: "0 4px 16px rgba(11,13,15,0.08)", borderRadius: 6, fontSize: 12 }} /><Area type="monotone" dataKey="Negative" stroke="#e5484d" fill="#e5484d" fillOpacity={0.12} strokeWidth={1.6} dot={false} /></AreaChart></ResponsiveContainer>
          </div></div>
          <div className="card"><div className="card-head"><h3>Positive trends</h3></div><div className="card-body" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="rgba(15,18,20,0.08)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#70747a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} /><YAxis tick={{ fill: "#70747a", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: "#fff", border: "1px solid rgba(15,18,20,0.14)", boxShadow: "0 4px 16px rgba(11,13,15,0.08)", borderRadius: 6, fontSize: 12 }} /><Area type="monotone" dataKey="Positive" stroke="#15966a" fill="#15966a" fillOpacity={0.12} strokeWidth={1.6} dot={false} /></AreaChart></ResponsiveContainer>
          </div></div>
        </div>
      )}

      {tab === "topics" && (
        <div className="card"><div className="card-head"><h3>Top topics</h3><span className="faint" style={{ fontSize: 12 }}>By tracked keyword, all time</span></div><div className="card-body">
          {byKeyword.length === 0 ? <div className="empty">No keyword activity yet.</div> : (
            <div className="bars">{byKeyword.sort((a, b) => b.totalMentions - a.totalMentions).map((k) => (
              <div className="b" key={k.keyword} style={{ gridTemplateColumns: "160px 1fr 120px" }}><span className="truncate">{k.keyword}</span><div className="track"><div className="fill" style={{ width: `${(k.totalMentions / Math.max(1, byKeyword[0].totalMentions)) * 100}%` }} /></div><span className="n num"><span className="pos">{k.positivePct}%</span> · <span className="neg">{k.negativePct}%</span> · {k.totalMentions}</span></div>
            ))}</div>
          )}
        </div></div>
      )}

      {tab === "top" && (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Source</th><th>Mention</th><th>Sentiment</th><th className="r">Engagement</th></tr></thead>
          <tbody>{top.length === 0 && <tr><td colSpan={4}><div className="empty">No posts in this period.</div></td></tr>}
          {top.map((p) => <tr key={p.id}><td><span className="src"><SourceIcon platform={p.platform} url={p.url} />{sourceOf(p.platform, p.url).label}</span></td><td className="mention"><span className="q">"{p.text || "—"}"</span></td><td><SentimentBadge sentiment={p.sentiment} /></td><td className="r num muted">{((p as any).commentsCount ?? 0) + ((p as any).likes ?? 0)}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
