import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma";
import { makeOrgSlug } from "../lib/auth";
import { trialEndFromNow } from "./billingService";

/**
 * "Continue with Google" for the web app and the mobile app. Both obtain a Google ID token
 * on the device and post it here; we verify it against Google's keys and our own client
 * ids, then find or create the account. No client secret is involved.
 *
 * GOOGLE_CLIENT_IDS is a comma-separated list: the web client id first (it is the one the
 * browser needs), followed by the iOS / Android client ids the mobile app signs in with.
 */
export function googleClientIds(): string[] {
  return (process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function googleConfigured(): boolean {
  return googleClientIds().length > 0;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

export class GoogleAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

const client = new OAuth2Client();

/** Verifies signature, expiry, issuer and audience. Throws GoogleAuthError when anything is off. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const audience = googleClientIds();
  if (audience.length === 0) throw new GoogleAuthError("Google sign-in isn't enabled on this platform yet.", 503);

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    throw new GoogleAuthError("Google could not confirm this sign-in. Please try again.");
  }
  if (!payload?.sub || !payload.email) throw new GoogleAuthError("Google did not share an email address for this account.");
  // An unverified address could belong to someone else; never link or create on it.
  if (!payload.email_verified) throw new GoogleAuthError("This Google account's email address isn't verified.");

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: (payload.name || payload.given_name || payload.email.split("@")[0]).slice(0, 80),
  };
}

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "aol.com"]);

/** A sensible first workspace name; onboarding lets the owner change it. */
export function defaultWorkspaceName(name: string, email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain && !FREE_MAIL.has(domain)) {
    const base = domain.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  const first = name.trim().split(/\s+/)[0] || "My";
  return `${first}'s workspace`;
}

/**
 * Signs a verified Google profile in:
 *  - known Google id          → that user
 *  - same email, no Google id → link it (Google has verified the address) and sign in
 *  - otherwise                → new workspace on a trial, exactly like email signup
 */
export async function signInWithGoogleProfile(profile: GoogleProfile) {
  const byGoogle = await prisma.user.findFirst({ where: { googleId: profile.googleId }, include: { organization: true } });
  if (byGoogle) {
    const user = await prisma.user.update({ where: { id: byGoogle.id }, data: { lastLoginAt: new Date() }, include: { organization: true } });
    return { user, created: false };
  }

  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    const user = await prisma.user.update({
      where: { id: byEmail.id },
      data: { googleId: profile.googleId, lastLoginAt: new Date() },
      include: { organization: true },
    });
    return { user, created: false };
  }

  const workspace = defaultWorkspaceName(profile.name, profile.email);
  const org = await prisma.organization.create({
    data: {
      name: workspace,
      slug: makeOrgSlug(workspace),
      brandName: workspace,
      alertEmails: [profile.email],
      plan: "trial",
      subscriptionStatus: "trialing",
      trialEndsAt: trialEndFromNow(),
      users: { create: { email: profile.email, name: profile.name, googleId: profile.googleId, role: "owner", lastLoginAt: new Date() } },
    },
    include: { users: { include: { organization: true } } },
  });
  return { user: org.users[0], created: true };
}
