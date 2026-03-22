import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { resolveSafePath, toRelativePath } from "../utils/pathUtils.js";

type InstallResult = {
  changed: string[];
  skipped: string[];
  restartRequired: true;
};

type ModEntry = {
  modId: string;
  jarPath: string;
};

const ALLOWED_TOP_LEVEL = new Set(["mods", "config", "world", "world_nether", "world_the_end"]);

const normalizeEntry = (value: string): string =>
  value
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");

export class ModService {
  private readonly modsDirRel = "mods";

  private modsDirAbs(serverRoot?: string): string {
    return resolveSafePath(this.modsDirRel, serverRoot);
  }

  async list(serverRoot?: string): Promise<ModEntry[]> {
    const dir = this.modsDirAbs(serverRoot);
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const list: ModEntry[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jar")) continue;
      const modId = entry.name.replace(/\.jar$/i, "");
      list.push({ modId, jarPath: toRelativePath(path.join(dir, entry.name), serverRoot) });
    }
    return list.sort((a, b) => a.modId.localeCompare(b.modId));
  }

  async install(options: {
    mode: "jar" | "zip";
    artifact: Express.Multer.File;
    confirmOverwrite?: boolean;
    serverRoot?: string;
  }): Promise<InstallResult> {
    const changed: string[] = [];
    const skipped: string[] = [];

    if (options.mode === "jar") {
      if (!options.artifact.originalname.toLowerCase().endsWith(".jar")) {
        throw new Error("Artifact must be a .jar file when mode=jar.");
      }
      const out = resolveSafePath(path.join(this.modsDirRel, path.basename(options.artifact.originalname)), options.serverRoot);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, options.artifact.buffer);
      changed.push(toRelativePath(out, options.serverRoot));
      return { changed, skipped, restartRequired: true };
    }

    const zip = new AdmZip(options.artifact.buffer);
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    const collisions: string[] = [];
    const planned: Array<{ zipEntry: AdmZip.IZipEntry; targetAbs: string; targetRel: string }> = [];

    for (const entry of entries) {
      const normalized = normalizeEntry(entry.entryName);
      if (!normalized) continue;
      const [top] = normalized.split("/");
      if (!ALLOWED_TOP_LEVEL.has(top)) continue;
      if (top === "mods" && !normalized.toLowerCase().endsWith(".jar")) continue;
      const absOut = resolveSafePath(normalized, options.serverRoot);
      const relOut = toRelativePath(absOut, options.serverRoot);
      const exists = await fs.stat(absOut).then(() => true).catch(() => false);
      if (exists && !options.confirmOverwrite) collisions.push(relOut);
      planned.push({ zipEntry: entry, targetAbs: absOut, targetRel: relOut });
    }

    if (collisions.length) {
      throw new Error(`Overwrite confirmation required. Collisions: ${collisions.join(", ")}`);
    }

    for (const item of planned) {
      await fs.mkdir(path.dirname(item.targetAbs), { recursive: true });
      await fs.writeFile(item.targetAbs, item.zipEntry.getData());
      changed.push(item.targetRel);
    }

    return { changed, skipped, restartRequired: true };
  }

  async remove(options: { modId: string; serverRoot?: string }): Promise<InstallResult> {
    const modsDir = this.modsDirAbs(options.serverRoot);
    const changed: string[] = [];
    const skipped: string[] = [];
    const jarPath = path.join(modsDir, `${options.modId}.jar`);
    if (await fs.stat(jarPath).then(() => true).catch(() => false)) {
      await fs.rm(jarPath, { force: true });
      changed.push(toRelativePath(jarPath, options.serverRoot));
    }
    return { changed, skipped, restartRequired: true };
  }
}
