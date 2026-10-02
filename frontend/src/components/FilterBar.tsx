import type { ItemFiltersQuery, KeywordSummary, Sentiment } from "../api/types";

export interface FilterState extends ItemFiltersQuery {}

const DATE_PRESETS = [
  { label: "All time", value: "" },
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export function FilterBar({
  keywords,
  value,
  onChange,
  showSentiment = true,
}: {
  keywords: KeywordSummary[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  showSentiment?: boolean;
}) {
  function setDatePreset(days?: number) {
    if (!days) {
      const { dateFrom, dateTo, ...rest } = value;
      onChange(rest);
      return;
    }
    const from = new Date();
    from.setDate(from.getDate() - days);
    onChange({ ...value, dateFrom: from.toISOString(), dateTo: undefined });
  }

  return (
    <div className="filter-bar">
      <select
        value={value.keyword ?? ""}
        onChange={(e) => onChange({ ...value, keyword: e.target.value || undefined })}
      >
        <option value="">All keywords</option>
        {keywords.map((k) => (
          <option key={k.id} value={k.term}>
            {k.term} ({k._count.posts + k._count.comments})
          </option>
        ))}
      </select>

      {showSentiment && (
        <select
          value={value.sentiment ?? ""}
          onChange={(e) => onChange({ ...value, sentiment: (e.target.value || undefined) as Sentiment | undefined })}
        >
          <option value="">All sentiment</option>
          <option value="POSITIVE">Positive</option>
          <option value="NEGATIVE">Negative</option>
          <option value="NEUTRAL">Neutral</option>
        </select>
      )}

      <select
        value={value.type ?? "both"}
        onChange={(e) => onChange({ ...value, type: e.target.value as FilterState["type"] })}
      >
        <option value="both">Posts + Comments</option>
        <option value="post">Posts only</option>
        <option value="comment">Comments only</option>
      </select>

      <select
        value={value.platform ?? ""}
        onChange={(e) => onChange({ ...value, platform: (e.target.value || undefined) as FilterState["platform"] })}
      >
        <option value="">All platforms</option>
        <option value="reddit">Reddit</option>
        <option value="quora">Quora</option>
        <option value="teamblind">TeamBlind</option>
        <option value="trustpilot">Trustpilot</option>
        <option value="linkedin">LinkedIn</option>
      </select>

      <select
        onChange={(e) => setDatePreset(e.target.value ? Number(e.target.value) : undefined)}
        defaultValue=""
      >
        {DATE_PRESETS.map((p) => (
          <option key={p.label} value={p.days ?? ""}>
            {p.label}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="🔍 Search posts, comments & author..."
        value={value.search ?? value.author ?? ""}
        onChange={(e) => onChange({ ...value, search: e.target.value || undefined, author: undefined })}
        style={{ minWidth: 260 }}
      />
    </div>
  );
}
