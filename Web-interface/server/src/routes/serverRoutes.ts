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

  router.post("/start", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const eula = await ctx.admin.getEula(server.rootPath);
      if (!eula.accepted) {
        ctx.audit.write({
          action: "server.start.blocked.eula",
          actor: "local-admin",
          details: { serverId, serverName: server.name }
        });
        return res.json({ kind: "eula_required", eula });
      }
      const status = ctx.runtime.start(serverId, server.rootPath);
      ctx.audit.write({ action: "server.start", actor: "local-admin" });
      return res.json({ kind: "started", status: { ...status, serverId, serverName: server.name } });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/players", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const players = await ctx.admin.listPlayers(serverId, server.rootPath);
      return res.json({ players });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/players", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const player = await ctx.admin.addPlayer(serverId, server.rootPath, {
        username: String(req.body?.username || ""),
        whitelisted: req.body?.whitelisted,
        operator: req.body?.operator,
        opLevel: req.body?.opLevel,
        bypassesPlayerLimit: req.body?.bypassesPlayerLimit
      });
      ctx.audit.write({
        action: "server.player.add",
        actor: "local-admin",
        details: { serverId, player }
      });
      return res.json({ player });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/players/:uuid/head", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const player = await ctx.admin.listPlayers(serverId, server.rootPath);
      const match = player.find((entry) => entry.uuid === String(req.params.uuid || ""));
      const image = await ctx.admin.getPlayerHeadImage({
        uuid: String(req.params.uuid || ""),
        name: typeof req.query.name === "string" ? req.query.name : match?.name
      });
      res.setHeader("Content-Type", image.contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(image.body);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.patch("/players/:uuid", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const player = await ctx.admin.updatePlayer(serverId, server.rootPath, {
        uuid: String(req.params.uuid || ""),
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        whitelisted: typeof req.body?.whitelisted === "boolean" ? req.body.whitelisted : undefined,
        operator: typeof req.body?.operator === "boolean" ? req.body.operator : undefined,
        opLevel: req.body?.opLevel,
        bypassesPlayerLimit:
          typeof req.body?.bypassesPlayerLimit === "boolean" ? req.body.bypassesPlayerLimit : undefined
      });
      ctx.audit.write({
        action: "server.player.update",
        actor: "local-admin",
        details: { serverId, player }
      });
      return res.json({ player });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/players/:uuid", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      await ctx.admin.removePlayer(serverId, server.rootPath, {
        uuid: String(req.params.uuid || ""),
        name: typeof req.query.name === "string" ? req.query.name : undefined
      });
      ctx.audit.write({
        action: "server.player.remove",
        actor: "local-admin",
        details: { serverId, uuid: String(req.params.uuid || "") }
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/eula", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const eula = await ctx.admin.getEula(server.rootPath);
      return res.json({ eula });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.put("/eula", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const eula = await ctx.admin.setEula(server.rootPath, !!req.body?.accepted);
      ctx.audit.write({
        action: "server.eula.update",
        actor: "local-admin",
        details: { serverId, accepted: eula.accepted }
      });
      return res.json({ eula });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/properties", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const properties = await ctx.admin.getProperties(server.rootPath);
      return res.json(properties);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.put("/properties", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const properties = await ctx.admin.setProperties(server.rootPath, {
        fields: Array.isArray(req.body?.fields) ? req.body.fields : [],
        expectedMtime: typeof req.body?.expectedMtime === "string" ? req.body.expectedMtime : undefined
      });
      ctx.audit.write({
        action: "server.properties.update",
        actor: "local-admin",
        details: { serverId, count: properties.fields.length }
      });
      return res.json(properties);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/start-force", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      await ctx.admin.setEula(server.rootPath, true);
      const status = ctx.runtime.start(serverId, server.rootPath);
      ctx.audit.write({ action: "server.start", actor: "local-admin" });
      return res.json({ kind: "started", status: { ...status, serverId, serverName: server.name } });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
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
