import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  hashPassword,
  verifyPassword,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  makeOrgSlug,
} from "../lib/auth";
import { requireAuth } from "../middleware/auth";
import { stateOf, trialEndFromNow } from "../services/billingService";

export const authRouter = Router();

// Credential endpoints get a tight per-IP limit; everything else uses the global one.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters.").max(128);

const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required.").max(80),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(1, "Company name is required.").max(80),
  brandName: z.string().trim().min(1, "Brand name is required.").max(80),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

function publicUser(u: { id: string; email: string; name: string; role: string; createdAt: Date }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt };
}

type OrgRow = {
  id: string; name: string; slug: string; brandName: string; alertEmails: string[]; plan: string;
  trialEndsAt: Date | null; subscriptionStatus: string; billingInterval: string | null; currentPeriodEnd: Date | null;
  stripeCustomerId: string | null; stripeSubscriptionId: string | null;
};

function publicOrg(o: OrgRow) {
  return {
    id: o.id, name: o.name, slug: o.slug, brandName: o.brandName, alertEmails: o.alertEmails, plan: o.plan,
    trialEndsAt: o.trialEndsAt, currentPeriodEnd: o.currentPeriodEnd,
    // The effective state, already resolved against the clock, so the UI never has to guess.
    subscriptionState: stateOf(o),
  };
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}

// POST /api/auth/signup — creates the organization and its first (owner) user.
authRouter.post("/signup", credentialLimiter, async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const { name, email, password, organizationName, brandName } = parsed.data;

    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) return res.status(409).json({ error: "An account with this email already exists." });

    const passwordHash = await hashPassword(password);

    const org = await prisma.organization.create({
      data: {
        name: organizationName,
        slug: makeOrgSlug(organizationName),
        brandName,
        // Alerts go to the signup email until the owner changes it.
        alertEmails: [email],
        // Every workspace starts on a full-featured trial; no card required.
        plan: "trial",
        subscriptionStatus: "trialing",
        trialEndsAt: trialEndFromNow(),
        users: {
          create: { email, name, passwordHash, role: "owner", lastLoginAt: new Date() },
        },
      },
      include: { users: true },
    });

    const user = org.users[0];
    setSessionCookie(res, signSession({ userId: user.id, orgId: org.id, role: user.role }));
    res.status(201).json({ user: publicUser(user), organization: publicOrg(org) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post("/login", credentialLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });
    // Same response for unknown email and wrong password so neither leaks.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    setSessionCookie(res, signSession({ userId: user.id, orgId: user.organizationId, role: user.role }));
    res.json({ user: publicUser(user), organization: publicOrg(user.organization) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: { organization: true },
    });
    if (!user) return res.status(401).json({ error: "Session is no longer valid." });
    res.json({ user: publicUser(user), organization: publicOrg(user.organization) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/me — profile fields only.
authRouter.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { name: parsed.data.name },
    });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
authRouter.post("/change-password", requireAuth, credentialLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });

    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword) },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
