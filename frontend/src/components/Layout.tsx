import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME } from "../brand";

const link = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? " active" : ""}`;

export function Layout() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const initials = (user?.name || user?.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const close = () => setOpen(false);

  return (
    <div className="app-shell">
      <div className="mobile-bar">
        <div className="wordmark" style={{ padding: 0, margin: 0, border: "none" }}>
          <span className="mark">{APP_NAME[0]}</span>
          <span className="name">{APP_NAME}</span>
        </div>
        <button type="button" className="secondary" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
          ☰
        </button>
      </div>
      {open && <div className="scrim" onClick={close} />}

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="wordmark">
          <span className="mark">{APP_NAME[0]}</span>
          <span className="name">{APP_NAME}</span>
        </div>

        {organization && (
          <div className="org-chip">
            <div className="org-name">{organization.name}</div>
            <div className="org-brand">Monitoring: {organization.brandName}</div>
          </div>
        )}

        <div className="nav-section">Monitor</div>
        <NavLink to="/app" end className={link} onClick={close}>Overview</NavLink>
        <NavLink to="/app/mentions" className={link} onClick={close}>Mentions</NavLink>
        <NavLink to="/app/keywords" className={link} onClick={close}>Keywords</NavLink>
        <NavLink to="/app/search-monitor" className={link} onClick={close}>Search Monitor</NavLink>
        <NavLink to="/app/competitors" className={link} onClick={close}>Competitors</NavLink>

        <div className="nav-section">Sentiment</div>
        <NavLink to="/app/negative" className={link} onClick={close}><span className="dot negative" />Negative</NavLink>
        <NavLink to="/app/neutral" className={link} onClick={close}><span className="dot neutral" />Neutral</NavLink>
        <NavLink to="/app/positive" className={link} onClick={close}><span className="dot positive" />Positive</NavLink>

        <div className="nav-section">Workspace</div>
        <NavLink to="/app/failed" className={link} onClick={close}>Needs attention</NavLink>
        <NavLink to="/app/settings" className={link} onClick={close}>Settings</NavLink>

        <div className="user-block">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="n">{user?.name}</div>
            <div className="e">{user?.email}</div>
          </div>
          <button type="button" className="ghost" onClick={handleLogout} title="Sign out">
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
