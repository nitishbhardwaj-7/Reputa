import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function getDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || !raw.trim() || raw.trim().startsWith("file:")) {
    // Fail loudly: a missing DATABASE_URL must never silently point somewhere else.
    throw new Error("DATABASE_URL is not set. Configure it in backend/.env (PostgreSQL connection string).");
  }
  return raw.trim();
}

const isProduction = optional("NODE_ENV") === "production";

function getJwtSecret(): string {
  const raw = optional("JWT_SECRET").trim();
  if (raw.length >= 32) return raw;
  if (isProduction) {
    throw new Error("JWT_SECRET must be set to at least 32 random characters in production.");
  }
  console.warn("⚠ JWT_SECRET not set — using a random development secret. Sessions reset on every restart.");
  return crypto.randomBytes(48).toString("hex");
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  IS_PRODUCTION: isProduction,
  PORT: Number(optional("PORT", "4000")),
  APP_NAME: optional("APP_NAME", "Reputa"),
  // Comma-separated list of allowed browser origins (the frontend). Same-origin
  // deployments behind nginx don't need it, but local dev does.
  APP_ORIGINS: optional("APP_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  JWT_SECRET: getJwtSecret(),
  COOKIE_SECURE: optional("COOKIE_SECURE", isProduction ? "true" : "false") === "true",
  DATABASE_URL: getDatabaseUrl(),

  // --- Operator-provided integrations (platform-wide, never tenant-visible) ---
  APIFY_API_URL: optional("APIFY_API_URL"),
  APIFY_API_KEY: optional("APIFY_API_KEY") || optional("APIFY_API_URL").match(/[?&]token=([^&]+)/)?.[1] || "",
  APIFY_METHOD: optional("APIFY_METHOD", "POST").toUpperCase() as "GET" | "POST",
  APIFY_INPUT_TEMPLATE: optional("APIFY_INPUT_TEMPLATE", '{"searches":["{{keyword}}"]}'),
  APIFY_QUERY_PARAMS: optional("APIFY_QUERY_PARAMS"),
  APIFY_TIMEOUT_MS: Number(optional("APIFY_TIMEOUT_MS", "120000")),

  AI_API_URL: optional("AI_API_URL", "https://api.mistral.ai/v1/chat/completions"),
  AI_API_KEY: optional("AI_API_KEY") || optional("MISTRAL_API_KEY"),
  AI_MODEL: optional("AI_MODEL", "open-mistral-7b"),
  AI_CONCURRENCY: Number(optional("AI_CONCURRENCY", "3")),

  SMTP_HOST: optional("SMTP_HOST"),
  SMTP_PORT: optional("SMTP_PORT", "587"),
  SMTP_USER: optional("SMTP_USER") || optional("GMAIL_USER"),
  SMTP_PASS: optional("SMTP_PASS") || optional("GMAIL_PASS"),
  MAIL_FROM: optional("MAIL_FROM"),

  SERPER_API_KEY: optional("SERPER_API_KEY") || optional("SEARCHAPI_KEY"),
  MONGODB_URI: optional("MONGODB_URI"),
  MONGODB_DB: optional("MONGODB_DB", "brandmonitor"),
};

// Keys an operator may override at runtime through the SystemSetting table.
const RUNTIME_KEYS = [
  "APIFY_API_URL", "APIFY_API_KEY", "AI_API_URL", "AI_API_KEY", "AI_MODEL",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM",
  "SERPER_API_KEY", "MONGODB_URI", "MONGODB_DB",
] as const;

/**
 * Re-reads integration keys from .env and then from SystemSetting (which wins).
 * Lets an operator rotate a key without restarting. Tenant data is never touched.
 */
export async function refreshEnvFromDisk() {
  try {
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath, "utf-8"));
      for (const key of RUNTIME_KEYS) {
        const val = parsed[key] ?? (key === "AI_API_KEY" ? parsed.MISTRAL_API_KEY : undefined);
        if (val !== undefined && val.trim() !== "") {
          (env as any)[key] = val.trim();
          process.env[key] = val.trim();
        }
      }
    }
  } catch {
    // .env is optional in production; SystemSetting / real env vars take over.
  }

  try {
    const rows = await prisma.systemSetting.findMany();
    for (const row of rows) {
      if ((RUNTIME_KEYS as readonly string[]).includes(row.key) && row.value.trim() !== "") {
        (env as any)[row.key] = row.value.trim();
        process.env[row.key] = row.value.trim();
      }
    }
  } catch {
    // Database not reachable yet (first boot); the next refresh will pick it up.
  }
}

/** What tenants are allowed to know: whether each integration is available, never the keys. */
export function platformStatus() {
  return {
    aiConfigured: Boolean(env.AI_API_URL && env.AI_API_KEY),
    searchConfigured: Boolean(env.SERPER_API_KEY),
    smtpConfigured: Boolean(env.SMTP_USER && env.SMTP_PASS),
    apifyConfigured: Boolean(env.APIFY_API_URL && env.APIFY_API_KEY),
  };
}

export function assertApifyConfigured() {
  if (!env.APIFY_API_URL || !env.APIFY_API_KEY) {
    throw new ConfigError("Apify is not configured on this platform.");
  }
}

export function assertAiConfigured() {
  if (!env.AI_API_KEY) {
    throw new ConfigError("The AI sentiment engine is not configured on this platform.");
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
