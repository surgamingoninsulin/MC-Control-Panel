import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const CONFIG_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PACKAGE_DIR = path.resolve(CONFIG_FILE_DIR, "..");
const WEB_INTERFACE_DIR = path.resolve(SERVER_PACKAGE_DIR, "..");
const PROJECT_ROOT_DIR = path.resolve(WEB_INTERFACE_DIR, "..");

const pickProjectServersDir = (): string => {
  const upper = path.resolve(PROJECT_ROOT_DIR, "Servers");
  if (fs.existsSync(upper)) return upper;
  return path.resolve(PROJECT_ROOT_DIR, "servers");
};

const resolveConfiguredPath = (value: string | undefined, fallbackAbs: string): string => {
  const raw = String(value || "").trim();
  if (!raw) return fallbackAbs;
  if (path.isAbsolute(raw)) return path.resolve(raw);
  const fromProjectRoot = path.resolve(PROJECT_ROOT_DIR, raw);
  const fromServerPackage = path.resolve(SERVER_PACKAGE_DIR, raw);
  const fromWebInterface = path.resolve(WEB_INTERFACE_DIR, raw);
  if (fs.existsSync(fromProjectRoot)) return fromProjectRoot;
  if (fs.existsSync(fromServerPackage)) return fromServerPackage;
  if (fs.existsSync(fromWebInterface)) return fromWebInterface;
  return fromProjectRoot;
};

const DEFAULT_SERVER_ROOT = pickProjectServersDir();
const DEFAULT_SERVERS_ROOT = DEFAULT_SERVER_ROOT;
const DEFAULT_PANEL_DATA = path.resolve(SERVER_PACKAGE_DIR, "data");
const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

const resolvedServersRoot = resolveConfiguredPath(process.env.SERVERS_ROOT, DEFAULT_SERVERS_ROOT);
const configuredServerRoot = resolveConfiguredPath(process.env.SERVER_ROOT, DEFAULT_SERVER_ROOT);
const resolvedServerRoot = fs.existsSync(configuredServerRoot) ? configuredServerRoot : resolvedServersRoot;
const resolvedPanelDataDir = resolveConfiguredPath(process.env.PANEL_DATA_DIR, DEFAULT_PANEL_DATA);

export const appConfig = {
  port: Number(process.env.APP_BIND_PORT || process.env.PORT || 4200),
  host: process.env.APP_BIND_HOST || process.env.HOST || "127.0.0.1",
  serverRoot: resolvedServerRoot,
  serversRoot: resolvedServersRoot,
  panelDataDir: resolvedPanelDataDir,
  startCommand: process.env.START_COMMAND || "",
  javaBinary: process.env.JAVA_BINARY || "java",
  serverJar: process.env.SERVER_JAR || "purpur.jar",
  useNogui: toBoolean(process.env.USE_NOGUI, true),
  ramAutoEnabled: toBoolean(process.env.RAM_AUTO_ENABLED, true),
  ramBaseGb: toNumber(process.env.RAM_BASE_GB, 2),
  ramReserveOsGb: toNumber(process.env.RAM_RESERVE_OS_GB, 2),
  ramMinGb: toNumber(process.env.RAM_MIN_GB, 2),
  ramMaxGb: toNumber(process.env.RAM_MAX_GB, 12),
  ramPerPluginMb: toNumber(process.env.RAM_PER_PLUGIN_MB, 50),
  ramPerWhitelistedPlayerMb: toNumber(process.env.RAM_PER_WHITELISTED_PLAYER_MB, 120),
  ramXmsRatio: toNumber(process.env.RAM_XMS_RATIO, 0.5),
  uploadLimitMb: Number(process.env.UPLOAD_LIMIT_MB || 64),
  maxConcurrentOps: Number(process.env.MAX_CONCURRENT_OPS || 3),
  blockExtensions:
    process.env.BLOCK_EXTENSIONS?.split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean) || [],
  logFile: process.env.AUDIT_LOG_FILE || "panel-audit.log",
  maxSupportedVersion: process.env.MAX_SUPPORTED_VERSION || "1.21.11",
  panelBaseUrl: process.env.PANEL_BASE_URL || `http://${process.env.APP_BIND_HOST || process.env.HOST || "127.0.0.1"}:${process.env.APP_BIND_PORT || process.env.PORT || 4200}`,
  publicUrl: process.env.APP_PUBLIC_URL || process.env.PANEL_BASE_URL || `http://${process.env.APP_BIND_HOST || process.env.HOST || "127.0.0.1"}:${process.env.APP_BIND_PORT || process.env.PORT || 4200}`,
  trustProxy: toBoolean(process.env.APP_TRUST_PROXY, false),
  cookieSecure: toBoolean(process.env.COOKIE_SECURE, false),
  cookieSameSite: process.env.COOKIE_SAME_SITE || "Lax",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: toBoolean(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || ""
};
