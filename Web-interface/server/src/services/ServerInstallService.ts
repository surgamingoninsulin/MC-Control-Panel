import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ServerRecord, ServerType } from "./ServerRegistryService.js";

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

const ensureVersionInJarName = async (jarAbsPath: string, version: string): Promise<string> => {
  const ext = path.extname(jarAbsPath).toLowerCase();
  if (ext !== ".jar") return jarAbsPath;
  const dir = path.dirname(jarAbsPath);
  const name = path.basename(jarAbsPath, ext);
  if (name.toLowerCase().includes(version.toLowerCase())) return jarAbsPath;
  const renamed = path.resolve(dir, `${name}-${version}.jar`);
  if (renamed === jarAbsPath) return jarAbsPath;
  const targetExists = await fs.stat(renamed).then(() => true).catch(() => false);
  if (targetExists) await fs.rm(renamed, { force: true });
  await fs.rename(jarAbsPath, renamed);
  return renamed;
};

export class ServerInstallService {
  async detectImportedServerJar(server: ServerRecord): Promise<{ jarFile: string | null; type: ServerType | null; version: string | null }> {
    const entries = await fs.readdir(server.rootPath, { withFileTypes: true });
    const jars = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
      .filter((entry) => !/(installer|buildtools|launcher-installer)\.jar$/i.test(entry.name))
      .map((entry) => entry.name);

    const detect = (name: string): { type: ServerType | null; version: string | null } => {
      const lower = name.toLowerCase();
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

    for (const jar of jars) {
      const result = detect(jar);
      if (result.type || result.version) {
        return { jarFile: jar, ...result };
      }
    }
    return { jarFile: jars[0] || null, type: null, version: null };
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

  async install(server: ServerRecord): Promise<{ jarPath: string }> {
    const jarPath = path.resolve(server.rootPath, `${server.type}-${server.version}.jar`);
    await fs.mkdir(server.rootPath, { recursive: true });
    if (server.type === "vanilla") {
      const manifest = await fetchJson<{
        versions: Array<{ id: string; url: string; type: string }>;
      }>("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      const versionEntry = manifest.versions.find(
        (entry) => entry.id === server.version && entry.type === "release"
      );
      if (!versionEntry) throw new Error("Vanilla version not found.");
      const versionMeta = await fetchJson<{ downloads?: { server?: { url: string } } }>(
        versionEntry.url
      );
      const url = versionMeta.downloads?.server?.url;
      if (!url) throw new Error("No server jar available for this vanilla version.");
      await downloadFile(url, jarPath);
      return { jarPath: await ensureVersionInJarName(jarPath, server.version) };
    }
    if (server.type === "paper") {
      const builds = await fetchJson<{ builds: number[] }>(
        `https://api.papermc.io/v2/projects/paper/versions/${server.version}`
      );
      const latest = builds.builds.at(-1);
      if (!latest) throw new Error("No Paper build found for this version.");
      const file = await fetchJson<{ downloads: { application: { name: string } } }>(
        `https://api.papermc.io/v2/projects/paper/versions/${server.version}/builds/${latest}`
      );
      const name = file.downloads.application.name;
      const url = `https://api.papermc.io/v2/projects/paper/versions/${server.version}/builds/${latest}/downloads/${name}`;
      await downloadFile(url, jarPath);
      return { jarPath: await ensureVersionInJarName(jarPath, server.version) };
    }
    if (server.type === "purpur") {
      const url = `https://api.purpurmc.org/v2/purpur/${server.version}/latest/download`;
      await downloadFile(url, jarPath);
      return { jarPath: await ensureVersionInJarName(jarPath, server.version) };
    }
    if (server.type === "spigot") {
      await runBuildTools(server.rootPath, server.version);
      const files = await fs.readdir(server.rootPath);
      const spigotJar = files
        .filter((name) => /^spigot-.*\.jar$/i.test(name))
        .sort()
        .at(-1);
      if (!spigotJar) throw new Error("Spigot jar not produced by BuildTools.");
      const builtPath = path.resolve(server.rootPath, spigotJar);
      await fs.copyFile(builtPath, jarPath);
      return { jarPath: await ensureVersionInJarName(jarPath, server.version) };
    }
    if (server.type === "forge") {
      const forgeVersion = await pickForgeArtifactVersion(server.version);
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
      return { jarPath: await ensureVersionInJarName(resolved, server.version) };
    }
    if (server.type === "neoforge") {
      const neoForgeVersion = await pickLatestNeoForgeVersionForMc(server.version);
      const installerPath = path.resolve(server.rootPath, `neoforge-${neoForgeVersion}-installer.jar`);
      const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoForgeVersion}/neoforge-${neoForgeVersion}-installer.jar`;
      await downloadFile(installerUrl, installerPath);
      await runJavaCommand(
        `java -jar "${installerPath}" --installServer`,
        server.rootPath,
        "NeoForge installer failed."
      );
      const resolved = await this.resolveInstalledServerJar(server.rootPath, [/neoforge-.*\.jar$/i, /forge-.*\.jar$/i]);
      return { jarPath: await ensureVersionInJarName(resolved, server.version) };
    }
    if (server.type === "fabric") {
      const installerVersion = await pickLatestFabricInstaller();
      const loaderVersion = await pickLatestStableFabricLoader(server.version);
      const installerPath = path.resolve(server.rootPath, `fabric-installer-${installerVersion}.jar`);
      const installerUrl = `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${installerVersion}/fabric-installer-${installerVersion}.jar`;
      await downloadFile(installerUrl, installerPath);
      await runJavaCommand(
        `java -jar "${installerPath}" server -mcversion ${server.version} -loader ${loaderVersion} -downloadMinecraft`,
        server.rootPath,
        "Fabric installer failed."
      );
      const resolved = await this.resolveInstalledServerJar(server.rootPath, [/fabric-server-launch\.jar$/i, /fabric-.*\.jar$/i]);
      return { jarPath: await ensureVersionInJarName(resolved, server.version) };
    }
    throw new Error(`Unsupported server type: ${server.type}`);
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
}
