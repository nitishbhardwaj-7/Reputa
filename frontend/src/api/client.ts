import type {
  AuthResponse,
  AuthUser,
  Organization,
  OrgSettingsResponse,
  Overview,
  KeywordSummary,
  ItemsResponse,
  ItemFiltersQuery,
  SentimentByKeywordRow,
  SentimentByPlatformRow,
  SentimentOverTimeRow,
  ScrapeResult,
  SearchResponse,
  ManualScrapePayload,
  ManualScrapeResult,
  PlatformKeywordCard,
  CompetitorCard,
  CompetitorOverview,
  CronStatus,
  GoogleMentionsResponse,
  GoogleStatsResponse,
  GoogleScanPayload,
  GoogleMention,
  BillingResponse,
  BillingInterval,
  PaidPlanId,
} from "./types";

function getApiBaseUrl(): string {
  // Same-origin by default: nginx proxies /api to the backend in production and
  // Vite proxies it in development. Override only for a split deployment.
  let raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";
  raw = raw.trim().replace(/\/+$/, "");
  if (raw.startsWith("/")) return raw;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) raw = `https://${raw}`;
  if (!raw.endsWith("/api")) raw = `${raw}/api`;
  return raw;
}

export const BASE_URL = getApiBaseUrl();

/** Fired when the server says the session is gone; the auth provider listens and signs out. */
export const AUTH_EXPIRED_EVENT = "reputa:auth-expired";

/** Fired when the server answers 402: the workspace's plan doesn't cover the request. */
export const PLAN_LIMIT_EVENT = "reputa:plan-limit";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function announcePlanLimit(message: string) {
  window.dispatchEvent(new CustomEvent(PLAN_LIMIT_EVENT, { detail: message }));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      code = body?.code;
    } catch {
      // non-JSON error body
    }
    if (res.status === 402) announcePlanLimit(message);
    if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/signup") && !path.startsWith("/auth/google")) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(message, res.status, code);
  }
  return res.json();
}

function toQuery(filters: Record<string, any> = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  // ---------------------------------------------------------------- auth
  health: () => request<{ ok: boolean; app: string; aiConfigured: boolean; searchConfigured: boolean; smtpConfigured: boolean }>("/health"),
  me: () => request<AuthResponse>("/auth/me"),
  login: (data: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  signup: (data: { name: string; email: string; password: string; organizationName: string; brandName: string }) =>
    request<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  authConfig: () => request<{ googleClientId: string | null }>("/auth/config"),
  googleAuth: (credential: string) => request<AuthResponse>("/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  updateProfile: (data: { name: string }) =>
    request<{ user: AuthUser }>("/auth/me", { method: "PATCH", body: JSON.stringify(data) }),
  changePassword: (data: { currentPassword?: string; newPassword: string }) =>
    request<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify(data) }),

  // ---------------------------------------------------------------- settings
  getSettings: () => request<OrgSettingsResponse>("/settings"),
  updateSettings: (data: { name?: string; brandName?: string; alertEmails?: string[] }) =>
    request<{ ok: boolean; organization: Organization }>("/settings", { method: "PATCH", body: JSON.stringify(data) }),
  testEmail: () => request<{ ok: boolean; message: string }>("/settings/test-email", { method: "POST" }),

  // ---------------------------------------------------------------- overview & feed
  getOverview: (keyword?: string, platform?: string, dateFrom?: string, dateTo?: string, source?: "scraper" | "google") =>
    request<Overview>(`/overview${toQuery({ keyword, platform, dateFrom, dateTo, source })}`),
  getKeywords: () => request<{ keywords: KeywordSummary[] }>("/keywords"),
  deleteKeyword: (id: string) => request<{ ok: boolean; message: string }>(`/keywords/${id}`, { method: "DELETE" }),
  scrapeKeyword: (keyword: string) =>
    request<ScrapeResult>("/keywords/scrape", { method: "POST", body: JSON.stringify({ keyword }) }),
  getItems: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items${toQuery(filters)}`),
  getNegative: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items/negative${toQuery(filters)}`),
  getNeutral: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items/neutral${toQuery(filters)}`),
  getPositive: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items/positive${toQuery(filters)}`),
  getFailed: () => request<{ posts: any[]; comments: any[] }>("/items/failed"),
  search: (q: string) => request<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),

  // ---------------------------------------------------------------- charts
  getDistribution: (keyword?: string, platform?: string, dateFrom?: string, dateTo?: string) =>
    request<Overview>(`/charts/distribution${toQuery({ keyword, platform, dateFrom, dateTo })}`),
  getByKeyword: () => request<SentimentByKeywordRow[]>("/charts/by-keyword"),
  getByPlatform: (keyword?: string, dateFrom?: string, dateTo?: string) =>
    request<SentimentByPlatformRow[]>(`/charts/by-platform${toQuery({ keyword, dateFrom, dateTo })}`),
  getOverTime: (keyword?: string, platform?: string, dateFrom?: string, dateTo?: string) =>
    request<SentimentOverTimeRow[]>(`/charts/over-time${toQuery({ keyword, platform, dateFrom, dateTo })}`),

  // ---------------------------------------------------------------- retry / delete
  retryPost: (id: string) => request<{ id: string; analyzed: boolean }>(`/retry/post/${id}`, { method: "POST" }),
  retryComment: (id: string) => request<{ id: string; analyzed: boolean }>(`/retry/comment/${id}`, { method: "POST" }),
  retryAllFailed: () => request<{ ok: boolean; total: number; analyzed: number; failed: number }>("/retry/all", { method: "POST" }),
  clearAllFailed: () =>
    request<{ ok: boolean; deletedPosts: number; deletedComments: number; totalDeleted: number }>("/retry/all", { method: "DELETE" }),
  resolveItem: (kind: "post" | "comment", id: string, resolved: boolean) =>
    request<{ ok: boolean; id: string; resolvedAt: string | null }>(`/items/${kind}/${id}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({ resolved }),
    }),
  deletePost: (id: string) => request<{ ok: boolean; id: string }>(`/items/post/${id}`, { method: "DELETE" }),
  deleteComment: (id: string) => request<{ ok: boolean; id: string }>(`/items/comment/${id}`, { method: "DELETE" }),
  deleteFailedPost: (id: string) => request<{ ok: boolean; id: string }>(`/items/post/${id}`, { method: "DELETE" }),
  deleteFailedComment: (id: string) => request<{ ok: boolean; id: string }>(`/items/comment/${id}`, { method: "DELETE" }),

  // ---------------------------------------------------------------- keyword cards & scraping
  runManualScrape: (payload: ManualScrapePayload) =>
    request<ManualScrapeResult>("/manual-scraper/scrape", { method: "POST", body: JSON.stringify(payload) }),
  getPlatformCards: () => request<{ cards: PlatformKeywordCard[] }>("/platform-keywords"),
  createPlatformCard: (data: { platform: string; keyword: string; searchUrl?: string }) =>
    request<{ ok: boolean; card: PlatformKeywordCard }>("/platform-keywords", { method: "POST", body: JSON.stringify(data) }),
  createPlatformCardsBulk: (data: { keyword: string; platforms: string[] }) =>
    request<{ ok: boolean; cards: PlatformKeywordCard[] }>("/platform-keywords/bulk", { method: "POST", body: JSON.stringify(data) }),
  deletePlatformCard: (id: string) => request<{ ok: boolean; message: string }>(`/platform-keywords/${id}`, { method: "DELETE" }),
  togglePlatformCard: (id: string) =>
    request<{ ok: boolean; card: PlatformKeywordCard }>(`/platform-keywords/${id}/toggle`, { method: "PATCH" }),
  runPlatformCardNow: (id: string, _payload?: unknown) =>
    request<{ ok: boolean; result: ManualScrapeResult }>(`/platform-keywords/run-card/${id}`, { method: "POST", body: "{}" }),
  runAllPlatformCardsNow: () =>
    request<{ ok: boolean; message: string; newItems?: number }>("/platform-keywords/run-all", { method: "POST" }),
  getCronStatus: () => request<CronStatus>("/platform-keywords/cron-status"),

  // ---------------------------------------------------------------- search monitor (Google/Bing/YouTube/News)
  getGoogleMentions: (platform = "All", q = "") =>
    request<GoogleMentionsResponse>(`/google-scraper/mentions${toQuery({ platform, q })}`),
  getGoogleStats: () => request<GoogleStatsResponse>("/google-scraper/stats"),
  runGoogleScan: (payload: GoogleScanPayload) =>
    request<{ ok: boolean; message: string }>("/google-scraper/scan", { method: "POST", body: JSON.stringify(payload) }),
  getGoogleStreamUrl: () => `${BASE_URL}/google-scraper/stream`,

  // ---------------------------------------------------------------- competitors
  getCompetitorCards: () => request<{ cards: CompetitorCard[] }>("/competitor-cards/cards"),
  createCompetitorCard: (data: { platform: string; keyword: string; searchUrl?: string }) =>
    request<{ ok: boolean; card: CompetitorCard }>("/competitor-cards/cards", { method: "POST", body: JSON.stringify(data) }),
  deleteCompetitorCard: (id: string) =>
    request<{ ok: boolean; message: string }>(`/competitor-cards/cards/${id}`, { method: "DELETE" }),
  toggleCompetitorCard: (id: string) =>
    request<{ ok: boolean; card: CompetitorCard }>(`/competitor-cards/cards/${id}/toggle`, { method: "PATCH" }),
  runCompetitorCardNow: (id: string) =>
    request<{ ok: boolean; result: any }>(`/competitor-cards/cards/run-card/${id}`, { method: "POST" }),
  runAllCompetitorCardsNow: () =>
    request<{ ok: boolean; message: string; newItems?: number }>("/competitor-cards/cards/run-all", { method: "POST" }),
  getCompetitorItems: (filters: { platform?: string; search?: string; page?: number; pageSize?: number }) =>
    request<ItemsResponse>(`/competitors/items${toQuery(filters)}`),
  getCompetitorOverview: () => request<CompetitorOverview>("/competitors/overview"),

  // ---------------------------------------------------------------- exports (cookie auth works for navigations too)
  // Downloaded through fetch (not a new tab) so a plan limit shows as a prompt instead of raw JSON.
  exportToExcel: async (filters: { scope?: string; platform?: string; keyword?: string; dateFrom?: string; dateTo?: string; sentiment?: string; search?: string; author?: string } = {}) => {
    const res = await fetch(`${BASE_URL}/export/excel${toQuery(filters)}`, { credentials: "include" });
    if (!res.ok) {
      let message = "Failed to export the report.";
      try { const body = await res.json(); if (body?.error) message = body.error; } catch { /* not JSON */ }
      if (res.status === 402) announcePlanLimit(message);
      return;
    }
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "Mentions_Report.xlsx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // ---------------------------------------------------------------- billing
  getBilling: () => request<BillingResponse>("/billing"),
  startCheckout: (plan: PaidPlanId, interval: BillingInterval) =>
    request<{ mode: "stripe" | "request"; url?: string; message?: string }>("/billing/checkout", { method: "POST", body: JSON.stringify({ plan, interval }) }),
  openBillingPortal: () => request<{ url: string }>("/billing/portal", { method: "POST" }),

  exportGoogleToExcel: async (data: {
    items?: GoogleMention[];
    filters?: { platform?: string; dateRangeLabel?: string; dateFrom?: string; dateTo?: string; query?: string };
  } = {}) => {
    if (data.items && data.items.length > 0) {
      const res = await fetch(`${BASE_URL}/google-scraper/export-excel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to export the report.");
      const blob = await res.blob();
      const safePlat = (data.filters?.platform || "All").replace(/[^a-zA-Z0-9_-]/g, "_");
      const dateLabel = (data.filters?.dateRangeLabel || "AllTime").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `Search_Mentions_${safePlat}_${dateLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } else {
      window.open(
        `${BASE_URL}/google-scraper/export-excel${toQuery({
          platform: data.filters?.platform,
          q: data.filters?.query,
          dateRangeLabel: data.filters?.dateRangeLabel,
          dateFrom: data.filters?.dateFrom,
          dateTo: data.filters?.dateTo,
        })}`,
        "_blank"
      );
    }
  },
};
