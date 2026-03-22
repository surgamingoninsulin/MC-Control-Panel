import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { resolveSafePath, toRelativePath } from "../utils/pathUtils.js";

type InstallResult = {
  changed: string[];
  restartRequired: true;
};

export class PluginService {
  private readonly pluginsDirRel = "plugins";

  private pluginsDirAbs(serverRoot?: string): string {
    return resolveSafePath(this.pluginsDirRel, serverRoot);
  }

  async list(serverRoot?: string): Promise<
    Array<{ pluginId: string; jarPath?: string; folderPath?: string }>
  > {
    const dir = this.pluginsDirAbs(serverRoot);
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const list: Array<{ pluginId: string; jarPath?: string; folderPath?: string }> = [];

    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue;
      if (entry.isFile() && name.toLowerCase().endsWith(".jar")) {
        const pluginId = name.replace(/\.jar$/i, "");
        if (pluginId.startsWith(".")) continue;
        list.push({
          pluginId,
          jarPath: toRelativePath(path.join(dir, name), serverRoot)
        });
      }
    }

    return list.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  }

  async install(options: {
    mode: "jar" | "zip";
    artifact: Express.Multer.File;
    confirmOverwrite?: boolean;
    serverRoot?: string;
  }): Promise<InstallResult> {
    const pluginsDir = this.pluginsDirAbs(options.serverRoot);
    await fs.mkdir(pluginsDir, { recursive: true });

    if (options.mode === "jar") {
      if (!options.artifact.originalname.toLowerCase().endsWith(".jar")) {
        throw new Error("Artifact must be a .jar file when mode=jar.");
      }

      const out = path.join(pluginsDir, path.basename(options.artifact.originalname));
      await fs.writeFile(out, options.artifact.buffer);
      const rel = toRelativePath(out, options.serverRoot);
      return { changed: [rel], restartRequired: true };
    }

    const zip = new AdmZip(options.artifact.buffer);
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    const changed: string[] = [];
    const collisions: string[] = [];

    for (const entry of entries) {
      const normalized = entry.entryName.replace(/\\/g, "/");
      if (normalized.includes("..")) {
        throw new Error("Zip contains unsafe path traversal entries.");
      }
      const absOut = resolveSafePath(path.join(this.pluginsDirRel, normalized), options.serverRoot);
      const relOut = toRelativePath(absOut, options.serverRoot);
      const exists = await fs.stat(absOut).then(() => true).catch(() => false);
      if (exists && !options.confirmOverwrite) collisions.push(relOut);
    }

    if (collisions.length) {
      throw new Error(`Overwrite confirmation required. Collisions: ${collisions.join(", ")}`);
    }

    for (const entry of entries) {
      const normalized = entry.entryName.replace(/\\/g, "/");
      const absOut = resolveSafePath(path.join(this.pluginsDirRel, normalized), options.serverRoot);
      await fs.mkdir(path.dirname(absOut), { recursive: true });
      await fs.writeFile(absOut, entry.getData());
      changed.push(toRelativePath(absOut, options.serverRoot));
    }

    return { changed, restartRequired: true };
  }

  async remove(options: { pluginId: string; deleteConfig?: boolean; serverRoot?: string }): Promise<InstallResult> {
    const pluginsDir = this.pluginsDirAbs(options.serverRoot);
    const changed: string[] = [];
    const jarPath = path.join(pluginsDir, `${options.pluginId}.jar`);
    const folderPath = path.join(pluginsDir, options.pluginId);

    if (await fs.stat(jarPath).then(() => true).catch(() => false)) {
      await fs.rm(jarPath, { force: true });
      changed.push(toRelativePath(jarPath, options.serverRoot));
    }

    if (await fs.stat(folderPath).then(() => true).catch(() => false)) {
      await fs.rm(folderPath, { recursive: true, force: true });
      changed.push(toRelativePath(folderPath, options.serverRoot));
    }

    if (options.deleteConfig) {
      const yml = path.join(pluginsDir, `${options.pluginId}.yml`);
      if (await fs.stat(yml).then(() => true).catch(() => false)) {
        await fs.rm(yml, { force: true });
        changed.push(toRelativePath(yml, options.serverRoot));
      }
    }

    return { changed, restartRequired: true };
  }
}
