import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CardStats, CompetitorCard, CompetitorOverview, FeedItem, Overview } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { sourceOf } from "../brand";
import { KeywordCards, type TrackedCard } from "../components/KeywordCards";
import { MentionDrawer } from "../components/MentionDrawer";
import { Icons, SentimentBadge, SourceIcon, timeAgo, useToast } from "../components/ui";

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** One line of the comparison: a name, its volume, and how its analyzed mentions split. */
function CompareRow({ name, stats, you = false }: { name: string; stats: CardStats; you?: boolean }) {
  const analyzed = stats.positive + stats.neutral + stats.negative;
  return (
    <div className={`vs-row${you ? " you" : ""}`}>
      <span style={{ fontWeight: you ? 600 : 500 }}>{name}{you && <span className="badge quiet" style={{ marginLeft: 8 }}>You</span>}</span>
      <span className="num">{stats.mentions.toLocaleString()}</span>
      {analyzed > 0 ? (
        <span className="vs-bar" title={`${stats.positive} positive · ${stats.neutral} neutral · ${stats.negative} negative`}>
          <i style={{ width: `${(stats.positive / analyzed) * 100}%`, background: "var(--positive)" }} />
          <i style={{ width: `${(stats.neutral / analyzed) * 100}%`, background: "var(--neutral)" }} />
          <i style={{ width: `${(stats.negative / analyzed) * 100}%`, background: "var(--negative)" }} />
        </span>
      ) : (
        <span className="faint" style={{ fontSize: 12.5 }}>Not analyzed yet</span>
      )}
      <span className="num" style={{ fontSize: 12.5 }}>
        <span className="pos">{pct(stats.positive, analyzed)}% positive</span> · <span className="neg">{pct(stats.negative, analyzed)}% negative</span>
      </span>
    </div>
  );
}

export function CompetitorsPage() {
  const { organization } = useAuth();
  const toast = useToast();
  const [cards, setCards] = useState<CompetitorCard[]>([]);
  const [overview, setOverview] = useState<CompetitorOverview | null>(null);
  const [brand, setBrand] = useState<Overview | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<FeedItem | null>(null);

  const load = useCallback(async () => {
    const [c, o, b, i] = await Promise.all([
      api.getCompetitorCards(),
      api.getCompetitorOverview(),
      api.getOverview().catch(() => null),
      api.getCompetitorItems({ pageSize: 25 }).catch(() => null),
    ]);
    setCards(c.cards);
    setOverview(o);
    setBrand(b);
    setItems(i?.items ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => { load().catch(() => setLoaded(true)); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(label);
    try {
      await fn();
      toast.show(ok);
      await load();
      return true;
    } catch (e: any) {
      if (e?.status !== 402) toast.show(e?.message || "Something went wrong.", "err");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const remove = (c: TrackedCard) => {
    if (!window.confirm(`Stop tracking "${c.keyword}" on ${c.platform}? Mentions already collected are kept.`)) return;
    void run(`del-${c.id}`, () => api.deleteCompetitorCard(c.id), "Competitor card deleted.");
  };

  const competitors = overview?.competitors ?? [];
  const you: CardStats = { mentions: brand?.totalMentions ?? 0, positive: brand?.positive ?? 0, neutral: brand?.neutral ?? 0, negative: brand?.negative ?? 0 };
  const active = cards.filter((c) => c.enabled).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Competitors</h1>
          <p>Track rival brands with the same scanners and see how your reputation compares.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={busy !== null || active === 0} onClick={() => run("all", () => api.runAllCompetitorCardsNow(), "Competitor scan complete.")}>
            {busy === "all" ? <span className="spinner" /> : <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.refresh}</span>}Scan competitors
          </button>
        </div>
      </div>
      {toast.node}

      <div className="metrics">
        <div className="metric"><div><div className="l">Competitors tracked</div><div className="v num">{competitors.length || new Set(cards.map((c) => c.keyword.toLowerCase())).size}</div><div className="t">{cards.length} card{cards.length === 1 ? "" : "s"}, {active} active</div></div></div>
        <div className="metric"><div><div className="l">Competitor mentions</div><div className="v num">{(overview?.totalMentions ?? 0).toLocaleString()}</div><div className="t">All time</div></div></div>
        <div className="metric"><div><div className="l">Their positive</div><div className="v num pos">{(overview?.positive ?? 0).toLocaleString()}</div><div className="t">{pct(overview?.positive ?? 0, (overview?.positive ?? 0) + (overview?.neutral ?? 0) + (overview?.negative ?? 0))}% of analyzed</div></div></div>
        <div className="metric"><div><div className="l">Their negative</div><div className="v num neg">{(overview?.negative ?? 0).toLocaleString()}</div><div className="t">{pct(overview?.negative ?? 0, (overview?.positive ?? 0) + (overview?.neutral ?? 0) + (overview?.negative ?? 0))}% of analyzed</div></div></div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <h3>You vs. competitors</h3>
          <div className="legend"><span><i className="dot" style={{ color: "var(--positive)" }} />Positive</span><span><i className="dot" style={{ color: "var(--neutral)" }} />Neutral</span><span><i className="dot" style={{ color: "var(--negative)" }} />Negative</span></div>
        </div>
        <div>
          <div className="vs-row head"><span>Brand</span><span>Mentions</span><span>Sentiment split</span><span>Share</span></div>
          <CompareRow name={organization?.brandName ?? "Your brand"} stats={you} you />
          {competitors.map((c) => <CompareRow key={c.keyword} name={c.keyword} stats={c} />)}
          {loaded && competitors.length === 0 && (
            <div className="empty" style={{ padding: 28 }}>
              {cards.length === 0 ? "Add a competitor card below to start comparing." : "No competitor mentions collected yet. Run a scan, or wait for the next hourly cycle."}
            </div>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="empty"><span className="spinner" /></div>
      ) : (
        <KeywordCards
          cards={cards}
          noun="competitor"
          busy={busy}
          placeholder={(p) => (p === "trustpilot" ? "competitor.com" : "Competitor brand")}
          onAdd={(p, keyword) => run("add", () => api.createCompetitorCard({ platform: p, keyword }), "Competitor card added.")}
          onRun={(c) => void run(`run-${c.id}`, () => api.runCompetitorCardNow(c.id), `Scanned "${c.keyword}".`)}
          onToggle={(c) => void run(`tog-${c.id}`, () => api.toggleCompetitorCard(c.id), c.enabled ? "Card paused." : "Card resumed.")}
          onDelete={remove}
        />
      )}

      <div className="tabs" style={{ marginTop: 8 }}><span className="tab active" style={{ cursor: "default" }}>Recent competitor mentions</span></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th style={{ width: 150 }}>Source</th><th style={{ width: 160 }}>Competitor</th><th>Mention</th><th style={{ width: 110 }}>Sentiment</th><th style={{ width: 100 }}>Published</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5}><div className="empty">{loaded ? "No competitor mentions yet." : <span className="spinner" />}</div></td></tr>}
            {items.map((it) => (
              <tr key={`${it.type}:${it.id}`} className="clickable" onClick={() => setOpen(it)}>
                <td><span className="src"><SourceIcon platform={it.platform} url={it.url} />{sourceOf(it.platform, it.url).label}</span></td>
                <td className="truncate" style={{ maxWidth: 160 }}>{it.keyword}</td>
                <td className="mention"><span className="q">"{it.text || "—"}"</span></td>
                <td><SentimentBadge sentiment={it.sentiment} /></td>
                <td className="muted num">{timeAgo(it.publishedAt ?? it.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <MentionDrawer item={open} onClose={() => setOpen(null)} onChange={(u) => setItems((all) => all.map((i) => (i.id === u.id ? u : i)))} />}
    </>
  );
}
