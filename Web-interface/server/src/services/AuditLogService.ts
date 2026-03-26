import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config.js";
import type { AuditEvent } from "../platformTypes.js";
import { PlatformDataService } from "./PlatformDataService.js";

type AuditEntry = {
  action: string;
  actor: string;
  serverId?: string | null;
  nodeId?: string | null;
  result?: "ok" | "error";
  details?: Record<string, unknown>;
  at?: string;
};

export class AuditLogService {
  private readonly logPath: string;
  private appendQueue: Promise<void> = Promise.resolve();
  constructor(private readonly platform?: PlatformDataService) {
    this.logPath = path.resolve(appConfig.serversRoot, appConfig.logFile);
  }

  write(entry: AuditEntry): void {
    const event: AuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: entry.at || new Date().toISOString(),
      action: entry.action,
      actor: entry.actor,
      serverId: entry.serverId || null,
      nodeId: entry.nodeId || null,
      result: entry.result || "ok",
      details: entry.details || {}
    };
    const row = JSON.stringify(event);

    this.appendQueue = this.appendQueue
      .then(async () => {
        await fs.mkdir(path.dirname(this.logPath), { recursive: true });
        await fs.appendFile(this.logPath, `${row}\n`, "utf8");
        this.platform?.update((state) => {
          state.auditEvents.unshift(event);
          state.auditEvents = state.auditEvents.slice(0, 3000);
        });
      })
      .catch((error) => {
        console.error("[audit] failed to write log entry:", (error as Error).message);
      });
  }

  list(): AuditEvent[] {
    return this.platform?.read().auditEvents.sort((a, b) => b.at.localeCompare(a.at)) || [];
  }
}
