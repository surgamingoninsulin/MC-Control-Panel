import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";

export const createNodeRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/", requireRole(["owner", "admin", "viewer"]), (_req, res) => {
    res.json({ nodes: ctx.nodes.list() });
  });

  router.post("/", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const node = ctx.nodes.create({
        name: String(req.body?.name || ""),
        baseUrl: String(req.body?.baseUrl || ""),
        authToken: typeof req.body?.authToken === "string" ? req.body.authToken : null
      });
      res.json({ node });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.put("/:id", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const node = ctx.nodes.update(String(req.params.id || ""), {
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        baseUrl: typeof req.body?.baseUrl === "string" ? req.body.baseUrl : undefined,
        authToken: typeof req.body?.authToken === "string" ? req.body.authToken : undefined
      });
      res.json({ node });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/:id", requireRole(["owner", "admin"]), (req, res) => {
    try {
      ctx.nodes.remove(String(req.params.id || ""));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/:id/test", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const out = await ctx.nodeExec.probeNode(String(req.params.id || ""));
      res.json(out);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/:id/heartbeat", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const node = ctx.nodes.heartbeat(String(req.params.id || ""));
      res.json({ node });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
