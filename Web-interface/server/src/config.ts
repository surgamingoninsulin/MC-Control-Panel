import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_SERVER_ROOT = path.resolve(process.cwd(), "..", "..", "Server");
const DEFAULT_SERVERS_ROOT = path.resolve(process.cwd(), "..", "..", "Servers");
const DEFAULT_PANEL_DATA = path.resolve(process.cwd(), "data");
const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

export const appConfig = {
  port: Number(process.env.PORT || 4200),
  host: process.env.HOST || "127.0.0.1",
  serverRoot: path.resolve(process.env.SERVER_ROOT || DEFAULT_SERVER_ROOT),
  serversRoot: path.resolve(process.env.SERVERS_ROOT || DEFAULT_SERVERS_ROOT),
  panelDataDir: path.resolve(process.env.PANEL_DATA_DIR || DEFAULT_PANEL_DATA),
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
  panelBaseUrl: process.env.PANEL_BASE_URL || `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 4200}`,
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: toBoolean(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || ""
};
