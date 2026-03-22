import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config.js";
import type { ServerType } from "./ServerRegistryService.js";
import { compareMcVersion, isVersionGte, isVersionLte } from "../utils/mcVersion.js";

type CacheShape = { schemaVersion: number; updatedAt: string; versionsByType: Record<string, string[]> };

const MIN_VERSION = "1.7.10";
const CACHE_TTL_MS = 1000 * 60 * 60;
const CACHE_SCHEMA_VERSION = 2;

export class VersionCatalogService {
  private readonly filePath: string;
  private cache: CacheShape = { schemaVersion: CACHE_SCHEMA_VERSION, updatedAt: "", versionsByType: {} };

  constructor() {
    fs.mkdirSync(appConfig.panelDataDir, { recursive: true });
    this.filePath = path.resolve(appConfig.panelDataDir, "version-catalog.json");
    this.cache = this.load();
  }

  async getServerTypes() {
    return [
      { id: "vanilla", label: "Vanilla", enabled: true },
      { id: "paper", label: "Paper", enabled: true },
      { id: "spigot", label: "Spigot", enabled: true },
      { id: "purpur", label: "Purpur", enabled: true },
      { id: "forge", label: "Forge", enabled: true },
      { id: "neoforge", label: "NeoForge", enabled: true },
      { id: "fabric", label: "Fabric", enabled: true }
    ];
  }

  async getVersions(type: ServerType): Promise<string[]> {
    await this.refreshIfNeeded();
    const out = this.cache.versionsByType[type] || [];
    return [...out];
  }

  private async refreshIfNeeded(): Promise<void> {
    const age = Date.now() - (this.cache.updatedAt ? new Date(this.cache.updatedAt).getTime() : 0);
    if (this.cache.schemaVersion === CACHE_SCHEMA_VERSION && age < CACHE_TTL_MS && Object.keys(this.cache.versionsByType).length) return;
    const prev = this.cache.versionsByType || {};
    const mojang = await this.fetchMojangReleaseVersions();
    const paper = await this.fetchPaperMcVersions(mojang);
    const purpur = await this.fetchPurpurMcVersions(mojang);
    const spigot = await this.fetchSpigotMcVersions(mojang);
    const forge = await this.fetchForgeMcVersions(mojang);
    const neoforge = await this.fetchNeoForgeMcVersions(mojang);
    const fabric = await this.fetchFabricMcVersions(mojang);
    this.cache = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      versionsByType: {
        vanilla: mojang.length ? mojang : (prev.vanilla || []),
        paper: paper.length ? paper : (prev.paper || []),
        purpur: purpur.length ? purpur : (prev.purpur || []),
        spigot: spigot.length ? spigot : (prev.spigot || []),
        forge: forge.length ? forge : (prev.forge || []),
        neoforge: neoforge.length ? neoforge : (prev.neoforge || []),
        fabric: fabric.length ? fabric : (prev.fabric || [])
      }
    };
    this.persist();
  }

  private async fetchMojangReleaseVersions(): Promise<string[]> {
    const response = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    if (!response.ok) throw new Error("Could not fetch Mojang version manifest.");
    const body = await response.json() as { versions?: Array<{ id: string; type: string }> };
    const versions = (body.versions || [])
      .filter((entry) => entry.type === "release")
      .map((entry) => entry.id)
      .filter((id) => isVersionGte(id, MIN_VERSION) && isVersionLte(id, appConfig.maxSupportedVersion))
      .sort(compareMcVersion);
    return [...new Set(versions)];
  }

  private async fetchForgeMcVersions(mojangVersions: string[]): Promise<string[]> {
    try {
      const response = await fetch("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
      if (!response.ok) return [...mojangVersions];
      const body = await response.json() as { promos?: Record<string, string> };
      const keys = Object.keys(body.promos || {});
      const versions = keys
        .map((key) => key.replace(/-(latest|recommended)$/i, ""))
        .filter((value) => isVersionGte(value, MIN_VERSION) && isVersionLte(value, appConfig.maxSupportedVersion))
        .sort(compareMcVersion);
      return [...new Set(versions)];
    } catch {
      return [...mojangVersions];
    }
  }

  private async fetchPaperMcVersions(mojangVersions: string[]): Promise<string[]> {
    try {
      const response = await fetch("https://api.papermc.io/v2/projects/paper");
      if (!response.ok) return [];
      const body = await response.json() as { versions?: string[] };
      const versions = (body.versions || [])
        .filter((value) => mojangVersions.includes(value))
        .filter((value) => isVersionGte(value, MIN_VERSION) && isVersionLte(value, appConfig.maxSupportedVersion))
        .sort(compareMcVersion);
      return [...new Set(versions)];
    } catch {
      return [];
    }
  }

  private async fetchPurpurMcVersions(mojangVersions: string[]): Promise<string[]> {
    try {
      const response = await fetch("https://api.purpurmc.org/v2/purpur/");
      if (!response.ok) return [];
      const body = await response.json() as { versions?: string[] };
      const versions = (body.versions || [])
        .filter((value) => mojangVersions.includes(value))
        .filter((value) => isVersionGte(value, MIN_VERSION) && isVersionLte(value, appConfig.maxSupportedVersion))
        .sort(compareMcVersion);
      return [...new Set(versions)];
    } catch {
      return [];
    }
  }

  private async fetchSpigotMcVersions(mojangVersions: string[]): Promise<string[]> {
    try {
      const response = await fetch("https://hub.spigotmc.org/versions/");
      if (!response.ok) return [];
      const html = await response.text();
      const matches = Array.from(html.matchAll(/href="(\d+\.\d+(?:\.\d+)?)\.json"/g));
      const versions = matches
        .map((entry) => String(entry[1] || ""))
        .filter((value) => mojangVersions.includes(value))
        .filter((value) => isVersionGte(value, MIN_VERSION) && isVersionLte(value, appConfig.maxSupportedVersion))
        .sort(compareMcVersion);
      return [...new Set(versions)];
    } catch {
      return [];
    }
  }

  private async fetchNeoForgeMcVersions(mojangVersions: string[]): Promise<string[]> {
    try {
      const response = await fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
      if (!response.ok) return [];
      const body = await response.json() as { versions?: string[] };
      const versions = (body.versions || [])
        .filter((value) => !/(alpha|beta|rc|snapshot|pre)/i.test(value))
        .map((value) => {
          const match = value.match(/^(\d+)\.(\d+)\./);
          if (!match) return "";
          return `1.${match[1]}.${match[2]}`;
        })
        .filter((value) => value && mojangVersions.includes(value))
        .sort(compareMcVersion);
      return [...new Set(versions)];
    } catch {
      return [];
    }
  }

  private async fetchFabricMcVersions(mojangVersions: string[]): Promise<string[]> {
    try {
      const response = await fetch("https://meta.fabricmc.net/v2/versions/game");
      if (!response.ok) return [...mojangVersions];
      const body = await response.json() as Array<{ version: string; stable: boolean }>;
      const versions = body
        .filter((entry) => entry.stable)
        .map((entry) => entry.version)
        .filter((value) => mojangVersions.includes(value))
        .sort(compareMcVersion);
      return [...new Set(versions)];
    } catch {
      return [...mojangVersions];
    }
  }

  private load(): CacheShape {
    try {
      if (!fs.existsSync(this.filePath)) return { schemaVersion: CACHE_SCHEMA_VERSION, updatedAt: "", versionsByType: {} };
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CacheShape>;
      return {
        schemaVersion: Number(parsed.schemaVersion || 0),
        updatedAt: parsed.updatedAt || "",
        versionsByType: parsed.versionsByType || {}
      };
    } catch {
      return { schemaVersion: CACHE_SCHEMA_VERSION, updatedAt: "", versionsByType: {} };
    }
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), "utf8");
  }
}
