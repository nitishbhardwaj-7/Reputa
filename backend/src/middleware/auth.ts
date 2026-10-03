import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { SESSION_COOKIE, verifySession } from "../lib/auth";

export interface AuthContext {
  userId: string;
  orgId: string;
  role: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function readToken(req: Request): string | null {
  // The mobile app sends a bearer token; browsers send the httpOnly cookie.
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7).trim() || null;
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;
  return null;
}

/**
 * Rejects the request unless a valid session is present. Confirms the user still
 * exists so a deleted account can't keep using an unexpired token.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  const claims = token ? verifySession(token) : null;
  if (!claims) {
    return res.status(401).json({ error: "Not signed in." });
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, role: true, organizationId: true },
  });
  if (!user || user.organizationId !== claims.orgId) {
    return res.status(401).json({ error: "Session is no longer valid." });
  }

  req.auth = { userId: user.id, orgId: user.organizationId, role: user.role, email: user.email };
  next();
}

/** Convenience for handlers that run after requireAuth. */
export function orgOf(req: Request): string {
  if (!req.auth) throw new Error("orgOf() called on an unauthenticated request");
  return req.auth.orgId;
}
