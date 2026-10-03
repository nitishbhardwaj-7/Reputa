import { prisma } from "../lib/prisma";
import { GRACE_DAYS, PLANS, TRIAL_DAYS, planOf, type BillingInterval, type PlanId, type PlanLimits } from "../config/plans";

/** A request the workspace's plan does not allow. Rendered as HTTP 402 by the error handler. */
export class PlanError extends Error {
  status = 402;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type SubscriptionState = "trialing" | "active" | "past_due" | "expired" | "canceled";

type OrgBilling = {
  id: string;
  plan: string;
  trialEndsAt: Date | null;
  subscriptionStatus: string;
  billingInterval: string | null;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

const BILLING_SELECT = {
  id: true, plan: true, trialEndsAt: true, subscriptionStatus: true, billingInterval: true,
  currentPeriodEnd: true, stripeCustomerId: true, stripeSubscriptionId: true,
} as const;

const DAY = 86_400_000;

export function trialEndFromNow(): Date {
  return new Date(Date.now() + TRIAL_DAYS * DAY);
}

/** What the workspace is entitled to right now, derived from the stored fields and the clock. */
export function stateOf(org: OrgBilling, now = Date.now()): SubscriptionState {
  if (org.plan === "trial" || !(org.plan in PLANS)) {
    return org.trialEndsAt && org.trialEndsAt.getTime() > now ? "trialing" : "expired";
  }
  if (org.subscriptionStatus === "canceled") {
    // A cancelled subscription keeps working until the period that was paid for ends.
    return org.currentPeriodEnd && org.currentPeriodEnd.getTime() > now ? "active" : "canceled";
  }
  const lapsed = org.currentPeriodEnd ? org.currentPeriodEnd.getTime() + GRACE_DAYS * DAY < now : false;
  if (lapsed) return "expired";
  return org.subscriptionStatus === "past_due" ? "past_due" : "active";
}

export function isUsable(state: SubscriptionState): boolean {
  return state === "trialing" || state === "active" || state === "past_due";
}

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function mentionsThisMonth(orgId: string): Promise<number> {
  const since = monthStartUtc();
  const [posts, comments] = await Promise.all([
    prisma.post.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
    prisma.comment.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
  ]);
  return posts + comments;
}

export interface Entitlements {
  plan: PlanId;
  planName: string;
  state: SubscriptionState;
  usable: boolean;
  interval: BillingInterval | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelsAtPeriodEnd: boolean;
  managedByStripe: boolean;
  limits: PlanLimits;
  usage: { mentionsThisMonth: number; keywords: number; competitors: number; alertRecipients: number };
}

async function loadOrg(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { ...BILLING_SELECT, alertEmails: true } });
  if (!org) throw new Error("Organization not found.");
  return org;
}

export async function getEntitlements(orgId: string): Promise<Entitlements> {
  const org = await loadOrg(orgId);
  const plan = planOf(org.plan);
  const state = stateOf(org);
  const [mentions, keywords, competitors] = await Promise.all([
    mentionsThisMonth(orgId),
    prisma.platformKeyword.count({ where: { organizationId: orgId } }),
    prisma.competitorCard.count({ where: { organizationId: orgId } }),
  ]);
  const trialLeft = plan.id === "trial" && org.trialEndsAt ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / DAY)) : null;
  return {
    plan: plan.id,
    planName: plan.name,
    state,
    usable: isUsable(state),
    interval: org.billingInterval === "yearly" ? "yearly" : org.billingInterval === "monthly" ? "monthly" : null,
    trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
    trialDaysLeft: trialLeft,
    currentPeriodEnd: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
    cancelsAtPeriodEnd: plan.id !== "trial" && org.subscriptionStatus === "canceled" && state === "active",
    managedByStripe: Boolean(org.stripeSubscriptionId),
    limits: plan.limits,
    usage: { mentionsThisMonth: mentions, keywords, competitors, alertRecipients: org.alertEmails.length },
  };
}

function inactiveMessage(org: OrgBilling, state: SubscriptionState): string {
  if (org.plan === "trial" || !(org.plan in PLANS)) return "Your free trial has ended. Choose a plan to resume scanning and alerts.";
  if (state === "canceled") return "Your subscription has ended. Choose a plan to resume scanning and alerts.";
  return "Your subscription has lapsed. Update your billing to resume scanning and alerts.";
}

/** Why a scan cannot run for this workspace right now, or null when it can. */
export async function scanBlocker(orgId: string): Promise<PlanError | null> {
  const org = await loadOrg(orgId);
  const state = stateOf(org);
  if (!isUsable(state)) return new PlanError("subscription_inactive", inactiveMessage(org, state));
  const plan = planOf(org.plan);
  const used = await mentionsThisMonth(orgId);
  if (used >= plan.limits.mentionsPerMonth) {
    return new PlanError(
      "mention_quota",
      `You've used all ${plan.limits.mentionsPerMonth.toLocaleString()} mentions included in ${plan.name} this month. Upgrade to keep scanning; the allowance resets on the 1st.`
    );
  }
  return null;
}

export async function assertCanScan(orgId: string): Promise<void> {
  const blocker = await scanBlocker(orgId);
  if (blocker) throw blocker;
}

export async function assertActive(orgId: string): Promise<void> {
  const org = await loadOrg(orgId);
  const state = stateOf(org);
  if (!isUsable(state)) throw new PlanError("subscription_inactive", inactiveMessage(org, state));
}

export async function assertCanAddKeywords(orgId: string, adding = 1): Promise<void> {
  await assertActive(orgId);
  const org = await loadOrg(orgId);
  const plan = planOf(org.plan);
  const have = await prisma.platformKeyword.count({ where: { organizationId: orgId } });
  if (have + adding > plan.limits.keywords) {
    throw new PlanError("keyword_limit", `${plan.name} includes ${plan.limits.keywords} keywords and you're using ${have}. Upgrade to track more.`);
  }
}

export async function assertCanAddCompetitor(orgId: string): Promise<void> {
  await assertActive(orgId);
  const org = await loadOrg(orgId);
  const plan = planOf(org.plan);
  const have = await prisma.competitorCard.count({ where: { organizationId: orgId } });
  if (have + 1 > plan.limits.competitors) {
    throw new PlanError("competitor_limit", `${plan.name} includes ${plan.limits.competitors} competitors and you're tracking ${have}. Upgrade to add more.`);
  }
}

export async function assertRecipientCount(orgId: string, count: number): Promise<void> {
  const org = await loadOrg(orgId);
  const plan = planOf(org.plan);
  if (count > plan.limits.alertRecipients) {
    throw new PlanError("recipient_limit", `${plan.name} includes ${plan.limits.alertRecipients} alert recipients. Upgrade to notify more people.`);
  }
}

export async function assertFeature(orgId: string, feature: "exports" | "searchScanning"): Promise<void> {
  await assertActive(orgId);
  const org = await loadOrg(orgId);
  const plan = planOf(org.plan);
  if (!plan.limits[feature]) {
    throw new PlanError(
      feature === "exports" ? "exports_unavailable" : "search_unavailable",
      feature === "exports"
        ? `Excel exports aren't included in ${plan.name}. Upgrade to Growth to export your mentions.`
        : `Google, YouTube and News scanning isn't included in ${plan.name}. Upgrade to Growth to monitor all sources.`
    );
  }
}

export async function hasFeature(orgId: string, feature: "exports" | "searchScanning"): Promise<boolean> {
  const org = await loadOrg(orgId);
  return planOf(org.plan).limits[feature];
}

/** Moves a workspace onto a paid plan (from Stripe, or by the operator's CLI). */
export async function applyPlan(
  orgId: string,
  plan: PlanId,
  opts: {
    status?: "active" | "past_due" | "canceled";
    interval?: BillingInterval | null;
    currentPeriodEnd?: Date | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  } = {}
) {
  return prisma.organization.update({
    where: { id: orgId },
    data: {
      plan,
      subscriptionStatus: plan === "trial" ? "trialing" : opts.status ?? "active",
      ...(opts.interval !== undefined ? { billingInterval: opts.interval } : {}),
      ...(opts.currentPeriodEnd !== undefined ? { currentPeriodEnd: opts.currentPeriodEnd } : {}),
      ...(opts.stripeCustomerId !== undefined ? { stripeCustomerId: opts.stripeCustomerId } : {}),
      ...(opts.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: opts.stripeSubscriptionId } : {}),
      // A fresh trial gets fresh reminder emails.
      ...(plan === "trial" ? { trialEndsAt: trialEndFromNow(), trialReminderSentAt: null, trialEndedNoticeAt: null } : {}),
    },
  });
}

/** Workspaces created before billing existed start their trial now. */
export async function backfillLegacyOrganizations(): Promise<number> {
  const legacy = await prisma.organization.updateMany({
    where: { OR: [{ plan: { in: ["free", "pro", "enterprise"] } }, { plan: "trial", trialEndsAt: null }] },
    data: { plan: "trial", subscriptionStatus: "trialing", trialEndsAt: trialEndFromNow() },
  });
  return legacy.count;
}
