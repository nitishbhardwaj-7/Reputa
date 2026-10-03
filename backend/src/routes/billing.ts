import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { orgOf } from "../middleware/auth";
import { PAID_PLANS, PLANS, TRIAL_DAYS } from "../config/plans";
import { getEntitlements } from "../services/billingService";
import { createCheckoutSession, createPortalSession, handleStripeWebhook, priceIdFor, stripeConfigured } from "../services/stripeService";
import { sendSystemEmail } from "../services/emailService";
import { env } from "../config/env";

export const billingRouter = Router();

const catalog = () => PAID_PLANS.map((id) => {
  const p = PLANS[id];
  return { id: p.id, name: p.name, description: p.description, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, limits: p.limits, features: p.features };
});

// GET /api/billing — plan, state, usage and the catalog
billingRouter.get("/", async (req, res, next) => {
  try {
    res.json({
      entitlements: await getEntitlements(orgOf(req)),
      plans: catalog(),
      trialDays: TRIAL_DAYS,
      checkout: stripeConfigured() ? "stripe" : "request",
    });
  } catch (err) {
    next(err);
  }
});

const checkoutSchema = z.object({
  plan: z.enum(["starter", "growth", "scale"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

// POST /api/billing/checkout { plan, interval }
billingRouter.post("/checkout", async (req, res, next) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a plan and a billing interval." });
    const { plan, interval } = parsed.data;
    const orgId = orgOf(req);
    if (req.auth!.role !== "owner") return res.status(403).json({ error: "Only the workspace owner can change the plan." });

    if (stripeConfigured() && priceIdFor(plan, interval)) {
      const url = await createCheckoutSession(orgId, req.auth!.email, plan, interval);
      return res.json({ mode: "stripe", url });
    }

    // No payment provider wired up yet: hand the request to the operator.
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, plan: true } });
    const operator = (process.env.OPERATOR_EMAIL || env.SMTP_USER || "").trim();
    const price = interval === "yearly" ? PLANS[plan].priceYearly : PLANS[plan].priceMonthly;
    console.log(`[billing] upgrade request: org=${orgId} (${org?.name}) plan=${plan} interval=${interval} by ${req.auth!.email}`);
    if (operator) {
      await sendSystemEmail(
        [operator],
        `Upgrade request: ${org?.name ?? orgId} → ${PLANS[plan].name} (${interval})`,
        `<p><b>${escapeHtml(org?.name ?? orgId)}</b> asked to move from <b>${escapeHtml(org?.plan ?? "trial")}</b> to <b>${PLANS[plan].name}</b>, billed ${interval} at $${price}/month.</p>
         <p>Requested by ${escapeHtml(req.auth!.email)}.</p>
         <p>Activate after payment with:<br><code>node dist/cli/setPlan.js ${escapeHtml(req.auth!.email)} ${plan} ${interval}</code></p>`
      ).catch(() => false);
    }
    res.json({
      mode: "request",
      message: `Thanks — we've received your request for ${PLANS[plan].name}. We'll email ${req.auth!.email} with payment details and activate the plan as soon as it's settled.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/billing/portal — Stripe customer portal (update card, cancel, invoices)
billingRouter.post("/portal", async (req, res, next) => {
  try {
    if (!stripeConfigured()) return res.status(400).json({ error: "Self-service billing isn't enabled yet. Contact support to change or cancel your plan." });
    if (req.auth!.role !== "owner") return res.status(403).json({ error: "Only the workspace owner can manage billing." });
    res.json({ url: await createPortalSession(orgOf(req)) });
  } catch (err: any) {
    if (/no Stripe customer/i.test(err?.message || "")) return res.status(400).json({ error: "There's no subscription to manage yet." });
    next(err);
  }
});

/** Mounted with express.raw() before the JSON parser: Stripe signs the exact bytes. */
export async function stripeWebhookHandler(req: Request, res: Response) {
  try {
    const type = await handleStripeWebhook(req.body as Buffer, req.header("stripe-signature") ?? undefined);
    res.json({ received: true, type });
  } catch (err: any) {
    console.error("Stripe webhook rejected:", err?.message || err);
    res.status(400).json({ error: "Webhook rejected." });
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
