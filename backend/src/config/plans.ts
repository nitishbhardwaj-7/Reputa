/**
 * The plan catalog: one place for prices, limits and feature flags. The marketing
 * pricing table, the Billing page and every server-side limit check read from here.
 */
export type PlanId = "trial" | "starter" | "growth" | "scale";
export type PaidPlanId = Exclude<PlanId, "trial">;
export type BillingInterval = "monthly" | "yearly";

export interface PlanLimits {
  /** New mentions ingested per calendar month (UTC). */
  mentionsPerMonth: number;
  /** Keyword cards across all sources. */
  keywords: number;
  /** Competitor cards. */
  competitors: number;
  /** Addresses that receive negative-mention alerts. */
  alertRecipients: number;
  /** Google / YouTube / News brand scanning. Off = the five direct sources only. */
  searchScanning: boolean;
  /** Excel exports. */
  exports: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  /** USD per month when billed monthly. */
  priceMonthly: number;
  /** USD per month when billed yearly (20% off). */
  priceYearly: number;
  limits: PlanLimits;
  features: string[];
}

export const TRIAL_DAYS = Math.max(1, Number(process.env.TRIAL_DAYS) || 14);
/** Days a paid workspace keeps working after a failed or lapsed payment. */
export const GRACE_DAYS = 3;

const GROWTH_LIMITS: PlanLimits = { mentionsPerMonth: 25_000, keywords: 25, competitors: 10, alertRecipients: 10, searchScanning: true, exports: true };

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Free trial",
    description: `Everything in Growth for ${TRIAL_DAYS} days`,
    priceMonthly: 0,
    priceYearly: 0,
    limits: GROWTH_LIMITS,
    features: [],
  },
  starter: {
    id: "starter",
    name: "Starter",
    description: "For individuals and small brands",
    priceMonthly: 49,
    priceYearly: 39,
    limits: { mentionsPerMonth: 5_000, keywords: 5, competitors: 2, alertRecipients: 2, searchScanning: false, exports: false },
    features: ["5,000 mentions / month", "5 sources", "Email alerts", "Basic reports"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "For growing businesses",
    priceMonthly: 99,
    priceYearly: 79,
    limits: GROWTH_LIMITS,
    features: ["25,000 mentions / month", "All sources", "Advanced alerts", "Detailed reports"],
  },
  scale: {
    id: "scale",
    name: "Scale",
    description: "For teams and agencies",
    priceMonthly: 199,
    priceYearly: 159,
    limits: { mentionsPerMonth: 100_000, keywords: 100, competitors: 50, alertRecipients: 50, searchScanning: true, exports: true },
    features: ["100,000 mentions / month", "All sources", "Priority support", "Custom reports"],
  },
};

export const PAID_PLANS: PaidPlanId[] = ["starter", "growth", "scale"];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLANS;
}
export function isPaidPlanId(v: unknown): v is PaidPlanId {
  return typeof v === "string" && (PAID_PLANS as string[]).includes(v);
}
/** Unknown or legacy plan names fall back to the trial definition. */
export function planOf(id: string | null | undefined): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS.trial;
}
