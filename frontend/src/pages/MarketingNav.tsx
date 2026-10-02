import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME, SUPPORT_EMAIL } from "../brand";
import { Icons } from "../components/ui";
import { Arrow } from "../marketing/Lines";

export function MarketingNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links = (
    <>
      <a href="/#product">Product</a>
      <a href="/#how">How it works</a>
      <a href="/#integrations">Integrations</a>
      <NavLink to="/pricing">Pricing</NavLink>
    </>
  );
  return (
    <div className="mk-nav-wrap">
    <nav className="mk-nav">
      <Link to="/" className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</Link>
      <div className="links">{links}</div>
      <div className="right">
        {user ? (
          <Link to="/app" className="btn primary sm">Open dashboard <Arrow /></Link>
        ) : (
          <>
            <Link to="/login" className="btn ghost sm">Sign in</Link>
            <Link to="/signup" className="btn primary sm">Start monitoring <Arrow /></Link>
          </>
        )}
        <button type="button" className="btn ghost sm burger" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          <span style={{ width: 16, height: 16, display: "inline-flex" }}>{open ? Icons.close : Icons.menu}</span>
        </button>
      </div>
      {open && <div className="mk-menu" onClick={() => setOpen(false)}>{links}</div>}
    </nav>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mk-footer">
      <div className="wrap inner">
        <div className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</div>
        <div className="links">
          <a href="/#product">Product</a>
          <a href="/#how">How it works</a>
          <a href="/#integrations">Integrations</a>
          <Link to="/pricing">Pricing</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
          <Link to="/login">Sign in</Link>
        </div>
        <div className="copy">© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</div>
      </div>
    </footer>
  );
}
