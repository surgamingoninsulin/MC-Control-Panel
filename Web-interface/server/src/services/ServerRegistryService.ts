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
    for (const server of this.data.servers) {
      this.ensureAddonLayout(server.rootPath, server.type);
      this.ensureServerIcon(server.rootPath);
    }
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
    if (fs.existsSync(current.rootPath)) {
      fs.rmSync(current.rootPath, { recursive: true, force: true });
    }
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
}
