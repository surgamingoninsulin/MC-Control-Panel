import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole, type AuthedRequest } from "../middleware/auth.js";

export const createBackupRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const serverId = typeof req.query.serverId === "string" ? req.query.serverId : undefined;
    res.json({ backups: ctx.backups.list(serverId) });
  });

  router.post("/server/:id", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const server = ctx.servers.requireById(String(req.params.id || ""));
      const actor = (req as AuthedRequest).user?.email || (req as AuthedRequest).user?.username || "local-admin";
      const backup = ctx.backups.create(server, actor, "manual");
      ctx.audit.write({
        action: "backup.create",
        actor,
        serverId: server.id,
        nodeId: server.nodeId,
        details: { backupId: backup.id, size: backup.size }
      });
      ctx.notifications.create({
        userId: (req as AuthedRequest).user?.id || null,
        severity: "success",
        category: "backup",
        title: "Backup created",
        body: `Backup for ${server.name} is ready.`,
        serverId: server.id,
        nodeId: server.nodeId,
        dedupeKey: null
      });
      res.json({ backup });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/:id/download", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    try {
      const backup = ctx.backups.getById(String(req.params.id || ""));
      res.download(backup.filePath);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  router.post("/:id/restore", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const backup = ctx.backups.getById(String(req.params.id || ""));
      if (ctx.runtime.isRunning(backup.serverId)) {
        return res.status(400).json({ error: "Stop the server before restoring a backup." });
      }
      const server = ctx.servers.requireById(backup.serverId);
      const actor = (req as AuthedRequest).user?.email || (req as AuthedRequest).user?.username || "local-admin";
      const out = ctx.backups.restore(server, backup.id, () => ctx.backups.create(server, actor, "pre-restore"));
      ctx.audit.write({
        action: "backup.restore",
        actor,
        serverId: server.id,
        nodeId: server.nodeId,
        details: { backupId: backup.id, preRestoreBackupId: out.preRestore.id }
      });
      ctx.notifications.create({
        userId: (req as AuthedRequest).user?.id || null,
        severity: "warn",
        category: "backup",
        title: "Backup restored",
        body: `Backup restored for ${server.name}.`,
        serverId: server.id,
        nodeId: server.nodeId,
        dedupeKey: null
      });
      return res.json(out);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/:id", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const backup = ctx.backups.getById(String(req.params.id || ""));
      if (ctx.runtime.isRunning(backup.serverId)) {
        return res.status(400).json({ error: "Stop the server before deleting its backups." });
      }
      const removed = ctx.backups.delete(backup.id);
      const actor = (req as AuthedRequest).user?.email || (req as AuthedRequest).user?.username || "local-admin";
      ctx.audit.write({
        action: "backup.delete",
        actor,
        serverId: removed.serverId,
        nodeId: removed.nodeId,
        details: { backupId: removed.id, filePath: removed.filePath }
      });
      return res.json({ removed });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
