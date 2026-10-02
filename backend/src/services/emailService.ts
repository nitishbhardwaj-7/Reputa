import { env, refreshEnvFromDisk } from "../config/env";
import nodemailer from "nodemailer";

export interface NegativeMentionPayload {
  type: "post" | "comment";
  keyword: string;
  brandName: string;
  platform: string;
  text: string;
  author: string;
  url: string;
  sentiment: string;
  confidence?: number | null;
  publishedAt?: Date | string | null;
}

export function parseRecipientList(raw?: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : (raw ?? "").split(/[\s,;]+/);
  return list
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

/** True when the platform's SMTP credentials are set, i.e. an alert can be attempted. */
export async function isSmtpConfigured(): Promise<boolean> {
  await refreshEnvFromDisk();
  return Boolean(env.SMTP_USER?.trim() && env.SMTP_PASS?.trim());
}

function createSmtpTransporter() {
  const host = env.SMTP_HOST?.trim() || "";
  const port = Number(env.SMTP_PORT) || 587;
  const user = env.SMTP_USER?.trim() || "";
  const pass = env.SMTP_PASS?.trim() || "";
  if (!user || !pass) return null;

  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

/**
 * Sends one negative-mention alert to the given recipients. Returns true only when
 * the SMTP server accepted the message, so callers can safely mark it as sent.
 */
export async function sendNegativeMentionAlert(item: NegativeMentionPayload, recipients: string[]): Promise<boolean> {
  await refreshEnvFromDisk();

  const transporter = createSmtpTransporter();
  if (!transporter) {
    console.warn("Skipping email alert: SMTP is not configured on this platform.");
    return false;
  }

  const to = parseRecipientList(recipients);
  if (to.length === 0) {
    console.warn("Skipping email alert: the organization has no alert recipients.");
    return false;
  }

  const platformName = (item.platform || "Social Media").toUpperCase();
  const itemType = item.type.toUpperCase();
  const dateStr = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : new Date().toLocaleString();
  const confidencePct = typeof item.confidence === "number" ? Math.round(item.confidence * 100) : 100;

  const subject = `Negative ${item.type} about ${item.brandName} on ${platformName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: #0f172a; color: #ffffff; padding: 22px 24px;">
        <span style="background: rgba(255,255,255,0.12); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;">
          ${escapeHtml(platformName)} • ${escapeHtml(itemType)}
        </span>
        <h2 style="margin: 14px 0 4px 0; font-size: 20px; font-weight: 700;">Negative mention detected</h2>
        <p style="margin: 0; font-size: 13px; opacity: 0.85;">Brand: <strong>${escapeHtml(item.brandName)}</strong> · Keyword: <strong>${escapeHtml(item.keyword)}</strong></p>
      </div>
      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; color: #475569;">
          <tr><td style="padding: 6px 0; font-weight: 600; width: 110px;">Platform</td><td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${escapeHtml(platformName)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 600;">Author</td><td style="padding: 6px 0; color: #0f172a;">${escapeHtml(item.author || "Anonymous")}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 600;">Published</td><td style="padding: 6px 0; color: #0f172a;">${escapeHtml(dateStr)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 600;">AI sentiment</td><td style="padding: 6px 0;">
            <span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700;">NEGATIVE (${confidencePct}% confidence)</span>
          </td></tr>
        </table>
        <blockquote style="margin: 0 0 24px; padding: 16px; background: #f8fafc; border-left: 4px solid #dc2626; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${escapeHtml(item.text || "No text content available.")}</blockquote>
        ${
          item.url
            ? `<div style="text-align: center; padding-top: 16px; border-top: 1px solid #f1f5f9;">
                 <a href="${escapeHtml(item.url)}" target="_blank" style="display: inline-block; background: #0f172a; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 10px 22px; border-radius: 8px;">View on ${escapeHtml(platformName)} →</a>
               </div>`
            : ""
        }
      </div>
      <div style="background: #f8fafc; padding: 12px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        Sent by ${escapeHtml(env.APP_NAME)} · You receive one alert per mention, never repeats.
      </div>
    </div>
  `;

  try {
    const senderUser = env.SMTP_USER?.trim() || "alerts@localhost";
    const fromAddress = env.MAIL_FROM?.trim() || `${env.APP_NAME} Alerts <${senderUser}>`;
    const info = await transporter.sendMail({ from: fromAddress, to: to.join(", "), subject, html });
    console.log(`✓ Alert delivered to [${to.join(", ")}] (${info.messageId})`);
    return true;
  } catch (err: any) {
    console.error("SMTP alert failed:", err?.message || err);
    return false;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
