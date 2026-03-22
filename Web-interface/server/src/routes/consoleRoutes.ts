import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";
import { readServerId } from "../utils/requestServer.js";

export const createConsoleRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/history", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    try {
      const serverId = readServerId(req);
      const cursorRaw = req.query.cursor;
      const cursor = cursorRaw ? Number(cursorRaw) : undefined;
      const lines = ctx.runtime.getHistory(serverId, Number.isFinite(cursor) ? cursor : undefined);
      res.json({
        lines,
        nextCursor: lines.length ? lines[lines.length - 1].cursor : cursor || 0
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/clear", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const serverId = readServerId(req);
      ctx.runtime.clearHistory(serverId);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
