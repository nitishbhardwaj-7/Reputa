import { useEffect, useRef, useState } from "react";
import { sourceOf } from "../brand";
import type { Sentiment } from "../api/types";

/* ---------------------------------------------------------------- source icon */
const SRC_COLORS: Record<string, string> = {
  reddit: "#FF4500",
  google: "#4285F4",
  trustpilot: "#00B67A",
  linkedin: "#0A66C2",
  quora: "#B92B27",
  youtube: "#FF0000",
  teamblind: "#2D2D2D",
};

export function SourceIcon({ platform, url, size = 18 }: { platform?: string | null; url?: string | null; size?: number }) {
  const s = sourceOf(platform, url);
  const bg = SRC_COLORS[s.id] ?? "#6b7078";
  return (
    <span className="src-icon" style={{ width: size, height: size, background: bg, fontSize: size * 0.55 }} title={s.label}>
      {s.id === "google" ? "G" : s.id === "youtube" ? "▶" : s.label[0]}
    </span>
  );
}

export function sourceLabel(platform?: string | null, url?: string | null): string {
  return sourceOf(platform, url).label;
}

/* ---------------------------------------------------------------- sentiment */
export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null | undefined }) {
  if (!sentiment) return <span className="badge quiet">Pending</span>;
  const label = sentiment.charAt(0) + sentiment.slice(1).toLowerCase();
  return <span className={`badge ${sentiment}`}>{label}</span>;
}

/* ---------------------------------------------------------------- time */
export function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* ---------------------------------------------------------------- count-up */
export function useCountUp(target: number, duration = 700): number {
  const [v, setV] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    // Background tabs throttle requestAnimationFrame; settle on the final value regardless.
    if (typeof document !== "undefined" && document.hidden) { setV(target); return; }
    start.current = null;
    let raf = 0;
    const from = 0;
    const step = (ts: number) => {
      if (start.current === null) start.current = ts;
      const p = Math.min(1, (ts - start.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const settle = window.setTimeout(() => { cancelAnimationFrame(raf); setV(target); }, duration + 120);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(settle); };
  }, [target, duration]);
  return v;
}

/* ---------------------------------------------------------------- sparkline */
export function Sparkline({ values, color = "#9a9fa6", width = 92, height = 36 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (!values.length) return <svg width={width} height={height} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `M1,${height} L${pts.join(" L")} L${width - 1},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} fill={color} opacity={0.12} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------- donut */
export interface DonutSlice { label: string; value: number; color: string }

export function Donut({ slices, total, label, size = 150 }: { slices: DonutSlice[]; total?: number; label?: string; size?: number }) {
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#212428" strokeWidth="11" />
      {slices.map((s) => {
        const len = (s.value / sum) * c;
        const el = (
          <circle
            key={s.label}
            cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="11"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            transform="rotate(-90 50 50)" style={{ transition: "stroke-dasharray 0.6s var(--ease)" }}
          />
        );
        offset += len;
        return el;
      })}
      <text x="50" y="48" textAnchor="middle" fill="#ececed" fontSize="15" fontWeight="600" fontFamily="inherit">{(total ?? sum).toLocaleString()}</text>
      {label && <text x="50" y="61" textAnchor="middle" fill="#9a9fa6" fontSize="7.5" fontFamily="inherit">{label}</text>}
    </svg>
  );
}

/* ---------------------------------------------------------------- icons (16px line icons) */
const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
export const Icons = {
  overview: I("M3 12h4l3-8 4 16 3-8h4"),
  mentions: I("M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"),
  alerts: I("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"),
  sources: I("M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7l8.7 5 8.7-5M12 22V12"),
  reports: I("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"),
  settings: I("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"),
  bell: I("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"),
  search: I("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"),
  calendar: I("M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18"),
  menu: I("M3 6h18M3 12h18M3 18h18"),
  close: I("M18 6L6 18M6 6l12 12"),
  external: I("M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"),
  check: I("M20 6L9 17l-5-5"),
  download: I("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"),
  arrow: I("M5 12h14M12 5l7 7-7 7"),
  up: I("M12 19V5M5 12l7-7 7 7"),
  down: I("M12 5v14M19 12l-7 7-7-7"),
  refresh: I("M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"),
  plus: I("M12 5v14M5 12h14"),
  trash: I("M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"),
};

/* ---------------------------------------------------------------- toast */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind?: "ok" | "err" } | null>(null);
  const show = (text: string, kind: "ok" | "err" = "ok") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 4000);
  };
  const node = toast ? <div className={`toast ${toast.kind === "err" ? "err" : ""}`}>{toast.text}</div> : null;
  return { show, node };
}

/* ---------------------------------------------------------------- severity from confidence */
export function severityOf(confidence?: number | null): "high" | "medium" | "low" {
  const c = confidence ?? 0;
  if (c >= 0.9) return "high";
  if (c >= 0.75) return "medium";
  return "low";
}
