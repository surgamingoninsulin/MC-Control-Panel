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
  name?: string;
  version?: string;
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
  nodeId?: string;
  runtimeMode?: "process" | "docker";
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export type ServerAddonSummary = {
  mode: "plugins" | "mods" | "none";
  items: Array<{ name: string; version?: string }>;
};

export type ServerTypeOption = {
  id: string;
  label: string;
  enabled: boolean;
  tooltip?: string;
};

export type ServerIconEntry = {
  file: string;
  isDefault: boolean;
  url: string;
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
  twoFactorEnabled?: boolean;
  recoveryKeysRemaining?: number;
  tempPasswordExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackupRecord = {
  id: string;
  serverId: string;
  nodeId: string;
  filePath: string;
  kind: "manual" | "scheduled" | "pre-restore";
  status: "ready" | "failed" | "restoring";
  size: number;
  checksum: string | null;
  createdAt: string;
  createdBy: string;
  restoreSourceBackupId: string | null;
  error: string | null;
};

export type ScheduledJob = {
  id: string;
  serverId: string;
  nodeId: string;
  name: string;
  kind: "backup" | "start" | "stop" | "restart" | "command";
  enabled: boolean;
  scheduleType: "interval" | "daily_time";
  intervalMinutes: number;
  timeOfDay: string | null;
  command: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export type JobRun = {
  id: string;
  jobId: string | null;
  serverId: string;
  nodeId: string;
  kind: "backup" | "start" | "stop" | "restart" | "command";
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
};

export type NotificationRecord = {
  id: string;
  userId: string | null;
  severity: "info" | "warn" | "error" | "success";
  category: "server" | "backup" | "job" | "security" | "node" | "system";
  title: string;
  body: string;
  serverId: string | null;
  nodeId: string | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreference = {
  userId: string;
  inApp: boolean;
  email: boolean;
  webhook: boolean;
};

export type AuditEvent = {
  id: string;
  at: string;
  action: string;
  actor: string;
  serverId: string | null;
  nodeId: string | null;
  result: "ok" | "error";
  details: Record<string, unknown>;
};

export type MetricsSample = {
  id: string;
  nodeId: string;
  serverId: string | null;
  createdAt: string;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedMb: number;
  diskTotalMb: number;
  uptimeMs: number;
  running: boolean;
  pid: number | null;
  backupStorageMb: number;
  recentJobFailures: number;
};

export type NodeRecord = {
  id: string;
  name: string;
  kind: "local" | "agent";
  host: string;
  baseUrl: string;
  authToken: string | null;
  status: "online" | "offline";
  capabilities: {
    runtime: boolean;
    files: boolean;
    backups: boolean;
    metrics: boolean;
    docker: boolean;
  };
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};
