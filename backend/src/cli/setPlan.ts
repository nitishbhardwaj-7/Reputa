/**
 * Operator tool: put a workspace on a plan by hand (invoice customers, comps, support fixes).
 *
 *   node dist/cli/setPlan.js <owner-email> <trial|starter|growth|scale> [monthly|yearly] [days]
 *
 * `days` sets how long the plan stays active (default: 31 monthly, 366 yearly). Passing
 * `trial` restarts a fresh trial. In Docker: docker exec reputa-api node dist/cli/setPlan.js ...
 */
import { prisma } from "../lib/prisma";
import { isPlanId, PLANS } from "../config/plans";
import { applyPlan, getEntitlements } from "../services/billingService";

async function main() {
  const [email, plan, intervalArg, daysArg] = process.argv.slice(2);
  if (!email || !isPlanId(plan)) {
    console.error("Usage: setPlan <owner-email> <trial|starter|growth|scale> [monthly|yearly] [days]");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { organizationId: true, organization: { select: { name: true } } } });
  if (!user) {
    console.error(`No user with email ${email}.`);
    process.exit(1);
  }
  const interval = intervalArg === "yearly" ? "yearly" : "monthly";
  const days = Number(daysArg) > 0 ? Number(daysArg) : interval === "yearly" ? 366 : 31;

  await applyPlan(user.organizationId, plan, plan === "trial"
    ? { interval: null, currentPeriodEnd: null }
    : { status: "active", interval, currentPeriodEnd: new Date(Date.now() + days * 86_400_000) });

  const e = await getEntitlements(user.organizationId);
  console.log(`${user.organization.name}: ${PLANS[plan].name} (${e.state})` +
    (e.currentPeriodEnd ? `, active until ${e.currentPeriodEnd.slice(0, 10)}` : "") +
    (e.trialEndsAt && plan === "trial" ? `, trial ends ${e.trialEndsAt.slice(0, 10)}` : ""));
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
