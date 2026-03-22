import path from "node:path";
import { appConfig } from "../config.js";

const normalizeInputPath = (inputPath = "."): string => {
  const normalized = inputPath.replace(/\\/g, "/").trim();
  return normalized.startsWith("/") ? normalized.slice(1) : normalized;
};

export const resolveSafePath = (inputPath = ".", serverRoot = appConfig.serverRoot): string => {
  const rel = normalizeInputPath(inputPath);
  const abs = path.resolve(serverRoot, rel);
  const root = serverRoot.endsWith(path.sep)
    ? serverRoot
    : `${serverRoot}${path.sep}`;

  if (abs !== serverRoot && !abs.startsWith(root)) {
    throw new Error("Path is outside SERVER_ROOT.");
  }

  return abs;
};

export const toRelativePath = (absPath: string, serverRoot = appConfig.serverRoot): string => {
  const rel = path.relative(serverRoot, absPath).replace(/\\/g, "/");
  return rel || ".";
};

export const rejectBlockedExtension = (inputPath: string): void => {
  if (!appConfig.blockExtensions.length) return;
  const ext = path.extname(inputPath).toLowerCase();
  if (ext && appConfig.blockExtensions.includes(ext)) {
    throw new Error(`Extension "${ext}" is blocked by server policy.`);
  }
};
