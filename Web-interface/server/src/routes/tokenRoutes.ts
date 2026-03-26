import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole, type AuthedRequest } from "../middleware/auth.js";

export const createTokenRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const user = (req as AuthedRequest).user!;
    res.json({ tokens: ctx.tokens.listForUser(user.id) });
  });

  router.post("/", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    try {
      const user = (req as AuthedRequest).user!;
      const { token, record } = ctx.tokens.create(
        user.id,
        String(req.body?.label || ""),
        Array.isArray(req.body?.scopes) ? req.body.scopes : [],
        typeof req.body?.expiresAt === "string" ? req.body.expiresAt : null
      );
      res.json({ token, record });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/:id", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    try {
      const user = (req as AuthedRequest).user!;
      ctx.tokens.revoke(user.id, String(req.params.id || ""));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
