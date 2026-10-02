import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME } from "../brand";
import "./marketing.css";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup({ name, email, password, organizationName, brandName: brandName || organizationName });
      navigate("/app/onboarding", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split mk">
      <aside className="auth-side">
        <Link to="/" className="wordmark" style={{ padding: 0, border: "none", textDecoration: "none" }}>
          <span className="mark">{APP_NAME[0]}</span>
          <span className="name">{APP_NAME}</span>
        </Link>
        <div>
          <h2>Two minutes from now, your first scan is running.</h2>
          <p>Create a workspace, tell us the brand to protect, and pick your platforms. Everything after that is automatic.</p>
          <ul style={{ color: "var(--text-dim)", lineHeight: 1.9, paddingLeft: 18, marginTop: 20 }}>
            <li>Hourly scans across six platforms</li>
            <li>AI sentiment on every mention</li>
            <li>Negative alerts straight to your inbox</li>
          </ul>
        </div>
        <div className="quote">Free during early access. No credit card.</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card fade-in">
          <h1>Create your workspace</h1>
          <p className="sub">Start monitoring your brand in minutes.</p>
          <form onSubmit={onSubmit}>
            {error && <div className="err">{error}</div>}
            <div className="two">
              <label>
                Your name
                <input type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </label>
              <label>
                Company
                <input type="text" autoComplete="organization" required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Acme Inc." />
              </label>
            </div>
            <label>
              Brand to monitor
              <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={organizationName || "Acme"} />
              <span className="field-hint">The name people use when they talk about you. Defaults to your company name.</span>
            </label>
            <label>
              Work email
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </label>
            <label>
              Password
              <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <span className="spinner" /> : "Create workspace →"}
            </button>
          </form>
          <div className="alt">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
