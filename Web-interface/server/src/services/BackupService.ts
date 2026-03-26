import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import type { BackupRecord } from "../platformTypes.js";
import { appConfig } from "../config.js";
import { PlatformDataService } from "./PlatformDataService.js";
import type { ServerRecord } from "./ServerRegistryService.js";

const LOCK_FILE = ".mc-control-panel.instance.lock";

const walkFiles = (dir: string, baseDir: string, out: Array<{ absolute: string; relative: string }> = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.resolve(dir, entry.name);
    const relative = path.relative(baseDir, absolute).replace(/\\/g, "/");
    if (relative === LOCK_FILE) continue;
    if (entry.isDirectory()) {
      walkFiles(absolute, baseDir, out);
    } else {
      out.push({ absolute, relative });
    }
  }
  return out;
};

const checksumFile = (filePath: string): string => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
};

export class BackupService {
  private readonly rootDir: string;

  constructor(private readonly platform: PlatformDataService) {
    this.rootDir = path.resolve(appConfig.panelDataDir, "backups");
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  list(serverId?: string): BackupRecord[] {
    return this.platform
      .read()
      .backupRecords
      .filter((entry) => !serverId || entry.serverId === serverId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getById(id: string): BackupRecord {
    const found = this.platform.read().backupRecords.find((entry) => entry.id === id);
    if (!found) throw new Error("Backup not found.");
    return found;
  }

  delete(id: string): BackupRecord {
    return this.platform.update((state) => {
      const index = state.backupRecords.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Backup not found.");
      const [removed] = state.backupRecords.splice(index, 1);
      if (removed?.filePath && fs.existsSync(removed.filePath)) {
        fs.rmSync(removed.filePath, { force: true });
      }
      return removed;
    });
  }

  create(server: ServerRecord, createdBy: string, kind: BackupRecord["kind"] = "manual"): BackupRecord {
    if (!fs.existsSync(server.rootPath)) throw new Error("Server root does not exist.");
    const serverDir = path.resolve(this.rootDir, server.id);
    fs.mkdirSync(serverDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.resolve(serverDir, `${stamp}-${kind}.zip`);
    const zip = new AdmZip();
    for (const file of walkFiles(server.rootPath, server.rootPath)) {
      zip.addLocalFile(file.absolute, path.dirname(file.relative), path.basename(file.relative));
    }
    zip.writeZip(outputPath);
    const stats = fs.statSync(outputPath);
    return this.platform.update((state) => {
      const record: BackupRecord = {
        id: `bak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        serverId: server.id,
        nodeId: server.nodeId,
        filePath: outputPath,
        kind,
        status: "ready",
        size: stats.size,
        checksum: checksumFile(outputPath),
        createdAt: new Date().toISOString(),
        createdBy,
        restoreSourceBackupId: null,
        error: null
      };
      state.backupRecords.unshift(record);
      return record;
    });
  }

  restore(server: ServerRecord, backupId: string, createPreRestoreBackup: () => BackupRecord): { restored: BackupRecord; preRestore: BackupRecord } {
    const target = this.getById(backupId);
    if (target.serverId !== server.id) throw new Error("Backup does not belong to the selected server.");
    if (!fs.existsSync(target.filePath)) throw new Error("Backup archive is missing.");
    const preRestore = createPreRestoreBackup();
    const extractDir = path.resolve(appConfig.panelDataDir, "restore-temp", `${server.id}-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    const zip = new AdmZip(target.filePath);
    zip.extractAllTo(extractDir, true);
    for (const entry of fs.readdirSync(server.rootPath)) {
      fs.rmSync(path.resolve(server.rootPath, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(extractDir)) {
      fs.cpSync(path.resolve(extractDir, entry), path.resolve(server.rootPath, entry), { recursive: true, force: true });
    }
    fs.rmSync(extractDir, { recursive: true, force: true });
    return { restored: target, preRestore };
  }
}
