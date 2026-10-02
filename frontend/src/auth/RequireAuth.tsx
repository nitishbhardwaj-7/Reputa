import { useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { APP_NAME } from "../brand";

/** Gate for everything under /app. Shows a quiet loader while the session is checked. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="full-center">
        <div className="wordmark" style={{ borderBottom: "none" }}>
          <span className="mark">{APP_NAME[0]}</span>
          <span className="name">{APP_NAME}</span>
        </div>
        <span className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * The inverse: users who are already signed in when they open login/signup go straight
 * to the app. A user who signs in *on* the page is left to the page's own navigation
 * (signup sends people to onboarding, login back to where they came from).
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const authedAtOpen = useRef<boolean | null>(null);
  if (loading) return null;
  if (authedAtOpen.current === null) authedAtOpen.current = Boolean(user);
  if (authedAtOpen.current) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
