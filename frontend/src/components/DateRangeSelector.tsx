import { useMemo } from "react";

export interface DateRange {
  startMonth?: string; // "YYYY-MM" (e.g. "2025-06")
  endMonth?: string;   // "YYYY-MM" (e.g. "2026-06")
  presetDays?: number; // e.g. 30 for Recent (30 Days)
}

export function getDateBounds(dr: DateRange): { dateFrom?: string; dateTo?: string } {
  let dateFrom: string | undefined = undefined;
  let dateTo: string | undefined = undefined;

  if (dr.presetDays) {
    const from = new Date();
    from.setDate(from.getDate() - dr.presetDays);
    dateFrom = from.toISOString();
    dateTo = new Date().toISOString();
  } else {
    if (dr.startMonth) {
      const [y, m] = dr.startMonth.split("-").map(Number);
      dateFrom = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString();
    }
    if (dr.endMonth) {
      const [y, m] = dr.endMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      dateTo = lastDay.toISOString();
    }
  }

  return { dateFrom, dateTo };
}

export function DateRangeSelector({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  // Generate selectable months from Jan 2024 up to the current month/year
  const monthOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const startYear = 2024;

    for (let y = startYear; y <= currentYear; y++) {
      const maxMonth = y === currentYear ? currentMonth : 11;
      for (let m = 0; m <= maxMonth; m++) {
        const d = new Date(y, m, 1);
        const val = `${y}-${String(m + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        options.push({ label, value: val });
      }
    }
    return options;
  }, []);

  function handlePreset(months?: number) {
    if (!months) {
      onChange({});
      return;
    }

    const now = new Date();
    const endVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startVal = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;

    onChange({ startMonth: startVal, endMonth: endVal, presetDays: undefined });
  }

  function isLastNMonths(months: number): boolean {
    if (value.presetDays || !value.startMonth || !value.endMonth) return false;
    const now = new Date();
    const endVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startVal = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    return value.startMonth === startVal && value.endMonth === endVal;
  }

  return (
    <div
      className="card"
      style={{
        padding: "16px 20px",
        marginBottom: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      {/* Left: Start Month & End Month Dropdowns */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)" }}>Start Month</label>
          <select
            value={value.startMonth || ""}
            onChange={(e) => onChange({ ...value, startMonth: e.target.value || undefined, presetDays: undefined })}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "var(--bg-panel-alt)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: 13,
              minWidth: 140,
            }}
          >
            <option value="">Select Month</option>
            {monthOptions.map((opt) => (
              <option key={`start-${opt.value}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)" }}>End Month</label>
          <select
            value={value.endMonth || ""}
            onChange={(e) => onChange({ ...value, endMonth: e.target.value || undefined, presetDays: undefined })}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "var(--bg-panel-alt)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: 13,
              minWidth: 140,
            }}
          >
            <option value="">Select Month</option>
            {monthOptions.map((opt) => (
              <option key={`end-${opt.value}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Quick Preset Buttons (All Time, Recent (30D), Last 3M, Last 6M, Last 12M, Reset) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`preset-chip ${!value.startMonth && !value.endMonth && !value.presetDays ? "active" : ""}`}
          onClick={() => onChange({})}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13 }}
        >
          All Time
        </button>

        <button
          type="button"
          className={`preset-chip ${value.presetDays === 30 ? "active" : ""}`}
          onClick={() => onChange({ presetDays: 30 })}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13 }}
        >
          Recent (30 Days)
        </button>

        <button
          type="button"
          className={`preset-chip ${isLastNMonths(3) ? "active" : ""}`}
          onClick={() => handlePreset(3)}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13 }}
        >
          Last 3M
        </button>

        <button
          type="button"
          className={`preset-chip ${isLastNMonths(6) ? "active" : ""}`}
          onClick={() => handlePreset(6)}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13 }}
        >
          Last 6M
        </button>

        <button
          type="button"
          className={`preset-chip ${isLastNMonths(12) ? "active" : ""}`}
          onClick={() => handlePreset(12)}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13 }}
        >
          Last 12M
        </button>

        <button
          type="button"
          onClick={() => onChange({})}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-dim)",
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 10px",
            textDecoration: "underline",
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
