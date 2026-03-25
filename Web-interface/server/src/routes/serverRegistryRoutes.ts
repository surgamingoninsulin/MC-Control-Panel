import { Router } from "express";
import multer from "multer";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";
import type { ServerType } from "../services/ServerRegistryService.js";

const ENABLED_TYPES: ServerType[] = ["vanilla", "paper", "spigot", "purpur", "forge", "neoforge", "fabric"];

const parseInstallInput = (body: unknown): { name: string; type: ServerType; version: string } => {
  const payload = (body || {}) as Record<string, unknown>;
  const name = String(payload.name || "").trim();
  const type = String(payload.type || "").trim() as ServerType;
  const version = String(payload.version || "").trim();
  if (!name) throw new Error("Server name is required.");
  if (!type || !ENABLED_TYPES.includes(type)) throw new Error("A supported server type is required.");
  if (!version) throw new Error("Minecraft version is required.");
  return { name, type, version };
};

const parseImportInput = (body: unknown): { name: string } => {
  const payload = (body || {}) as Record<string, unknown>;
  const name = String(payload.name || "").trim();
  if (!name) throw new Error("Server name is required.");
  return { name };
};

export const createServerRegistryRoutes = (ctx: AppContext): Router => {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    preservePath: true,
    limits: {
      // Large folder imports can carry many multipart fields and long relative names.
      // Keep these generous so path metadata is not truncated.
      fieldSize: 10 * 1024 * 1024,
      fields: 50_000,
      parts: 100_000
    }
  });

  router.get("/", requireRole(["owner", "admin", "viewer"]), (_req, res) => {
    res.json({ servers: ctx.servers.list() });
  });

  router.post("/", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const input = parseInstallInput(req.body);
      const server = ctx.servers.create(input);
      res.json({ server });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/:id", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const id = String(req.params.id);
      if (ctx.runtime.isRunning(id)) {
        return res.status(400).json({ error: "Cannot delete a running server." });
      }
      const removed = ctx.servers.delete(id);
      return res.json({ removed });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/:id/rename", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const id = String(req.params.id);
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Server name is required." });
      if (ctx.runtime.isRunning(id)) {
        return res.status(400).json({ error: "Cannot rename a running server. Stop it first." });
      }
      const server = ctx.servers.update(id, { name });
      ctx.audit.write({
        action: "server.rename",
        actor: "local-admin",
        details: { serverId: id, name }
      });
      return res.json({ server });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/install", requireRole(["owner", "admin"]), upload.single("icon"), async (req, res) => {
    try {
      const input = parseInstallInput(req.body);
      const created = ctx.servers.create(input);
      if (req.file) {
        if (!/\.png$/i.test(String(req.file.originalname || ""))) {
          return res.status(400).json({ error: "Server icon must be a .png file." });
        }
        ctx.servers.setServerIcon(created.id, req.file.buffer);
      }
      const install = await ctx.installer.install(created);
      const server =
        install.version && install.version !== created.version
          ? ctx.servers.update(created.id, { version: install.version })
          : created;
      return res.json({ server, install });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/:id/update", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const id = String(req.params.id);
      if (ctx.runtime.isRunning(id)) {
        return res.status(400).json({ error: "Cannot update a running server. Stop it first." });
      }
      const current = ctx.servers.requireById(id);
      const update = await ctx.installer.updateServerJar(current);
      const server =
        update.version && update.version !== current.version
          ? ctx.servers.update(current.id, { version: update.version })
          : current;
      ctx.audit.write({
        action: "server.jar.update",
        actor: "local-admin",
        details: { serverId: id, type: current.type, version: update.version, build: update.build, updated: update.updated }
      });
      return res.json({ server, update });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/:id/icon", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    try {
      const iconPath = ctx.servers.getServerIconPath(String(req.params.id));
      return res.sendFile(iconPath);
    } catch (error) {
      return res.status(404).json({ error: (error as Error).message });
    }
  });

  router.get("/:id/addons-summary", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const id = String(req.params.id);
      const server = ctx.servers.requireById(id);
      if (server.type === "vanilla") {
        return res.json({ summary: { mode: "none", items: [] } });
      }
      if (server.type === "paper" || server.type === "spigot" || server.type === "purpur") {
        const plugins = await ctx.plugins.list(server.rootPath);
        return res.json({ summary: { mode: "plugins", items: plugins.map((entry) => entry.pluginId) } });
      }
      const mods = await ctx.mods.list(server.rootPath);
      return res.json({ summary: { mode: "mods", items: mods.map((entry) => entry.modId) } });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/import", requireRole(["owner", "admin"]), upload.array("files[]"), async (req, res) => {
    try {
      const input = parseImportInput(req.body);
      const server = ctx.servers.importAs({ ...input, type: "vanilla", version: "imported" });
      const files = (req.files as Express.Multer.File[]) || [];
      const rawPathsJson = String((req.body as { pathsJson?: string }).pathsJson || "[]");
      let parsed: unknown = [];
      try {
        parsed = JSON.parse(rawPathsJson);
      } catch {
        parsed = [];
      }
      const relativePaths = Array.isArray(parsed) ? parsed.map((item) => String(item || "")) : [];
      const out = await ctx.installer.importServerFolder(server, files, relativePaths);
      const detected = await ctx.installer.detectImportedServerJar(server);
      const updatedServer =
        detected.type || detected.version
          ? ctx.servers.update(server.id, {
              type: detected.type || server.type,
              version: detected.version || server.version
            })
          : server;
      return res.json({ server: updatedServer, ...out, detected });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
