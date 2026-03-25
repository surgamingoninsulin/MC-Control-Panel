import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config.js";
import type { MultiServerRuntimeService } from "./MultiServerRuntimeService.js";

type WhitelistEntry = {
  uuid: string;
  name: string;
};

type OpsEntry = {
  uuid: string;
  name: string;
  level: number;
  bypassesPlayerLimit: boolean;
};

type PlayerCacheEntry = {
  uuid: string;
  name: string;
  cachedAt: string;
};

export type PlayerRecord = {
  uuid: string;
  name: string;
  whitelisted: boolean;
  operator: boolean;
  opLevel: number | null;
  bypassesPlayerLimit: boolean;
  headUrl: string;
};

export type EulaState = {
  accepted: boolean;
  path: string;
  link: string;
  mtime: string | null;
};

export type PlayerHeadImage = {
  contentType: string;
  body: Buffer;
};

export type ServerPropertyField = {
  key: string;
  value: string;
  control: "boolean" | "number" | "select" | "text";
  category: "access" | "world" | "gameplay" | "network" | "performance" | "advanced";
  label: string;
  options?: string[];
  isCustom?: boolean;
};

type PropertyLine =
  | { type: "comment" | "blank"; raw: string }
  | { type: "property"; key: string; value: string; raw: string };

const EULA_RELATIVE_PATH = "eula.txt";
const WHITELIST_RELATIVE_PATH = "whitelist.json";
const OPS_RELATIVE_PATH = "ops.json";
const PROPERTIES_RELATIVE_PATH = "server.properties";
const EULA_LINK = "https://aka.ms/MinecraftEULA";

const PROPERTY_OPTIONS: Record<string, string[]> = {
  difficulty: ["peaceful", "easy", "normal", "hard"],
  gamemode: ["survival", "creative", "adventure", "spectator"],
  "level-type": [
    "minecraft:normal",
    "minecraft:flat",
    "minecraft:large_biomes",
    "minecraft:amplified",
    "minecraft:single_biome_surface",
    "minecraft:debug_all_block_states"
  ],
  "op-permission-level": ["1", "2", "3", "4"],
  "enforce-secure-profile": ["true", "false"],
  "white-list": ["true", "false"],
  "broadcast-console-to-ops": ["true", "false"],
  "broadcast-rcon-to-ops": ["true", "false"],
  "allow-flight": ["true", "false"],
  hardcore: ["true", "false"],
  "force-gamemode": ["true", "false"],
  "online-mode": ["true", "false"],
  "pvp": ["true", "false"],
  "spawn-animals": ["true", "false"],
  "spawn-monsters": ["true", "false"],
  "spawn-npcs": ["true", "false"],
  "enable-command-block": ["true", "false"],
  "enable-status": ["true", "false"],
  "enable-query": ["true", "false"],
  "enable-rcon": ["true", "false"],
  "prevent-proxy-connections": ["true", "false"]
};

const PROPERTY_CATEGORIES: Record<string, ServerPropertyField["category"]> = {
  "white-list": "access",
  "enforce-whitelist": "access",
  "op-permission-level": "access",
  "broadcast-console-to-ops": "access",
  "broadcast-rcon-to-ops": "access",
  "online-mode": "access",
  "enforce-secure-profile": "access",
  "prevent-proxy-connections": "access",
  "hide-online-players": "access",
  "server-ip": "network",
  "server-port": "network",
  "query.port": "network",
  "rcon.port": "network",
  "enable-query": "network",
  "enable-rcon": "network",
  "enable-status": "network",
  "network-compression-threshold": "network",
  "rate-limit": "network",
  "motd": "network",
  "max-players": "access",
  "gamemode": "gameplay",
  difficulty: "gameplay",
  hardcore: "gameplay",
  "allow-flight": "gameplay",
  "force-gamemode": "gameplay",
  "player-idle-timeout": "gameplay",
  "spawn-protection": "gameplay",
  "simulation-distance": "gameplay",
  "view-distance": "gameplay",
  "max-world-size": "world",
  "max-tick-time": "performance",
  "sync-chunk-writes": "performance",
  "use-native-transport": "performance",
  "entity-broadcast-range-percentage": "performance",
  "pause-when-empty-seconds": "performance",
  "level-name": "world",
  "level-seed": "world",
  "level-type": "world",
  "generate-structures": "world"
};

const toLabel = (key: string): string =>
  key
    .split(/[-.]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const isBooleanLike = (value: string): boolean => /^(true|false)$/i.test(value.trim());

const isNumericLike = (value: string): boolean => /^-?\d+(\.\d+)?$/.test(value.trim());

const findPropertySeparatorIndex = (line: string): number => {
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "=" || char === ":") return index;
  }
  return -1;
};

const normalizePropertyValue = (key: string, value: string): string => {
  const trimmedKey = String(key || "").trim();
  const rawValue = String(value ?? "");
  const escapedPrefix = `${trimmedKey}\\=`;
  const plainPrefix = `${trimmedKey}=`;
  if (rawValue.startsWith(escapedPrefix)) return rawValue.slice(escapedPrefix.length);
  if (rawValue.startsWith(plainPrefix)) return rawValue.slice(plainPrefix.length);
  return rawValue;
};

const withHyphenUuid = (value: string): string => {
  const compact = String(value || "").trim().replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) return String(value || "").trim();
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
};

export class ServerAdminService {
  private readonly cachePath = path.resolve(appConfig.panelDataDir, "player-cache.json");
  private readonly playerCache = new Map<string, PlayerCacheEntry>();
  private cacheLoaded = false;

  constructor(private readonly runtime: MultiServerRuntimeService) {}

  async listPlayers(serverId: string, serverRoot: string): Promise<PlayerRecord[]> {
    const [whitelist, ops] = await Promise.all([this.readWhitelist(serverRoot), this.readOps(serverRoot)]);
    const out = new Map<string, PlayerRecord>();

    for (const entry of whitelist) {
      const key = this.playerKey(entry.uuid, entry.name);
      out.set(key, {
        uuid: withHyphenUuid(entry.uuid),
        name: entry.name,
        whitelisted: true,
        operator: false,
        opLevel: null,
        bypassesPlayerLimit: false,
        headUrl: this.headUrl(serverId, entry.uuid)
      });
    }

    for (const entry of ops) {
      const key = this.playerKey(entry.uuid, entry.name);
      const existing = out.get(key);
      out.set(key, {
        uuid: withHyphenUuid(entry.uuid),
        name: entry.name,
        whitelisted: existing?.whitelisted || false,
        operator: true,
        opLevel: entry.level,
        bypassesPlayerLimit: !!entry.bypassesPlayerLimit,
        headUrl: this.headUrl(serverId, entry.uuid)
      });
    }

    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async addPlayer(
    serverId: string,
    serverRoot: string,
    input: { username: string; whitelisted?: boolean; operator?: boolean; opLevel?: number; bypassesPlayerLimit?: boolean }
  ): Promise<PlayerRecord> {
    const resolved = await this.resolvePlayer(input.username);
    const nextWhitelisted = input.whitelisted !== false || !!input.operator;
    const nextOperator = !!input.operator;
    return this.savePlayer(serverId, serverRoot, {
      uuid: resolved.uuid,
      name: resolved.name,
      whitelisted: nextWhitelisted,
      operator: nextOperator,
      opLevel: this.normalizeOpLevel(input.opLevel),
      bypassesPlayerLimit: !!input.bypassesPlayerLimit
    });
  }

  async updatePlayer(
    serverId: string,
    serverRoot: string,
    input: { uuid: string; name?: string; whitelisted?: boolean; operator?: boolean; opLevel?: number; bypassesPlayerLimit?: boolean }
  ): Promise<PlayerRecord> {
    const current = await this.findPlayer(serverRoot, input.uuid, input.name || "");
    if (!current) throw new Error("Player not found.");
    return this.savePlayer(serverId, serverRoot, {
      uuid: current.uuid,
      name: current.name,
      whitelisted: input.whitelisted ?? current.whitelisted,
      operator: input.operator ?? current.operator,
      opLevel: this.normalizeOpLevel(input.opLevel ?? current.opLevel ?? 4),
      bypassesPlayerLimit: input.bypassesPlayerLimit ?? current.bypassesPlayerLimit
    });
  }

  async removePlayer(serverId: string, serverRoot: string, input: { uuid?: string; name?: string }): Promise<void> {
    const current = await this.findPlayer(serverRoot, input.uuid || "", input.name || "");
    if (!current) return;
    await this.saveCollections(serverRoot, {
      whitelist: (await this.readWhitelist(serverRoot)).filter((entry) => withHyphenUuid(entry.uuid) !== current.uuid),
      ops: (await this.readOps(serverRoot)).filter((entry) => withHyphenUuid(entry.uuid) !== current.uuid)
    });
    await this.applyLivePlayerDiff(serverId, current.name, { whitelisted: current.whitelisted, operator: current.operator }, { whitelisted: false, operator: false });
  }

  async getEula(serverRoot: string): Promise<EulaState> {
    const filePath = path.resolve(serverRoot, EULA_RELATIVE_PATH);
    const stat = await fs.stat(filePath).catch(() => null);
    const raw = stat ? await fs.readFile(filePath, "utf8") : "";
    const accepted = /^eula\s*=\s*true\s*$/im.test(raw);
    return {
      accepted,
      path: EULA_RELATIVE_PATH,
      link: EULA_LINK,
      mtime: stat?.mtime.toISOString() || null
    };
  }

  async setEula(serverRoot: string, accepted: boolean): Promise<EulaState> {
    const filePath = path.resolve(serverRoot, EULA_RELATIVE_PATH);
    const now = new Date().toString();
    const content = [
      `#By changing the setting below to TRUE you are indicating your agreement to our EULA (${EULA_LINK}).`,
      `#${now}`,
      `eula=${accepted ? "true" : "false"}`
    ].join("\n");
    await fs.writeFile(filePath, content, "utf8");
    return this.getEula(serverRoot);
  }

  async getProperties(serverRoot: string): Promise<{ path: string; mtime: string | null; fields: ServerPropertyField[] }> {
    const filePath = path.resolve(serverRoot, PROPERTIES_RELATIVE_PATH);
    const stat = await fs.stat(filePath).catch(() => null);
    const raw = stat ? await fs.readFile(filePath, "utf8") : "";
    const fields = this.toFields(this.parseProperties(raw));
    return {
      path: PROPERTIES_RELATIVE_PATH,
      mtime: stat?.mtime.toISOString() || null,
      fields
    };
  }

  async getPlayerHeadImage(input: { uuid?: string; name?: string }): Promise<PlayerHeadImage> {
    const uuid = withHyphenUuid(String(input.uuid || "").trim());
    const name = String(input.name || "").trim() || "Player";
    const sources = [
      uuid ? `https://crafatar.com/renders/head/${uuid}?size=48&overlay` : "",
      uuid ? `https://mc-heads.net/avatar/${uuid}/48` : "",
      name ? `https://mc-heads.net/avatar/${encodeURIComponent(name)}/48` : ""
    ].filter(Boolean);

    for (const source of sources) {
      try {
        const response = await fetch(source, {
          headers: { Accept: "image/png,image/webp,image/*;q=0.8,*/*;q=0.5" }
        });
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type") || "image/png";
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) continue;
        return { contentType, body: bytes };
      } catch {
        // Try next provider.
      }
    }

    return {
      contentType: "image/svg+xml; charset=utf-8",
      body: Buffer.from(this.renderFallbackHeadSvg(name), "utf8")
    };
  }

  async setProperties(
    serverRoot: string,
    input: { fields: Array<{ key: string; value: string }>; expectedMtime?: string }
  ): Promise<{ path: string; mtime: string; fields: ServerPropertyField[] }> {
    const filePath = path.resolve(serverRoot, PROPERTIES_RELATIVE_PATH);
    const currentStat = await fs.stat(filePath).catch(() => null);
    if (input.expectedMtime && currentStat && currentStat.mtime.toISOString() !== input.expectedMtime) {
      throw new Error("server.properties was modified by another process.");
    }
    const raw = currentStat ? await fs.readFile(filePath, "utf8") : "";
    const parsed = this.parseProperties(raw);
    const nextMap = new Map<string, string>();
    for (const field of input.fields || []) {
      const key = String(field.key || "").trim();
      if (!key) continue;
      nextMap.set(key, String(field.value ?? ""));
    }
    const updated = this.mergePropertyLines(parsed, nextMap);
    await fs.writeFile(filePath, updated, "utf8");
    const stat = await fs.stat(filePath);
    return {
      path: PROPERTIES_RELATIVE_PATH,
      mtime: stat.mtime.toISOString(),
      fields: this.toFields(this.parseProperties(updated))
    };
  }

  private async savePlayer(
    serverId: string,
    serverRoot: string,
    next: { uuid: string; name: string; whitelisted: boolean; operator: boolean; opLevel: number; bypassesPlayerLimit: boolean }
  ): Promise<PlayerRecord> {
    const [whitelist, ops, current] = await Promise.all([
      this.readWhitelist(serverRoot),
      this.readOps(serverRoot),
      this.findPlayer(serverRoot, next.uuid, next.name)
    ]);
    const uuid = withHyphenUuid(next.uuid);
    const updatedWhitelist = whitelist.filter((entry) => withHyphenUuid(entry.uuid) !== uuid);
    const updatedOps = ops.filter((entry) => withHyphenUuid(entry.uuid) !== uuid);

    if (next.whitelisted) updatedWhitelist.push({ uuid, name: next.name });
    if (next.operator) {
      updatedOps.push({
        uuid,
        name: next.name,
        level: this.normalizeOpLevel(next.opLevel),
        bypassesPlayerLimit: !!next.bypassesPlayerLimit
      });
    }

    await this.saveCollections(serverRoot, { whitelist: updatedWhitelist, ops: updatedOps });
    await this.applyLivePlayerDiff(
      serverId,
      next.name,
      { whitelisted: !!current?.whitelisted, operator: !!current?.operator },
      { whitelisted: next.whitelisted, operator: next.operator }
    );

    return {
      uuid,
      name: next.name,
      whitelisted: next.whitelisted,
      operator: next.operator,
      opLevel: next.operator ? this.normalizeOpLevel(next.opLevel) : null,
      bypassesPlayerLimit: next.operator ? !!next.bypassesPlayerLimit : false,
      headUrl: this.headUrl(serverId, uuid)
    };
  }

  private async applyLivePlayerDiff(
    serverId: string,
    playerName: string,
    previous: { whitelisted: boolean; operator: boolean },
    next: { whitelisted: boolean; operator: boolean }
  ): Promise<void> {
    if (!this.runtime.isRunning(serverId)) return;
    if (!previous.whitelisted && next.whitelisted) this.runtime.sendCommand(serverId, `whitelist add ${playerName}`);
    if (previous.whitelisted && !next.whitelisted) this.runtime.sendCommand(serverId, `whitelist remove ${playerName}`);
    if (!previous.operator && next.operator) this.runtime.sendCommand(serverId, `op ${playerName}`);
    if (previous.operator && !next.operator) this.runtime.sendCommand(serverId, `deop ${playerName}`);
  }

  private async findPlayer(serverRoot: string, uuid: string, name: string): Promise<PlayerRecord | null> {
    const players = await this.listPlayers("lookup", serverRoot);
    const byUuid = withHyphenUuid(uuid);
    const byName = String(name || "").trim().toLowerCase();
    return (
      players.find((entry) => entry.uuid === byUuid) ||
      players.find((entry) => entry.name.toLowerCase() === byName) ||
      null
    );
  }

  private async readWhitelist(serverRoot: string): Promise<WhitelistEntry[]> {
    const filePath = path.resolve(serverRoot, WHITELIST_RELATIVE_PATH);
    return this.readJsonArray<WhitelistEntry>(filePath, (entry) => ({
      uuid: withHyphenUuid(String(entry?.uuid || "")),
      name: String(entry?.name || "").trim()
    })).then((rows) => rows.filter((entry) => entry.uuid && entry.name));
  }

  private async readOps(serverRoot: string): Promise<OpsEntry[]> {
    const filePath = path.resolve(serverRoot, OPS_RELATIVE_PATH);
    return this.readJsonArray<OpsEntry>(filePath, (entry) => ({
      uuid: withHyphenUuid(String(entry?.uuid || "")),
      name: String(entry?.name || "").trim(),
      level: this.normalizeOpLevel(entry?.level),
      bypassesPlayerLimit: !!entry?.bypassesPlayerLimit
    })).then((rows) => rows.filter((entry) => entry.uuid && entry.name));
  }

  private async saveCollections(serverRoot: string, input: { whitelist: WhitelistEntry[]; ops: OpsEntry[] }): Promise<void> {
    await Promise.all([
      fs.writeFile(path.resolve(serverRoot, WHITELIST_RELATIVE_PATH), JSON.stringify(input.whitelist, null, 2), "utf8"),
      fs.writeFile(path.resolve(serverRoot, OPS_RELATIVE_PATH), JSON.stringify(input.ops, null, 2), "utf8")
    ]);
  }

  private async readJsonArray<T>(filePath: string, mapRow: (entry: any) => T): Promise<T[]> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(mapRow) : [];
    } catch {
      return [];
    }
  }

  private headUrl(serverId: string, uuid: string): string {
    return `/api/server/players/${encodeURIComponent(withHyphenUuid(uuid))}/head?serverId=${encodeURIComponent(serverId)}`;
  }

  private renderFallbackHeadSvg(name: string): string {
    const safeName = String(name || "Player").trim();
    const initials = safeName.slice(0, 2).toUpperCase();
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
  <rect x="1" y="1" width="46" height="46" rx="10" fill="#132433" stroke="#35526D" stroke-width="2"/>
  <rect x="7" y="7" width="34" height="34" rx="7" fill="#20384D"/>
  <path d="M12 18C12 14.6863 14.6863 12 18 12H30C33.3137 12 36 14.6863 36 18V30C36 33.3137 33.3137 36 30 36H18C14.6863 36 12 33.3137 12 30V18Z" fill="#2E4D67"/>
  <text x="24" y="29" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#E6F4FF">${initials}</text>
</svg>`.trim();
  }

  private playerKey(uuid: string, name: string): string {
    const safeUuid = withHyphenUuid(uuid);
    if (safeUuid) return safeUuid;
    return `name:${String(name || "").trim().toLowerCase()}`;
  }

  private normalizeOpLevel(input: unknown): number {
    const parsed = Number(input ?? 4);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) return 4;
    return parsed;
  }

  private parseProperties(raw: string): PropertyLine[] {
    const lines = String(raw || "").split(/\r?\n/);
    return lines.map((line) => {
      if (!line.trim()) return { type: "blank", raw: line };
      if (line.trimStart().startsWith("#") || line.trimStart().startsWith("!")) return { type: "comment", raw: line };
      const idx = findPropertySeparatorIndex(line);
      if (idx < 0) return { type: "comment", raw: line };
      const key = line.slice(0, idx).trim();
      return {
        type: "property",
        key,
        value: normalizePropertyValue(key, line.slice(idx + 1)),
        raw: line
      };
    });
  }

  private toFields(lines: PropertyLine[]): ServerPropertyField[] {
    const seen = new Set<string>();
    const fields: ServerPropertyField[] = [];
    for (const line of lines) {
      if (line.type !== "property") continue;
      if (seen.has(line.key)) continue;
      seen.add(line.key);
      fields.push({
        key: line.key,
        value: line.value,
        control: this.inferControl(line.key, line.value),
        category: PROPERTY_CATEGORIES[line.key] || "advanced",
        label: toLabel(line.key),
        options: PROPERTY_OPTIONS[line.key],
        isCustom: !(line.key in PROPERTY_CATEGORIES)
      });
    }
    return fields.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.label.localeCompare(b.label);
    });
  }

  private inferControl(key: string, value: string): ServerPropertyField["control"] {
    if (PROPERTY_OPTIONS[key]?.length) {
      if (PROPERTY_OPTIONS[key].every((option) => /^(true|false)$/.test(option))) return "boolean";
      return "select";
    }
    if (isBooleanLike(value)) return "boolean";
    if (isNumericLike(value)) return "number";
    return "text";
  }

  private mergePropertyLines(lines: PropertyLine[], nextValues: Map<string, string>): string {
    const rendered: string[] = [];
    const handled = new Set<string>();

    for (const line of lines) {
      if (line.type !== "property") {
        rendered.push(line.raw);
        continue;
      }
      if (!nextValues.has(line.key)) continue;
      rendered.push(`${line.key}=${normalizePropertyValue(line.key, nextValues.get(line.key) || "")}`);
      handled.add(line.key);
    }

    for (const [key, value] of nextValues.entries()) {
      if (handled.has(key)) continue;
      rendered.push(`${key}=${normalizePropertyValue(key, value)}`);
    }

    return rendered.join("\n");
  }

  private async resolvePlayer(username: string): Promise<{ uuid: string; name: string }> {
    const cleanUsername = String(username || "").trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(cleanUsername)) {
      throw new Error("Minecraft username must be 3-16 characters using letters, numbers, or underscore.");
    }
    await this.loadCache();
    const cacheKey = cleanUsername.toLowerCase();
    const cached = this.playerCache.get(cacheKey);
    if (cached) return { uuid: cached.uuid, name: cached.name };

    const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanUsername)}`, {
      headers: { Accept: "application/json" }
    });
    if (response.status === 204) throw new Error(`Minecraft player "${cleanUsername}" was not found.`);
    if (!response.ok) throw new Error(`Could not resolve Minecraft player "${cleanUsername}".`);
    const body = (await response.json()) as { id?: string; name?: string };
    const uuid = withHyphenUuid(String(body.id || ""));
    const name = String(body.name || "").trim();
    if (!uuid || !name) throw new Error(`Could not resolve Minecraft player "${cleanUsername}".`);

    const entry = { uuid, name, cachedAt: new Date().toISOString() };
    this.playerCache.set(cacheKey, entry);
    this.playerCache.set(uuid, entry);
    await this.persistCache();
    return { uuid, name };
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const raw = await fs.readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, PlayerCacheEntry>;
      for (const [key, value] of Object.entries(parsed || {})) {
        if (!value?.uuid || !value?.name) continue;
        this.playerCache.set(key, {
          uuid: withHyphenUuid(value.uuid),
          name: value.name,
          cachedAt: value.cachedAt || new Date(0).toISOString()
        });
      }
    } catch {
      // no-op
    }
  }

  private async persistCache(): Promise<void> {
    const out: Record<string, PlayerCacheEntry> = {};
    for (const [key, value] of this.playerCache.entries()) out[key] = value;
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    await fs.writeFile(this.cachePath, JSON.stringify(out, null, 2), "utf8");
  }
}
