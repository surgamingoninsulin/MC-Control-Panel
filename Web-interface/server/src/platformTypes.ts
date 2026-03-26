export type NodeCapabilitySet = {
  runtime: boolean;
  files: boolean;
  backups: boolean;
  metrics: boolean;
  docker: boolean;
};

export type NodeRecord = {
  id: string;
  name: string;
  kind: "local" | "agent";
  host: string;
  baseUrl: string;
  authToken: string | null;
  status: "online" | "offline";
  capabilities: NodeCapabilitySet;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiTokenScope =
  | "servers.read"
  | "servers.write"
  | "files.read"
  | "files.write"
  | "jobs.read"
  | "jobs.write"
  | "backups.read"
  | "backups.write"
  | "metrics.read"
  | "audit.read"
  | "notifications.read"
  | "notifications.write"
  | "admin";

export type ApiTokenRecord = {
  id: string;
  userId: string;
  label: string;
  tokenHash: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
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

export type JobKind = "backup" | "start" | "stop" | "restart" | "command";

export type ScheduledJob = {
  id: string;
  serverId: string;
  nodeId: string;
  name: string;
  kind: JobKind;
  enabled: boolean;
  scheduleType: "interval";
  intervalMinutes: number;
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
  kind: JobKind;
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

export type BulkActionGroup = {
  id: string;
  action: "start" | "stop" | "restart" | "update" | "backup";
  createdAt: string;
  createdBy: string;
  targetServerIds: string[];
  completedServerIds: string[];
  failed: Array<{ serverId: string; reason: string }>;
};

export type PlatformState = {
  version: number;
  nodes: NodeRecord[];
  apiTokens: ApiTokenRecord[];
  backupRecords: BackupRecord[];
  scheduledJobs: ScheduledJob[];
  jobRuns: JobRun[];
  notifications: NotificationRecord[];
  notificationPreferences: NotificationPreference[];
  auditEvents: AuditEvent[];
  metricsSamples: MetricsSample[];
  bulkActionGroups: BulkActionGroup[];
};
