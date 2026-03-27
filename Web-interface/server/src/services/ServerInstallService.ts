import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ServerRecord, ServerType } from "./ServerRegistryService.js";

const INFO_FILE_NAME = "info.txt";
const MC_VERSION_RE = /(\d+\.\d+(?:\.\d+)?)/;

type InstallResult = { jarPath: string; version?: string; build?: string | null; infoPath?: string };
type UpdateResult = { jarPath: string; version: string; build: string | null; updated: boolean; infoPath: string };
type MojangManifest = {
  latest?: { release?: string };
  versions: Array<{ id: string; url: string; type: string; releaseTime?: string }>;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed request: ${url}`);
  return response.json() as Promise<T>;
};

const downloadFile = async (url: string, outputPath: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed from ${url}`);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
};

const runBuildTools = async (rootPath: string, version: string): Promise<void> => {
  const buildToolsPath = path.resolve(rootPath, "BuildTools.jar");
  await downloadFile(
    "https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar",
    buildToolsPath
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(`java -jar "${buildToolsPath}" --rev ${version}`, {
      cwd: rootPath,
      shell: true
    });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("BuildTools failed to build spigot jar."));
    });
    child.once("error", reject);
  });
};

const pickLatestNeoForgeVersionForMc = async (mcVersion: string): Promise<string> => {
  const response = await fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
  if (!response.ok) throw new Error("Could not fetch NeoForge versions.");
  const body = await response.json() as { versions?: string[] };
  const [major, minor, patch = 0] = mcVersion.split(".").map((v) => Number(v));
  if (!major || !minor) throw new Error("Invalid Minecraft version for NeoForge.");
  const strictPrefix = `${minor}.${patch}.`;
  const broadPrefix = `${minor}.`;
  const candidates = (body.versions || [])
    .filter((value) => !/(alpha|beta|rc|snapshot|pre)/i.test(value))
    .filter((value) => value.startsWith(strictPrefix) || value.startsWith(broadPrefix))
    .sort((a, b) => (a < b ? 1 : -1));
  const selected = candidates[0];
  if (!selected) throw new Error(`No NeoForge release found for Minecraft ${mcVersion}.`);
  return selected;
};

const pickForgeBuildForMc = async (mcVersion: string): Promise<string> => {
  const response = await fetch("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
  if (!response.ok) throw new Error("Could not fetch Forge promotions.");
  const body = await response.json() as { promos?: Record<string, string> };
  const promos = body.promos || {};
  const latest = promos[`${mcVersion}-latest`];
  const recommended = promos[`${mcVersion}-recommended`];
  const build = latest || recommended;
  if (!build) throw new Error(`No Forge build found for Minecraft ${mcVersion}.`);
  return `${mcVersion}-${build}`;
};

const pickForgeArtifactVersion = async (mcVersion: string): Promise<string> => {
  const promoted = await pickForgeBuildForMc(mcVersion);
  const metadataResponse = await fetch("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml");
  if (!metadataResponse.ok) return promoted;
  const xml = await metadataResponse.text();
  const versions = Array.from(xml.matchAll(/<version>([^<]+)<\/version>/g)).map((entry) => String(entry[1] || ""));
  if (!versions.length) return promoted;
  if (versions.includes(promoted)) return promoted;
  const prefixMatches = versions.filter((value) => value.startsWith(`${promoted}-`));
  if (!prefixMatches.length) return promoted;
  const exactMcSuffix = prefixMatches.find((value) => value.endsWith(`-${mcVersion}`));
  if (exactMcSuffix) return exactMcSuffix;
  return prefixMatches.sort((a, b) => (a < b ? 1 : -1))[0];
};

const pickLatestStableFabricLoader = async (mcVersion: string): Promise<string> => {
  const response = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
  if (!response.ok) throw new Error(`No Fabric loader data for ${mcVersion}.`);
  const body = await response.json() as Array<{ loader?: { version?: string; stable?: boolean } }>;
  const stable = body.find((entry) => entry.loader?.stable && entry.loader.version)?.loader?.version;
  const fallback = body.find((entry) => !!entry.loader?.version)?.loader?.version;
  const loader = stable || fallback;
  if (!loader) throw new Error(`No Fabric loader found for ${mcVersion}.`);
  return loader;
};

const pickLatestFabricInstaller = async (): Promise<string> => {
  const response = await fetch("https://meta.fabricmc.net/v2/versions/installer");
  if (!response.ok) throw new Error("Could not fetch Fabric installer versions.");
  const body = await response.json() as Array<{ version?: string }>;
  const version = body[0]?.version;
  if (!version) throw new Error("No Fabric installer version found.");
  return version;
};

const runJavaCommand = async (command: string, cwd: string, failureMessage: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(failureMessage));
    });
    child.once("error", reject);
  });
};

const downloadFirstAvailable = async (urls: string[], outputPath: string): Promise<{ url: string }> => {
  let lastError = "";
  for (const url of urls) {
    try {
      await downloadFile(url, outputPath);
      return { url };
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  throw new Error(lastError || `Download failed from ${urls[0] || "unknown URL"}`);
};

const extractMinecraftVersion = (value: string): string => {
  const raw = String(value || "").trim();
  const match = raw.match(MC_VERSION_RE);
  return match?.[1] || raw;
};

const parseVersionBuild = (value: string): { version: string; build: string | null } => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+\.\d+(?:\.\d+)?)(?:-(\d+))?$/);
  if (!match) return { version: extractMinecraftVersion(raw), build: null };
  return { version: match[1], build: match[2] || null };
};

const pickVanillaVersionEntry = (
  manifest: MojangManifest,
  requestedVersion: string
): { id: string; url: string } => {
  const releases = (manifest.versions || []).filter((entry) => entry.type === "release");
  if (!releases.length) throw new Error("No vanilla releases found in Mojang manifest.");
  const wantsLatest = /^(latest|latest-release)$/i.test(String(requestedVersion || "").trim());
  if (!wantsLatest) {
    const exact = releases.find((entry) => entry.id === requestedVersion);
    if (!exact) throw new Error("Vanilla version not found.");
    return { id: exact.id, url: exact.url };
  }
  const latestReleaseId = String(manifest.latest?.release || "").trim();
  if (latestReleaseId) {
    const byLatestId = releases.find((entry) => entry.id === latestReleaseId);
    if (byLatestId) return { id: byLatestId.id, url: byLatestId.url };
  }
  const sorted = [...releases].sort((a, b) => String(b.releaseTime || "").localeCompare(String(a.releaseTime || "")));
  const fallback = sorted[0] || releases[0];
  return { id: fallback.id, url: fallback.url };
};

export class ServerInstallService {
  async detectImportedServerJar(server: ServerRecord): Promise<{ jarFile: string | null; type: ServerType | null; version: string | null }> {
    const infoVersion = await this.readInfoVersion(server.rootPath);
    const entries = await fs.readdir(server.rootPath, { withFileTypes: true });
    const jars = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
      .filter((entry) => !/(installer|buildtools|launcher-installer)\.jar$/i.test(entry.name))
      .map((entry) => entry.name);

    const detect = (name: string): { type: ServerType | null; version: string | null } => {
      const lower = name.toLowerCase();
      const purpurBuild = lower.match(/^purpur-(\d+\.\d+(?:\.\d+)?)-(\d+)\.jar$/i);
      if (purpurBuild?.[1]) {
        return { type: "purpur", version: `${purpurBuild[1]}-${purpurBuild[2]}` };
      }
      const patterns: Array<{ type: ServerType; regex: RegExp }> = [
        { type: "purpur", regex: /^purpur-(\d+\.\d+(?:\.\d+)?)-.+\.jar$/i },
        { type: "paper", regex: /^paper-(\d+\.\d+(?:\.\d+)?)-.+\.jar$/i },
        { type: "spigot", regex: /^spigot-(\d+\.\d+(?:\.\d+)?)(?:-[\w.-]+)?\.jar$/i },
        { type: "forge", regex: /^forge-(\d+\.\d+(?:\.\d+)?)-.+\.jar$/i },
        { type: "neoforge", regex: /^neoforge-(\d+\.\d+(?:\.\d+)?)-.+\.jar$/i },
        { type: "fabric", regex: /^fabric-server-launch(?:er)?\.(\d+\.\d+(?:\.\d+)?)\.jar$/i },
        { type: "vanilla", regex: /^minecraft_server(?:\.\d+)?\.(\d+\.\d+(?:\.\d+)?)\.jar$/i },
        { type: "vanilla", regex: /^server-(\d+\.\d+(?:\.\d+)?)(?:-[\w.-]+)?\.jar$/i },
        { type: "vanilla", regex: /^vanilla-(\d+\.\d+(?:\.\d+)?)(?:-[\w.-]+)?\.jar$/i }
      ];
      for (const pattern of patterns) {
        const match = lower.match(pattern.regex);
        if (match?.[1]) return { type: pattern.type, version: match[1] };
      }
      const fallback = lower.match(/(\d+\.\d+(?:\.\d+)?)/);
      return { type: null, version: fallback?.[1] || null };
    };

    if (jars.some((jar) => /^purpur\.jar$/i.test(jar)) && infoVersion) {
      return { jarFile: jars.find((jar) => /^purpur\.jar$/i.test(jar)) || null, type: "purpur", version: infoVersion };
    }

    for (const jar of jars) {
      const result = detect(jar);
      if (result.type || result.version) {
        return { jarFile: jar, ...result };
      }
    }
    return { jarFile: jars[0] || null, type: null, version: infoVersion || null };
  }

  private normalizeImportPaths(paths: string[]): string[] {
    const normalized = paths.map((value) =>
      String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part && part !== "." && part !== "..")
        .join("/")
    );

    if (!normalized.length || normalized.some((entry) => !entry)) return normalized;

    const firstSegments = normalized.map((entry) => entry.split("/")[0]).filter(Boolean);
    if (!firstSegments.length) return normalized;
    const commonRoot = firstSegments[0];
    const hasSingleRoot = firstSegments.every((segment) => segment === commonRoot);
    if (!hasSingleRoot) return normalized;

    // Strip selected root folder itself so server.properties lands at imported server root.
    return normalized.map((entry) => {
      const parts = entry.split("/").filter(Boolean);
      const stripped = parts.slice(1).join("/");
      return stripped || parts.at(-1) || entry;
    });
  }

  async install(server: ServerRecord): Promise<InstallResult> {
    const inputVersion = String(server.version || "").trim();
    const mcVersion = extractMinecraftVersion(inputVersion);
    if (server.type !== "vanilla" && !MC_VERSION_RE.test(mcVersion)) {
      throw new Error(`Invalid Minecraft version: ${server.version}`);
    }
    await fs.mkdir(server.rootPath, { recursive: true });
    if (server.type === "vanilla") {
      const manifest = await fetchJson<MojangManifest>("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      const versionEntry = pickVanillaVersionEntry(manifest, "latest");
      const versionMeta = await fetchJson<{ downloads?: { server?: { url: string } } }>(
        versionEntry.url
      );
      const url = versionMeta.downloads?.server?.url;
      if (!url) throw new Error("No server jar available for this vanilla version.");
      const jarPath = path.resolve(server.rootPath, `vanilla-${versionEntry.id}.jar`);
      await downloadFile(url, jarPath);
      await this.removeVanillaVersionedJars(server.rootPath, jarPath);
      await this.writeInfoVersion(server.rootPath, versionEntry.id);
      return { jarPath, version: versionEntry.id };
    }
    const jarPath = path.resolve(
      server.rootPath,
      server.type === "purpur" ? "purpur.jar" : `${server.type}-${mcVersion}.jar`
    );
    if (server.type === "paper") {
      const builds = await fetchJson<{ builds: number[] }>(
        `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}`
      );
      const latest = builds.builds.at(-1);
      if (!latest) throw new Error("No Paper build found for this version.");
      const file = await fetchJson<{ downloads: { application: { name: string } } }>(
        `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latest}`
      );
      const name = file.downloads.application.name;
      const url = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latest}/downloads/${name}`;
      await downloadFile(url, jarPath);
      return { jarPath };
    }
    if (server.type === "purpur") {
      const buildMeta = await fetchJson<{ builds?: { latest?: number | string } }>(
        `https://api.purpurmc.org/v2/purpur/${mcVersion}`
      );
      const latestBuild = buildMeta.builds?.latest !== undefined ? String(buildMeta.builds.latest) : null;
      const url = `https://api.purpurmc.org/v2/purpur/${mcVersion}/latest/download`;
      await this.removePurpurVersionedJars(server.rootPath);
      await downloadFile(url, jarPath);
      const combinedVersion = latestBuild ? `${mcVersion}-${latestBuild}` : mcVersion;
      const infoPath = await this.writeInfoVersion(server.rootPath, combinedVersion);
      return { jarPath, version: combinedVersion, build: latestBuild, infoPath };
    }
    if (server.type === "spigot") {
      await runBuildTools(server.rootPath, mcVersion);
      const files = await fs.readdir(server.rootPath);
      const spigotJar = files
        .filter((name) => /^spigot-.*\.jar$/i.test(name))
        .sort()
        .at(-1);
      if (!spigotJar) throw new Error("Spigot jar not produced by BuildTools.");
      const builtPath = path.resolve(server.rootPath, spigotJar);
      await fs.copyFile(builtPath, jarPath);
      return { jarPath };
    }
    if (server.type === "forge") {
      const forgeVersion = await pickForgeArtifactVersion(mcVersion);
      const installerPath = path.resolve(server.rootPath, `forge-${forgeVersion}-installer.jar`);
      const forgeUrls = [
        `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`,
        `https://files.minecraftforge.net/maven/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`
      ];
      await downloadFirstAvailable(forgeUrls, installerPath);
      await runJavaCommand(
        `java -jar "${installerPath}" --installServer`,
        server.rootPath,
        "Forge installer failed."
      );
      const resolved = await this.resolveInstalledServerJar(server.rootPath, [/forge-.*\.jar$/i]);
      return { jarPath: resolved };
    }
    if (server.type === "neoforge") {
      const neoForgeVersion = await pickLatestNeoForgeVersionForMc(mcVersion);
      const installerPath = path.resolve(server.rootPath, `neoforge-${neoForgeVersion}-installer.jar`);
      const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoForgeVersion}/neoforge-${neoForgeVersion}-installer.jar`;
      await downloadFile(installerUrl, installerPath);
      await runJavaCommand(
        `java -jar "${installerPath}" --installServer`,
        server.rootPath,
        "NeoForge installer failed."
      );
      const resolved = await this.resolveInstalledServerJar(server.rootPath, [/neoforge-.*\.jar$/i, /forge-.*\.jar$/i]);
      return { jarPath: resolved };
    }
    if (server.type === "fabric") {
      const installerVersion = await pickLatestFabricInstaller();
      const loaderVersion = await pickLatestStableFabricLoader(mcVersion);
      const installerPath = path.resolve(server.rootPath, `fabric-installer-${installerVersion}.jar`);
      const installerUrl = `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${installerVersion}/fabric-installer-${installerVersion}.jar`;
      await downloadFile(installerUrl, installerPath);
      await runJavaCommand(
        `java -jar "${installerPath}" server -mcversion ${mcVersion} -loader ${loaderVersion} -downloadMinecraft`,
        server.rootPath,
        "Fabric installer failed."
      );
      const resolved = await this.resolveInstalledServerJar(server.rootPath, [/fabric-server-launch\.jar$/i, /fabric-.*\.jar$/i]);
      return { jarPath: resolved };
    }
    throw new Error(`Unsupported server type: ${server.type}`);
  }

  async updateServerJar(server: ServerRecord): Promise<UpdateResult> {
    if (server.type === "vanilla") {
      const manifest = await fetchJson<MojangManifest>("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      const latestEntry = pickVanillaVersionEntry(manifest, "latest");
      const versionMeta = await fetchJson<{ downloads?: { server?: { url: string } } }>(latestEntry.url);
      const url = versionMeta.downloads?.server?.url;
      if (!url) throw new Error("No server jar available for the latest vanilla version.");
      const jarPath = path.resolve(server.rootPath, `vanilla-${latestEntry.id}.jar`);
      const tmpPath = `${jarPath}.download`;
      await downloadFile(url, tmpPath);
      await fs.rm(jarPath, { force: true });
      await fs.rename(tmpPath, jarPath);
      await this.removeVanillaVersionedJars(server.rootPath, jarPath);
      const infoPath = await this.writeInfoVersion(server.rootPath, latestEntry.id);
      const current = parseVersionBuild(server.version).version;
      return {
        jarPath,
        version: latestEntry.id,
        build: null,
        updated: current !== latestEntry.id,
        infoPath
      };
    }
    if (server.type !== "purpur") {
      throw new Error("Update is currently supported for Vanilla and Purpur servers only.");
    }
    const infoVersion = await this.readInfoVersion(server.rootPath);
    const fromServer = parseVersionBuild(server.version);
    const fromInfo = parseVersionBuild(infoVersion || "");
    const mcVersion = fromServer.version || fromInfo.version;
    if (!mcVersion || !MC_VERSION_RE.test(mcVersion)) {
      throw new Error("Could not determine Minecraft version for this Purpur server.");
    }
    const currentBuild = fromServer.build || fromInfo.build;
    const buildMeta = await fetchJson<{ builds?: { latest?: number | string } }>(
      `https://api.purpurmc.org/v2/purpur/${mcVersion}`
    );
    const latestBuild = buildMeta.builds?.latest !== undefined ? String(buildMeta.builds.latest) : null;
    if (!latestBuild) throw new Error(`No Purpur build found for Minecraft ${mcVersion}.`);

    const jarPath = path.resolve(server.rootPath, "purpur.jar");
    const tmpPath = path.resolve(server.rootPath, `purpur-${mcVersion}-${latestBuild}.jar.download`);
    const url = `https://api.purpurmc.org/v2/purpur/${mcVersion}/latest/download`;
    await downloadFile(url, tmpPath);
    await fs.rm(jarPath, { force: true });
    await fs.rename(tmpPath, jarPath);
    await this.removePurpurVersionedJars(server.rootPath);
    const combinedVersion = `${mcVersion}-${latestBuild}`;
    const infoPath = await this.writeInfoVersion(server.rootPath, combinedVersion);
    return {
      jarPath,
      version: combinedVersion,
      build: latestBuild,
      updated: currentBuild !== latestBuild,
      infoPath
    };
  }

  private async resolveInstalledServerJar(serverRoot: string, preferredPatterns: RegExp[]): Promise<string> {
    const entries = await fs.readdir(serverRoot);
    const jars = entries
      .filter((name) => name.toLowerCase().endsWith(".jar"))
      .filter((name) => !/(installer|buildtools|launcher-installer)\.jar$/i.test(name));
    for (const pattern of preferredPatterns) {
      const match = jars.find((name) => pattern.test(name));
      if (match) return path.resolve(serverRoot, match);
    }
    if (!jars.length) throw new Error("No server jar was produced.");
    return path.resolve(serverRoot, jars[0]);
  }

  async importServerFolder(
    server: ServerRecord,
    files: Express.Multer.File[],
    relativePaths: string[] = []
  ): Promise<{ saved: string[] }> {
    const saved: string[] = [];
    await fs.mkdir(server.rootPath, { recursive: true });
    const normalizedPaths = this.normalizeImportPaths(relativePaths);
    const fallbackFromUpload = this.normalizeImportPaths(
      files.map((file) => String(file.originalname || ""))
    );
    for (const [index, file] of files.entries()) {
      const fromMap = String(normalizedPaths[index] || "").trim();
      const fromFallback = String(fallbackFromUpload[index] || "").trim();
      const selected = fromMap || fromFallback;
      const cleaned = selected
        .split("/")
        .filter((part) => part && part !== "." && part !== "..")
        .join("/");
      if (!cleaned) continue;
      const out = path.resolve(server.rootPath, cleaned);
      const relative = path.relative(server.rootPath, out);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Invalid import file path.");
      }
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, file.buffer);
      saved.push(cleaned);
    }
    if (files.length > 0 && saved.length === 0) {
      throw new Error("Import failed: no valid files were received from the selected folder.");
    }
    return { saved };
  }

  private async writeInfoVersion(serverRoot: string, value: string): Promise<string> {
    const infoPath = path.resolve(serverRoot, INFO_FILE_NAME);
    await fs.writeFile(infoPath, `${String(value || "").trim()}\n`, "utf8");
    return infoPath;
  }

  private async readInfoVersion(serverRoot: string): Promise<string | null> {
    try {
      const raw = await fs.readFile(path.resolve(serverRoot, INFO_FILE_NAME), "utf8");
      const value = String(raw || "").trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private async removePurpurVersionedJars(serverRoot: string): Promise<void> {
    const entries = await fs.readdir(serverRoot, { withFileTypes: true });
    const toDelete = entries
      .filter((entry) => entry.isFile() && /^purpur-\d+\.\d+(?:\.\d+)?-\d+\.jar$/i.test(entry.name))
      .map((entry) => path.resolve(serverRoot, entry.name));
    await Promise.all(toDelete.map((filePath) => fs.rm(filePath, { force: true })));
  }

  private async removeVanillaVersionedJars(serverRoot: string, keepJarPath: string): Promise<void> {
    const keep = path.resolve(keepJarPath);
    const entries = await fs.readdir(serverRoot, { withFileTypes: true });
    const toDelete = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.resolve(serverRoot, entry.name))
      .filter((filePath) => filePath !== keep)
      .filter((filePath) => {
        const name = path.basename(filePath);
        return (
          /^vanilla-\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?\.jar$/i.test(name) ||
          /^server-\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?\.jar$/i.test(name) ||
          /^minecraft_server(?:\.\d+)?\.\d+\.\d+(?:\.\d+)?\.jar$/i.test(name)
        );
      });
    await Promise.all(toDelete.map((filePath) => fs.rm(filePath, { force: true })));
  }
}
