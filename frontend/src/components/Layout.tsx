import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import { APP_NAME } from "../brand";
import { Icons } from "./ui";

const link = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

export function Layout() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [q, setQ] = useState("");

  // Open-alert count for the sidebar badge; cheap and refreshed on navigation.
  useEffect(() => {
    api.getOverview().then((o) => setOpenAlerts(o.openAlerts ?? 0)).catch(() => {});
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/app/mentions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  }

  const initials = (user?.name || user?.email || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const plan = organization?.plan ? organization.plan.charAt(0).toUpperCase() + organization.plan.slice(1) + " plan" : "";
  const today = new Date();
  const weekAgo = new Date(Date.now() - 6 * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const close = () => setOpen(false);

  return (
    <div className="app">
      {open && <div className="sidebar-scrim" onClick={close} />}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="wordmark"><span className="mark">{APP_NAME[0]}</span>{APP_NAME}</div>
        <nav className="nav">
          <NavLink to="/app" end className={link} onClick={close}>{Icons.overview}Overview</NavLink>
          <NavLink to="/app/mentions" className={link} onClick={close}>{Icons.mentions}Mentions</NavLink>
          <NavLink to="/app/alerts" className={link} onClick={close}>
            {Icons.alerts}Alerts{openAlerts > 0 && <span className="count">{openAlerts > 99 ? "99+" : openAlerts}</span>}
          </NavLink>
          <NavLink to="/app/sources" className={link} onClick={close}>{Icons.sources}Sources</NavLink>
          <NavLink to="/app/reports" className={link} onClick={close}>{Icons.reports}Reports</NavLink>
          <div className="spacer" />
          <NavLink to="/app/settings" className={link} onClick={close}>{Icons.settings}Settings</NavLink>
        </nav>
        <div className="bottom">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="n">{organization?.name ?? "Workspace"}</div>
            <div className="p">{plan}</div>
          </div>
          <button type="button" className="btn ghost sm" onClick={handleLogout} title="Sign out">Sign out</button>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen((v) => !v)} aria-label="Menu">{Icons.menu}</button>
          <form className="search" onSubmit={submitSearch}>
            <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.search}</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mentions, keywords or sources…" />
            <span className="kbd">⌘K</span>
          </form>
          <div className="right">
            <button type="button" className="btn secondary sm" style={{ gap: 8 }} onClick={() => navigate("/app/reports")}>
              <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.calendar}</span>
              {fmt(weekAgo)} – {fmt(today)}, {today.getFullYear()}
            </button>
            <button type="button" className="icon-btn" onClick={() => navigate("/app/alerts")} aria-label="Alerts">
              {Icons.bell}{openAlerts > 0 && <span className="pip" />}
            </button>
            <div className="avatar" title={user?.email}>{initials}</div>
          </div>
        </header>
        <main className="main fade-in" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
