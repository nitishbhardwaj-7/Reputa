import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, AUTH_EXPIRED_EVENT } from "../api/client";
import type { AuthUser, Organization } from "../api/types";

interface AuthState {
  user: AuthUser | null;
  organization: Organization | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { name: string; email: string; password: string; organizationName: string; brandName: string }) => Promise<void>;
  logout: () => Promise<void>;
  setOrganization: (org: Organization) => void;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
      setOrganization(res.organization);
    } catch {
      setUser(null);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => {
      setUser(null);
      setOrganization(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      organization,
      loading,
      refresh,
      async login(email, password) {
        const res = await api.login({ email, password });
        setUser(res.user);
        setOrganization(res.organization);
      },
      async signup(data) {
        const res = await api.signup(data);
        setUser(res.user);
        setOrganization(res.organization);
      },
      async logout() {
        try {
          await api.logout();
        } finally {
          setUser(null);
          setOrganization(null);
        }
      },
      setOrganization,
      setUser,
    }),
    [user, organization, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
