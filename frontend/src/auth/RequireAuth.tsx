import { useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Gate for everything under /app. Shows a quiet loader while the session is checked. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--text-3)" }}>
        <span className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/**
 * Users who are already signed in when they open login/signup go straight to the app.
 * A user who signs in *on* the page is left to the page's own navigation.
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const authedAtOpen = useRef<boolean | null>(null);
  if (loading) return null;
  if (authedAtOpen.current === null) authedAtOpen.current = Boolean(user);
  if (authedAtOpen.current) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
