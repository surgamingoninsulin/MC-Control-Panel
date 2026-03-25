import { AuditLogService } from "./services/AuditLogService.js";
import { ConfigValidationService } from "./services/ConfigValidationService.js";
import { FileService } from "./services/FileService.js";
import { PluginService } from "./services/PluginService.js";
import { AuthService } from "./services/AuthService.js";
import { MultiServerRuntimeService } from "./services/MultiServerRuntimeService.js";
import { ServerInstallService } from "./services/ServerInstallService.js";
import { ServerRegistryService } from "./services/ServerRegistryService.js";
import { ServerAdminService } from "./services/ServerAdminService.js";
import { ServerSettingsService } from "./services/ServerSettingsService.js";
import { VersionCatalogService } from "./services/VersionCatalogService.js";
import { ModService } from "./services/ModService.js";
import type { WebSocketHub } from "./services/WebSocketHub.js";

export type AppContext = {
  runtime: MultiServerRuntimeService;
  settings: ServerSettingsService;
  servers: ServerRegistryService;
  auth: AuthService;
  installer: ServerInstallService;
  admin: ServerAdminService;
  versionCatalog: VersionCatalogService;
  audit: AuditLogService;
  files: FileService;
  plugins: PluginService;
  mods: ModService;
  configValidation: ConfigValidationService;
  ws: WebSocketHub;
};
