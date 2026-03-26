import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import cors from "cors";
import { appConfig } from "./config.js";
import { AuditLogService } from "./services/AuditLogService.js";
import { AuthService } from "./services/AuthService.js";
import { BackupService } from "./services/BackupService.js";
import { ConfigValidationService } from "./services/ConfigValidationService.js";
import { FileService } from "./services/FileService.js";
import { JobsService } from "./services/JobsService.js";
import { MetricsService } from "./services/MetricsService.js";
import { MultiServerRuntimeService } from "./services/MultiServerRuntimeService.js";
import { NodeExecutionService } from "./services/NodeExecutionService.js";
import { NodeService } from "./services/NodeService.js";
import { NotificationService } from "./services/NotificationService.js";
import { PlatformDataService } from "./services/PlatformDataService.js";
import { PluginService } from "./services/PluginService.js";
import { ModService } from "./services/ModService.js";
import { ServerInstallService } from "./services/ServerInstallService.js";
import { ServerRegistryService } from "./services/ServerRegistryService.js";
import { ServerAdminService } from "./services/ServerAdminService.js";
import { ServerSettingsService } from "./services/ServerSettingsService.js";
import { TokenService } from "./services/TokenService.js";
import { VersionCatalogService } from "./services/VersionCatalogService.js";
import { WebSocketHub } from "./services/WebSocketHub.js";
import { authMiddleware } from "./middleware/auth.js";
import { createAuditRoutes } from "./routes/auditRoutes.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createBackupRoutes } from "./routes/backupRoutes.js";
import { createBulkRoutes } from "./routes/bulkRoutes.js";
import { createCatalogRoutes } from "./routes/catalogRoutes.js";
import { createConsoleRoutes } from "./routes/consoleRoutes.js";
import { createConfigRoutes } from "./routes/configRoutes.js";
import { createFileRoutes } from "./routes/fileRoutes.js";
import { createJobRoutes, runDueJobs } from "./routes/jobRoutes.js";
import { createMetricsRoutes } from "./routes/metricsRoutes.js";
import { createNodeRoutes } from "./routes/nodeRoutes.js";
import { createNotificationRoutes } from "./routes/notificationRoutes.js";
import { createPluginRoutes } from "./routes/pluginRoutes.js";
import { createModRoutes } from "./routes/modRoutes.js";
import { createServerRegistryRoutes } from "./routes/serverRegistryRoutes.js";
import { createServerRoutes } from "./routes/serverRoutes.js";
import { createTokenRoutes } from "./routes/tokenRoutes.js";
import { createUserRoutes } from "./routes/userRoutes.js";
import { validateStartup } from "./utils/startupValidation.js";

const app = express();
const server = http.createServer(app);
const ws = new WebSocketHub(server);

validateStartup();

const platform = new PlatformDataService();
const servers = new ServerRegistryService();
const auth = new AuthService();
const tokens = new TokenService(platform);
const settings = new ServerSettingsService();
const runtime = new MultiServerRuntimeService(settings);
const admin = new ServerAdminService(runtime);
const audit = new AuditLogService(platform);
const files = new FileService();
const configValidation = new ConfigValidationService();
const plugins = new PluginService();
const mods = new ModService();
const installer = new ServerInstallService();
const versionCatalog = new VersionCatalogService();
const nodes = new NodeService(platform);
const notifications = new NotificationService(platform);
const backups = new BackupService(platform);
const jobs = new JobsService(platform);
const metrics = new MetricsService(platform);
const nodeExec = new NodeExecutionService(nodes, runtime, settings);

const ctx = {
  runtime,
  settings,
  servers,
  auth,
  installer,
  admin,
  versionCatalog,
  audit,
  files,
  configValidation,
  plugins,
  mods,
  platform,
  nodes,
  notifications,
  backups,
  jobs,
  metrics,
  tokens,
  nodeExec,
  ws
};

runtime.onConsole(({ serverId, line }) => {
  ws.broadcast({ channel: "console:stream", event: "console:line", data: line, serverId });
});

runtime.onStatus(({ serverId, status }) => {
  ws.broadcast({ channel: "console:stream", event: "server:status", data: status, serverId });
});

app.use(cors());
if (appConfig.trustProxy) app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware(auth, tokens));

app.get("/api/panel/info", (_req, res) => {
  res.json({
    mode: "dev",
    auth: "enabled",
    insecure: true,
    host: appConfig.host,
    port: appConfig.port,
    publicUrl: appConfig.publicUrl,
    serverRoot: appConfig.serverRoot,
    maxConcurrentOps: appConfig.maxConcurrentOps
  });
});

app.use("/api/server", createServerRoutes(ctx));
app.use("/api/servers", createServerRegistryRoutes(ctx));
app.use("/api", createCatalogRoutes(ctx));
app.use("/api/auth", createAuthRoutes(ctx));
app.use("/api/audit", createAuditRoutes(ctx));
app.use("/api/backups", createBackupRoutes(ctx));
app.use("/api/bulk", createBulkRoutes(ctx));
app.use("/api/users", createUserRoutes(ctx));
app.use("/api/console", createConsoleRoutes(ctx));
app.use("/api/files", createFileRoutes(ctx));
app.use("/api/jobs", createJobRoutes(ctx));
app.use("/api/metrics", createMetricsRoutes(ctx));
app.use("/api/nodes", createNodeRoutes(ctx));
app.use("/api/notifications", createNotificationRoutes(ctx));
app.use("/api/plugins", createPluginRoutes(ctx));
app.use("/api/mods", createModRoutes(ctx));
app.use("/api/tokens", createTokenRoutes(ctx));
app.use("/api/config", createConfigRoutes(ctx));

setInterval(() => {
  void runDueJobs(ctx);
}, 30_000);

setInterval(() => {
  for (const serverEntry of servers.list()) {
    const status = runtime.getStatus(serverEntry.id);
    metrics.collect({
      nodeId: serverEntry.nodeId,
      serverId: serverEntry.id,
      running: status.running,
      uptimeMs: status.uptimeMs,
      pid: status.pid
    });
  }
}, 60_000);

const clientDist = path.resolve(process.cwd(), "../client/dist");
app.use(express.static(clientDist));
app.get("*", async (_req, res, next) => {
  try {
    const indexPath = path.join(clientDist, "index.html");
    await fs.access(indexPath);
    res.sendFile(indexPath);
  } catch {
    next();
  }
});

server.listen(appConfig.port, appConfig.host, () => {
  console.log(
    `Panel listening on http://${appConfig.host}:${appConfig.port} (dev-mode insecure, single server root: ${appConfig.serverRoot})`
  );
});
