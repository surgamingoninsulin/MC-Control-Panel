import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole, type AuthedRequest } from "../middleware/auth.js";

export const createBulkRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.post("/servers", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const action = String(req.body?.action || "") as "start" | "stop" | "restart" | "update" | "backup";
      const serverIds = Array.isArray(req.body?.serverIds)
        ? req.body.serverIds.map((item: unknown) => String(item || ""))
        : [];
      const actor = (req as AuthedRequest).user?.email || (req as AuthedRequest).user?.username || "local-admin";
      const group = ctx.platform.update((state) => {
        const created = {
          id: `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          action,
          createdAt: new Date().toISOString(),
          createdBy: actor,
          targetServerIds: serverIds,
          completedServerIds: [] as string[],
          failed: [] as Array<{ serverId: string; reason: string }>
        };
        state.bulkActionGroups.unshift(created);
        return created;
      });

      for (const serverId of serverIds) {
        try {
          const server = ctx.servers.requireById(serverId);
          if (action === "start") ctx.runtime.start(server.id, server.rootPath);
          if (action === "stop") ctx.runtime.stop(server.id);
          if (action === "restart") ctx.runtime.restart(server.id, server.rootPath);
          if (action === "backup") ctx.backups.create(server, actor, "manual");
          if (action === "update") void ctx.installer.updateServerJar(server);
          ctx.platform.update((state) => {
            const target = state.bulkActionGroups.find((entry) => entry.id === group.id);
            if (target && !target.completedServerIds.includes(serverId)) target.completedServerIds.push(serverId);
          });
        } catch (error) {
          ctx.platform.update((state) => {
            const target = state.bulkActionGroups.find((entry) => entry.id === group.id);
            if (target) target.failed.push({ serverId, reason: (error as Error).message });
          });
        }
      }

      res.json({ group: ctx.platform.read().bulkActionGroups.find((entry) => entry.id === group.id) });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
