import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME } from "../brand";
import "./marketing.css";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not sign in.");
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
          <h2>Welcome back. Your brand didn't stop being talked about.</h2>
          <p>Your workspace has kept scanning every hour. Sign in to see what's new and what needs a response.</p>
        </div>
        <div className="quote">"The first negative review I ever responded to within the hour — because I actually knew about it."</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card fade-in">
          <h1>Sign in</h1>
          <p className="sub">Enter your details to open your workspace.</p>
          <form onSubmit={onSubmit}>
            {error && <div className="err">{error}</div>}
            <label>
              Email
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </label>
            <label>
              Password
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <span className="spinner" /> : "Sign in"}
            </button>
          </form>
          <div className="alt">
            New here? <Link to="/signup">Create a workspace</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
