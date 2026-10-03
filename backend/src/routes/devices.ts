import { Router } from "express";
import { prisma } from "../lib/prisma";
import { orgOf } from "../middleware/auth";
import { isExpoPushToken } from "../services/pushService";

export const devicesRouter = Router();

/** A workspace can register a sensible number of phones; this stops a runaway client. */
const MAX_DEVICES_PER_USER = 10;

// POST /api/devices { token, platform } — called by the app after sign-in and at every launch.
devicesRouter.post("/", async (req, res, next) => {
  try {
    const { token, platform } = req.body ?? {};
    if (!isExpoPushToken(token)) return res.status(400).json({ error: "A valid Expo push token is required." });
    const cleanPlatform = platform === "ios" || platform === "android" ? platform : "unknown";

    // A token identifies one app install. If someone else signs in on that phone, it moves to them.
    await prisma.pushDevice.upsert({
      where: { token },
      create: { token, platform: cleanPlatform, userId: req.auth!.userId, organizationId: orgOf(req) },
      update: { platform: cleanPlatform, userId: req.auth!.userId, organizationId: orgOf(req), lastSeenAt: new Date() },
    });

    // Keep only this user's most recent devices.
    const mine = await prisma.pushDevice.findMany({ where: { userId: req.auth!.userId }, orderBy: { lastSeenAt: "desc" }, select: { id: true } });
    if (mine.length > MAX_DEVICES_PER_USER) {
      await prisma.pushDevice.deleteMany({ where: { id: { in: mine.slice(MAX_DEVICES_PER_USER).map((d) => d.id) } } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/devices { token } — called on sign-out so the phone stops receiving alerts.
devicesRouter.delete("/", async (req, res, next) => {
  try {
    const { token } = req.body ?? {};
    if (typeof token !== "string" || !token) return res.status(400).json({ error: "A token is required." });
    await prisma.pushDevice.deleteMany({ where: { token, userId: req.auth!.userId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
