import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Overview, PlatformKeywordCard, PlatformStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { KeywordCards, type TrackedCard } from "../components/KeywordCards";
import { Icons, SourceIcon, useToast } from "../components/ui";

export function SourcesPage() {
  const { organization } = useAuth();
  const toast = useToast();
  const [cards, setCards] = useState<PlatformKeywordCard[]>([]);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [search, setSearch] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, s, f, g] = await Promise.all([
      api.getPlatformCards(),
      api.getSettings(),
      api.getFailed(),
      api.getOverview(undefined, "google").catch(() => null),
    ]);
    setCards(c.cards);
    setPlatform(s.platform);
    setFailed((f.posts?.length ?? 0) + (f.comments?.length ?? 0));
    setSearch(g);
    setLoaded(true);
  }, []);

  useEffect(() => { load().catch(() => setLoaded(true)); }, [load]);

  /** Runs an action, reports the outcome, and refreshes. Plan-limit errors are announced app-wide. */
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
    if (!window.confirm(`Delete "${c.keyword}" from ${c.platform}? Mentions already collected are kept.`)) return;
    void run(`del-${c.id}`, () => api.deletePlatformCard(c.id), "Card deleted.");
  };

  const enabled = cards.filter((c) => c.enabled).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sources</h1>
          <p>Every card is one keyword on one platform, scanned every hour. {cards.length > 0 ? `${cards.length} card${cards.length === 1 ? "" : "s"}, ${enabled} active.` : ""}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={busy !== null || enabled === 0} onClick={() => run("all", () => api.runAllPlatformCardsNow(), "Scan complete.")}>
            {busy === "all" ? <span className="spinner" /> : <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.refresh}</span>}Scan all now
          </button>
        </div>
      </div>
      {toast.node}

      {!loaded ? (
        <div className="empty"><span className="spinner" /></div>
      ) : (
        <KeywordCards
          cards={cards}
          noun="keyword"
          busy={busy}
          placeholder={(p) => (p === "trustpilot" ? "yourdomain.com" : organization?.brandName || "Your brand")}
          onAdd={(p, keyword) => run("add", () => api.createPlatformCard({ platform: p, keyword }), "Card added.")}
          onRun={(c) => void run(`run-${c.id}`, () => api.runPlatformCardNow(c.id), `Scanned "${c.keyword}".`)}
          onToggle={(c) => void run(`tog-${c.id}`, () => api.togglePlatformCard(c.id), c.enabled ? "Card paused." : "Card resumed.")}
          onDelete={remove}
        />
      )}

      <section className="kw-section">
        <div className="kw-head">
          <SourceIcon platform="google" size={22} />
          <h3>Google, YouTube &amp; News</h3>
          <span className="hint">Scanned automatically for your brand name; no card needed.</span>
        </div>
        <div className="kw-grid">
          <div className="kw-card">
            <div className="top">
              <span className="name">{organization?.brandName ?? "Your brand"}</span>
              <span className={`badge ${platform?.searchConfigured ? "positive" : "quiet"}`}>{platform?.searchConfigured ? "Active" : "Unavailable"}</span>
            </div>
            <div className="nums"><span><b>{(search?.totalMentions ?? 0).toLocaleString()}</b> mentions</span></div>
            <div className="foot">
              <span className="when">Change the brand name in Settings</span>
              <button type="button" className="icon-act" title="Scan now" aria-label="Scan search results now" disabled={busy !== null || !platform?.searchConfigured} onClick={() => run("google", () => api.runGoogleScan({}), "Search scan started.")}>
                {busy === "google" ? <span className="spinner" /> : Icons.refresh}
              </button>
            </div>
          </div>
        </div>
      </section>

      {failed > 0 && (
        <div className="form-card" style={{ maxWidth: "none" }}>
          <div className="between"><h3>Needs attention</h3><span className="badge negative">{failed} failed</span></div>
          <p className="muted" style={{ fontSize: 13 }}>
            {failed} mention{failed === 1 ? "" : "s"} couldn't be analyzed (usually a temporary AI rate limit). They retry automatically every hour.
          </p>
          <div className="row">
            <button type="button" className="btn secondary sm" disabled={busy !== null} onClick={() => run("retry", () => api.retryAllFailed(), "Retrying failed items.")}>{busy === "retry" ? <span className="spinner" /> : "Retry now"}</button>
            <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => window.confirm("Delete all failed items? This can't be undone.") && run("clear", () => api.clearAllFailed(), "Failed items removed.")}>Discard</button>
          </div>
        </div>
      )}
    </>
  );
}
