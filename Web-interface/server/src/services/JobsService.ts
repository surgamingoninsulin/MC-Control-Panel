import type { JobKind, JobRun, ScheduledJob } from "../platformTypes.js";
import { PlatformDataService } from "./PlatformDataService.js";

const nowIso = (): string => new Date().toISOString();
const normalizeTimeOfDay = (value: string | null | undefined): string => {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return "00:00";
  return `${match[1]}:${match[2]}`;
};
const computeNextRunInterval = (intervalMinutes: number): string =>
  new Date(Date.now() + Math.max(1, intervalMinutes) * 60_000).toISOString();
const computeNextRunDaily = (timeOfDay: string): string => {
  const normalized = normalizeTimeOfDay(timeOfDay);
  const [hh, mm] = normalized.split(":").map((part) => Number(part));
  const now = new Date();
  const next = new Date(now);
  next.setHours(hh, mm, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
};
const computeNextRunForJob = (job: Pick<ScheduledJob, "scheduleType" | "intervalMinutes" | "timeOfDay">): string => {
  if (job.scheduleType === "daily_time") return computeNextRunDaily(job.timeOfDay || "00:00");
  return computeNextRunInterval(job.intervalMinutes);
};

export class JobsService {
  constructor(private readonly platform: PlatformDataService) {}

  listJobs(serverId?: string): ScheduledJob[] {
    return this.platform
      .read()
      .scheduledJobs
      .filter((entry) => !serverId || entry.serverId === serverId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listRuns(serverId?: string): JobRun[] {
    return this.platform
      .read()
      .jobRuns
      .filter((entry) => !serverId || entry.serverId === serverId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  createJob(input: {
    serverId: string;
    nodeId: string;
    name: string;
    kind: JobKind;
    intervalMinutes: number;
    scheduleType?: ScheduledJob["scheduleType"];
    timeOfDay?: string | null;
    command?: string | null;
  }): ScheduledJob {
    return this.platform.update((state) => {
      const ts = nowIso();
      const scheduleType: ScheduledJob["scheduleType"] = input.scheduleType === "daily_time" ? "daily_time" : "interval";
      const intervalMinutes = Math.max(1, Number(input.intervalMinutes || 1));
      const timeOfDay = scheduleType === "daily_time" ? normalizeTimeOfDay(input.timeOfDay) : null;
      const job: ScheduledJob = {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        serverId: input.serverId,
        nodeId: input.nodeId,
        name: input.name.trim() || `${input.kind} job`,
        kind: input.kind,
        enabled: true,
        scheduleType,
        intervalMinutes,
        timeOfDay,
        command: input.command?.trim() || null,
        createdAt: ts,
        updatedAt: ts,
        lastRunAt: null,
        nextRunAt: computeNextRunForJob({ scheduleType, intervalMinutes, timeOfDay })
      };
      state.scheduledJobs.push(job);
      return job;
    });
  }

  updateJob(id: string, patch: Partial<Pick<ScheduledJob, "name" | "enabled" | "intervalMinutes" | "scheduleType" | "timeOfDay" | "command">>): ScheduledJob {
    return this.platform.update((state) => {
      const job = state.scheduledJobs.find((entry) => entry.id === id);
      if (!job) throw new Error("Job not found.");
      if (typeof patch.name === "string") job.name = patch.name.trim() || job.name;
      if (typeof patch.enabled === "boolean") job.enabled = patch.enabled;
      if (typeof patch.intervalMinutes === "number" && Number.isFinite(patch.intervalMinutes)) {
        job.intervalMinutes = Math.max(1, patch.intervalMinutes);
      }
      if (patch.scheduleType === "interval" || patch.scheduleType === "daily_time") {
        job.scheduleType = patch.scheduleType;
      }
      if (typeof patch.timeOfDay === "string") {
        job.timeOfDay = normalizeTimeOfDay(patch.timeOfDay);
      } else if (patch.timeOfDay === null) {
        job.timeOfDay = null;
      }
      if (job.scheduleType === "interval") job.timeOfDay = null;
      if (job.scheduleType === "daily_time" && !job.timeOfDay) job.timeOfDay = "00:00";
      if (typeof patch.command === "string") job.command = patch.command.trim() || null;
      job.updatedAt = nowIso();
      job.nextRunAt = job.enabled ? computeNextRunForJob(job) : null;
      return { ...job };
    });
  }

  deleteJob(id: string): ScheduledJob {
    return this.platform.update((state) => {
      const index = state.scheduledJobs.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Job not found.");
      const [removed] = state.scheduledJobs.splice(index, 1);
      state.jobRuns = state.jobRuns.filter((entry) => entry.jobId !== id);
      return removed;
    });
  }

  startRun(input: { jobId: string | null; serverId: string; nodeId: string; kind: JobKind }): JobRun {
    return this.platform.update((state) => {
      const run: JobRun = {
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        jobId: input.jobId,
        serverId: input.serverId,
        nodeId: input.nodeId,
        kind: input.kind,
        status: "running",
        startedAt: nowIso(),
        finishedAt: null,
        message: null
      };
      state.jobRuns.unshift(run);
      state.jobRuns = state.jobRuns.slice(0, 1000);
      return run;
    });
  }

  finishRun(id: string, status: "succeeded" | "failed", message: string | null): JobRun {
    return this.platform.update((state) => {
      const run = state.jobRuns.find((entry) => entry.id === id);
      if (!run) throw new Error("Run not found.");
      run.status = status;
      run.message = message;
      run.finishedAt = nowIso();
      if (run.jobId) {
        const job = state.scheduledJobs.find((entry) => entry.id === run.jobId);
        if (job) {
          job.lastRunAt = run.finishedAt;
          job.nextRunAt = job.enabled ? computeNextRunForJob(job) : null;
          job.updatedAt = nowIso();
        }
      }
      return { ...run };
    });
  }

  dueJobs(now = Date.now()): ScheduledJob[] {
    return this.platform
      .read()
      .scheduledJobs
      .filter((entry) => entry.enabled && !!entry.nextRunAt && new Date(String(entry.nextRunAt)).getTime() <= now);
  }
}
