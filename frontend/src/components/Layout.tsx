import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { api, PLAN_LIMIT_EVENT } from "../api/client";
import type { Organization } from "../api/types";
import { APP_NAME } from "../brand";
import { Icons } from "./ui";

const link = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

const PLAN_NAMES: Record<string, string> = { trial: "Free trial", starter: "Starter plan", growth: "Growth plan", scale: "Scale plan" };

function daysLeft(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** The strip under the top bar: quiet during a trial, loud once scanning is paused. */
function PlanBanner({ org }: { org: Organization | null }) {
  if (!org) return null;
  const state = org.subscriptionState;
  if (state === "trialing") {
    const d = daysLeft(org.trialEndsAt);
    return (
      <div className={`plan-banner${d <= 3 ? " warn" : ""}`}>
        <span><b>Free trial</b> · {d} day{d === 1 ? "" : "s"} left{d <= 3 ? " — choose a plan to keep scanning without a gap." : ""}</span>
        <Link to="/app/billing">Choose a plan →</Link>
      </div>
    );
  }
  if (state === "past_due") {
    return <div className="plan-banner warn"><span><b>Payment due</b> · the last charge didn't go through.</span><Link to="/app/billing">Update billing →</Link></div>;
  }
  if (state === "expired" || state === "canceled") {
    return (
      <div className="plan-banner stop">
        <span><b>{org.plan === "trial" ? "Your free trial has ended" : "Your subscription has ended"}</b> · scanning and alerts are paused. Your data is safe.</span>
        <Link to="/app/billing">Choose a plan →</Link>
      </div>
    );
  }
  return null;
}

export function Layout() {
  const { user, organization, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [q, setQ] = useState("");
  const [limitMsg, setLimitMsg] = useState<string | null>(null);

  // Open-alert count for the sidebar badge; cheap and refreshed on navigation.
  useEffect(() => {
    api.getOverview().then((o) => setOpenAlerts(o.openAlerts ?? 0)).catch(() => {});
  }, [location.pathname]);

  // Keep the plan state fresh (a trial can end while the tab is open).
  useEffect(() => { refresh().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Any request the plan doesn't cover surfaces here, wherever it was made.
  useEffect(() => {
    let timer = 0;
    const onLimit = (e: Event) => {
      setLimitMsg((e as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLimitMsg(null), 9000);
    };
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => { window.removeEventListener(PLAN_LIMIT_EVENT, onLimit); window.clearTimeout(timer); };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/app/mentions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  }

  const initials = (user?.name || user?.email || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const plan = PLAN_NAMES[organization?.plan ?? "trial"] ?? "Free trial";
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
          <NavLink to="/app/billing" className={link} onClick={close}>{Icons.calendar}Billing</NavLink>
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
        <PlanBanner org={organization} />
        <main className="main fade-in" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      {limitMsg && (
        <div className="toast upsell" role="status">
          <span>{limitMsg}</span>
          <Link to="/app/billing" onClick={() => setLimitMsg(null)}>See plans →</Link>
        </div>
      )}
    </div>
  );
}
