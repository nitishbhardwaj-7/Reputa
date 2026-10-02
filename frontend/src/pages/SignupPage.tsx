import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME } from "../brand";
import { useToast } from "../components/ui";
import { AuthSide, SocialButtons } from "./LoginPage";
import "./marketing.css";

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "aol.com"]);

/** A sensible workspace name to start with; onboarding lets the user change it. */
function guessCompany(name: string, email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain && !FREE_MAIL.has(domain)) {
    const base = domain.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  const first = name.trim().split(/\s+/)[0] || "My";
  return `${first}'s workspace`;
}

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const company = guessCompany(name, email);
      await signup({ name, email, password, organizationName: company, brandName: company });
      navigate("/app/onboarding", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="light auth">
      <div className="pane">
        <Link to="/" className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</Link>
        <div className="form">
          <h1>Create your account.</h1>
          <p className="sub">Start monitoring your brand in minutes.<br />No credit card required.</p>
          <form onSubmit={onSubmit}>
            {error && <div className="err">{error}</div>}
            <div className="field"><label>Full name</label><input type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
            <div className="field"><label>Work email</label><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
            <div className="field"><label>Password</label><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password" /></div>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Create account"}</button>
          </form>
          <div className="or">or continue with</div>
          <SocialButtons onUnavailable={() => toast.show("Single sign-on is coming soon — use your email and password for now.")} />
          <div className="alt">Already have an account? <Link to="/login">Sign in</Link></div>
        </div>
        <div />
      </div>
      <AuthSide text="Turn mentions into opportunities." />
      {toast.node}
    </div>
  );
}
