import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { CompetitorCard, Overview, PlatformKeywordCard, PlatformStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SOURCES, TRACKABLE_SOURCES, sourceOf } from "../brand";
import { Icons, SourceIcon, timeAgo, useToast } from "../components/ui";

export function SourcesPage() {
  const { organization } = useAuth();
  const toast = useToast();
  const [cards, setCards] = useState<PlatformKeywordCard[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorCard[]>([]);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [perSource, setPerSource] = useState<Record<string, Overview>>({});
  const [failed, setFailed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const [newPlatform, setNewPlatform] = useState("reddit");
  const [newKeyword, setNewKeyword] = useState("");
  const [compPlatform, setCompPlatform] = useState("reddit");
  const [compKeyword, setCompKeyword] = useState("");

  const load = useCallback(async () => {
    const [c, comp, s, f, ...ovs] = await Promise.all([
      api.getPlatformCards(),
      api.getCompetitorCards(),
      api.getSettings(),
      api.getFailed(),
      ...SOURCES.map((src) => api.getOverview(undefined, src.id).catch(() => null)),
    ]);
    setCards(c.cards);
    setCompetitors(comp.cards);
    setPlatform(s.platform);
    setFailed((f.posts?.length ?? 0) + (f.comments?.length ?? 0));
    const map: Record<string, Overview> = {};
    SOURCES.forEach((src, i) => { if (ovs[i]) map[src.id] = ovs[i] as Overview; });
    setPerSource(map);
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(label);
    try { await fn(); toast.show(ok); await load(); } catch (e: any) { toast.show(e?.message || "Something went wrong.", "err"); } finally { setBusy(null); }
  }

  async function addKeyword(e: FormEvent) {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    await run("add", () => api.createPlatformCard({ platform: newPlatform, keyword: newKeyword.trim() }), "Keyword added.");
    setNewKeyword("");
  }

  async function addCompetitor(e: FormEvent) {
    e.preventDefault();
    if (!compKeyword.trim()) return;
    await run("addc", () => api.createCompetitorCard({ platform: compPlatform, keyword: compKeyword.trim() }), "Competitor added.");
    setCompKeyword("");
  }

  const bySource = useMemo(() => {
    const m: Record<string, PlatformKeywordCard[]> = {};
    for (const c of cards) (m[c.platform] ??= []).push(c);
    return m;
  }, [cards]);

  const status = (id: string) => {
    if (id === "google" || id === "youtube") return platform?.searchConfigured ? { cls: "positive", t: "Active" } : { cls: "quiet", t: "Unavailable" };
    const list = bySource[id] ?? [];
    if (list.length === 0) return { cls: "quiet", t: "Not configured" };
    return list.some((c) => c.enabled) ? { cls: "positive", t: "Active" } : { cls: "neutral", t: "Paused" };
  };

  const lastScan = (id: string) => {
    if (id === "google" || id === "youtube") return platform?.searchConfigured ? "Hourly" : "—";
    const t = (bySource[id] ?? []).map((c) => c.lastRunAt).filter(Boolean).sort().pop();
    return t ? timeAgo(t) : "Never";
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Sources</h1><p>Where we look for your brand, and what we listen for on each.</p></div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={busy !== null} onClick={() => run("all", () => api.runAllPlatformCardsNow(), "Scan started for all keywords.")}>
            {busy === "all" ? <span className="spinner" /> : <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.refresh}</span>}Scan all now
          </button>
        </div>
      </div>
      {toast.node}

      <div className="tbl-wrap" style={{ marginBottom: 14 }}>
        <table className="tbl">
          <thead><tr><th>Source</th><th>Connection status</th><th className="r">Mentions</th><th>Sentiment</th><th>Last scan</th><th>Keywords</th><th style={{ width: 90 }} /></tr></thead>
          <tbody>
            {SOURCES.map((src) => {
              const st = status(src.id);
              const ov = perSource[src.id];
              const list = bySource[src.id] ?? [];
              return (
                <tr key={src.id}>
                  <td><span className="src"><SourceIcon platform={src.id} />{src.label}</span></td>
                  <td><span className={`badge ${st.cls}`}>{st.t}</span></td>
                  <td className="r num">{(ov?.totalMentions ?? 0).toLocaleString()}</td>
                  <td>
                    {ov && ov.totalAnalyzed > 0 ? (
                      <span className="row" style={{ gap: 6, fontSize: 12 }}>
                        <span className="pos num">{ov.positivePct}%</span><span className="faint">/</span><span className="neg num">{ov.negativePct}%</span>
                      </span>
                    ) : <span className="faint">—</span>}
                  </td>
                  <td className="muted">{lastScan(src.id)}</td>
                  <td>
                    {src.trackable ? (
                      <span className="row" style={{ gap: 6 }}>
                        {list.length === 0 && <span className="faint">None</span>}
                        {list.map((c) => (
                          <span key={c.id} className={`badge ${c.enabled ? "quiet" : "neutral"}`} style={{ gap: 6, opacity: c.enabled ? 1 : 0.6 }} title={c.enabled ? "Enabled — click to pause" : "Paused — click to enable"}>
                            <button type="button" onClick={() => run(c.id, () => api.togglePlatformCard(c.id), c.enabled ? "Keyword paused." : "Keyword enabled.")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}>{c.keyword}</button>
                            <button type="button" onClick={() => run(`del-${c.id}`, () => api.deletePlatformCard(c.id), "Keyword removed.")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, opacity: 0.6 }} aria-label="Remove">×</button>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="badge quiet">{organization?.brandName ?? "Brand name"}</span>
                    )}
                  </td>
                  <td className="r">
                    {src.trackable && list.length > 0 && (
                      <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => run(`run-${src.id}`, async () => { for (const c of list.filter((x) => x.enabled)) await api.runPlatformCardNow(c.id); }, `${src.label} scan complete.`)}>
                        {busy === `run-${src.id}` ? <span className="spinner" /> : "Scan"}
                      </button>
                    )}
                    {src.id === "google" && platform?.searchConfigured && (
                      <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => run("google", () => api.runGoogleScan({}), "Search scan started.")}>{busy === "google" ? <span className="spinner" /> : "Scan"}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid-eq">
        <form className="form-card" onSubmit={addKeyword}>
          <h3>Add a keyword</h3>
          <p className="muted" style={{ fontSize: 13 }}>Each keyword is scanned on its source every hour.</p>
          <div className="form-row">
            <div className="field"><label>Source</label><select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>{TRACKABLE_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div className="field"><label>Keyword</label><input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} placeholder={newPlatform === "trustpilot" ? "acme.com" : organization?.brandName || "Your brand"} /></div>
          </div>
          <div className="between"><span className="faint" style={{ fontSize: 12 }}>{sourceOf(newPlatform).hint}</span><button type="submit" className="btn secondary" disabled={busy !== null || !newKeyword.trim()}>{busy === "add" ? <span className="spinner" /> : <><span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.plus}</span>Add keyword</>}</button></div>
        </form>

        <div className="form-card">
          <div className="between"><h3>Needs attention</h3>{failed > 0 && <span className="badge negative">{failed} failed</span>}</div>
          <p className="muted" style={{ fontSize: 13 }}>
            {failed === 0 ? "Every captured mention has been analyzed." : `${failed} mention${failed === 1 ? "" : "s"} couldn't be analyzed (usually a temporary AI rate limit). They retry automatically every hour.`}
          </p>
          {failed > 0 && (
            <div className="row">
              <button type="button" className="btn secondary sm" disabled={busy !== null} onClick={() => run("retry", () => api.retryAllFailed(), "Retrying failed items.")}>{busy === "retry" ? <span className="spinner" /> : "Retry now"}</button>
              <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => window.confirm("Delete all failed items? This can't be undone.") && run("clear", () => api.clearAllFailed(), "Failed items removed.")}>Discard</button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Competitors</h3>
          <button type="button" className="btn ghost sm" disabled={busy !== null || competitors.length === 0} onClick={() => run("compall", () => api.runAllCompetitorCardsNow(), "Competitor scan complete.")}>{busy === "compall" ? <span className="spinner" /> : "Scan competitors"}</button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="tbl" style={{ minWidth: 0 }}>
            <thead><tr><th>Source</th><th>Competitor</th><th>Status</th><th>Last scan</th><th style={{ width: 140 }} /></tr></thead>
            <tbody>
              {competitors.length === 0 && <tr><td colSpan={5}><div className="empty" style={{ padding: 24 }}>Track a rival brand to compare sentiment side by side.</div></td></tr>}
              {competitors.map((c) => (
                <tr key={c.id}>
                  <td><span className="src"><SourceIcon platform={c.platform} />{sourceOf(c.platform).label}</span></td>
                  <td>{c.keyword}</td>
                  <td><span className={`badge ${c.enabled ? "positive" : "quiet"}`}>{c.enabled ? "Active" : "Paused"}</span></td>
                  <td className="muted">{c.lastRunAt ? timeAgo(c.lastRunAt) : "Never"}</td>
                  <td className="r">
                    <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => run(`c-${c.id}`, () => api.runCompetitorCardNow(c.id), "Scan complete.")}>{busy === `c-${c.id}` ? <span className="spinner" /> : "Scan"}</button>
                    <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => run(`ct-${c.id}`, () => api.toggleCompetitorCard(c.id), "Updated.")}>{c.enabled ? "Pause" : "Enable"}</button>
                    <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => run(`cd-${c.id}`, () => api.deleteCompetitorCard(c.id), "Competitor removed.")} aria-label="Remove"><span style={{ width: 13, height: 13, display: "inline-flex" }}>{Icons.trash}</span></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={addCompetitor} className="row" style={{ padding: 12, borderTop: "1px solid var(--line)", gap: 8 }}>
            <select value={compPlatform} onChange={(e) => setCompPlatform(e.target.value)}>{TRACKABLE_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <input value={compKeyword} onChange={(e) => setCompKeyword(e.target.value)} placeholder="Competitor brand" style={{ flex: 1, minWidth: 160 }} />
            <button type="submit" className="btn secondary" disabled={busy !== null || !compKeyword.trim()}>{busy === "addc" ? <span className="spinner" /> : "Add competitor"}</button>
          </form>
        </div>
      </div>
    </>
  );
}
