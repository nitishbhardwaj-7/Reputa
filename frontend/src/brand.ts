// Single place to rename the product. Everything user-facing reads from here.
export const APP_NAME = "Reputa";
export const APP_TAGLINE = "Know what the internet thinks about your brand.";
export const SUPPORT_EMAIL = "hello@adaptsmedia.com";

export interface SourceMeta {
  id: string;
  label: string;
  hint: string;
  /** Whether users can add keyword cards for it (Playwright/Serper scrapers). */
  trackable: boolean;
}

export const SOURCES: SourceMeta[] = [
  { id: "reddit", label: "Reddit", hint: "Threads and comments", trackable: true },
  { id: "google", label: "Google", hint: "Web, News, Bing and YouTube results for your brand", trackable: false },
  { id: "trustpilot", label: "Trustpilot", hint: "Reviews — use your domain, e.g. acme.com", trackable: true },
  { id: "linkedin", label: "LinkedIn", hint: "Posts and articles", trackable: true },
  { id: "quora", label: "Quora", hint: "Questions and answers", trackable: true },
  { id: "youtube", label: "YouTube", hint: "Videos found via search scans", trackable: false },
  { id: "teamblind", label: "TeamBlind", hint: "Anonymous professional discussions", trackable: true },
];

export const TRACKABLE_SOURCES = SOURCES.filter((s) => s.trackable);
export type PlatformId = (typeof TRACKABLE_SOURCES)[number]["id"];

/** Maps whatever platform label the data carries to a display source. */
export function sourceOf(platform?: string | null, url?: string | null): SourceMeta {
  const p = (platform || "").toLowerCase();
  const u = (url || "").toLowerCase();
  const find = (id: string) => SOURCES.find((s) => s.id === id)!;
  if (p.includes("reddit") || u.includes("reddit.com")) return find("reddit");
  if (p.includes("trustpilot") || u.includes("trustpilot.com")) return find("trustpilot");
  if (p.includes("linkedin") || u.includes("linkedin.com")) return find("linkedin");
  if (p.includes("quora") || u.includes("quora.com")) return find("quora");
  if (p.includes("youtube") || u.includes("youtube.com") || u.includes("youtu.be")) return find("youtube");
  if (p.includes("blind") || u.includes("teamblind.com")) return find("teamblind");
  if (p === "news" || p === "web" || p === "google" || p === "bing") return find("google");
  return { id: p || "web", label: p ? p.charAt(0).toUpperCase() + p.slice(1) : "Web", hint: "", trackable: false };
}
