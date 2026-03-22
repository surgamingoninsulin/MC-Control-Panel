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

  router.post("/install", requireRole(["owner", "admin"]), upload.single("icon"), async (req, res) => {
    try {
      const input = parseInstallInput(req.body);
      const server = ctx.servers.create(input);
      if (req.file) {
        if (!/\.png$/i.test(String(req.file.originalname || ""))) {
          return res.status(400).json({ error: "Server icon must be a .png file." });
        }
        ctx.servers.setServerIcon(server.id, req.file.buffer);
      }
      const install = await ctx.installer.install(server);
      return res.json({ server, install });
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
