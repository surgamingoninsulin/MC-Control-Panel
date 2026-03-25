export type ConsoleLine = {
  cursor: number;
  ts: string;
  source: "stdout" | "stderr" | "system";
  line: string;
};

export type ServerStatus = {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  uptimeMs: number;
  phase?: "offline" | "starting" | "online" | "stopping" | "restarting";
  serverId?: string;
  serverName?: string;
};

export type ServerSettings = {
  startupScript: string;
  autoRestart: boolean;
  ramMinGb: number | null;
  ramMaxGb: number | null;
  serverIp: string;
  serverPort: number | null;
  playitEnabled: boolean;
  playitCommand: string;
};

export type PlayerRecord = {
  uuid: string;
  name: string;
  whitelisted: boolean;
  operator: boolean;
  opLevel: number | null;
  bypassesPlayerLimit: boolean;
  headUrl: string;
};

export type EulaState = {
  accepted: boolean;
  path: string;
  link: string;
  mtime: string | null;
};

export type ServerPropertyField = {
  key: string;
  value: string;
  control: "boolean" | "number" | "select" | "text";
  category: "access" | "world" | "gameplay" | "network" | "performance" | "advanced";
  label: string;
  options?: string[];
  isCustom?: boolean;
};

export type ServerPropertiesState = {
  path: string;
  mtime: string | null;
  fields: ServerPropertyField[];
};

export type StartServerResult =
  | { kind: "started"; status: ServerStatus }
  | { kind: "eula_required"; eula: EulaState };

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime?: string;
};

export type PluginEntry = {
  pluginId: string;
  jarPath?: string;
  folderPath?: string;
};

export type ModEntry = {
  modId: string;
  jarPath: string;
};

export type ServerInstallType = "vanilla" | "paper" | "spigot" | "purpur" | "forge" | "neoforge" | "fabric";

export type ServerProfile = {
  id: string;
  name: string;
  nameKey: string;
  type: ServerInstallType;
  version: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export type ServerAddonSummary = {
  mode: "plugins" | "mods" | "none";
  items: string[];
};

export type ServerTypeOption = {
  id: string;
  label: string;
  enabled: boolean;
  tooltip?: string;
};

export type UserRole = "owner" | "admin" | "viewer";

export type UserRecord = {
  id: string;
  username: string;
  usernameKey: string;
  email: string;
  emailKey: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};
