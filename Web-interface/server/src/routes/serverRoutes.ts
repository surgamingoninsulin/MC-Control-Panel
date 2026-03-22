import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";
import { readServerId } from "../utils/requestServer.js";

export const createServerRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/status", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      res.json({ ...ctx.runtime.getStatus(serverId), serverId, serverName: server.name });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/start", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const status = ctx.runtime.start(serverId, server.rootPath);
      ctx.audit.write({ action: "server.start", actor: "local-admin" });
      res.json({ ...status, serverId, serverName: server.name });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/stop", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const serverId = readServerId(req);
      const status = ctx.runtime.stop(serverId);
      ctx.audit.write({ action: "server.stop", actor: "local-admin" });
      res.json({ ...status, serverId });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/restart", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const status = ctx.runtime.restart(serverId, server.rootPath);
      ctx.audit.write({ action: "server.restart", actor: "local-admin" });
      res.json({ ...status, serverId, serverName: server.name });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/command", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const command = String(req.body?.command || "");
      if (!command.trim()) return res.status(400).json({ error: "command is required" });
      const serverId = readServerId(req);
      ctx.runtime.sendCommand(serverId, command);
      ctx.audit.write({
        action: "server.command",
        actor: "local-admin",
        details: { command }
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/settings", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const serverId = readServerId(req);
    res.json({ settings: ctx.settings.get(serverId) });
  });

  router.put("/settings", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const serverId = readServerId(req);
      const settings = ctx.settings.update(serverId, req.body || {});
      ctx.audit.write({
        action: "server.settings.update",
        actor: "local-admin",
        details: settings
      });
      return res.json({ settings });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
