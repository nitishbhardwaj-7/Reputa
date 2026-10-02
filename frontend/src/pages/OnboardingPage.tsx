import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME, TRACKABLE_SOURCES, type PlatformId } from "../brand";
import { SourceIcon } from "../components/ui";
import "./marketing.css";

/** Two steps: name the workspace/brand, then pick a keyword and the sources to scan. */
export function OnboardingPage() {
  const { organization, setOrganization } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [company, setCompany] = useState(organization?.name ?? "");
  const [brand, setBrand] = useState(organization?.brandName ?? "");
  const [keyword, setKeyword] = useState(organization?.brandName ?? "");
  const [selected, setSelected] = useState<Set<PlatformId>>(new Set(["reddit", "quora", "trustpilot", "linkedin"]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveWorkspace(e: FormEvent) {
    e.preventDefault();
    if (!company.trim() || !brand.trim()) return setError("Both fields are required.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateSettings({ name: company.trim(), brandName: brand.trim() });
      setOrganization(res.organization);
      setKeyword((k) => k || brand.trim());
      setStep(2);
    } catch (err: any) {
      setError(err?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: PlatformId) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function saveSources(e: FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return setError("Enter the keyword to monitor.");
    if (selected.size === 0) return setError("Pick at least one source.");
    setBusy(true);
    setError(null);
    try {
      await api.createPlatformCardsBulk({ keyword: keyword.trim(), platforms: Array.from(selected) });
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not save your sources.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="light onb">
      <div className="box fade-in" key={step}>
        <div className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</div>
        <div className="progress" style={{ marginTop: 18 }}><i className="on" /><i className={step === 2 ? "on" : ""} /><i /></div>

        {step === 1 ? (
          <form onSubmit={saveWorkspace} className="stack" style={{ gap: 14 }}>
            <div><h1>Set up your workspace</h1><p className="sub">You can change these any time in Settings.</p></div>
            {error && <div className="err" style={{ background: "#fbe6e6", border: "1px solid #f1b9b9", color: "#a33a3a", padding: "9px 11px", borderRadius: 6, fontSize: 13 }}>{error}</div>}
            <div className="field"><label>Company name</label><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." /></div>
            <div className="field">
              <label>Brand to monitor</label>
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Acme" />
              <span className="hint">The name people use when they talk about you. Used for search scans and alerts.</span>
            </div>
            <div className="between" style={{ marginTop: 6 }}>
              <span />
              <button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Continue"}</button>
            </div>
          </form>
        ) : (
          <form onSubmit={saveSources} className="stack" style={{ gap: 14 }}>
            <div><h1>What should we listen for?</h1><p className="sub">We'll scan each source for this keyword every hour. Add more keywords and competitors later.</p></div>
            {error && <div className="err" style={{ background: "#fbe6e6", border: "1px solid #f1b9b9", color: "#a33a3a", padding: "9px 11px", borderRadius: 6, fontSize: 13 }}>{error}</div>}
            <div className="field">
              <label>Keyword</label>
              <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={brand || "Your brand"} />
              <span className="hint">Usually your brand name. For Trustpilot, your website domain works best (e.g. acme.com).</span>
            </div>
            <div className="field">
              <label>Sources</label>
              <div className="src-grid">
                {TRACKABLE_SOURCES.map((s) => (
                  <label key={s.id} className={`src-opt${selected.has(s.id) ? " on" : ""}`}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    <SourceIcon platform={s.id} size={20} />
                    <span><div className="t">{s.label}</div><div className="h">{s.hint}</div></span>
                  </label>
                ))}
              </div>
              <span className="hint">Google, YouTube and News are scanned automatically for your brand name.</span>
            </div>
            <div className="between" style={{ marginTop: 6 }}>
              <button type="button" className="btn ghost" onClick={() => navigate("/app", { replace: true })} disabled={busy}>Skip for now</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Start monitoring →"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
