import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME, SUPPORT_EMAIL } from "../brand";
import { useToast } from "../components/ui";
import "./marketing.css";

/* ------------------------------------------------------------------ Google Identity Services */
declare global {
  interface Window { google?: any }
}

let gisLoading: Promise<void> | null = null;
function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new Error("Could not load Google sign-in.")); };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

const GoogleMark = () => (
  <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z" /><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.8H1.8v3A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.6 14.6a7.2 7.2 0 0 1 0-4.6V7H1.8a12 12 0 0 0 0 10.8l3.8-3.2z" /><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 7l3.8 3C6.5 6.8 9 4.8 12 4.8z" /></svg>
);

/**
 * "Continue with Google" + "Continue with Microsoft".
 * When the platform has a Google client id, Google's own button is rendered (its ID-token
 * flow only works from a button Google draws). Otherwise our placeholder explains it's not on yet.
 */
export function SocialButtons({ onGoogle, onUnavailable }: { onGoogle: (credential: string) => void; onUnavailable: (provider: string) => void }) {
  const [clientId, setClientId] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement>(null);
  const handler = useRef(onGoogle);
  handler.current = onGoogle;

  useEffect(() => {
    let alive = true;
    api.authConfig().then((c) => alive && setClientId(c.googleClientId)).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadGoogleIdentity()
      .then(() => {
        if (!alive || !slot.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r: { credential?: string }) => r.credential && handler.current(r.credential),
          ux_mode: "popup",
        });
        window.google.accounts.id.renderButton(slot.current, {
          type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular",
          logo_alignment: "center", width: Math.min(400, Math.max(200, slot.current.offsetWidth)),
        });
      })
      .catch(() => alive && setClientId(null));
    return () => { alive = false; };
  }, [clientId]);

  return (
    <div className={`social${clientId ? " with-gsi" : ""}`}>
      {clientId ? (
        <div ref={slot} className="gsi-slot" />
      ) : (
        <button type="button" className="btn secondary" onClick={() => onUnavailable("Google")}><GoogleMark />Continue with Google</button>
      )}
      <button type="button" className="btn secondary" onClick={() => onUnavailable("Microsoft")}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z" /><path fill="#7FBA00" d="M13 1h10v10H13z" /><path fill="#00A4EF" d="M1 13h10v10H1z" /><path fill="#FFB900" d="M13 13h10v10H13z" /></svg>
        Continue with Microsoft
      </button>
    </div>
  );
}

/** Monochrome architectural panel used beside both auth forms. */
export function AuthSide({ text }: { text: string }) {
  return (
    <aside className="side" aria-hidden>
      <div className="bands" />
      <div className="vt">{text}</div>
    </aside>
  );
}

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/app";
  const toast = useToast();

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

  async function onGoogle(credential: string) {
    setBusy(true);
    setError(null);
    try {
      const { created } = await loginWithGoogle(credential);
      navigate(created ? "/app/onboarding" : from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="light auth">
      <div className="pane">
        <Link to="/" className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</Link>
        <div className="form">
          <h1>Welcome back.</h1>
          <p className="sub">Your reputation is always changing.<br />Stay informed.</p>
          <form onSubmit={onSubmit}>
            {error && <div className="err">{error}</div>}
            <div className="field"><label>Work email</label><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
            <div className="field">
              <div className="label-row"><label>Password</label><a className="forgot" href={`mailto:${SUPPORT_EMAIL}?subject=Password%20reset`}>Forgot password?</a></div>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
            </div>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Sign in"}</button>
          </form>
          <div className="or">or continue with</div>
          <SocialButtons onGoogle={onGoogle} onUnavailable={(p) => toast.show(`${p} sign-in is coming soon — use your email and password for now.`)} />
          <div className="alt">Don't have an account? <Link to="/signup">Create one</Link></div>
        </div>
        <div />
      </div>
      <AuthSide text="Stay ahead of the conversation." />
      {toast.node}
    </div>
  );
}
