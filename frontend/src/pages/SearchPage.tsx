import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { SearchResponse } from "../api/types";
import { ItemList } from "../components/ItemList";

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setData(null);
      return;
    }
    setLoading(true);
    api.search(q)
      .then((r) => setData(r))
      .catch((err) => console.error("Search failed:", err))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div>
      <div className="page-header">
        <h2>Search results for "{q}"</h2>
      </div>
      <p style={{ color: "var(--text-dim)", marginTop: -10 }}>
        Searches post text, comment text, authors, and keywords across all stored brand monitoring data.
      </p>

      {loading && <div className="empty-state">Searching…</div>}

      {data && (
        <>
          {data.keywords.length > 0 && (
            <div className="banner info">Matching keywords: {data.keywords.map((k) => k.term).join(", ")}</div>
          )}
          <ItemList
            items={[
              ...data.posts.map((p) => ({ ...p, type: "post" as const })),
              ...data.comments.map((c) => ({ ...c, type: "comment" as const })),
            ]}
          />
        </>
      )}
    </div>
  );
}
