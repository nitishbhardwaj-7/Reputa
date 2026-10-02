// Single place to rename the product. Everything user-facing reads from here.
export const APP_NAME = "Reputa";
export const APP_TAGLINE = "The only platform you need for online reputation management.";
export const SUPPORT_EMAIL = "hello@adaptsmedia.com";

export const PLATFORMS = [
  { id: "reddit", label: "Reddit", hint: "Threads and comments" },
  { id: "quora", label: "Quora", hint: "Questions and answers" },
  { id: "trustpilot", label: "Trustpilot", hint: "Reviews — use your domain, e.g. acme.com" },
  { id: "linkedin", label: "LinkedIn", hint: "Posts and articles" },
  { id: "teamblind", label: "TeamBlind", hint: "Anonymous professional discussions" },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];
