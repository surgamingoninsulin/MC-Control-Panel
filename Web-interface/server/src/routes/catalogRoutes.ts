import { Router } from "express";
import type { AppContext } from "../context.js";
import type { ServerType } from "../services/ServerRegistryService.js";

export const createCatalogRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/server-types", async (_req, res) => {
    const types = await ctx.versionCatalog.getServerTypes();
    res.json({ types });
  });

  router.get("/server-versions", async (req, res) => {
    try {
      const type = String(req.query.type || "purpur") as ServerType;
      const forceRefresh = /^(1|true|yes)$/i.test(String(req.query.force || "").trim());
      const versions = await ctx.versionCatalog.getVersions(type, { forceRefresh });
      res.json({ versions });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
