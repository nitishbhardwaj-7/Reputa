import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api/client";

export function Layout() {
  const [health, setHealth] = useState<{ apifyConfigured: boolean; aiConfigured: boolean } | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>
          ORM <span>Dashboard</span>
        </h1>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Overview
        </NavLink>
        <NavLink to="/explorer" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Posts &amp; Comments
        </NavLink>
        <NavLink to="/manual-scraper" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Keywords Cards
        </NavLink>
        <NavLink to="/competitor-dashboard" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Competitor Dashboard
        </NavLink>
        <NavLink to="/google-scraper" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Google Scraper
        </NavLink>
        <NavLink to="/negative" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Negative Mentions
        </NavLink>
        <NavLink to="/neutral" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Neutral Mentions
        </NavLink>
        <NavLink to="/positive" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Positive Mentions
        </NavLink>
        <NavLink to="/failed" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Failed / Retry
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Settings
        </NavLink>

        <div style={{ marginTop: "auto", padding: "10px 8px", fontSize: 11, color: "var(--text-dim)" }}>
          {health && !health.aiConfigured && <div style={{ color: "#ffb4bd" }}>⚠ AI provider not configured</div>}
          {health?.aiConfigured && <div>AI Integration Active</div>}
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
