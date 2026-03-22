import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppContext } from "../context.js";
import { appConfig } from "../config.js";
import { requireRole } from "../middleware/auth.js";
import { readServerId } from "../utils/requestServer.js";

const MOD_SERVER_TYPES = new Set(["fabric", "forge", "neoforge"]);

const migrateModJarsToPlugins = async (serverRoot: string): Promise<void> => {
  const pluginsDir = path.resolve(serverRoot, "plugins");
  const modsDir = path.resolve(serverRoot, "mods");
  await fs.mkdir(pluginsDir, { recursive: true });
  const entries = await fs.readdir(modsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jar")) continue;
    const from = path.resolve(modsDir, entry.name);
    const to = path.resolve(pluginsDir, entry.name);
    await fs.copyFile(from, to);
    await fs.rm(from, { force: true });
  }
};

export const createPluginRoutes = (ctx: AppContext): Router => {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: appConfig.uploadLimitMb * 1024 * 1024 }
  });

  router.get("/list", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      if (server.type === "vanilla") return res.json({ plugins: [] });
      if (MOD_SERVER_TYPES.has(server.type)) return res.json({ plugins: [] });
      await migrateModJarsToPlugins(server.rootPath);
      const plugins = await ctx.plugins.list(server.rootPath);
      return res.json({ plugins });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/install", requireRole(["owner", "admin"]), upload.single("artifact"), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      if (server.type === "vanilla") return res.status(400).json({ error: "Plugins/Mods are disabled for vanilla servers." });
      if (!req.file) return res.status(400).json({ error: "artifact is required" });
      if (!MOD_SERVER_TYPES.has(server.type)) await migrateModJarsToPlugins(server.rootPath);
      const mode = req.body?.mode === "zip" ? "zip" : "jar";
      const confirmOverwrite = req.body?.confirmOverwrite === "true";
      const result = MOD_SERVER_TYPES.has(server.type)
        ? await ctx.mods.install({
            mode,
            artifact: req.file,
            confirmOverwrite,
            serverRoot: server.rootPath
          })
        : await ctx.plugins.install({
            mode,
            artifact: req.file,
            confirmOverwrite,
            serverRoot: server.rootPath
          });
      ctx.ws.broadcast({
        channel: "tasks:events",
        event: MOD_SERVER_TYPES.has(server.type) ? "mod:install" : "plugin:install",
        data: result,
        serverId
      });
      ctx.audit.write({
        action: MOD_SERVER_TYPES.has(server.type) ? "mod.install" : "plugin.install",
        actor: "local-admin",
        details: { mode, file: req.file.originalname, changed: result.changed }
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/remove", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const pluginId = String(req.body?.pluginId || "");
      if (!pluginId) return res.status(400).json({ error: "pluginId is required" });
      if (server.type === "vanilla") return res.status(400).json({ error: "Plugins/Mods are disabled for vanilla servers." });
      const deleteConfig = !!req.body?.deleteConfig;
      const result = MOD_SERVER_TYPES.has(server.type)
        ? await ctx.mods.remove({ modId: pluginId, serverRoot: server.rootPath })
        : await ctx.plugins.remove({ pluginId, deleteConfig, serverRoot: server.rootPath });
      ctx.ws.broadcast({
        channel: "tasks:events",
        event: MOD_SERVER_TYPES.has(server.type) ? "mod:remove" : "plugin:remove",
        data: result,
        serverId
      });
      ctx.audit.write({
        action: MOD_SERVER_TYPES.has(server.type) ? "mod.remove" : "plugin.remove",
        actor: "local-admin",
        details: { pluginId, deleteConfig, changed: result.changed }
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
