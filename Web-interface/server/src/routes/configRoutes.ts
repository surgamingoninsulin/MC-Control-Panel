import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole } from "../middleware/auth.js";
import { readServerId } from "../utils/requestServer.js";

export const createConfigRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/validate", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const inputPath = String(req.query.path || "");
      if (!inputPath) return res.status(400).json({ error: "path is required" });
      const file = await ctx.files.read(inputPath, "utf8", server.rootPath);
      const validation = ctx.configValidation.validate(inputPath, file.content);
      return res.json({ ...validation, path: inputPath, mtime: file.mtime });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
