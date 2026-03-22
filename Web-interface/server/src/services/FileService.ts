import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafePath, rejectBlockedExtension, toRelativePath } from "../utils/pathUtils.js";

type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime?: string;
};

export class FileService {
  async tree(inputPath: string, serverRoot?: string): Promise<FileTreeNode[]> {
    const abs = resolveSafePath(inputPath, serverRoot);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const out: FileTreeNode[] = [];

    for (const entry of entries) {
      const absEntry = path.join(abs, entry.name);
      const rel = toRelativePath(absEntry, serverRoot);
      if (entry.isDirectory()) {
        out.push({ name: entry.name, path: rel, type: "directory" });
      } else if (entry.isFile()) {
        const stat = await fs.stat(absEntry);
        out.push({
          name: entry.name,
          path: rel,
          type: "file",
          size: stat.size,
          mtime: stat.mtime.toISOString()
        });
      }
    }

    return out.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async read(inputPath: string, encoding: BufferEncoding = "utf8", serverRoot?: string): Promise<{
    path: string;
    content: string;
    mtime: string;
  }> {
    const abs = resolveSafePath(inputPath, serverRoot);
    const stat = await fs.stat(abs);
    if (!stat.isFile()) throw new Error("Path is not a file.");
    const content = await fs.readFile(abs, encoding);
    return { path: toRelativePath(abs, serverRoot), content, mtime: stat.mtime.toISOString() };
  }

  async write(params: {
    path: string;
    content: string;
    encoding?: BufferEncoding;
    expectedMtime?: string;
    serverRoot?: string;
  }): Promise<{ mtime: string }> {
    rejectBlockedExtension(params.path);
    const abs = resolveSafePath(params.path, params.serverRoot);
    const dir = path.dirname(abs);
    await fs.mkdir(dir, { recursive: true });

    if (params.expectedMtime) {
      const current = await fs.stat(abs).catch(() => null);
      if (current && current.mtime.toISOString() !== params.expectedMtime) {
        throw new Error("File was modified by another process.");
      }
    }

    await fs.writeFile(abs, params.content, params.encoding || "utf8");
    const stat = await fs.stat(abs);
    return { mtime: stat.mtime.toISOString() };
  }

  async mkdir(inputPath: string, serverRoot?: string): Promise<void> {
    const abs = resolveSafePath(inputPath, serverRoot);
    await fs.mkdir(abs, { recursive: true });
  }

  async move(from: string, to: string, serverRoot?: string): Promise<void> {
    rejectBlockedExtension(from);
    rejectBlockedExtension(to);
    const absFrom = resolveSafePath(from, serverRoot);
    const absTo = resolveSafePath(to, serverRoot);
    await fs.mkdir(path.dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
  }

  async remove(paths: string[], serverRoot?: string): Promise<void> {
    for (const inputPath of paths) {
      rejectBlockedExtension(inputPath);
      const abs = resolveSafePath(inputPath, serverRoot);
      await fs.rm(abs, { recursive: true, force: true });
    }
  }

  async upload(targetPath: string, files: Express.Multer.File[], serverRoot?: string): Promise<string[]> {
    const absTarget = resolveSafePath(targetPath, serverRoot);
    await fs.mkdir(absTarget, { recursive: true });
    const saved: string[] = [];

    for (const file of files) {
      rejectBlockedExtension(file.originalname);
      const absOut = path.join(absTarget, path.basename(file.originalname));
      await fs.writeFile(absOut, file.buffer);
      saved.push(toRelativePath(absOut, serverRoot));
    }

    return saved;
  }
}
