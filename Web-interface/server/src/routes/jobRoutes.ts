import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireRole, type AuthedRequest } from "../middleware/auth.js";

const runJob = async (
  ctx: AppContext,
  job: { id: string | null; serverId: string; nodeId: string; kind: "backup" | "start" | "stop" | "restart" | "command"; command?: string | null },
  actor: string
) => {
  const run = ctx.jobs.startRun({ jobId: job.id, serverId: job.serverId, nodeId: job.nodeId, kind: job.kind });
  try {
    const server = ctx.servers.requireById(job.serverId);
    if (job.kind === "backup") ctx.backups.create(server, actor, "scheduled");
    if (job.kind === "start") ctx.runtime.start(server.id, server.rootPath);
    if (job.kind === "stop") ctx.runtime.stop(server.id);
    if (job.kind === "restart") ctx.runtime.restart(server.id, server.rootPath);
    if (job.kind === "command") {
      if (!job.command?.trim()) throw new Error("Command is required.");
      ctx.runtime.sendCommand(server.id, job.command);
    }
    return ctx.jobs.finishRun(run.id, "succeeded", null);
  } catch (error) {
    return ctx.jobs.finishRun(run.id, "failed", (error as Error).message);
  }
};

export const createJobRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/", requireRole(["owner", "admin", "viewer"]), (req, res) => {
    const serverId = typeof req.query.serverId === "string" ? req.query.serverId : undefined;
    res.json({ jobs: ctx.jobs.listJobs(serverId), runs: ctx.jobs.listRuns(serverId) });
  });

  router.post("/", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const server = ctx.servers.requireById(String(req.body?.serverId || ""));
      const job = ctx.jobs.createJob({
        serverId: server.id,
        nodeId: server.nodeId,
        name: String(req.body?.name || ""),
        kind: String(req.body?.kind || "") as "backup" | "start" | "stop" | "restart" | "command",
        scheduleType: String(req.body?.scheduleType || "interval") as "interval" | "daily_time",
        intervalMinutes: Number(req.body?.intervalMinutes || 5),
        timeOfDay: typeof req.body?.timeOfDay === "string" ? req.body.timeOfDay : null,
        command: typeof req.body?.command === "string" ? req.body.command : null
      });
      res.json({ job });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.put("/:id", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const job = ctx.jobs.updateJob(String(req.params.id || ""), req.body || {});
      res.json({ job });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/:id/run", requireRole(["owner", "admin"]), async (req, res) => {
    try {
      const scheduled = ctx.jobs.listJobs().find((entry) => entry.id === String(req.params.id || ""));
      if (!scheduled) return res.status(404).json({ error: "Job not found." });
      const actor = (req as AuthedRequest).user?.email || (req as AuthedRequest).user?.username || "local-admin";
      const run = await runJob(
        ctx,
        { id: scheduled.id, serverId: scheduled.serverId, nodeId: scheduled.nodeId, kind: scheduled.kind, command: scheduled.command },
        actor
      );
      res.json({ run });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/:id", requireRole(["owner", "admin"]), (req, res) => {
    try {
      const removed = ctx.jobs.deleteJob(String(req.params.id || ""));
      const actor = (req as AuthedRequest).user?.email || (req as AuthedRequest).user?.username || "local-admin";
      ctx.audit.write({
        action: "job.delete",
        actor,
        serverId: removed.serverId,
        nodeId: removed.nodeId,
        details: { jobId: removed.id, kind: removed.kind, name: removed.name }
      });
      return res.json({ removed });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};

export const runDueJobs = async (ctx: AppContext): Promise<void> => {
  for (const job of ctx.jobs.dueJobs()) {
    const run = await runJob(
      ctx,
      { id: job.id, serverId: job.serverId, nodeId: job.nodeId, kind: job.kind, command: job.command },
      "scheduler"
    );
    ctx.audit.write({
      action: "job.run",
      actor: "scheduler",
      serverId: job.serverId,
      nodeId: job.nodeId,
      result: run.status === "failed" ? "error" : "ok",
      details: { jobId: job.id, runId: run.id, kind: job.kind, message: run.message }
    });
    if (run.status === "failed") {
      ctx.notifications.create({
        userId: null,
        severity: "error",
        category: "job",
        title: "Scheduled job failed",
        body: `${job.name} failed: ${run.message || "unknown error"}`,
        serverId: job.serverId,
        nodeId: job.nodeId,
        dedupeKey: `job-failed:${job.id}`
      });
    }
  }
};
