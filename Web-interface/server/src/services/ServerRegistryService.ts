import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config.js";

export type ServerType = "vanilla" | "paper" | "spigot" | "purpur" | "forge" | "neoforge" | "fabric";

export type ServerRecord = {
  id: string;
  name: string;
  nameKey: string;
  type: ServerType;
  version: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

type RegistryData = {
  servers: ServerRecord[];
};

const EMPTY_REGISTRY: RegistryData = { servers: [] };

const nowIso = (): string => new Date().toISOString();
const normalizeNameKey = (value: string): string => value.trim().toLowerCase();
const MOD_SERVER_TYPES = new Set<ServerType>(["fabric", "forge", "neoforge"]);
const PLUGIN_SERVER_TYPES = new Set<ServerType>(["paper", "spigot", "purpur"]);

export class ServerRegistryService {
  private readonly filePath: string;
  private data: RegistryData = EMPTY_REGISTRY;

  constructor() {
    fs.mkdirSync(appConfig.panelDataDir, { recursive: true });
    fs.mkdirSync(appConfig.serversRoot, { recursive: true });
    this.filePath = path.resolve(appConfig.panelDataDir, "servers.json");
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

  update(id: string, patch: Partial<Pick<ServerRecord, "name" | "type" | "version">>): ServerRecord {
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
      nextNameKey !== current.nameKey
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
      return { servers: parsed.servers };
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
    const fromDist = path.resolve(process.cwd(), "../client/dist/server-icon.png");
    if (fs.existsSync(fromDist)) return fromDist;
    const fromPublic = path.resolve(process.cwd(), "../client/public/server-icon.png");
    if (fs.existsSync(fromPublic)) return fromPublic;
    return null;
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
