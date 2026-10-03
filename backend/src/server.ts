import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { execFileSync } from "child_process";
import path from "path";
import { env, refreshEnvFromDisk, platformStatus } from "./config/env";
import { requireAuth } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { keywordsRouter } from "./routes/keywords";
import { itemsRouter } from "./routes/items";
import { chartsRouter } from "./routes/charts";
import { retryRouter } from "./routes/retry";
import { settingsRouter } from "./routes/settings";
import { manualScraperRouter } from "./routes/manualScraper";
import { platformKeywordsRouter } from "./routes/platformKeywords";
import { googleScraperRouter } from "./routes/googleScraper";
import { competitorsRouter } from "./routes/competitors";
import { exportRouter } from "./routes/export";
import { startHourlyScraperCron } from "./services/cronScheduler";
import { billingRouter, stripeWebhookHandler } from "./routes/billing";
import { backfillLegacyOrganizations, PlanError } from "./services/billingService";

const app = express();

// Keep the schema in step with the code on every boot. Swap for `prisma migrate deploy`
// once the schema stabilises and tenants hold data you can't afford to reshape.
// Runs from the backend directory with an explicit schema path so it works no matter
// what cwd the process was launched from (pm2, npm --prefix, systemd...).
try {
  const backendDir = path.resolve(__dirname, "..");
  // Call the CLI's JS entry with the running Node binary: no shell, so no quoting
  // differences between Windows cmd and POSIX sh.
  const prismaCli = require.resolve("prisma/build/index.js", { paths: [backendDir] });
  const schema = path.join(backendDir, "prisma", "schema.prisma");
  console.log("Syncing database schema...");
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--schema", schema], {
    // stdin closed: if Prisma ever wants to ask a question it must fail, not hang the boot.
    stdio: ["ignore", "inherit", "inherit"],
    cwd: backendDir,
    timeout: 120_000,
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1", CI: "1" },
  });
} catch (err: any) {
  console.warn("Schema sync notice:", err?.message || err);
}
refreshEnvFromDisk().catch(() => {});
backfillLegacyOrganizations()
  .then((n) => { if (n > 0) console.log(`Started a trial for ${n} workspace(s) created before billing.`); })
  .catch((err) => console.warn("Billing backfill notice:", err?.message || err));

// Behind nginx in production; needed for correct client IPs in rate limiting.
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(
  cors({
    origin(origin, cb) {
      // Same-origin (no Origin header) and the configured frontends are allowed.
      if (!origin || env.APP_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(cookieParser());
// Stripe signs the raw request bytes, so this route must run before the JSON parser.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
app.use(express.json({ limit: "2mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: env.APP_NAME, ...platformStatus() });
});

// Public
app.use("/api/auth", authRouter);

// Everything below requires a signed-in user and is scoped to their organization.
app.use("/api", requireAuth);
app.use("/api/settings", settingsRouter);
app.use("/api/billing", billingRouter);
app.use("/api/export", exportRouter);
app.use("/api/google-scraper", googleScraperRouter);
app.use(["/api/competitor-cards", "/api/competitors"], competitorsRouter);
app.use("/api/manual-scraper", manualScraperRouter);
app.use("/api/platform-keywords", platformKeywordsRouter);
app.use("/api/keywords", keywordsRouter);
app.use("/api/retry", retryRouter);
app.use("/api/charts", chartsRouter);
app.use("/api", itemsRouter);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// In the Docker image the built SPA ships alongside the API and is served from the
// same origin (SERVE_STATIC_DIR). Hashed assets cache for a year; index.html never.
if (process.env.SERVE_STATIC_DIR) {
  const dir = path.resolve(process.env.SERVE_STATIC_DIR);
  app.use(express.static(dir, { index: false, setHeaders: (res, file) => {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(dir, "index.html"));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.message === "Not allowed by CORS") return res.status(403).json({ error: "Origin not allowed." });
  // The workspace's plan doesn't cover this request; the UI turns `upgrade` into a prompt.
  if (err instanceof PlanError) return res.status(402).json({ error: err.message, code: err.code, upgrade: true });
  console.error("SERVER ERROR:", err);
  // Never leak stack traces or internal messages to tenants in production.
  const msg = env.IS_PRODUCTION ? "Something went wrong on our side." : err?.message || "Unexpected server error.";
  res.status(500).json({ error: msg });
});

app.listen(env.PORT, () => {
  console.log(`${env.APP_NAME} API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  const status = platformStatus();
  if (!status.aiConfigured) console.warn("⚠ AI sentiment engine not configured (AI_API_KEY).");
  if (!status.searchConfigured) console.warn("⚠ Search scanning not configured (SERPER_API_KEY).");
  if (!status.smtpConfigured) console.warn("⚠ Email alerts not configured (SMTP_USER / SMTP_PASS).");
  startHourlyScraperCron();
});
