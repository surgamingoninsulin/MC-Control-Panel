import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole, type AuthedRequest } from "../middleware/auth.js";

export const createNotificationRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json({ notifications: ctx.notifications.list(user?.id) });
  });

  router.post("/:id/read", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      const notification = ctx.notifications.markRead(String(req.params.id || ""), user?.id);
      res.json({ notification });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/preferences/me", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const user = (req as AuthedRequest).user!;
    res.json({ preferences: ctx.notifications.getPreference(user.id) });
  });

  router.put("/preferences/me", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const user = (req as AuthedRequest).user!;
    const preferences = ctx.notifications.updatePreference(user.id, req.body || {});
    res.json({ preferences });
  });

  return router;
};
