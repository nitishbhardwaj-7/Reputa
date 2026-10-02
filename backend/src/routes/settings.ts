import { Router } from "express";
import { getSettings, updateSettings } from "../config/env";
import { prisma } from "../lib/prisma";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    next(err);
  }
});

settingsRouter.post("/", async (req, res, next) => {
  try {
    const {
      apifyApiUrl,
      apifyApiKey,
      aiApiUrl,
      aiApiKey,
      aiModel,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      gmailUser,
      gmailPass,
      mailFrom,
      alertEmail,
      searchApiKey,
      serperApiKey,
      mongodbUri,
      mongodbDb,
      databaseUrl,
    } = req.body ?? {};

    const updated = await updateSettings({
      apifyApiUrl: typeof apifyApiUrl === "string" ? apifyApiUrl : undefined,
      apifyApiKey: typeof apifyApiKey === "string" ? apifyApiKey : undefined,
      aiApiUrl: typeof aiApiUrl === "string" ? aiApiUrl : undefined,
      aiApiKey: typeof aiApiKey === "string" ? aiApiKey : undefined,
      aiModel: typeof aiModel === "string" ? aiModel : undefined,
      smtpHost: typeof smtpHost === "string" ? smtpHost : undefined,
      smtpPort: typeof smtpPort === "string" ? smtpPort : undefined,
      smtpUser: typeof smtpUser === "string" ? smtpUser : undefined,
      smtpPass: typeof smtpPass === "string" ? smtpPass : undefined,
      gmailUser: typeof gmailUser === "string" ? gmailUser : undefined,
      gmailPass: typeof gmailPass === "string" ? gmailPass : undefined,
      mailFrom: typeof mailFrom === "string" ? mailFrom : undefined,
      alertEmail: typeof alertEmail === "string" ? alertEmail : undefined,
      searchApiKey: typeof searchApiKey === "string" ? searchApiKey : undefined,
      serperApiKey: typeof serperApiKey === "string" ? serperApiKey : undefined,
      mongodbUri: typeof mongodbUri === "string" ? mongodbUri : undefined,
      mongodbDb: typeof mongodbDb === "string" ? mongodbDb : undefined,
      databaseUrl: typeof databaseUrl === "string" ? databaseUrl : undefined,
    });

    res.json({
      ok: true,
      message: "Settings updated successfully.",
      settings: updated,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/test-email — send test alert email to all configured recipients via SMTP
settingsRouter.post("/test-email", async (_req, res, _next) => {
  try {
    const { sendNegativeMentionAlert, parseRecipientList } = await import("../services/emailService");
    const { env } = await import("../config/env");

    const recipients = parseRecipientList(env.ALERT_EMAIL);
    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipient emails configured in Alert Recipient Email(s)." });
    }

    const ok = await sendNegativeMentionAlert({
      type: "post",
      keyword: "EB1A Experts (SMTP Test Alert)",
      platform: "reddit",
      text: "✓ This is a test email sent from ORM Dashboard to confirm SMTP configuration and multi-recipient email delivery.",
      author: "ORM Alert System",
      url: "https://reddit.com",
      sentiment: "NEGATIVE",
      confidence: 0.98,
      publishedAt: new Date(),
    });

    if (ok) {
      res.json({
        ok: true,
        message: `✓ Test alert delivered successfully via SMTP to ${recipients.length} recipient(s): [${recipients.join(", ")}]!`,
      });
    } else {
      res.status(500).json({
        error: "Failed to deliver test email via SMTP. Please verify your SMTP Host, Username, Password, and Recipient addresses.",
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unexpected error dispatching test email." });
  }
});

// POST /api/settings/reset-database — empties all posts, comments, scrape runs, and keywords.
settingsRouter.post("/reset-database", async (_req, res, next) => {
  try {
    const deletedComments = await prisma.comment.deleteMany({});
    const deletedPosts = await prisma.post.deleteMany({});
    const deletedScrapeRuns = await prisma.scrapeRun.deleteMany({});
    const deletedKeywords = await prisma.keyword.deleteMany({});

    res.json({
      ok: true,
      message: "Database emptied successfully.",
      deletedComments: deletedComments.count,
      deletedPosts: deletedPosts.count,
      deletedScrapeRuns: deletedScrapeRuns.count,
      deletedKeywords: deletedKeywords.count,
    });
  } catch (err) {
    next(err);
  }
});
