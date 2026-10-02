import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { platformStatus, refreshEnvFromDisk } from "../config/env";
import { sendNegativeMentionAlert, parseRecipientList } from "../services/emailService";
import { orgOf } from "../middleware/auth";

export const settingsRouter = Router();

/**
 * Tenant settings are the organization's own configuration. Integration keys belong
 * to the platform operator and are never read or written here.
 */

const updateSchema = z.object({
  name: z.string().trim().min(1, "Company name is required.").max(80).optional(),
  brandName: z.string().trim().min(1, "Brand name is required.").max(80).optional(),
  alertEmails: z.array(z.string().trim().toLowerCase().email("One of the alert emails is invalid.")).max(10).optional(),
});

settingsRouter.get("/", async (req, res, next) => {
  try {
    await refreshEnvFromDisk();
    const org = await prisma.organization.findUnique({
      where: { id: orgOf(req) },
      select: { id: true, name: true, slug: true, brandName: true, alertEmails: true, plan: true, createdAt: true },
    });
    if (!org) return res.status(404).json({ error: "Organization not found." });
    res.json({ organization: org, platform: platformStatus() });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch("/", async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });

    const data = parsed.data;
    const org = await prisma.organization.update({
      where: { id: orgOf(req) },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.brandName !== undefined ? { brandName: data.brandName } : {}),
        ...(data.alertEmails !== undefined ? { alertEmails: Array.from(new Set(parseRecipientList(data.alertEmails))) } : {}),
      },
      select: { id: true, name: true, slug: true, brandName: true, alertEmails: true, plan: true, createdAt: true },
    });
    res.json({ ok: true, organization: org });
  } catch (err) {
    next(err);
  }
});

// POST /test-email — sends a sample alert to this organization's recipients
settingsRouter.post("/test-email", async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: orgOf(req) }, select: { brandName: true, alertEmails: true } });
    if (!org) return res.status(404).json({ error: "Organization not found." });
    if (org.alertEmails.length === 0) return res.status(400).json({ error: "Add at least one alert email first." });
    if (!platformStatus().smtpConfigured) return res.status(503).json({ error: "Email delivery is not available on this platform yet." });

    const ok = await sendNegativeMentionAlert(
      {
        type: "post",
        keyword: org.brandName,
        brandName: org.brandName,
        platform: "test",
        text: "This is a test alert confirming that negative-mention notifications reach your inbox.",
        author: "Alert system",
        url: "",
        sentiment: "NEGATIVE",
        confidence: 0.99,
        publishedAt: new Date(),
      },
      org.alertEmails
    );
    if (!ok) return res.status(502).json({ error: "The mail server rejected the test message." });
    res.json({ ok: true, message: `Test alert sent to ${org.alertEmails.join(", ")}.` });
  } catch (err) {
    next(err);
  }
});
