import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";
import type { UserRole } from "../services/AuthService.js";

export const createUserRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/", requireRole(["owner"]), (_req, res) => {
    res.json({ users: ctx.auth.listUsers() });
  });

  router.post("/", requireRole(["owner"]), (req, res) => {
    try {
      const username = String(req.body?.username || "");
      const password = String(req.body?.password || "");
      const role = String(req.body?.role || "viewer") as UserRole;
      const email = String(req.body?.email || "");
      const user = ctx.auth.createUser({ username, password, role, email });
      res.json({ user });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.put("/:id", requireRole(["owner"]), (req, res) => {
    try {
      const user = ctx.auth.updateUser(String(req.params.id), {
        role: req.body?.role,
        active: req.body?.active,
        password: req.body?.password,
        email: req.body?.email
      });
      res.json({ user });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/:id", requireRole(["owner"]), (req, res) => {
    try {
      ctx.auth.removeUser(String(req.params.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
