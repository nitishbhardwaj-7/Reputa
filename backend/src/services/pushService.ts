import { prisma } from "../lib/prisma";

/**
 * Push notifications to the mobile app through Expo's push service. Devices register an
 * Expo push token (POST /api/devices); a negative mention is pushed to every device in the
 * workspace. Tokens Expo reports as gone are removed so we stop sending to them.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Android channel the app creates; must match `ALERT_CHANNEL` in the app. */
const ALERT_CHANNEL = "alerts";
const BATCH = 100; // Expo's limit per request

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path the notification opens, e.g. /mention/comment/<id>. */
  url?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/** Posts one batch to Expo. Exposed so tests can substitute the transport. */
export type PushTransport = (messages: unknown[]) => Promise<ExpoTicket[]>;

const expoTransport: PushTransport = async (messages) => {
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
  const json = (await res.json()) as { data?: ExpoTicket[] };
  return Array.isArray(json.data) ? json.data : [];
};

/**
 * Sends one message to every device registered in the workspace.
 * Returns how many devices accepted it; never throws (a push must not break the pipeline).
 */
export async function sendPushToOrganization(orgId: string, message: PushMessage, transport: PushTransport = expoTransport): Promise<{ devices: number; delivered: number; removed: number }> {
  const devices = await prisma.pushDevice.findMany({ where: { organizationId: orgId }, select: { token: true } });
  if (devices.length === 0) return { devices: 0, delivered: 0, removed: 0 };

  let delivered = 0;
  const gone: string[] = [];
  for (let i = 0; i < devices.length; i += BATCH) {
    const chunk = devices.slice(i, i + BATCH);
    const payload = chunk.map((d) => ({
      to: d.token,
      title: message.title,
      body: message.body,
      sound: "default",
      priority: "high",
      channelId: ALERT_CHANNEL,
      data: message.url ? { url: message.url } : {},
    }));
    try {
      const tickets = await transport(payload);
      tickets.forEach((t, idx) => {
        if (t.status === "ok") delivered++;
        else if (t.details?.error === "DeviceNotRegistered") gone.push(chunk[idx].token);
        else console.warn("Push not accepted:", t.details?.error || t.message);
      });
    } catch (err: any) {
      console.error("Push send failed:", err?.message || err);
    }
  }

  if (gone.length > 0) await prisma.pushDevice.deleteMany({ where: { token: { in: gone } } });
  return { devices: devices.length, delivered, removed: gone.length };
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** The alert for one negative mention. */
export function negativeMentionPush(kind: "post" | "comment", id: string, platform: string, text: string): PushMessage {
  const source = platform && platform !== "web" ? platform.charAt(0).toUpperCase() + platform.slice(1) : "the web";
  return {
    title: `Negative mention on ${source}`,
    body: clip(text || "A new negative mention was detected.", 160),
    url: `/mention/${kind}/${id}`,
  };
}
