import Stripe from "stripe";
import { prisma } from "../lib/prisma";
import { PAID_PLANS, type BillingInterval, type PaidPlanId } from "../config/plans";
import { applyPlan } from "./billingService";

/**
 * Stripe is optional. With STRIPE_SECRET_KEY and the six price ids set, upgrades go
 * through Checkout and stay in sync via the webhook. Without them the Billing page
 * records an upgrade request for the operator instead.
 */
let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function stripe(): Stripe {
  if (!stripeConfigured()) throw new Error("Stripe is not configured.");
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
  return client;
}

export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const first = (process.env.APP_ORIGINS || "http://localhost:5173").split(",")[0].trim();
  return first.replace(/\/+$/, "");
}

function priceEnvName(plan: PaidPlanId, interval: BillingInterval): string {
  return `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
}

export function priceIdFor(plan: PaidPlanId, interval: BillingInterval): string | null {
  return process.env[priceEnvName(plan, interval)]?.trim() || null;
}

/** Reverse lookup used by the webhook to learn which plan a subscription is on. */
function planForPrice(priceId: string | undefined | null): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) {
    for (const interval of ["monthly", "yearly"] as const) {
      if (priceIdFor(plan, interval) === priceId) return { plan, interval };
    }
  }
  return null;
}

export async function createCheckoutSession(orgId: string, email: string, plan: PaidPlanId, interval: BillingInterval): Promise<string> {
  const price = priceIdFor(plan, interval);
  if (!price) throw new Error(`${priceEnvName(plan, interval)} is not set.`);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } });

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    ...(org?.stripeCustomerId ? { customer: org.stripeCustomerId } : { customer_email: email }),
    client_reference_id: orgId,
    allow_promotion_codes: true,
    metadata: { orgId, plan, interval },
    subscription_data: { metadata: { orgId, plan, interval } },
    success_url: `${appUrl()}/app/billing?checkout=success`,
    cancel_url: `${appUrl()}/app/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } });
  if (!org?.stripeCustomerId) throw new Error("This workspace has no Stripe customer yet.");
  const session = await stripe().billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${appUrl()}/app/billing` });
  return session.url;
}

function statusFromStripe(status: string): "active" | "past_due" | "canceled" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "canceled";
}

// Subscription period fields moved onto the item in newer Stripe API versions; read both.
function periodEndOf(sub: any): Date | null {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return typeof ts === "number" ? new Date(ts * 1000) : null;
}

async function orgIdForSubscription(sub: any): Promise<string | null> {
  if (sub?.metadata?.orgId) return String(sub.metadata.orgId);
  const customer = typeof sub?.customer === "string" ? sub.customer : sub?.customer?.id;
  if (!customer) return null;
  const org = await prisma.organization.findFirst({ where: { stripeCustomerId: customer }, select: { id: true } });
  return org?.id ?? null;
}

async function syncSubscription(sub: any) {
  const orgId = await orgIdForSubscription(sub);
  if (!orgId) return;
  const matched = planForPrice(sub?.items?.data?.[0]?.price?.id);
  const current = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
  if (!current) return;
  const plan = matched?.plan ?? (PAID_PLANS.includes(sub?.metadata?.plan) ? (sub.metadata.plan as PaidPlanId) : null);
  if (!plan) return; // not one of ours

  // "cancel at period end" keeps the plan until the date that was paid for.
  const status = sub.cancel_at_period_end ? "canceled" : statusFromStripe(String(sub.status));
  await applyPlan(orgId, plan, {
    status,
    interval: matched?.interval ?? (sub?.metadata?.interval === "yearly" ? "yearly" : "monthly"),
    currentPeriodEnd: periodEndOf(sub),
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripeSubscriptionId: sub.id,
  });
}

/** Verifies the signature and applies the event. Throws on a bad signature. */
export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<string> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  if (!signature) throw new Error("Missing Stripe signature.");
  const event = stripe().webhooks.constructEvent(rawBody, signature, secret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as any;
      if (session.mode === "subscription" && session.subscription) {
        const sub = await stripe().subscriptions.retrieve(String(session.subscription));
        // Carry the workspace id from the session in case the subscription metadata is missing.
        const merged = { ...sub, metadata: { ...(sub as any).metadata, orgId: (sub as any).metadata?.orgId ?? session.client_reference_id ?? session.metadata?.orgId } };
        await syncSubscription(merged);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object);
      break;
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      const orgId = await orgIdForSubscription(sub);
      if (orgId) {
        await prisma.organization.update({
          where: { id: orgId },
          data: { subscriptionStatus: "canceled", currentPeriodEnd: periodEndOf(sub) ?? new Date(), stripeSubscriptionId: null },
        });
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as any;
      const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customer) await prisma.organization.updateMany({ where: { stripeCustomerId: customer }, data: { subscriptionStatus: "past_due" } });
      break;
    }
    default:
      break;
  }
  return event.type;
}
