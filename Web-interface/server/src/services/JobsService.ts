import type { JobKind, JobRun, ScheduledJob } from "../platformTypes.js";
import { PlatformDataService } from "./PlatformDataService.js";

const nowIso = (): string => new Date().toISOString();
const computeNextRun = (intervalMinutes: number): string =>
  new Date(Date.now() + Math.max(1, intervalMinutes) * 60_000).toISOString();

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
    command?: string | null;
  }): ScheduledJob {
    return this.platform.update((state) => {
      const ts = nowIso();
      const job: ScheduledJob = {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        serverId: input.serverId,
        nodeId: input.nodeId,
        name: input.name.trim() || `${input.kind} job`,
        kind: input.kind,
        enabled: true,
        scheduleType: "interval",
        intervalMinutes: Math.max(1, Number(input.intervalMinutes || 1)),
        command: input.command?.trim() || null,
        createdAt: ts,
        updatedAt: ts,
        lastRunAt: null,
        nextRunAt: computeNextRun(Math.max(1, Number(input.intervalMinutes || 1)))
      };
      state.scheduledJobs.push(job);
      return job;
    });
  }

  updateJob(id: string, patch: Partial<Pick<ScheduledJob, "name" | "enabled" | "intervalMinutes" | "command">>): ScheduledJob {
    return this.platform.update((state) => {
      const job = state.scheduledJobs.find((entry) => entry.id === id);
      if (!job) throw new Error("Job not found.");
      if (typeof patch.name === "string") job.name = patch.name.trim() || job.name;
      if (typeof patch.enabled === "boolean") job.enabled = patch.enabled;
      if (typeof patch.intervalMinutes === "number" && Number.isFinite(patch.intervalMinutes)) {
        job.intervalMinutes = Math.max(1, patch.intervalMinutes);
      }
      if (typeof patch.command === "string") job.command = patch.command.trim() || null;
      job.updatedAt = nowIso();
      job.nextRunAt = job.enabled ? computeNextRun(job.intervalMinutes) : null;
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
          job.nextRunAt = job.enabled ? computeNextRun(job.intervalMinutes) : null;
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
