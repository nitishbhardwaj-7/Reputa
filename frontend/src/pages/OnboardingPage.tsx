import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME, PLATFORMS, type PlatformId } from "../brand";
import "./marketing.css";

/** First-run setup: one keyword across the platforms the user chooses, then straight to the dashboard. */
export function OnboardingPage() {
  const { organization } = useAuth();
  const navigate = useNavigate();

  const [keyword, setKeyword] = useState(organization?.brandName ?? "");
  const [selected, setSelected] = useState<Set<PlatformId>>(new Set(["reddit", "quora", "trustpilot", "linkedin"]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: PlatformId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return setError("Enter the keyword to monitor.");
    if (selected.size === 0) return setError("Pick at least one platform.");
    setBusy(true);
    setError(null);
    try {
      await api.createPlatformCardsBulk({ keyword: keyword.trim(), platforms: Array.from(selected) });
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not save your keywords.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onb mk">
      <div className="onb-card">
        <div className="wordmark" style={{ padding: 0, border: "none", marginBottom: 26 }}>
          <span className="mark">{APP_NAME[0]}</span>
          <span className="name">{APP_NAME}</span>
        </div>
        <div className="progress"><span className="on" /><span className="on" /><span /></div>
        <h1>What should we listen for?</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
          We'll search each platform for this keyword every hour. You can add more keywords and competitors later.
        </p>

        <form onSubmit={onSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {error && <div className="banner error" style={{ margin: 0 }}>{error}</div>}

          <label className="settings-form-group">
            Keyword
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={organization?.brandName || "Your brand"} />
            <span className="field-hint">Usually your brand name. For Trustpilot, your website domain works best (e.g. acme.com).</span>
          </label>

          <div className="settings-form-group">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Platforms</span>
            <div className="platform-grid">
              {PLATFORMS.map((p) => (
                <label key={p.id} className={`platform-opt${selected.has(p.id) ? " on" : ""}`}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span>
                    <div className="pl">{p.label}</div>
                    <div className="ph">{p.hint}</div>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="ghost" onClick={() => navigate("/app", { replace: true })} disabled={busy}>
              Skip for now
            </button>
            <button type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : "Start monitoring →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
