import fs from "node:fs";
import os from "node:os";
import { appConfig } from "../config.js";
import type { MetricsSample } from "../platformTypes.js";
import { PlatformDataService } from "./PlatformDataService.js";

type CpuSnapshot = { idle: number; total: number };

const readCpu = (): CpuSnapshot => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
};

export class MetricsService {
  private previousCpu = readCpu();

  constructor(private readonly platform: PlatformDataService) {}

  collect(input: { nodeId: string; serverId?: string | null; running: boolean; uptimeMs: number; pid: number | null }): MetricsSample {
    const nextCpu = readCpu();
    const idleDelta = nextCpu.idle - this.previousCpu.idle;
    const totalDelta = nextCpu.total - this.previousCpu.total;
    this.previousCpu = nextCpu;
    const stat = fs.statfsSync(appConfig.serversRoot);
    const diskTotalMb = (stat.bsize * stat.blocks) / (1024 * 1024);
    const diskFreeMb = (stat.bsize * stat.bavail) / (1024 * 1024);
    const backupStorageMb =
      this.platform.read().backupRecords
        .filter((entry) => entry.nodeId === input.nodeId && (!input.serverId || entry.serverId === input.serverId))
        .reduce((sum, entry) => sum + entry.size, 0) / (1024 * 1024);
    return this.platform.update((state) => {
      const sample: MetricsSample = {
        id: `met-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nodeId: input.nodeId,
        serverId: input.serverId || null,
        createdAt: new Date().toISOString(),
        cpuPercent: totalDelta > 0 ? Math.max(0, Math.min(100, 100 - (idleDelta / totalDelta) * 100)) : 0,
        memoryUsedMb: (os.totalmem() - os.freemem()) / (1024 * 1024),
        memoryTotalMb: os.totalmem() / (1024 * 1024),
        diskUsedMb: Math.max(0, diskTotalMb - diskFreeMb),
        diskTotalMb,
        uptimeMs: input.uptimeMs,
        running: input.running,
        pid: input.pid,
        backupStorageMb,
        recentJobFailures: state.jobRuns.filter((entry) => entry.status === "failed" && (!input.serverId || entry.serverId === input.serverId)).slice(0, 20).length
      };
      state.metricsSamples.unshift(sample);
      state.metricsSamples = state.metricsSamples.slice(0, 4000);
      return sample;
    });
  }

  list(nodeId?: string, serverId?: string): MetricsSample[] {
    return this.platform
      .read()
      .metricsSamples
      .filter((entry) => (!nodeId || entry.nodeId === nodeId) && (!serverId || entry.serverId === serverId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200);
  }
}
