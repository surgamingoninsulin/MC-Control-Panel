import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";

export const createMetricsRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/nodes/:id", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    res.json({ samples: ctx.metrics.list(String(req.params.id || "")) });
  });

  router.get("/servers/:id", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const server = ctx.servers.requireById(String(req.params.id || ""));
    res.json({ samples: ctx.metrics.list(server.nodeId, server.id) });
  });

  return router;
};
