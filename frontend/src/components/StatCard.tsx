import type { TrendChange } from "../api/types";

/**
 * Week-over-week arrow. `goodDirection` decides the colour: more positive mentions
 * is good, more negative mentions is not, so the same "up" arrow means different
 * things per card. Flat (no change) stays neutral grey.
 */
function TrendArrow({ change, goodDirection, windowDays }: { change: TrendChange; goodDirection: "up" | "down"; windowDays: number }) {
  const { abs, pct } = change;
  const direction = abs > 0 ? "up" : abs < 0 ? "down" : "flat";
  const color =
    direction === "flat" ? "var(--text-dim, #94a3b8)" : direction === goodDirection ? "#22c55e" : "#ef4444";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "–";
  const magnitude = pct === null ? (abs === 0 ? "no change" : `+${abs} new`) : `${Math.abs(pct)}%`;

  return (
    <span
      style={{ color, fontWeight: 600, fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}
      title={`${abs >= 0 ? "+" : ""}${abs} vs the previous ${windowDays} days`}
    >
      {arrow} {magnitude}
      <span style={{ color: "var(--text-dim, #94a3b8)", fontWeight: 400 }}>vs prev {windowDays}d</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  variant,
  trend,
  goodDirection = "up",
  windowDays = 7,
}: {
  label: string;
  value: string | number;
  sub?: string;
  variant?: "positive" | "negative" | "neutral";
  trend?: TrendChange;
  goodDirection?: "up" | "down";
  windowDays?: number;
}) {
  return (
    <div className={`stat-card ${variant ?? ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {trend && (
        <div style={{ marginTop: 4 }}>
          <TrendArrow change={trend} goodDirection={goodDirection} windowDays={windowDays} />
        </div>
      )}
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
