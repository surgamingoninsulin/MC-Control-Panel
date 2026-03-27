import { Router } from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import type { AppContext } from "../context.js";
import { appConfig } from "../config.js";
import { requireRole } from "../middleware/auth.js";
import { readServerId } from "../utils/requestServer.js";

export const createFileRoutes = (ctx: AppContext): Router => {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    preservePath: true,
    limits: { fileSize: appConfig.uploadLimitMb * 1024 * 1024 }
  });

  router.get("/tree", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const list = await ctx.files.tree(String(req.query.path || "."), server.rootPath);
      return res.json({ entries: list });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/read", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const file = await ctx.files.read(String(req.query.path || ""), "utf8", server.rootPath);
      return res.json(file);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.put("/write", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const out = await ctx.files.write({
        path: String(req.body?.path || ""),
        content: String(req.body?.content || ""),
        encoding: req.body?.encoding || "utf8",
        expectedMtime: req.body?.expectedMtime,
        serverRoot: server.rootPath
      });
      ctx.ws.broadcast({
        channel: "fs:events",
        event: "file:write",
        data: { path: String(req.body?.path || ""), mtime: out.mtime },
        serverId
      });
      ctx.audit.write({
        action: "file.write",
        actor: "local-admin",
        details: { path: String(req.body?.path || "") }
      });
      return res.json(out);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/upload", requireRole(["owner", "admin"]), upload.array("files[]"), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const targetPath = String(req.body?.targetPath || ".");
      const files = (req.files as Express.Multer.File[]) || [];
      const saved = await ctx.files.upload(targetPath, files, server.rootPath);
      ctx.ws.broadcast({
        channel: "fs:events",
        event: "file:upload",
        data: { targetPath, files: saved },
        serverId
      });
      ctx.audit.write({
        action: "file.upload",
        actor: "local-admin",
        details: { targetPath, count: saved.length }
      });
      return res.json({ saved });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/open-root", requireRole(["owner", "admin", "viewer"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const target = server.rootPath;

      if (process.platform === "win32") {
        const child = spawn("explorer.exe", [target], { detached: true, stdio: "ignore" });
        child.unref();
      } else if (process.platform === "darwin") {
        const child = spawn("open", [target], { detached: true, stdio: "ignore" });
        child.unref();
      } else {
        const child = spawn("xdg-open", [target], { detached: true, stdio: "ignore" });
        child.unref();
      }

      return res.json({ ok: true, rootPath: target });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/mkdir", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const target = String(req.body?.path || "");
      await ctx.files.mkdir(target, server.rootPath);
      ctx.ws.broadcast({ channel: "fs:events", event: "file:mkdir", data: { path: target }, serverId });
      ctx.audit.write({
        action: "file.mkdir",
        actor: "local-admin",
        details: { path: target }
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/move", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const from = String(req.body?.from || "");
      const to = String(req.body?.to || "");
      await ctx.files.move(from, to, server.rootPath);
      ctx.ws.broadcast({ channel: "fs:events", event: "file:move", data: { from, to }, serverId });
      ctx.audit.write({
        action: "file.move",
        actor: "local-admin",
        details: { from, to }
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/rename", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const from = String(req.body?.from || "");
      const to = String(req.body?.to || "");
      await ctx.files.move(from, to, server.rootPath);
      ctx.ws.broadcast({ channel: "fs:events", event: "file:rename", data: { from, to }, serverId });
      ctx.audit.write({
        action: "file.rename",
        actor: "local-admin",
        details: { from, to }
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/delete", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const serverId = readServerId(req);
      const server = ctx.servers.requireById(serverId);
      const paths = Array.isArray(req.body?.paths) ? req.body.paths.map(String) : [];
      await ctx.files.remove(paths, server.rootPath);
      ctx.ws.broadcast({ channel: "fs:events", event: "file:delete", data: { paths }, serverId });
      ctx.audit.write({
        action: "file.delete",
        actor: "local-admin",
        details: { paths }
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
