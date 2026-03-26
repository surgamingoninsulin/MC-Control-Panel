import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config.js";
import type { PlatformState } from "../platformTypes.js";

const nowIso = (): string => new Date().toISOString();

const emptyState = (): PlatformState => ({
  version: 1,
  nodes: [],
  apiTokens: [],
  backupRecords: [],
  scheduledJobs: [],
  jobRuns: [],
  notifications: [],
  notificationPreferences: [],
  auditEvents: [],
  metricsSamples: [],
  bulkActionGroups: []
});

export class PlatformDataService {
  private readonly filePath: string;
  private state: PlatformState;

  constructor() {
    fs.mkdirSync(appConfig.panelDataDir, { recursive: true });
    this.filePath = path.resolve(appConfig.panelDataDir, "platform-state.json");
    this.state = this.load();
    this.ensureDefaults();
  }

  read(): PlatformState {
    return JSON.parse(JSON.stringify(this.state)) as PlatformState;
  }

  update<T>(mutator: (state: PlatformState) => T): T {
    const result = mutator(this.state);
    this.persist();
    return result;
  }

  private load(): PlatformState {
    try {
      if (!fs.existsSync(this.filePath)) return emptyState();
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PlatformState>;
      return {
        ...emptyState(),
        ...parsed,
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        apiTokens: Array.isArray(parsed.apiTokens) ? parsed.apiTokens : [],
        backupRecords: Array.isArray(parsed.backupRecords) ? parsed.backupRecords : [],
        scheduledJobs: Array.isArray(parsed.scheduledJobs) ? parsed.scheduledJobs : [],
        jobRuns: Array.isArray(parsed.jobRuns) ? parsed.jobRuns : [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        notificationPreferences: Array.isArray(parsed.notificationPreferences) ? parsed.notificationPreferences : [],
        auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
        metricsSamples: Array.isArray(parsed.metricsSamples) ? parsed.metricsSamples : [],
        bulkActionGroups: Array.isArray(parsed.bulkActionGroups) ? parsed.bulkActionGroups : []
      };
    } catch {
      return emptyState();
    }
  }

  private ensureDefaults(): void {
    if (!this.state.nodes.some((node) => node.id === "local")) {
      const ts = nowIso();
      this.state.nodes.push({
        id: "local",
        name: "Local Node",
        kind: "local",
        host: appConfig.publicUrl,
        baseUrl: appConfig.publicUrl,
        authToken: null,
        status: "online",
        capabilities: {
          runtime: true,
          files: true,
          backups: true,
          metrics: true,
          docker: false
        },
        lastHeartbeatAt: ts,
        createdAt: ts,
        updatedAt: ts
      });
      this.persist();
    }
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
