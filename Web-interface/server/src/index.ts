import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import cors from "cors";
import { appConfig } from "./config.js";
import { AuditLogService } from "./services/AuditLogService.js";
import { AuthService } from "./services/AuthService.js";
import { ConfigValidationService } from "./services/ConfigValidationService.js";
import { FileService } from "./services/FileService.js";
import { MultiServerRuntimeService } from "./services/MultiServerRuntimeService.js";
import { PluginService } from "./services/PluginService.js";
import { ModService } from "./services/ModService.js";
import { ServerInstallService } from "./services/ServerInstallService.js";
import { ServerRegistryService } from "./services/ServerRegistryService.js";
import { ServerSettingsService } from "./services/ServerSettingsService.js";
import { VersionCatalogService } from "./services/VersionCatalogService.js";
import { WebSocketHub } from "./services/WebSocketHub.js";
import { authMiddleware } from "./middleware/auth.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createCatalogRoutes } from "./routes/catalogRoutes.js";
import { createConsoleRoutes } from "./routes/consoleRoutes.js";
import { createConfigRoutes } from "./routes/configRoutes.js";
import { createFileRoutes } from "./routes/fileRoutes.js";
import { createPluginRoutes } from "./routes/pluginRoutes.js";
import { createModRoutes } from "./routes/modRoutes.js";
import { createServerRegistryRoutes } from "./routes/serverRegistryRoutes.js";
import { createServerRoutes } from "./routes/serverRoutes.js";
import { createUserRoutes } from "./routes/userRoutes.js";

const app = express();
const server = http.createServer(app);
const ws = new WebSocketHub(server);

const servers = new ServerRegistryService();
const auth = new AuthService();
const settings = new ServerSettingsService();
const runtime = new MultiServerRuntimeService(settings);
const audit = new AuditLogService();
const files = new FileService();
const configValidation = new ConfigValidationService();
const plugins = new PluginService();
const mods = new ModService();
const installer = new ServerInstallService();
const versionCatalog = new VersionCatalogService();

const ctx = {
  runtime,
  settings,
  servers,
  auth,
  installer,
  versionCatalog,
  audit,
  files,
  configValidation,
  plugins,
  mods,
  ws
};

runtime.onConsole(({ serverId, line }) => {
  ws.broadcast({ channel: "console:stream", event: "console:line", data: line, serverId });
});

runtime.onStatus(({ serverId, status }) => {
  ws.broadcast({ channel: "console:stream", event: "server:status", data: status, serverId });
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware(auth));

app.get("/api/panel/info", (_req, res) => {
  res.json({
    mode: "dev",
    auth: "enabled",
    insecure: true,
    host: appConfig.host,
    port: appConfig.port,
    serverRoot: appConfig.serverRoot,
    maxConcurrentOps: appConfig.maxConcurrentOps
  });
});

app.use("/api/server", createServerRoutes(ctx));
app.use("/api/servers", createServerRegistryRoutes(ctx));
app.use("/api", createCatalogRoutes(ctx));
app.use("/api/auth", createAuthRoutes(ctx));
app.use("/api/users", createUserRoutes(ctx));
app.use("/api/console", createConsoleRoutes(ctx));
app.use("/api/files", createFileRoutes(ctx));
app.use("/api/plugins", createPluginRoutes(ctx));
app.use("/api/mods", createModRoutes(ctx));
app.use("/api/config", createConfigRoutes(ctx));

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
