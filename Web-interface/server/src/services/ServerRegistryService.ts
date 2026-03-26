import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appConfig } from "../config.js";

export type ServerType = "vanilla" | "paper" | "spigot" | "purpur" | "forge" | "neoforge" | "fabric";

export type ServerRecord = {
  id: string;
  name: string;
  nameKey: string;
  type: ServerType;
  version: string;
  nodeId: string;
  runtimeMode: "process" | "docker";
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

type RegistryData = {
  servers: ServerRecord[];
};

const EMPTY_REGISTRY: RegistryData = { servers: [] };
const ICON_FILE_RE = /^[A-Za-z0-9]+\.png$/;
const DEFAULT_ICON_FILE = "_31278649105.png";

const nowIso = (): string => new Date().toISOString();
const normalizeNameKey = (value: string): string => value.trim().toLowerCase();
const MOD_SERVER_TYPES = new Set<ServerType>(["fabric", "forge", "neoforge"]);
const PLUGIN_SERVER_TYPES = new Set<ServerType>(["paper", "spigot", "purpur"]);

export class ServerRegistryService {
  private readonly filePath: string;
  private readonly iconDatabaseDir: string;
  private readonly iconDatabaseBackupDir: string;
  private data: RegistryData = EMPTY_REGISTRY;

  constructor() {
    fs.mkdirSync(appConfig.panelDataDir, { recursive: true });
    fs.mkdirSync(appConfig.serversRoot, { recursive: true });
    this.filePath = path.resolve(appConfig.panelDataDir, "servers.json");
    this.iconDatabaseDir = this.resolveIconDatabaseDir();
    this.iconDatabaseBackupDir = path.resolve(appConfig.panelDataDir, "server-icons-database");
    this.ensureIconDatabaseIntegrity();
    this.data = this.load();
    let changed = false;
    for (const server of this.data.servers) {
      const canonicalRoot = path.resolve(appConfig.serversRoot, server.name);
      const normalizedCurrent = path.resolve(server.rootPath);
      const normalizedBase = path.resolve(appConfig.serversRoot);
      const expectedInBase =
        normalizedCurrent === normalizedBase || normalizedCurrent.startsWith(`${normalizedBase}${path.sep}`);
      if (!expectedInBase || normalizedCurrent !== canonicalRoot) {
        server.rootPath = this.reconcileServerRoot(server.name, normalizedCurrent, canonicalRoot);
        changed = true;
      }
      this.ensureAddonLayout(server.rootPath, server.type);
      this.ensureServerIcon(server.rootPath);
    }
    if (changed) this.persist();
  }

  list(): ServerRecord[] {
    return [...this.data.servers];
  }

  getById(id: string): ServerRecord | null {
    return this.data.servers.find((server) => server.id === id) || null;
  }

  requireById(id: string): ServerRecord {
    const server = this.getById(id);
    if (!server) throw new Error("Server not found.");
    return server;
  }

  create(input: { name: string; type: ServerType; version: string }): ServerRecord {
    const name = input.name.trim();
    if (!name) throw new Error("Server name is required.");
    const nameKey = normalizeNameKey(name);
    if (!nameKey) throw new Error("Server name is required.");
    if (this.data.servers.some((server) => server.nameKey === nameKey)) {
      throw new Error("A server with this name already exists.");
    }
    const id = `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rootPath = path.resolve(appConfig.serversRoot, name);
    fs.mkdirSync(rootPath, { recursive: true });
    const ts = nowIso();
    const record: ServerRecord = {
      id,
      name,
      nameKey,
      type: input.type,
      version: input.version,
      nodeId: "local",
      runtimeMode: "process",
      rootPath,
      createdAt: ts,
      updatedAt: ts
    };
    this.ensureAddonLayout(record.rootPath, record.type);
    this.ensureServerIcon(record.rootPath);
    this.data.servers.push(record);
    this.persist();
    return record;
  }

  update(id: string, patch: Partial<Pick<ServerRecord, "name" | "type" | "version" | "nodeId" | "runtimeMode" | "rootPath">>): ServerRecord {
    const current = this.requireById(id);
    const nextName = (patch.name ?? current.name).trim();
    const nextNameKey = normalizeNameKey(nextName);
    if (!nextNameKey) throw new Error("Server name is required.");
    if (
      this.data.servers.some((server) => server.id !== id && server.nameKey === nextNameKey)
    ) {
      throw new Error("A server with this name already exists.");
    }

    const nextRootPath =
      typeof patch.rootPath === "string" && patch.rootPath.trim()
        ? path.resolve(patch.rootPath.trim())
        : nextNameKey !== current.nameKey
          ? path.resolve(appConfig.serversRoot, nextName)
          : current.rootPath;
    if (nextRootPath !== current.rootPath) {
      fs.mkdirSync(path.dirname(nextRootPath), { recursive: true });
      if (fs.existsSync(current.rootPath)) {
        fs.renameSync(current.rootPath, nextRootPath);
      } else {
        fs.mkdirSync(nextRootPath, { recursive: true });
      }
    }

    const updated: ServerRecord = {
      ...current,
      name: nextName,
      nameKey: nextNameKey,
      type: patch.type ?? current.type,
      version: patch.version ?? current.version,
      nodeId: patch.nodeId ?? current.nodeId,
      runtimeMode: patch.runtimeMode ?? current.runtimeMode,
      rootPath: nextRootPath,
      updatedAt: nowIso()
    };
    this.ensureAddonLayout(updated.rootPath, updated.type);
    this.ensureServerIcon(updated.rootPath);
    this.data.servers = this.data.servers.map((server) => (server.id === id ? updated : server));
    this.persist();
    return updated;
  }

  setServerIcon(id: string, iconBuffer: Buffer): void {
    const server = this.requireById(id);
    const out = path.resolve(server.rootPath, "server-icon.png");
    fs.writeFileSync(out, iconBuffer);
  }

  listIconDatabase(): Array<{ file: string; isDefault: boolean }> {
    const dir = this.iconDatabaseDir;
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase().endsWith(".png"));
    const sorted = files.sort((a, b) => a.localeCompare(b));
    return sorted.map((file) => ({ file, isDefault: file === DEFAULT_ICON_FILE }));
  }

  getIconFromDatabase(file: string): string {
    const normalized = String(file || "").trim();
    if (!normalized) throw new Error("Icon file is required.");
    const resolved = path.resolve(this.iconDatabaseDir, normalized);
    const dbRoot = path.resolve(this.iconDatabaseDir);
    if (!(resolved === dbRoot || resolved.startsWith(`${dbRoot}${path.sep}`))) {
      throw new Error("Invalid icon path.");
    }
    if (!fs.existsSync(resolved)) throw new Error("Icon not found.");
    return resolved;
  }

  saveIconToDatabase(iconBuffer: Buffer): string {
    fs.mkdirSync(this.iconDatabaseDir, { recursive: true });
    fs.mkdirSync(this.iconDatabaseBackupDir, { recursive: true });
    let fileName = this.generateUniqueIconFileName();
    let iconPath = path.resolve(this.iconDatabaseDir, fileName);
    while (fs.existsSync(iconPath)) {
      fileName = this.generateUniqueIconFileName();
      iconPath = path.resolve(this.iconDatabaseDir, fileName);
    }
    fs.writeFileSync(iconPath, iconBuffer);
    const backupPath = path.resolve(this.iconDatabaseBackupDir, fileName);
    fs.writeFileSync(backupPath, iconBuffer);
    return fileName;
  }

  setServerIconFromDatabase(id: string, file: string): void {
    const iconPath = this.getIconFromDatabase(file);
    const buffer = fs.readFileSync(iconPath);
    this.setServerIcon(id, buffer);
  }

  deleteIconFromDatabase(file: string): void {
    const normalized = String(file || "").trim();
    if (!normalized) throw new Error("Icon file is required.");
    if (normalized === DEFAULT_ICON_FILE) {
      throw new Error("Default icon cannot be deleted.");
    }
    const mainPath = path.resolve(this.iconDatabaseDir, normalized);
    const backupPath = path.resolve(this.iconDatabaseBackupDir, normalized);
    const mainRoot = path.resolve(this.iconDatabaseDir);
    const backupRoot = path.resolve(this.iconDatabaseBackupDir);
    const inMain = mainPath === mainRoot || mainPath.startsWith(`${mainRoot}${path.sep}`);
    const inBackup = backupPath === backupRoot || backupPath.startsWith(`${backupRoot}${path.sep}`);
    if (!inMain || !inBackup) throw new Error("Invalid icon path.");
    if (fs.existsSync(mainPath)) fs.rmSync(mainPath, { force: true });
    if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
  }

  getServerIconPath(id: string): string {
    const server = this.requireById(id);
    const iconPath = path.resolve(server.rootPath, "server-icon.png");
    if (fs.existsSync(iconPath)) return iconPath;
    const fallback = this.resolveDefaultServerIconPath();
    if (!fallback) throw new Error("Default server icon not found.");
    return fallback;
  }

  importAs(input: { name: string; type: ServerType; version: string }): ServerRecord {
    return this.create(input);
  }

  delete(id: string): ServerRecord {
    const current = this.requireById(id);
    this.data.servers = this.data.servers.filter((server) => server.id !== id);
    this.persist();
    this.removeServerRoot(current.rootPath);
    return current;
  }

  private load(): RegistryData {
    try {
      if (!fs.existsSync(this.filePath)) return { servers: [] };
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as RegistryData;
      if (!Array.isArray(parsed.servers)) return { servers: [] };
      return {
        servers: parsed.servers.map((server) => ({
          ...server,
          nodeId: server.nodeId || "local",
          runtimeMode: server.runtimeMode || "process"
        }))
      };
    } catch {
      return { servers: [] };
    }
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  private ensureAddonLayout(serverRoot: string, type: ServerType): void {
    const pluginsDir = path.resolve(serverRoot, "plugins");
    const modsDir = path.resolve(serverRoot, "mods");
    if (MOD_SERVER_TYPES.has(type)) {
      fs.mkdirSync(modsDir, { recursive: true });
      if (fs.existsSync(pluginsDir)) fs.rmSync(pluginsDir, { recursive: true, force: true });
      return;
    }
    if (PLUGIN_SERVER_TYPES.has(type)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
      if (fs.existsSync(modsDir)) fs.rmSync(modsDir, { recursive: true, force: true });
      return;
    }
    if (type === "vanilla") {
      if (fs.existsSync(pluginsDir)) fs.rmSync(pluginsDir, { recursive: true, force: true });
      if (fs.existsSync(modsDir)) fs.rmSync(modsDir, { recursive: true, force: true });
    }
  }

  private ensureServerIcon(serverRoot: string): void {
    const iconPath = path.resolve(serverRoot, "server-icon.png");
    if (fs.existsSync(iconPath)) return;
    const fallback = this.resolveDefaultServerIconPath();
    if (!fallback) return;
    fs.mkdirSync(path.dirname(iconPath), { recursive: true });
    fs.copyFileSync(fallback, iconPath);
  }

  private resolveDefaultServerIconPath(): string | null {
    const fromDbDist = path.resolve(this.iconDatabaseDir, DEFAULT_ICON_FILE);
    if (fs.existsSync(fromDbDist)) return fromDbDist;
    return null;
  }

  private ensureIconDatabaseIntegrity(): void {
    fs.mkdirSync(this.iconDatabaseDir, { recursive: true });
    fs.mkdirSync(this.iconDatabaseBackupDir, { recursive: true });
    this.migrateLegacyDefaultIcon();
    this.copyMissingIcons(this.iconDatabaseBackupDir, this.iconDatabaseDir);
    this.copyMissingIcons(this.iconDatabaseDir, this.iconDatabaseBackupDir);
  }

  private migrateLegacyDefaultIcon(): void {
    const distLegacy = path.resolve(process.cwd(), "../client/dist/server-icon.png");
    const defaultPath = path.resolve(this.iconDatabaseDir, DEFAULT_ICON_FILE);
    const backupDefaultPath = path.resolve(this.iconDatabaseBackupDir, DEFAULT_ICON_FILE);
    if (!fs.existsSync(defaultPath) && fs.existsSync(backupDefaultPath)) {
      fs.copyFileSync(backupDefaultPath, defaultPath);
    }
    if (!fs.existsSync(defaultPath)) {
      if (fs.existsSync(distLegacy)) {
        fs.copyFileSync(distLegacy, defaultPath);
      }
    }
    if (fs.existsSync(defaultPath) && !fs.existsSync(backupDefaultPath)) {
      fs.copyFileSync(defaultPath, backupDefaultPath);
    }
    if (fs.existsSync(distLegacy)) fs.rmSync(distLegacy, { force: true });
  }

  private copyMissingIcons(fromDir: string, toDir: string): void {
    if (!fs.existsSync(fromDir)) return;
    fs.mkdirSync(toDir, { recursive: true });
    const entries = fs.readdirSync(fromDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = entry.name;
      if (!file.toLowerCase().endsWith(".png")) continue;
      if (file !== DEFAULT_ICON_FILE && !ICON_FILE_RE.test(file)) continue;
      const fromPath = path.resolve(fromDir, file);
      const toPath = path.resolve(toDir, file);
      if (!fs.existsSync(toPath)) {
        fs.copyFileSync(fromPath, toPath);
      }
    }
  }

  private resolveIconDatabaseDir(): string {
    const fromPanelData = path.resolve(appConfig.panelDataDir, "../../client/dist/server-icons database");
    const fromCwd = path.resolve(process.cwd(), "../client/dist/server-icons database");
    if (fs.existsSync(fromPanelData)) return fromPanelData;
    if (fs.existsSync(fromCwd)) return fromCwd;
    return fromPanelData;
  }

  private generateUniqueIconFileName(): string {
    const random = crypto.randomBytes(9).toString("base64url");
    return `${random}.png`;
  }

  private removeServerRoot(rootPath: string): void {
    if (!fs.existsSync(rootPath)) return;
    try {
      fs.rmSync(rootPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    } catch {
      // fallback below
    }
    if (!fs.existsSync(rootPath)) return;
    this.forceRemoveTree(rootPath);
    try {
      fs.rmSync(rootPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    } catch {
      // final existence check throws below
    }
    if (fs.existsSync(rootPath)) {
      throw new Error(`Server folder could not be fully deleted: ${rootPath}`);
    }
  }

  private forceRemoveTree(targetPath: string): void {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.lstatSync(targetPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const name of fs.readdirSync(targetPath)) {
        this.forceRemoveTree(path.resolve(targetPath, name));
      }
      try {
        fs.chmodSync(targetPath, 0o777);
      } catch {
        // no-op
      }
      try {
        fs.rmdirSync(targetPath);
      } catch {
        try {
          fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
        } catch {
          // no-op
        }
      }
      return;
    }
    try {
      fs.chmodSync(targetPath, 0o666);
    } catch {
      // no-op
    }
    try {
      fs.rmSync(targetPath, { force: true });
    } catch {
      // no-op
    }
  }

  private reconcileServerRoot(serverName: string, currentRoot: string, targetRoot: string): string {
    if (currentRoot === targetRoot) return targetRoot;
    fs.mkdirSync(appConfig.serversRoot, { recursive: true });
    const currentExists = fs.existsSync(currentRoot);
    const targetExists = fs.existsSync(targetRoot);

    if (targetExists) {
      return targetRoot;
    }
    if (!currentExists) {
      fs.mkdirSync(targetRoot, { recursive: true });
      return targetRoot;
    }

    try {
      fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
      fs.renameSync(currentRoot, targetRoot);
      return targetRoot;
    } catch {
      // Cross-volume fallback
    }

    try {
      fs.cpSync(currentRoot, targetRoot, { recursive: true, force: true });
      fs.rmSync(currentRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
      return targetRoot;
    } catch {
      // Keep existing path if move/copy fails.
      return currentRoot;
    }
  }
}
