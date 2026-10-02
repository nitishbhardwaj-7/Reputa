import { env, assertApifyConfigured } from "../config/env";

export class ApifyError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApifyError";
    this.status = status;
  }
}

/**
 * ApifyService — the ONLY module in this application allowed to talk to
 * Apify. It does no scraping itself: it calls the Apify API URL/key you
 * configured, and returns whatever raw data comes back untouched.
 *
 * The exact Actor/Task input schema is not hardcoded — it's supplied via
 * APIFY_INPUT_TEMPLATE, a JSON template with a {{keyword}} placeholder,
 * because that shape is defined by whichever Apify Actor you choose to run.
 */
export async function fetchApifyResults(keyword: string): Promise<unknown[]> {
  assertApifyConfigured();

  const url = buildUrl();
  const method = env.APIFY_METHOD === "GET" ? "GET" : "POST";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.APIFY_API_KEY}`,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    body = renderInputTemplate(env.APIFY_INPUT_TEMPLATE, keyword);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.APIFY_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new ApifyError(
        `Apify request timed out after ${env.APIFY_TIMEOUT_MS}ms. The actor run may take longer than APIFY_TIMEOUT_MS allows.`
      );
    }
    throw new ApifyError(`Could not reach Apify API at the configured APIFY_API_URL: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApifyError("Apify rejected the request — check APIFY_API_KEY is valid and has access to this Actor/Task/Dataset.", response.status);
  }
  if (response.status === 404) {
    throw new ApifyError("Apify API URL not found (404) — check APIFY_API_URL is correct.", response.status);
  }
  if (!response.ok) {
    const text = await safeText(response);
    throw new ApifyError(`Apify API request failed with status ${response.status}: ${text.slice(0, 500)}`, response.status);
  }

  const text = await response.text();
  if (!text || !text.trim()) {
    throw new ApifyError("Apify returned an empty response body.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApifyError("Apify response was not valid JSON — the configured APIFY_API_URL may not point at a dataset-items endpoint.");
  }

  const items = extractItemArray(parsed);
  if (!items) {
    throw new ApifyError(
      "Apify response did not contain a recognizable array of items. Expected either a top-level JSON array, or an object with an items/data/results array field."
    );
  }
  if (items.length === 0) {
    // Not an error — a valid, empty scrape result. Caller decides how to
    // surface this (e.g. "no results for this keyword").
    return [];
  }

  return items;
}

function buildUrl(): string {
  let base = env.APIFY_API_URL;
  if (env.APIFY_METHOD === "POST") {
    base = base.replace(/\/runs(\?|$)/, "/run-sync-get-dataset-items$1");
  }
  if (!env.APIFY_QUERY_PARAMS) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${env.APIFY_QUERY_PARAMS.replace(/^[&?]/, "")}`;
}

function renderInputTemplate(template: string, keyword: string): string {
  const rendered = template.split("{{keyword}}").join(escapeForJson(keyword));
  // Validate it's actually valid JSON after substitution so we fail fast
  // with a clear message instead of Apify returning a cryptic 400.
  try {
    JSON.parse(rendered);
  } catch {
    throw new ApifyError(
      "APIFY_INPUT_TEMPLATE is not valid JSON after substituting {{keyword}}. Check backend/.env."
    );
  }
  return rendered;
}

function escapeForJson(value: string): string {
  // Escape the keyword as if it were being inserted as a JSON string body,
  // since the template already contains the surrounding quotes.
  return JSON.stringify(value).slice(1, -1);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Apify's run-sync-get-dataset-items endpoints return a plain JSON array.
 * Some other endpoints wrap items in { items: [...] }, { data: [...] } or
 * { results: [...] }. Handle all of these without assuming one shape.
 */
function extractItemArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["items", "data", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return null;
}
