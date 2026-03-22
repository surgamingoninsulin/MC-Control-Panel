import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppContext } from "../context.js";
import { appConfig } from "../config.js";
import { requireRole } from "../middleware/auth.js";
import { readServerId } from "../utils/requestServer.js";

const PLUGIN_SERVER_TYPES = new Set(["paper", "spigot", "purpur"]);

const migratePluginJarsToMods = async (serverRoot: string): Promise<void> => {
  const pluginsDir = path.resolve(serverRoot, "plugins");
  const modsDir = path.resolve(serverRoot, "mods");
  await fs.mkdir(modsDir, { recursive: true });
  const entries = await fs.readdir(pluginsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jar")) continue;
    const from = path.resolve(pluginsDir, entry.name);
    const to = path.resolve(modsDir, entry.name);
    await fs.copyFile(from, to);
    await fs.rm(from, { force: true });
  }
};

export const createModRoutes = (ctx: AppContext): Router => {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: appConfig.uploadLimitMb * 1024 * 1024 }
  });

  router.get("/list", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      if (server.type === "vanilla") return res.json({ mods: [] });
      if (PLUGIN_SERVER_TYPES.has(server.type)) return res.json({ mods: [] });
      await migratePluginJarsToMods(server.rootPath);
      const mods = await ctx.mods.list(server.rootPath);
      return res.json({ mods });
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
      if (!PLUGIN_SERVER_TYPES.has(server.type)) await migratePluginJarsToMods(server.rootPath);
      const mode = req.body?.mode === "zip" ? "zip" : "jar";
      const confirmOverwrite = req.body?.confirmOverwrite === "true";
      const result = PLUGIN_SERVER_TYPES.has(server.type)
        ? await ctx.plugins.install({
            mode,
            artifact: req.file,
            confirmOverwrite,
            serverRoot: server.rootPath
          })
        : await ctx.mods.install({
            mode,
            artifact: req.file,
            confirmOverwrite,
            serverRoot: server.rootPath
          });
      ctx.ws.broadcast({
        channel: "tasks:events",
        event: PLUGIN_SERVER_TYPES.has(server.type) ? "plugin:install" : "mod:install",
        data: result,
        serverId
      });
      ctx.audit.write({
        action: PLUGIN_SERVER_TYPES.has(server.type) ? "plugin.install" : "mod.install",
        actor: "local-admin",
        details: { mode, file: req.file.originalname, changed: result.changed, skipped: "skipped" in result ? result.skipped : [] }
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
      const modId = String(req.body?.modId || "");
      if (!modId) return res.status(400).json({ error: "modId is required" });
      if (server.type === "vanilla") return res.status(400).json({ error: "Plugins/Mods are disabled for vanilla servers." });
      const result = PLUGIN_SERVER_TYPES.has(server.type)
        ? await ctx.plugins.remove({ pluginId: modId, deleteConfig: false, serverRoot: server.rootPath })
        : await ctx.mods.remove({ modId, serverRoot: server.rootPath });
      ctx.ws.broadcast({
        channel: "tasks:events",
        event: PLUGIN_SERVER_TYPES.has(server.type) ? "plugin:remove" : "mod:remove",
        data: result,
        serverId
      });
      ctx.audit.write({
        action: PLUGIN_SERVER_TYPES.has(server.type) ? "plugin.remove" : "mod.remove",
        actor: "local-admin",
        details: { modId, changed: result.changed }
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
