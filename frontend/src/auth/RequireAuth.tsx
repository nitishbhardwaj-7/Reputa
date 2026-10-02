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

/** The inverse: signed-in users shouldn't see login/signup again. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
