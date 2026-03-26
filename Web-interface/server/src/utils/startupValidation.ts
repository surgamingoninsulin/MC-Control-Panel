import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { appConfig } from "../config.js";

export const validateStartup = (): void => {
  const nodeMajor = Number(process.versions.node.split(".")[0] || 0);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
    throw new Error(`Node.js 20+ is required. Detected ${process.versions.node}.`);
  }

  fs.mkdirSync(appConfig.panelDataDir, { recursive: true });
  fs.mkdirSync(appConfig.serversRoot, { recursive: true });
  fs.accessSync(appConfig.panelDataDir, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(appConfig.serversRoot, fs.constants.R_OK | fs.constants.W_OK);

  const javaCheck = spawnSync(appConfig.javaBinary, ["-version"], { encoding: "utf8" });
  if (javaCheck.error) {
    throw new Error(`Java runtime check failed: ${javaCheck.error.message}`);
  }

  if (!/^https?:\/\//i.test(appConfig.publicUrl)) {
    throw new Error("APP_PUBLIC_URL must start with http:// or https://");
  }
};
