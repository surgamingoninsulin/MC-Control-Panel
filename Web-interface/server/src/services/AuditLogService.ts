import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config.js";

type AuditEntry = {
  action: string;
  actor: string;
  details?: Record<string, unknown>;
  at?: string;
};

export class AuditLogService {
  private readonly logPath: string;
  private appendQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.logPath = path.resolve(appConfig.serversRoot, appConfig.logFile);
  }

  write(entry: AuditEntry): void {
    const row = JSON.stringify({
      at: entry.at || new Date().toISOString(),
      action: entry.action,
      actor: entry.actor,
      details: entry.details || {}
    });

    this.appendQueue = this.appendQueue
      .then(async () => {
        await fs.mkdir(path.dirname(this.logPath), { recursive: true });
        await fs.appendFile(this.logPath, `${row}\n`, "utf8");
      })
      .catch((error) => {
        console.error("[audit] failed to write log entry:", (error as Error).message);
      });
  }
}
