import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { TRIAL_DAYS } from "../config/plans";
import { isSmtpConfigured, sendSystemEmail } from "./emailService";
import { appUrl } from "./stripeService";

const DAY = 86_400_000;

function shell(title: string, body: string, cta: string): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;border:1px solid #deddd8;border-radius:10px;overflow:hidden;background:#fff;color:#111">
    <div style="padding:24px 24px 8px"><div style="font-size:13px;font-weight:600;letter-spacing:.02em">${env.APP_NAME}</div>
      <h1 style="font-size:22px;letter-spacing:-.02em;margin:18px 0 10px">${title}</h1>
      <div style="font-size:14.5px;line-height:1.55;color:#444">${body}</div>
      <a href="${appUrl()}/app/billing" style="display:inline-block;margin:20px 0 24px;background:#0b0c0d;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:7px">${cta} →</a>
    </div>
    <div style="background:#f7f6f2;padding:12px 24px;font-size:11.5px;color:#888;border-top:1px solid #deddd8">You're receiving this because you own a ${env.APP_NAME} workspace.</div>
  </div>`;
}

/**
 * One reminder three days before a trial ends and one notice when it has ended.
 * Each is recorded only after the mail server accepts it, so a failed send retries next hour.
 */
export async function sendTrialNotices(): Promise<{ reminders: number; ended: number }> {
  const out = { reminders: 0, ended: 0 };
  if (!(await isSmtpConfigured())) return out;
  const now = new Date();

  const endingSoon = await prisma.organization.findMany({
    where: { plan: "trial", trialReminderSentAt: null, trialEndsAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY) } },
    select: { id: true, name: true, trialEndsAt: true, users: { where: { role: "owner" }, select: { email: true } } },
  });
  for (const org of endingSoon) {
    const to = org.users.map((u) => u.email);
    if (to.length === 0) continue;
    const days = Math.max(1, Math.ceil((org.trialEndsAt!.getTime() - now.getTime()) / DAY));
    const ok = await sendSystemEmail(
      to,
      `Your ${env.APP_NAME} trial ends in ${days} day${days === 1 ? "" : "s"}`,
      shell(
        `${days} day${days === 1 ? "" : "s"} left in your trial`,
        `<p>${org.name}'s ${TRIAL_DAYS}-day trial ends on <b>${org.trialEndsAt!.toUTCString().slice(0, 16)}</b>.</p>
         <p>Pick a plan before then and hourly scanning, sentiment analysis and negative-mention alerts continue without a gap. Everything you've collected stays exactly where it is.</p>`,
        "Choose a plan"
      )
    );
    if (ok) {
      await prisma.organization.update({ where: { id: org.id }, data: { trialReminderSentAt: now } });
      out.reminders++;
    }
  }

  const ended = await prisma.organization.findMany({
    where: { plan: "trial", trialEndedNoticeAt: null, trialEndsAt: { lte: now } },
    select: { id: true, name: true, users: { where: { role: "owner" }, select: { email: true } } },
  });
  for (const org of ended) {
    const to = org.users.map((u) => u.email);
    if (to.length === 0) continue;
    const ok = await sendSystemEmail(
      to,
      `Your ${env.APP_NAME} trial has ended — scanning is paused`,
      shell(
        "Your trial has ended",
        `<p>We've paused scanning and alerts for <b>${org.name}</b>. Your mentions, reports and settings are all still there.</p>
         <p>Choose a plan to pick up right where you left off — the next hourly scan runs as soon as you do.</p>`,
        "Resume monitoring"
      )
    );
    if (ok) {
      await prisma.organization.update({ where: { id: org.id }, data: { trialEndedNoticeAt: now } });
      out.ended++;
    }
  }
  return out;
}
