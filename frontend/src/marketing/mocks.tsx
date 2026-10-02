import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP_NAME } from "../brand";
import { Donut, Icons, SourceIcon } from "../components/ui";

/* ------------------------------------------------------------------ scaled */
/** Renders a fixed-width design at whatever width its container has, scaling proportionally. */
export function Scaled({ width, children, className }: { width: number; children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  const [h, setH] = useState(0);
  useEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const update = () => { const k = Math.min(1, o.clientWidth / width); setS(k); setH(i.offsetHeight * k); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(o); ro.observe(i);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className={className} style={{ height: h || undefined, position: "relative" }}>
      <div ref={inner} style={{ width, transform: `scale(${s})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ chart helpers */
function pts(values: number[], w: number, h: number, pad = 6, max?: number) {
  const m = max ?? Math.max(...values);
  return values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), h - pad - (v / m) * (h - pad * 2)] as const);
}
export function linePath(values: number[], w: number, h: number, max?: number) {
  return pts(values, w, h, 6, max).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}
function areaPath(values: number[], w: number, h: number, max?: number) {
  const p = pts(values, w, h, 6, max);
  return `${linePath(values, w, h, max)} L${p[p.length - 1][0].toFixed(1)},${h - 6} L${p[0][0].toFixed(1)},${h - 6} Z`;
}

const POS = [12, 18, 15, 22, 20, 28, 26, 31, 29, 36, 34, 40, 38, 44];
const NEU = [8, 10, 9, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17];
const NEG = [6, 7, 5, 8, 6, 5, 7, 6, 4, 5, 4, 3, 4, 3];

export function TimelineChart({ w = 620, h = 190, labels = ["Oct 20", "22", "24", "26", "28", "30", "Nov 1"] }: { w?: number; h?: number; labels?: string[] }) {
  const max = 48;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" data-draw className="chart">
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={6} x2={w - 6} y1={6 + (h - 12) * f} y2={6 + (h - 12) * f} stroke="rgba(15,18,20,0.08)" />)}
      <path d={areaPath(POS, w, h - 18, max)} fill="#15966a" opacity={0.08} />
      <path className="draw" d={linePath(POS, w, h - 18, max)} fill="none" stroke="#15966a" strokeWidth={1.8} pathLength={1} strokeLinejoin="round" />
      <path className="draw" d={linePath(NEU, w, h - 18, max)} fill="none" stroke="#8a8f98" strokeWidth={1.5} pathLength={1} strokeLinejoin="round" />
      <path className="draw" d={linePath(NEG, w, h - 18, max)} fill="none" stroke="#e5484d" strokeWidth={1.8} pathLength={1} strokeLinejoin="round" />
      {labels.map((l, i) => <text key={l} x={6 + (i / (labels.length - 1)) * (w - 12)} y={h - 2} fontSize={10} fill="#9a9ea4" textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} fontFamily="inherit">{l}</text>)}
    </svg>
  );
}

export function Spark({ values, color, w = 160, h = 48 }: { values: number[]; color: string; w?: number; h?: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" data-draw>
      <path d={areaPath(values, w, h)} fill={color} opacity={0.08} />
      <path className="draw" d={linePath(values, w, h)} fill="none" stroke={color} strokeWidth={1.8} pathLength={1} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export const SOURCE_SPLIT = [
  { label: "Reddit", value: 28, color: "#ff6a3d" }, { label: "Google", value: 18, color: "#2878ff" }, { label: "Trustpilot", value: 16, color: "#15966a" },
  { label: "LinkedIn", value: 12, color: "#4f8fd6" }, { label: "Quora", value: 10, color: "#c25c56" }, { label: "YouTube", value: 8, color: "#e5484d" },
  { label: "TeamBlind", value: 6, color: "#6b7078" }, { label: "Others", value: 2, color: "#c9cbcf" },
];

const RECENT = [
  { src: "reddit", who: "r/startups", t: "2m ago", q: "Support took four days to reply and the refund still hasn't landed…", s: "NEGATIVE", alert: true },
  { src: "trustpilot", who: "", t: "5h ago", q: "Fast, thorough, and they actually explained every step. Would recommend.", s: "POSITIVE", alert: false },
  { src: "google", who: "", t: "8h ago", q: "Great product and amazing customer support.", s: "POSITIVE", alert: false },
];

/* ------------------------------------------------------------------ dashboard mock */
export function DashboardMock() {
  return (
    <div className="dm">
      <aside className="dm-sb">
        <div className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</div>
        <nav>
          <span className="on">{Icons.overview}Overview</span>
          <span>{Icons.mentions}Mentions</span>
          <span>{Icons.alerts}Alerts<b>9</b></span>
          <span>{Icons.sources}Sources</span>
          <span>{Icons.reports}Reports</span>
          <span className="gap">{Icons.settings}Settings</span>
        </nav>
        <div className="dm-who"><i>N</i><div><div>Workspace</div><small>Pro plan</small></div></div>
      </aside>
      <div className="dm-main">
        <div className="dm-top">
          <div className="dm-search">{Icons.search}<span>Search mentions, keywords or sources…</span></div>
          <div className="dm-pill">{Icons.calendar}Oct 20, 2026 – Oct 26, 2026</div>
          <div className="dm-pill">Last 7 days ▾</div>
          <div className="dm-ico">{Icons.bell}<i /></div>
          <div className="dm-av">N</div>
        </div>
        <div className="dm-body">
          <h2>Your reputation at a glance.</h2>
          <div className="dm-metrics">
            {[["Total mentions", "1,517", "↑ 12.8%", "up"], ["Positive", "477", "↑ 32.3%", "up"], ["Negative", "61", "↓ 32.7%", "up"], ["Alerts sent", "9", "Last 24 hours", ""]].map(([l, v, t, c]) => (
              <div className="dm-metric" key={l}><span>{l}</span><b className={l === "Negative" ? "neg" : l === "Positive" ? "pos" : ""}>{v}</b><small className={c}>{t}</small></div>
            ))}
          </div>
          <div className="dm-grid">
            <div className="dm-card">
              <div className="dm-ch"><span>Mentions over time</span><span className="dm-legend"><i style={{ color: "#15966a" }} />Positive <i style={{ color: "#8a8f98" }} />Neutral <i style={{ color: "#e5484d" }} />Negative</span></div>
              <div style={{ height: 190, padding: "8px 10px 4px" }}><TimelineChart /></div>
            </div>
            <div className="dm-card">
              <div className="dm-ch"><span>Mentions by source</span></div>
              <div className="dm-donut">
                <Donut slices={SOURCE_SPLIT} total={1517} label="Mentions" size={132} />
                <ul>{SOURCE_SPLIT.map((s) => <li key={s.label}><i style={{ background: s.color }} />{s.label}<em>{s.value}%</em></li>)}</ul>
              </div>
            </div>
          </div>
          <div className="dm-card">
            <div className="dm-tabs"><span className="on">Recent mentions</span><span>All mentions</span><span>Flagged</span><span className="r">All sources ▾ · All sentiment ▾ · Newest first ▾</span></div>
            <table>
              <thead><tr><th>Source</th><th>Mention</th><th>Sentiment</th><th>Time</th><th>Alert</th></tr></thead>
              <tbody>
                {RECENT.map((r) => (
                  <tr key={r.q}>
                    <td><span className="src"><SourceIcon platform={r.src} size={16} />{r.src === "reddit" ? "Reddit" : r.src === "trustpilot" ? "Trustpilot" : "Google"}{r.who && <small>{r.who}</small>}</span></td>
                    <td className="q">"{r.q}"</td>
                    <td><span className={`badge ${r.s}`}>{r.s[0] + r.s.slice(1).toLowerCase()}</span></td>
                    <td className="muted">{r.t}</td>
                    <td>{r.alert ? <span className="badge info">Alert sent</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ report mock */
const BY_SOURCE = [["Reddit", 1076], ["Google", 692], ["Trustpilot", 615], ["LinkedIn", 461], ["Quora", 384], ["YouTube", 307], ["TeamBlind", 230], ["Others", 77]] as const;
const TOP = [
  ["Reddit", "r/SaaS", "Switched from a competitor last month — the migration tooling is genuinely good.", "POSITIVE", 184],
  ["Trustpilot", "", "Billing double-charged us and support took three days to respond.", "NEGATIVE", 96],
  ["Quora", "", "Is Reputa worth it for a two-person marketing team?", "NEUTRAL", 71],
] as const;

export function ReportMock() {
  return (
    <div className="rm">
      <div className="rm-head">
        <div><div className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</div><h3>Reputation report</h3><span>Sep 1, 2026 — Sep 30, 2026</span></div>
        <span className="rm-btn">{Icons.download}Export PDF</span>
      </div>
      <div className="rm-metrics">
        {[["Total mentions", 3842, ""], ["Positive", 2416, "pos"], ["Neutral", 981, ""], ["Negative", 445, "neg"]].map(([l, v, c]) => (
          <div key={l as string}><span>{l}</span><b className={c as string} data-count={v}>{(v as number).toLocaleString()}</b></div>
        ))}
      </div>
      <div className="rm-grid">
        <div className="rm-card">
          <h4>Sentiment distribution</h4>
          <div className="rm-donut">
            <Donut slices={[{ label: "Positive", value: 2416, color: "#15966a" }, { label: "Neutral", value: 981, color: "#8a8f98" }, { label: "Negative", value: 445, color: "#e5484d" }]} total={3842} label="Mentions" size={128} />
            <ul><li><i style={{ background: "#15966a" }} />Positive<em>62.9%</em></li><li><i style={{ background: "#8a8f98" }} />Neutral<em>25.5%</em></li><li><i style={{ background: "#e5484d" }} />Negative<em>11.6%</em></li></ul>
          </div>
        </div>
        <div className="rm-card">
          <h4>Mentions by source</h4>
          <svg viewBox="0 0 320 150" width="100%" data-draw className="rm-bars">
            {BY_SOURCE.map(([l, v], i) => { const h = (v / 1100) * 110; return (
              <g key={l}>
                <rect className="grow" x={14 + i * 38} y={118 - h} width={22} height={h} fill={i === 0 ? "#111315" : "#c9cbcf"} />
                <text x={25 + i * 38} y={134} fontSize={8.5} fill="#70747a" textAnchor="middle" fontFamily="inherit">{l.slice(0, 6)}</text>
                <text x={25 + i * 38} y={112 - h} fontSize={8.5} fill="#111315" textAnchor="middle" fontFamily="inherit">{v.toLocaleString()}</text>
              </g>); })}
          </svg>
        </div>
      </div>
      <div className="rm-grid three">
        <div className="rm-card wide">
          <h4>Most discussed conversations</h4>
          <ul className="rm-list">
            {TOP.map(([src, who, q, s, n]) => (
              <li key={q}><SourceIcon platform={src.toLowerCase()} size={16} /><div><div className="q">"{q}"</div><small>{src}{who ? ` · ${who}` : ""} · {n} interactions</small></div><span className={`badge ${s}`}>{s[0] + s.slice(1).toLowerCase()}</span></li>
            ))}
          </ul>
        </div>
        <div className="rm-card"><h4>Negative trend</h4><div className="rm-spark"><b className="neg">445</b><small>↓ 18.2% vs. August</small><div style={{ height: 48 }}><Spark values={[22, 25, 19, 24, 20, 17, 18, 15, 14, 12, 13, 10]} color="#e5484d" /></div></div></div>
        <div className="rm-card"><h4>Positive trend</h4><div className="rm-spark"><b className="pos">2,416</b><small>↑ 27.4% vs. August</small><div style={{ height: 48 }}><Spark values={[40, 44, 42, 50, 54, 52, 60, 63, 68, 72, 75, 82]} color="#15966a" /></div></div></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ alert mock */
export function AlertMock({ ghost = false }: { ghost?: boolean }) {
  if (ghost) {
    // Earlier alerts in the stack: same chrome, content reduced to skeleton bars.
    return (
      <div className="gm ghost" aria-hidden>
        <div className="gm-head"><span className="gm-m" style={{ opacity: 0.5 }} /><div><i className="sk" style={{ width: 150 }} /><i className="sk" style={{ width: 90 }} /></div></div>
        <i className="sk" style={{ width: "92%" }} /><i className="sk" style={{ width: "64%" }} />
      </div>
    );
  }
  return (
    <div className="gm">
      <div className="gm-head">
        <span className="gm-m"><svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="#e5484d" d="M3 6.5V18h4V10l5 3.8L17 10v8h4V6.5l-9 6.7z" /><path fill="#2878ff" d="M3 6.5 12 13.2 21 6.5V5l-9 6.7L3 5z" opacity={0.9} /></svg></span>
        <div><b>Negative mention detected</b><small>2 minutes ago · {APP_NAME} alerts</small></div>
      </div>
      <p>"Support took four days to reply and the refund still hasn't landed…"</p>
      <div className="gm-meta"><SourceIcon platform="reddit" size={14} />Reddit · r/startups · confidence 0.94</div>
      <span className="btn primary sm">View mention <span className="arr">→</span></span>
    </div>
  );
}
