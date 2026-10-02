import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "../config/env";

export const SESSION_COOKIE = "orm_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionClaims {
  userId: string;
  orgId: string;
  role: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS, algorithm: "HS256" });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded !== "object" || !decoded) return null;
    const { userId, orgId, role } = decoded as Partial<SessionClaims>;
    if (!userId || !orgId || !role) return null;
    return { userId, orgId, role };
  } catch {
    return null;
  }
}

/** Sets the session as an httpOnly cookie; the browser never sees the token from JS. */
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: env.COOKIE_SECURE, path: "/" });
}

/** URL-safe slug plus a short random suffix so two "Acme"s never collide. */
export function makeOrgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "org";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
