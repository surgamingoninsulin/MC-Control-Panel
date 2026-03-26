import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";

export const createAuditRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/", requireRole(["owner", "admin"]), (req, res) => {
    const action = typeof req.query.action === "string" ? req.query.action : "";
    const serverId = typeof req.query.serverId === "string" ? req.query.serverId : "";
    const result = typeof req.query.result === "string" ? req.query.result : "";
    const events = ctx.audit
      .list()
      .filter((entry) => (!action || entry.action.includes(action)) && (!serverId || entry.serverId === serverId) && (!result || entry.result === result));
    res.json({ events });
  });

  return router;
};
