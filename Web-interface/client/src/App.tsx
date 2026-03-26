import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "./api";
import type {
  ConsoleLine,
  EulaState,
  FileEntry,
  ModEntry,
  PlayerRecord,
  PluginEntry,
  ServerAddonSummary,
  ServerInstallType,
  ServerIconEntry,
  ServerProfile,
  ServerPropertiesState,
  ServerPropertyField,
  ServerSettings,
  ServerStatus,
  ServerTypeOption,
  UserRecord,
  UserRole
} from "./types";

type View = "console" | "players" | "files" | "plugins" | "settings" | "users";
type AddServerMode = "install" | "import";
type UiUserRole = "admin" | "viewer";

type ConfigEditorState = { path: string; content: string; originalContent: string; mtime: string };
const STORAGE_KEY_SETUP = "panel.setup.complete";
const STORAGE_KEY_LOGIN_EMAIL = "panel.login.email";
const STORAGE_KEY_LOGIN_PASSWORD = "panel.login.password";
const STORAGE_KEY_REMEMBER_EMAIL = "panel.login.remember.email";
const STORAGE_KEY_REMEMBER_PASSWORD = "panel.login.remember.password";
const STORAGE_KEY_REMEMBER_BOTH = "panel.login.remember.both";
const CONFIG_EXTENSIONS = new Set([".yml", ".yaml", ".json", ".toml", ".properties", ".ini", ".cfg", ".conf"]);
const DEFAULT_SETTINGS: ServerSettings = {
  startupScript: "",
  autoRestart: true,
  ramMinGb: null,
  ramMaxGb: null,
  serverIp: "",
  serverPort: null,
  playitEnabled: false,
  playitCommand: ""
};
const DEFAULT_PROPERTIES: ServerPropertiesState = {
  path: "server.properties",
  mtime: null,
  fields: []
};
const PROPERTY_CATEGORY_LABELS: Record<ServerPropertyField["category"], string> = {
  access: "Access",
  world: "World",
  gameplay: "Gameplay",
  network: "Network",
  performance: "Performance",
  advanced: "Advanced / Custom"
};
const PROPERTY_CATEGORY_DESCRIPTIONS: Record<ServerPropertyField["category"], string> = {
  access: "Player access, permissions, authentication, and operator-facing rules.",
  world: "World generation and persistent world behavior.",
  gameplay: "Core survival and player experience settings.",
  network: "Ports, MOTD, status visibility, and external connectivity.",
  performance: "Settings that affect load, ticking, and runtime efficiency.",
  advanced: "Specialized or custom properties that usually need extra care."
};
const PROPERTY_DESCRIPTIONS: Record<string, string> = {
  "accepts-transfers": "Allows server transfer support for compatible clients and services.",
  "allow-flight": "Lets players stay connected while flying, useful for modded servers and admins.",
  "broadcast-console-to-ops": "Sends console output to online operators.",
  "broadcast-rcon-to-ops": "Sends RCON output to online operators.",
  difficulty: "Sets the world difficulty for mobs, hunger, and damage balance.",
  "enable-query": "Enables the GameSpy query protocol for external server-list tools.",
  "enable-rcon": "Enables remote console access through the RCON protocol.",
  "enable-status": "Controls whether the server responds to status pings and server list checks.",
  "enforce-secure-profile": "Requires secure chat/player profiles for newer Minecraft versions.",
  "enforce-whitelist": "Kicks non-whitelisted players immediately when the whitelist is active.",
  "force-gamemode": "Forces players to join with the configured default gamemode.",
  gamemode: "Sets the default gamemode for new players and respawns.",
  hardcore: "Enables hardcore mode with permanent death behavior.",
  "hide-online-players": "Hides player counts and player lists from server-status pings.",
  "level-name": "Defines the folder name used for the main world save.",
  "level-seed": "Controls world generation using a custom seed value.",
  "level-type": "Chooses the world generation style such as normal or flat.",
  "management-server-enabled": "Enables the built-in management server features if supported by the jar.",
  "management-server-host": "Host binding used by the integrated management server.",
  "management-server-port": "Port used by the integrated management server.",
  "management-server-secret": "Secret token used to authorize management server access.",
  "management-server-tls-enabled": "Controls TLS for the integrated management server.",
  "max-players": "Maximum number of players allowed to join at the same time.",
  "max-tick-time": "Watchdog timeout before the server force-stops a frozen tick.",
  motd: "Message shown in the multiplayer server list.",
  "network-compression-threshold": "Packet compression threshold. Lower values compress more traffic.",
  "online-mode": "Validates players with Mojang/Microsoft authentication.",
  "op-permission-level": "Permission level granted to operators.",
  "pause-when-empty-seconds": "Pauses the world after the configured idle time with no players online.",
  "player-idle-timeout": "Automatically kicks players after being idle too long.",
  "prevent-proxy-connections": "Adds stricter checks for proxied or suspicious joins.",
  "query.port": "Port used by the query service when enabled.",
  "rate-limit": "Connection rate limit used to reduce abuse.",
  "rcon.password": "Password used to authenticate remote console clients.",
  "rcon.port": "Port used by remote console clients.",
  "server-ip": "Specific network interface the server should bind to.",
  "server-port": "Primary TCP port used by players to connect.",
  "simulation-distance": "How far entities and redstone stay active around players.",
  "spawn-protection": "Protected radius around world spawn for non-operators.",
  "sync-chunk-writes": "Writes chunk data synchronously for safer but slower saves.",
  "use-native-transport": "Uses the platform-native network transport when available.",
  "view-distance": "How far terrain is sent to players."
};

const propertyDescription = (field: ServerPropertyField): string =>
  PROPERTY_DESCRIPTIONS[field.key] || `Controls the "${field.label}" server property.`;

const isSensitiveProperty = (key: string): boolean => {
  const lower = key.toLowerCase();
  return lower.includes("secret") || lower.includes("password");
};

const isConfigPath = (pathValue: string): boolean => {
  const lower = pathValue.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 && CONFIG_EXTENSIONS.has(lower.slice(idx));
};

const formatUptime = (uptimeMs = 0): string => {
  const totalSec = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hours}h ${mins}m ${secs}s`;
};

const configLanguage = (pathValue: string): string => {
  const lower = pathValue.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".toml")) return "ini";
  if (lower.endsWith(".properties") || lower.endsWith(".ini") || lower.endsWith(".cfg") || lower.endsWith(".conf")) return "ini";
  return "plaintext";
};

const viewFromPath = (pathName: string): View => {
  const lower = String(pathName || "/").toLowerCase();
  if (lower === "/players") return "players";
  if (lower === "/files") return "files";
  if (lower === "/plugins-mods") return "plugins";
  if (lower === "/settings" || lower === "/server-management") return "settings";
  if (lower === "/users") return "users";
  return "console";
};

const pathFromView = (view: View): string => {
  if (view === "players") return "/players";
  if (view === "files") return "/files";
  if (view === "plugins") return "/plugins-mods";
  if (view === "settings") return "/server-management";
  if (view === "users") return "/users";
  return "/console";
};

const ModalCloseButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClick}>
    <i className="fa-solid fa-xmark" aria-hidden="true" />
  </button>
);

type UploadCandidate = { file: File; relativePath?: string };

const normalizeRelPath = (value: string): string =>
  String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();

const readDirectoryEntries = async (reader: any): Promise<any[]> => {
  const out: any[] = [];
  while (true) {
    const batch = await new Promise<any[]>((resolve) => {
      reader.readEntries((items: any[]) => resolve(items || []), () => resolve([]));
    });
    if (!batch.length) break;
    out.push(...batch);
  }
  return out;
};

const walkDroppedEntry = async (entry: any, parentPath = ""): Promise<UploadCandidate[]> => {
  if (!entry) return [];
  if (entry.isFile) {
    return await new Promise<UploadCandidate[]>((resolve) => {
      entry.file(
        (file: File) => {
          const rel = normalizeRelPath(parentPath ? `${parentPath}/${file.name}` : file.name);
          resolve([{ file, relativePath: rel }]);
        },
        () => resolve([])
      );
    });
  }
  if (entry.isDirectory) {
    const dirPath = normalizeRelPath(parentPath ? `${parentPath}/${entry.name}` : entry.name);
    const reader = entry.createReader();
    const children = await readDirectoryEntries(reader);
    const nested = await Promise.all(children.map((child) => walkDroppedEntry(child, dirPath)));
    return nested.flat();
  }
  return [];
};

const collectDroppedUploads = async (dt: DataTransfer): Promise<UploadCandidate[]> => {
  const items = Array.from(dt.items || []);
  const fromEntries: UploadCandidate[] = [];
  for (const item of items) {
    const getEntry = (item as any).webkitGetAsEntry?.bind(item as any);
    const entry = getEntry ? getEntry() : null;
    if (!entry) continue;
    const chunk = await walkDroppedEntry(entry);
    fromEntries.push(...chunk);
  }
  if (fromEntries.length) return fromEntries;

  const files = Array.from(dt.files || []);
  return files.map((file) => {
    const rel = "webkitRelativePath" in file ? normalizeRelPath(String(file.webkitRelativePath || "")) : "";
    return { file, relativePath: rel || file.name };
  });
};

export default function App() {
  const [activeView, setActiveView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [message, setMessage] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalDetail, setInfoModalDetail] = useState("");

  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(() => localStorage.getItem(STORAGE_KEY_SETUP) !== "1");
  const [setupStep, setSetupStep] = useState(0);
  const [setupError, setSetupError] = useState("");
  const [setupUsername, setSetupUsername] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupServerName, setSetupServerName] = useState("");
  const [setupServerType, setSetupServerType] = useState<ServerInstallType | "">("");
  const [setupVersion, setSetupVersion] = useState("");
  const [setupRecoveryKeys, setSetupRecoveryKeys] = useState<string[]>([]);

  const [loginUsername, setLoginUsername] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_EMAIL) || "");
  const [loginPassword, setLoginPassword] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_PASSWORD) || "");
  const [rememberEmail, setRememberEmail] = useState(
    () => localStorage.getItem(STORAGE_KEY_REMEMBER_EMAIL) === "1" || localStorage.getItem(STORAGE_KEY_REMEMBER_BOTH) === "1"
  );
  const [rememberPassword, setRememberPassword] = useState(
    () => localStorage.getItem(STORAGE_KEY_REMEMBER_PASSWORD) === "1" || localStorage.getItem(STORAGE_KEY_REMEMBER_BOTH) === "1"
  );
  const [loginError, setLoginError] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotRecoveryKey, setForgotRecoveryKey] = useState("");
  const [forgotModalNotice, setForgotModalNotice] = useState("");
  const [forgotModalError, setForgotModalError] = useState("");
  const [needsRecoveryKeyRegeneration, setNeedsRecoveryKeyRegeneration] = useState(false);
  const [showRecoveryKeysModal, setShowRecoveryKeysModal] = useState(false);
  const [recoveryKeysModalTitle, setRecoveryKeysModalTitle] = useState("Recovery Keys");
  const [recoveryKeysModalKeys, setRecoveryKeysModalKeys] = useState<string[]>([]);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [serverSettings, setServerSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [serverProperties, setServerProperties] = useState<ServerPropertiesState>(DEFAULT_PROPERTIES);
  const [eulaState, setEulaState] = useState<EulaState | null>(null);
  const [newPropertyKey, setNewPropertyKey] = useState("");
  const [newPropertyValue, setNewPropertyValue] = useState("");
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [consoleCursor, setConsoleCursor] = useState(0);
  const [consoleCommand, setConsoleCommand] = useState("");
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleAutoScroll, setConsoleAutoScroll] = useState(true);
  const [serverActionBusy, setServerActionBusy] = useState(false);
  const consoleScrollRef = useRef<HTMLDivElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<ServerProfile | null>(null);
  const [showRenameServerModal, setShowRenameServerModal] = useState(false);
  const [serverToRename, setServerToRename] = useState<ServerProfile | null>(null);
  const [renameServerName, setRenameServerName] = useState("");
  const [updatingServerId, setUpdatingServerId] = useState("");
  const [hoveredServerId, setHoveredServerId] = useState("");
  const [serverAddonSummaries, setServerAddonSummaries] = useState<Record<string, ServerAddonSummary | undefined>>({});
  const [serverAddonLoadingId, setServerAddonLoadingId] = useState("");
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [showServerAddonsModal, setShowServerAddonsModal] = useState(false);
  const [serverAddonsModalServerId, setServerAddonsModalServerId] = useState("");
  const [addServerMode, setAddServerMode] = useState<AddServerMode>("install");

  const [serverTypeOptions, setServerTypeOptions] = useState<ServerTypeOption[]>([]);
  const [setupVersionOptions, setSetupVersionOptions] = useState<string[]>([]);
  const [installVersionOptions, setInstallVersionOptions] = useState<string[]>([]);
  const [installName, setInstallName] = useState("");
  const [installType, setInstallType] = useState<ServerInstallType | "">("");
  const [installVersion, setInstallVersion] = useState("");
  const [iconDatabaseEntries, setIconDatabaseEntries] = useState<ServerIconEntry[]>([]);
  const [installIconFile, setInstallIconFile] = useState("");
  const [importIconFile, setImportIconFile] = useState("");
  const [iconPickerTarget, setIconPickerTarget] = useState<"install" | "import">("install");
  const [showInstallIconModal, setShowInstallIconModal] = useState(false);
  const [installIconModalSelectedFile, setInstallIconModalSelectedFile] = useState("");
  const [installIconModalUpload, setInstallIconModalUpload] = useState<File | null>(null);
  const installIconRef = useRef<HTMLInputElement>(null);
  const [importName, setImportName] = useState("");
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const importRef = useRef<HTMLInputElement>(null);

  const [filesPath, setFilesPath] = useState(".");
  const [filesEntries, setFilesEntries] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [configEditor, setConfigEditor] = useState<ConfigEditorState | null>(null);
  const [configEditorError, setConfigEditorError] = useState("");
  const [showCreateFsModal, setShowCreateFsModal] = useState(false);
  const [createFsType, setCreateFsType] = useState<"" | "file" | "folder">("");
  const [createFsName, setCreateFsName] = useState("");
  const [createFsError, setCreateFsError] = useState("");

  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [selectedAddonKeys, setSelectedAddonKeys] = useState<string[]>([]);
  const [deletePluginConfigOnRemove, setDeletePluginConfigOnRemove] = useState(true);
  const pluginBrowseRef = useRef<HTMLInputElement>(null);
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [modsLoading, setModsLoading] = useState(false);
  const modBrowseRef = useRef<HTMLInputElement>(null);

  const [dragOverlayVisible, setDragOverlayVisible] = useState(false);
  const dragCounterRef = useRef(0);
  const activeViewRef = useRef<View>("console");
  const filesPathRef = useRef(".");

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userRoleDraft, setUserRoleDraft] = useState<Record<string, UserRole>>({});
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UiUserRole>("viewer");
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [forcePassword, setForcePassword] = useState("");
  const [forcePasswordConfirm, setForcePasswordConfirm] = useState("");
  const [forcePasswordError, setForcePasswordError] = useState("");
  const [showForcePassword, setShowForcePassword] = useState(false);
  const [showForcePasswordConfirm, setShowForcePasswordConfirm] = useState(false);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [addPlayerUsername, setAddPlayerUsername] = useState("");
  const [addPlayerWhitelisted, setAddPlayerWhitelisted] = useState(true);
  const [addPlayerOperator, setAddPlayerOperator] = useState(false);
  const [addPlayerBusy, setAddPlayerBusy] = useState(false);
  const [showEulaModal, setShowEulaModal] = useState(false);
  const [revealedPropertyKeys, setRevealedPropertyKeys] = useState<Record<string, boolean>>({});

  const canManageUsers = currentUser?.role === "owner" || currentUser?.role === "admin";
  const canEditUsers = currentUser?.role === "owner";
  const canOperateServer = currentUser?.role === "owner" || currentUser?.role === "admin";
  const activeServer = servers.find((s) => s.id === selectedServerId) || null;
  const serverPhase = status?.phase || (status?.running ? "online" : "offline");
  const isStarting = serverPhase === "starting";
  const isStopping = serverPhase === "stopping";
  const isRestarting = serverPhase === "restarting";
  const isOnline = serverPhase === "online";
  const disableStart = serverActionBusy || isStarting || isOnline || isStopping || isRestarting;
  const disableStop = serverActionBusy || !isOnline;
  const disableRestart = serverActionBusy || !isOnline;
  const addonsEnabled = !!activeServer && activeServer.type !== "vanilla";
  const addonsMode: "plugins" | "mods" | "none" =
    !activeServer || activeServer.type === "vanilla"
      ? "none"
      : activeServer.type === "paper" || activeServer.type === "spigot" || activeServer.type === "purpur"
        ? "plugins"
        : "mods";

  const loadMe = async () => {
    try {
      const out = await api.authMe();
      setCurrentUser(out.user);
      setIsAuthenticated(true);
      return true;
    } catch {
      setCurrentUser(null);
      setIsAuthenticated(false);
      return false;
    }
  };

  const loadServers = async () => {
    const out = await api.listServers();
    setServers(out.servers);
    if (!selectedServerId && out.servers.length) setSelectedServerId(out.servers[0].id);
    if (selectedServerId && out.servers.length && !out.servers.some((s) => s.id === selectedServerId)) setSelectedServerId(out.servers[0].id);
  };

  const loadStatus = async () => { if (!selectedServerId) return; setStatus(await api.serverStatus()); };
  const loadServerSettings = async () => {
    if (!selectedServerId) return;
    const out = await api.getServerSettings();
    setServerSettings({
      startupScript: out.settings.startupScript || "",
      autoRestart: !!out.settings.autoRestart,
      ramMinGb: out.settings.ramMinGb ?? null,
      ramMaxGb: out.settings.ramMaxGb ?? null,
      serverIp: out.settings.serverIp || "",
      serverPort: out.settings.serverPort ?? null,
      playitEnabled: !!out.settings.playitEnabled,
      playitCommand: out.settings.playitCommand || ""
    });
  };
  const loadServerProperties = async () => {
    if (!selectedServerId) return;
    const out = await api.getServerProperties();
    setServerProperties({
      path: out.path,
      mtime: out.mtime,
      fields: out.fields
    });
  };
  const loadEula = async () => {
    if (!selectedServerId) return;
    const out = await api.getEula();
    setEulaState(out.eula);
  };
  const loadServerManagement = async () => {
    if (!selectedServerId) return;
    setSettingsLoading(true);
    try {
      await Promise.all([loadServerSettings(), loadServerProperties(), loadEula()]);
    } finally {
      setSettingsLoading(false);
    }
  };
  const loadConsoleHistory = async (cursor = 0) => {
    if (!selectedServerId) return;
    api.setActiveServerId(selectedServerId);
    const out = await api.consoleHistory(cursor);
    setConsoleLines((prev) => {
      if (!cursor) return out.lines as ConsoleLine[];
      const next = [...prev, ...(out.lines as ConsoleLine[])];
      const dedup = new Map(next.map((line) => [line.cursor, line]));
      return Array.from(dedup.values()).sort((a, b) => a.cursor - b.cursor);
    });
    setConsoleCursor(out.nextCursor || cursor);
  };

  const sendConsoleCommand = async () => {
    const command = consoleCommand.trim();
    if (!command) return;
    await api.sendCommand(command);
    setConsoleCommand("");
    await loadConsoleHistory(consoleCursor);
  };

  const loadTypes = async () => setServerTypeOptions((await api.getServerTypes()).types);
  const loadServerIcons = async () => {
    const out = await api.listServerIcons();
    setIconDatabaseEntries(out.icons);
    if (!installIconFile) {
      const defaultIcon = out.icons.find((entry) => entry.isDefault);
      if (defaultIcon) {
        setInstallIconModalSelectedFile(defaultIcon.file);
      }
    }
    return out.icons;
  };

  const loadVersions = async (type: ServerInstallType | "", target: "setup" | "install") => {
    if (!type) {
      if (target === "setup") setSetupVersionOptions([]);
      if (target === "install") setInstallVersionOptions([]);
      return;
    }
    const versions = (await api.getServerVersions(type)).versions;
    if (target === "setup") setSetupVersionOptions(versions);
    if (target === "install") setInstallVersionOptions(versions);
  };

  const loadFiles = async (nextPath = filesPath) => {
    setFilesLoading(true);
    try {
      const out = await api.listFiles(nextPath);
      setFilesPath(nextPath);
      setFilesEntries(out.entries);
      setSelectedPaths([]);
    } finally { setFilesLoading(false); }
  };

  const loadPlugins = async () => {
    setPluginsLoading(true);
    try {
      const out = await api.listPlugins();
      setPlugins(out.plugins);
      if (selectedServerId) {
        setServerAddonSummaries((prev) => ({
          ...prev,
          [selectedServerId]: {
            mode: "plugins",
            items: out.plugins.map((entry) => ({ name: entry.name || entry.pluginId, version: entry.version || "-" }))
          }
        }));
      }
      setSelectedAddonKeys((prev) => prev.filter((id) => !id.startsWith("plugin:") || out.plugins.some((p) => `plugin:${p.pluginId}` === id)));
    } finally { setPluginsLoading(false); }
  };

  const loadMods = async () => {
    setModsLoading(true);
    try {
      const out = await api.listMods();
      setMods(out.mods);
      if (selectedServerId) {
        setServerAddonSummaries((prev) => ({
          ...prev,
          [selectedServerId]: { mode: "mods", items: out.mods.map((entry) => ({ name: entry.modId, version: "-" })) }
        }));
      }
      setSelectedAddonKeys((prev) => prev.filter((id) => !id.startsWith("mod:") || out.mods.some((m) => `mod:${m.modId}` === id)));
    } finally { setModsLoading(false); }
  };

  const refreshUsers = async () => {
    if (!canManageUsers) return;
    const out = await api.listUsers();
    setUsers(out.users);
    setUserRoleDraft(Object.fromEntries(out.users.map((u) => [u.id, u.role])));
  };
  const loadServerAddonSummary = async (server: ServerProfile) => {
    setServerAddonLoadingId(server.id);
    try {
      const out = await api.getServerAddonSummary(server.id);
      setServerAddonSummaries((prev) => ({ ...prev, [server.id]: out.summary }));
    } finally {
      setServerAddonLoadingId("");
    }
  };
  const loadPlayers = async () => {
    if (!selectedServerId) return;
    setPlayersLoading(true);
    try {
      const out = await api.listPlayers();
      setPlayers(out.players);
    } finally {
      setPlayersLoading(false);
    }
  };

  useEffect(() => {
    loadMe().then(async (ok) => {
      if (ok) {
        setNeedsBootstrap(false);
        await Promise.all([loadTypes(), loadServers()]);
        return;
      }
      const state = await api.authState();
      setNeedsBootstrap(state.needsBootstrap);
      if (state.needsBootstrap) { setShowSetupModal(true); await loadTypes(); }
    }).catch(() => void 0);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path === "/setup") {
        setShowSetupModal(true);
        return;
      }
      if (!isAuthenticated) return;
      setShowSetupModal(false);
      setActiveView(viewFromPath(path));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isAuthenticated]);

  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);
  useEffect(() => { filesPathRef.current = filesPath; }, [filesPath]);

  useEffect(() => {
    setConsoleLines([]);
    setConsoleCursor(0);
    if (selectedServerId) {
      loadConsoleHistory(0).catch((e) => setMessage(e.message));
    }
  }, [selectedServerId, activeView, addonsEnabled, addonsMode]);

  useEffect(() => {
    if (!selectedServerId) return;
    api.setActiveServerId(selectedServerId);
    loadStatus().catch((e) => setMessage(e.message));
    loadConsoleHistory(0).catch((e) => setMessage(e.message));
    loadEula().catch((e) => setMessage(e.message));
    if (activeView === "files") loadFiles(".").catch((e) => setMessage(e.message));
    if (activeView === "players") loadPlayers().catch((e) => setMessage(e.message));
    if (activeView === "plugins" && addonsEnabled) {
      if (addonsMode === "plugins") {
        loadPlugins().catch((e) => setMessage(e.message));
      } else if (addonsMode === "mods") {
        loadMods().catch((e) => setMessage(e.message));
      }
    }
    if (activeView === "settings") loadServerManagement().catch((e) => setMessage(e.message));
  }, [selectedServerId]);

  useEffect(() => {
    if (!isAuthenticated || showSetupModal || !selectedServerId) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        await loadStatus();
      } catch {
        // Ignore transient polling errors; explicit actions still surface errors.
      }
    };
    tick().catch(() => void 0);
    const timer = setInterval(() => {
      tick().catch(() => void 0);
    }, 1200);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isAuthenticated, showSetupModal, selectedServerId]);

  useEffect(() => { if (showSetupModal) loadTypes().catch(() => void 0); }, [showSetupModal]);
  useEffect(() => {
    if (activeView === "players" && selectedServerId) loadPlayers().catch((e) => setMessage(e.message));
    if (activeView === "users") refreshUsers().catch((e) => setMessage(e.message));
    if (activeView === "console" && selectedServerId) loadConsoleHistory(0).catch((e) => setMessage(e.message));
    if (activeView === "files" && selectedServerId) loadFiles(filesPath).catch((e) => setMessage(e.message));
    if (activeView === "plugins" && selectedServerId && addonsEnabled) {
      if (addonsMode === "plugins") {
        loadPlugins().catch((e) => setMessage(e.message));
      } else if (addonsMode === "mods") {
        loadMods().catch((e) => setMessage(e.message));
      }
    }
    if (activeView === "settings" && selectedServerId) loadServerManagement().catch((e) => setMessage(e.message));
  }, [activeView, currentUser?.role, selectedServerId, addonsEnabled, addonsMode]);

  useEffect(() => {
    if (activeView === "plugins" && !addonsEnabled) {
      goToView("console");
    }
  }, [activeView, addonsEnabled]);

  useEffect(() => {
    setSelectedAddonKeys([]);
  }, [selectedServerId, addonsMode]);

  useEffect(() => {
    if (activeView !== "console" || !selectedServerId) return;
    setConsoleLoading(true);
    const tick = async () => {
      try {
        await loadConsoleHistory(consoleCursor);
      } catch (error) {
        setMessage((error as Error).message);
      } finally {
        setConsoleLoading(false);
      }
    };
    const timer = setInterval(() => {
      tick().catch(() => void 0);
    }, 1000);
    tick().catch(() => void 0);
    return () => clearInterval(timer);
  }, [activeView, selectedServerId, consoleCursor]);

  useEffect(() => {
    if (!consoleAutoScroll || activeView !== "console") return;
    const node = consoleScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [consoleLines, consoleAutoScroll, activeView]);

  useEffect(() => {
    if (!message) return;
    const lower = message.toLowerCase();
    if (lower.includes("authentication required") || lower.includes("401")) {
      setMessage("");
      return;
    }
    setInfoModalDetail(message);
    setShowInfoModal(true);
    setMessage("");
  }, [message]);

  useEffect(() => {
    const currentPath = window.location.pathname;
    if (showSetupModal) {
      if (currentPath !== "/setup") window.history.replaceState({}, "", "/setup");
      return;
    }
    if (!isAuthenticated) {
      if (currentPath !== "/login") window.history.replaceState({}, "", "/login");
      return;
    }
    const nextPath = pathFromView(activeView);
    if (currentPath !== nextPath) window.history.replaceState({}, "", nextPath);
  }, [activeView, isAuthenticated, showSetupModal]);

  useEffect(() => {
    if (!showAddServerModal) return;
    if (addServerMode === "import" && importRef.current) {
      importRef.current.setAttribute("webkitdirectory", "");
      importRef.current.setAttribute("directory", "");
    }
    loadServerIcons().catch((e) => setMessage(e.message));
  }, [showAddServerModal, addServerMode]);

  useEffect(() => { loadVersions(installType, "install").catch(() => void 0); }, [installType]);
  useEffect(() => { loadVersions(setupServerType, "setup").catch(() => void 0); }, [setupServerType]);

  useEffect(() => {
    const hasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types || []).includes("Files");
    const handleDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      dragCounterRef.current += 1;
      if (isAuthenticated && !showSetupModal && (activeViewRef.current === "files" || activeViewRef.current === "plugins")) setDragOverlayVisible(true);
      e.preventDefault();
    };
    const handleDragOver = (e: DragEvent) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); };
    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setDragOverlayVisible(false);
      e.preventDefault();
    };
    const handleDrop = async (e: DragEvent) => {
      const dataTransfer = e.dataTransfer;
      dragCounterRef.current = 0;
      setDragOverlayVisible(false);
      if (!dataTransfer || !(activeViewRef.current === "files" || activeViewRef.current === "plugins")) return;
      e.preventDefault();
      try {
        if (activeViewRef.current === "files") {
          const uploads = await collectDroppedUploads(dataTransfer);
          if (!uploads.length) return;
          await api.uploadFiles(filesPathRef.current, uploads);
          await loadFiles(filesPathRef.current);
        } else {
          const files = Array.from(dataTransfer.files || []);
          if (!files.length) return;
          if (!addonsEnabled) return;
          if (addonsMode === "plugins") {
            for (const file of files) await api.installPlugin(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
            await loadPlugins();
          } else {
            for (const file of files) await api.installMod(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
            await loadMods();
          }
        }
      } catch (error) { setMessage((error as Error).message); }
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") { dragCounterRef.current = 0; setDragOverlayVisible(false); } };
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isAuthenticated, showSetupModal, addonsEnabled, addonsMode]);

  const doLogin = async () => {
    setLoginError("");
    const email = loginUsername.trim();
    if (!email.includes("@")) return setLoginError("Use email address to log in.");
    try {
      await api.authLogin(email, loginPassword);
      const shouldRememberEmail = rememberEmail;
      const shouldRememberPassword = rememberPassword;
      if (shouldRememberEmail) {
        localStorage.setItem(STORAGE_KEY_LOGIN_EMAIL, email);
      } else {
        localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL);
      }
      if (shouldRememberPassword) {
        localStorage.setItem(STORAGE_KEY_LOGIN_PASSWORD, loginPassword);
      } else {
        localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD);
      }
      localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, shouldRememberEmail ? "1" : "0");
      localStorage.setItem(STORAGE_KEY_REMEMBER_PASSWORD, shouldRememberPassword ? "1" : "0");
      localStorage.removeItem(STORAGE_KEY_REMEMBER_BOTH);
      await loadMe();
      await Promise.all([loadTypes(), loadServers()]);
      setActiveView(viewFromPath(window.location.pathname));
      setNeedsBootstrap(false);
      setNeedsRecoveryKeyRegeneration(false);
    } catch (error) { setLoginError((error as Error).message); }
  };

  const doForgotPassword = async () => {
    setForgotModalNotice("");
    setForgotModalError("");
    const email = forgotEmail.trim();
    const passkey = forgotRecoveryKey.trim();
    if (!email) return setForgotModalError("Enter email.");
    if (!passkey) return setForgotModalError("Enter a recovery key.");
    try {
      const out = await api.authRecoveryLogin(email, passkey);
      setForgotModalNotice("Recovery key accepted. Set a new password now.");
      setShowForgotModal(false);
      setForgotEmail("");
      setForgotRecoveryKey("");
      setNeedsRecoveryKeyRegeneration(out.shouldRegenerate);
      await loadMe();
    } catch (error) { setForgotModalError((error as Error).message); }
  };

  const finishSetup = async () => {
    setSetupError("");
    if (setupStep === 0 && !setupUsername.trim()) return setSetupError("Set username.");
    if (setupStep === 0 && !setupEmail.trim()) return setSetupError("Set owner email.");
    if (setupStep === 1 && !setupPassword) return setSetupError("Set password.");
    if (setupStep === 2 && !setupServerName.trim()) return setSetupError("Set server name.");
    if (setupStep === 3 && !setupServerType) return setSetupError("Choose server type.");
    if (setupStep === 4 && !setupVersion) return setSetupError("Choose version.");
    if (setupStep < 4) return setSetupStep((prev) => prev + 1);
    if (setupStep === 4) {
      try {
        const bootstrap = await api.authBootstrap(setupUsername.trim(), setupPassword, setupEmail.trim());
        await api.installServer({ name: setupServerName.trim(), type: setupServerType as ServerInstallType, version: setupVersion });
        setSetupRecoveryKeys(bootstrap.recoveryKeys || []);
        setSetupStep(5);
      } catch (error) { setSetupError((error as Error).message); }
      return;
    }
    if (setupStep === 5) {
      localStorage.setItem(STORAGE_KEY_SETUP, "1");
      setShowSetupModal(false);
      setNeedsBootstrap(false);
      setSetupRecoveryKeys([]);
      await loadMe();
      await Promise.all([loadTypes(), loadServers()]);
    }
  };

  const doLogout = async () => {
    await api.authLogout();
    const shouldKeepPassword = rememberPassword;
    if (!shouldKeepPassword) {
      setLoginPassword("");
      localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD);
      localStorage.setItem(STORAGE_KEY_REMEMBER_PASSWORD, "0");
    }
    setCurrentUser(null);
    setIsAuthenticated(false);
    setUsers([]);
    setUserRoleDraft({});
    setShowSetupModal(false);
    setNeedsRecoveryKeyRegeneration(false);
  };
  const installServerNow = async () => {
    await api.installServer({
      name: installName.trim(),
      type: installType as ServerInstallType,
      version: installVersion,
      iconDatabaseFile: installIconFile
    });
    setShowAddServerModal(false); setInstallName(""); setInstallType(""); setInstallVersion(""); setInstallIconFile("");
    setInstallIconModalSelectedFile(""); setInstallIconModalUpload(null);
    if (installIconRef.current) installIconRef.current.value = "";
    await loadServers();
  };
  const importServerNow = async () => {
    if (!importName.trim()) throw new Error("Server name is required.");
    if (!importFiles.length) throw new Error("Select a server root folder first.");
    await api.importServer({ name: importName.trim(), files: importFiles, iconDatabaseFile: importIconFile || undefined });
    setShowAddServerModal(false); setImportName(""); setImportFiles([]); setImportIconFile("");
    setInstallIconModalSelectedFile(""); setInstallIconModalUpload(null);
    if (installIconRef.current) installIconRef.current.value = "";
    await loadServers();
  };
  const deleteServerNow = async () => { if (!serverToDelete) return; await api.deleteServer(serverToDelete.id); setShowDeleteModal(false); setServerToDelete(null); await loadServers(); };
  const renameServerNow = async () => {
    if (!serverToRename) return;
    const out = await api.renameServer(serverToRename.id, renameServerName.trim());
    setShowRenameServerModal(false);
    setServerToRename(null);
    setRenameServerName("");
    await loadServers();
    setSelectedServerId(out.server.id);
  };
  const updateServerNow = async (server: ServerProfile) => {
    if (updatingServerId) return;
    setUpdatingServerId(server.id);
    try {
      const out = await api.updateServer(server.id);
      await loadServers();
      if (selectedServerId === server.id) await loadStatus();
      setMessage(out.update.updated ? `Updated ${out.server.name} to ${out.server.version}.` : `${out.server.name} is already on ${out.server.version}.`);
    } finally {
      setUpdatingServerId("");
    }
  };
  const createUserNow = async () => {
    await api.createUser({ username: newUsername.trim(), email: newEmail.trim(), password: newPassword, role: newRole });
    setNewUsername(""); setNewEmail(""); setNewPassword(""); setNewRole("viewer");
    setShowAddUserModal(false);
    await refreshUsers();
  };
  const setForcedPasswordNow = async () => {
    setForcePasswordError("");
    if (!forcePassword) return setForcePasswordError("Enter a new password.");
    if (forcePassword !== forcePasswordConfirm) return setForcePasswordError("Passwords do not match.");
    const nextPassword = forcePassword;
    await api.authSetPassword(forcePassword);
    setForcePassword(""); setForcePasswordConfirm("");
    setLoginPassword(nextPassword);
    if (rememberPassword) {
      localStorage.setItem(STORAGE_KEY_LOGIN_PASSWORD, nextPassword);
    }
    await loadMe();
  };

  const copyRecoveryKeys = async (keys: string[]) => {
    const value = keys.join("\n");
    try {
      await navigator.clipboard.writeText(value);
      setInfoModalDetail("Recovery keys copied to clipboard.");
      setShowInfoModal(true);
    } catch {
      setInfoModalDetail("Copy failed. Please use Download.");
      setShowInfoModal(true);
    }
  };

  const downloadRecoveryKeys = (keys: string[]) => {
    const blob = new Blob([keys.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const node = document.createElement("a");
    node.href = url;
    node.download = "mc-control-panel-recovery-keys.txt";
    document.body.appendChild(node);
    node.click();
    node.remove();
    URL.revokeObjectURL(url);
  };

  const regenerateRecoveryKeysNow = async () => {
    const out = await api.authRegenerateRecoveryKeys();
    setCurrentUser(out.user);
    setRecoveryKeysModalTitle("New Recovery Keys");
    setRecoveryKeysModalKeys(out.recoveryKeys || []);
    setShowRecoveryKeysModal(true);
    setNeedsRecoveryKeyRegeneration(false);
  };

  const regenerateRecoveryKeysForUser = async (userId: string, username: string) => {
    const out = await api.regenerateUserRecoveryKeys(userId);
    await refreshUsers();
    setRecoveryKeysModalTitle(`New PassKeys (${username})`);
    setRecoveryKeysModalKeys(out.recoveryKeys || []);
    setShowRecoveryKeysModal(true);
  };

  const runServerAction = async (action: "start" | "stop" | "restart") => {
    if (!selectedServerId) return;
    if (serverActionBusy) return;
    goToView("console");
    setServerActionBusy(true);
    try {
      if (action === "start") {
        const out = await api.startServer();
        if (out.kind === "eula_required") {
          setEulaState(out.eula);
          setShowEulaModal(true);
          return;
        }
      } else {
        setConsoleLines([]);
        setConsoleCursor(0);
        await api.clearConsoleHistory();
        if (action === "stop") await api.stopServer();
        if (action === "restart") await api.restartServer();
      }
      await Promise.all([loadStatus(), loadConsoleHistory(0)]);
    } finally {
      setServerActionBusy(false);
    }
  };

  const acceptEulaAndStart = async () => {
    if (!selectedServerId) return;
    setServerActionBusy(true);
    try {
      setConsoleLines([]);
      setConsoleCursor(0);
      await api.clearConsoleHistory();
      const out = await api.startServerAfterEula();
      if (out.kind === "started") {
        setShowEulaModal(false);
        await Promise.all([loadStatus(), loadConsoleHistory(0), loadEula()]);
      }
    } finally {
      setServerActionBusy(false);
    }
  };

  const openFileEntry = async (entry: FileEntry) => {
    if (entry.type === "directory") return loadFiles(entry.path);
    if (entry.path.toLowerCase().endsWith(".jar")) return;
    const out = await api.readFile(entry.path);
    setConfigEditor({ path: out.path, content: out.content, originalContent: out.content, mtime: out.mtime });
    setConfigEditorError("");
    setShowConfigEditor(true);
  };

  const closeConfigEditor = () => {
    if (configEditor && configEditor.content !== configEditor.originalContent) {
      if (!window.confirm("You have unsaved changes. Close anyway?")) return;
    }
    setShowConfigEditor(false);
    setConfigEditor(null);
    setConfigEditorError("");
  };

  const saveConfigEditor = async () => {
    if (!configEditor) return;
    try {
      const out = await api.writeFile({ path: configEditor.path, content: configEditor.content, expectedMtime: configEditor.mtime });
      setConfigEditor({ ...configEditor, mtime: out.mtime, originalContent: configEditor.content });
      await loadFiles(filesPath);
    } catch (error) { setConfigEditorError((error as Error).message); }
  };

  const togglePathSelection = (filePath: string) => setSelectedPaths((prev) => prev.includes(filePath) ? prev.filter((entry) => entry !== filePath) : [...prev, filePath]);
  const deleteSelectedFiles = async () => { if (!selectedPaths.length) return; await api.deletePaths(selectedPaths); await loadFiles(filesPath); };
  const toggleAddonSelection = (addonKey: string) =>
    setSelectedAddonKeys((prev) => (prev.includes(addonKey) ? prev.filter((id) => id !== addonKey) : [...prev, addonKey]));
  const deleteSelectedAddons = async () => {
    if (!selectedAddonKeys.length) return;
    if (addonsMode === "none") return;
    for (const addonKey of selectedAddonKeys) {
      if (addonKey.startsWith("plugin:")) {
        await api.removePlugin(addonKey.slice("plugin:".length), deletePluginConfigOnRemove);
      } else if (addonKey.startsWith("mod:")) {
        await api.removeMod(addonKey.slice("mod:".length));
      }
    }
    setSelectedAddonKeys([]);
    if (addonsMode === "plugins") {
      await loadPlugins();
    } else if (addonsMode === "mods") {
      await loadMods();
    }
  };
  const browsePluginInstall = async (files: File[]) => {
    if (!files.length) return;
    if (addonsMode !== "plugins") {
      for (const file of files) await api.installMod(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
      await loadMods();
      return;
    }
    for (const file of files) await api.installPlugin(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
    await loadPlugins();
  };
  const browseModInstall = async (files: File[]) => {
    if (!files.length) return;
    if (addonsMode !== "mods") {
      for (const file of files) await api.installPlugin(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
      await loadPlugins();
      return;
    }
    for (const file of files) await api.installMod(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
    await loadMods();
  };
  const createFsEntryNow = async () => {
    setCreateFsError("");
    if (!createFsType) return setCreateFsError("Choose new file or new folder.");
    const name = createFsName.trim().replace(/\\/g, "/");
    if (!name || name.includes("/") || name.includes("..")) return setCreateFsError("Use a valid single name.");
    if (createFsType === "file" && !name.includes(".")) return setCreateFsError("File name needs extension, e.g. newfile.txt");
    const base = filesPath === "." ? "" : filesPath;
    const target = base ? `${base}/${name}` : name;
    if (createFsType === "folder") {
      await api.mkdir(target);
    } else {
      await api.writeFile({ path: target, content: "" });
    }
    setShowCreateFsModal(false);
    setCreateFsType("");
    setCreateFsName("");
    await loadFiles(filesPath);
  };

  const saveServerSettings = async () => {
    setSettingsSaving(true);
    try {
      const [settingsOut, propertiesOut] = await Promise.all([
        api.updateServerSettings({
          ...serverSettings,
          startupScript: ""
        }),
        api.updateServerProperties({
          expectedMtime: serverProperties.mtime,
          fields: serverProperties.fields
            .map((field) => ({ key: field.key.trim(), value: field.value }))
            .filter((field) => !!field.key)
        })
      ]);
      setServerSettings(settingsOut.settings);
      setServerProperties(propertiesOut);
      await loadEula();
      setMessage("Server management saved.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const addCustomProperty = () => {
    const key = newPropertyKey.trim();
    if (!key) return setMessage("Property key is required.");
    if (serverProperties.fields.some((field) => field.key.toLowerCase() === key.toLowerCase())) {
      return setMessage("That property already exists.");
    }
    setServerProperties((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          key,
          value: newPropertyValue,
          label: key,
          category: "advanced",
          control: "text",
          isCustom: true
        }
      ]
    }));
    setNewPropertyKey("");
    setNewPropertyValue("");
  };

  const updatePropertyField = (key: string, value: string) => {
    setServerProperties((prev) => ({
      ...prev,
      fields: prev.fields.map((field) => (field.key === key ? { ...field, value } : field))
    }));
  };

  const togglePropertyVisibility = (key: string) => {
    setRevealedPropertyKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const removePropertyField = (key: string) => {
    setServerProperties((prev) => ({
      ...prev,
      fields: prev.fields.filter((field) => field.key !== key)
    }));
  };

  const addPlayerNow = async () => {
    const username = addPlayerUsername.trim();
    if (!username) return setMessage("Player username is required.");
    if (!addPlayerWhitelisted && !addPlayerOperator) return setMessage("Choose whitelist and/or operator.");
    setAddPlayerBusy(true);
    try {
      await api.addPlayer({
        username,
        whitelisted: addPlayerWhitelisted || addPlayerOperator,
        operator: addPlayerOperator
      });
      setAddPlayerUsername("");
      setAddPlayerWhitelisted(true);
      setAddPlayerOperator(false);
      await Promise.all([loadPlayers(), loadEula()]);
    } finally {
      setAddPlayerBusy(false);
    }
  };

  const togglePlayerState = async (
    player: PlayerRecord,
    patch: Partial<Pick<PlayerRecord, "whitelisted" | "operator" | "bypassesPlayerLimit">>
  ) => {
    await api.updatePlayer(player.uuid, patch);
    await loadPlayers();
  };

  const removePlayerNow = async (player: PlayerRecord) => {
    await api.removePlayer(player.uuid, player.name);
    await loadPlayers();
  };

  const openServerAddonsModal = async (server: ServerProfile) => {
    setServerAddonsModalServerId(server.id);
    setShowServerAddonsModal(true);
    await loadServerAddonSummary(server);
  };

  const openIconModal = async (target: "install" | "import") => {
    setIconPickerTarget(target);
    const icons = await loadServerIcons();
    setInstallIconModalUpload(null);
    const selectedIcon = target === "install" ? installIconFile : importIconFile;
    setInstallIconModalSelectedFile(selectedIcon || icons.find((entry) => entry.isDefault)?.file || "");
    if (installIconRef.current) installIconRef.current.value = "";
    setShowInstallIconModal(true);
  };

  const confirmIconSelection = async () => {
    if (installIconModalUpload) {
      const out = await api.uploadServerIcon(installIconModalUpload);
      await loadServerIcons();
      if (iconPickerTarget === "install") setInstallIconFile(out.icon.file);
      else setImportIconFile(out.icon.file);
      setShowInstallIconModal(false);
      setInstallIconModalUpload(null);
      setInstallIconModalSelectedFile(out.icon.file);
      return;
    }
    if (iconPickerTarget === "install") setInstallIconFile(installIconModalSelectedFile);
    else setImportIconFile(installIconModalSelectedFile);
    setShowInstallIconModal(false);
  };

  const deleteInstallIconEntry = async (file: string) => {
    await api.deleteServerIcon(file);
    const out = await api.listServerIcons();
    setIconDatabaseEntries(out.icons);
    if (installIconModalSelectedFile === file) {
      const fallback = out.icons.find((entry) => entry.isDefault)?.file || "";
      setInstallIconModalSelectedFile(fallback);
    }
    if (installIconFile === file) {
      setInstallIconFile("");
    }
    if (importIconFile === file) {
      setImportIconFile("");
    }
  };

  const openServerModal = (mode: AddServerMode) => {
    if (mode === "import") {
      setImportFiles([]);
      setImportIconFile("");
    }
    if (mode === "install") {
      setInstallIconFile("");
      setInstallIconModalSelectedFile("");
      setInstallIconModalUpload(null);
      if (installIconRef.current) installIconRef.current.value = "";
    }
    setAddServerMode(mode);
    setShowAddServerModal(true);
  };

  const goToView = (view: View) => {
    setActiveView(view);
    const nextPath = pathFromView(view);
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
  };

  const groupedPropertyFields = (Object.keys(PROPERTY_CATEGORY_LABELS) as Array<ServerPropertyField["category"]>)
    .map((category) => ({
      category,
      label: PROPERTY_CATEGORY_LABELS[category],
      fields: serverProperties.fields.filter((field) => field.category === category)
    }))
    .filter((group) => group.fields.length > 0);

  if (!isAuthenticated || showSetupModal) {
    return (
      <div className="shell auth-shell">
        <main className="main flow-mode auth-main">
          {showSetupModal ? (
            <div className="auth-panel setup-panel">
              <h2 className="auth-title">Sign Up</h2>
              <p className="muted auth-subtitle">Initial Setup ({setupStep + 1}/6)</p>
              {setupStep === 0 && <div className="auth-form-stack"><label>Username</label><input value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} placeholder="Set username" autoFocus /><label>Email</label><input type="email" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} placeholder="Owner email" /></div>}
              {setupStep === 1 && <div className="auth-form-stack"><label>Password</label><div className="password-input-wrap"><input type={showSetupPassword ? "text" : "password"} value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} placeholder="Set password" autoFocus /><button type="button" className="password-toggle-btn" onClick={() => setShowSetupPassword((prev) => !prev)}>{showSetupPassword ? "Hide" : "Show"}</button></div></div>}
              {setupStep === 2 && <div className="auth-form-stack"><label>Server Name</label><input value={setupServerName} onChange={(e) => setSetupServerName(e.target.value)} placeholder="Set server name" autoFocus /></div>}
              {setupStep === 3 && <div className="auth-form-stack"><label>Server Type</label><div className="jar-options">{serverTypeOptions.map((t) => <button key={t.id} className={setupServerType === t.id ? "menu-btn active" : "menu-btn"} disabled={!t.enabled} title={t.enabled ? t.label : t.tooltip || "soon"} onClick={() => t.enabled && setSetupServerType(t.id as ServerInstallType)}>{t.label}</button>)}</div></div>}
              {setupStep === 4 && <div className="auth-form-stack"><label>Version</label><select value={setupVersion} onChange={(e) => setSetupVersion(e.target.value)}><option value="">Choose version</option>{setupVersionOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>}
              {setupStep === 5 && <div className="auth-form-stack"><label>Recovery Keys</label><p className="muted">Save these 10 keys now. Each key can be used once to recover access if you forget your password.</p><textarea readOnly value={setupRecoveryKeys.join("\n")} rows={10} /><div className="row"><button type="button" onClick={() => copyRecoveryKeys(setupRecoveryKeys).catch((e) => setSetupError(e.message))}>Copy Keys</button><button type="button" onClick={() => downloadRecoveryKeys(setupRecoveryKeys)}>Download Keys</button></div></div>}
              {!!setupError && <div className="banner warn">{setupError}</div>}
              <div className="row auth-actions-row">{setupStep > 0 && setupStep < 5 && <button onClick={() => setSetupStep((prev) => prev - 1)}>Back</button>}<button className="btn-start auth-primary-btn" onClick={() => finishSetup().catch((e) => setSetupError(e.message))}>{setupStep < 4 ? "Next" : setupStep === 4 ? "Generate Recovery Keys" : "Finish Setup"}</button></div>
            </div>
          ) : (
            <section className="auth-panel login-panel">
              <h2 className="auth-title login-title">Log In</h2>
              {needsBootstrap && <div className="banner warn">No account exists yet. Run initial setup.</div>}
              <div className="auth-form-stack"><label>Email</label><input type="email" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="Email address" /><label>Password</label><div className="password-input-wrap"><input type={showLoginPassword ? "text" : "password"} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doLogin().catch((err) => setLoginError(err.message)); }} placeholder="Password" /><button type="button" className="password-toggle-btn" onClick={() => setShowLoginPassword((prev) => !prev)}>{showLoginPassword ? "Hide" : "Show"}</button></div><div className="remember-options remember-options-grid"><label className="remember-row"><input type="checkbox" checked={rememberEmail} onChange={(e) => { const next = e.target.checked; setRememberEmail(next); if (!next) { localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL); localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, "0"); } }} />Remember email</label><button type="button" className="remember-row remember-action-row" onClick={() => { setForgotEmail(""); setForgotRecoveryKey(""); setForgotModalNotice(""); setForgotModalError(""); setShowForgotModal(true); }}><span className="remember-action-icon"><i className="fa-solid fa-key" aria-hidden="true" /></span><span>Forgot password</span></button><label className="remember-row"><input type="checkbox" checked={rememberPassword} onChange={(e) => { const next = e.target.checked; setRememberPassword(next); if (!next) { localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD); localStorage.setItem(STORAGE_KEY_REMEMBER_PASSWORD, "0"); } }} />Remember password</label></div></div>
              {!!loginError && <div className="banner warn">{loginError}</div>}
              <button className="auth-primary-btn" onClick={() => doLogin().catch((e) => setLoginError(e.message))}>Log In</button>
              {needsBootstrap && <button onClick={() => { setShowSetupModal(true); window.history.pushState({}, "", "/setup"); }}>Open Setup</button>}
            </section>
          )}
          {showForgotModal && (
            <div className="modal-backdrop" onClick={() => setShowForgotModal(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <ModalCloseButton onClick={() => setShowForgotModal(false)} />
                <h3>Forgot Password</h3>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter email"
                />
                <input
                  value={forgotRecoveryKey}
                  onChange={(e) => setForgotRecoveryKey(e.target.value)}
                  placeholder="Enter recovery key"
                />
                {!!forgotModalError && <div className="banner warn">{forgotModalError}</div>}
                {!!forgotModalNotice && <div className="banner info">{forgotModalNotice}</div>}
                <div className="row">
                  <button onClick={() => setShowForgotModal(false)}>Close</button>
                  <button className="btn-start" onClick={() => doForgotPassword().catch((e) => setForgotModalError(e.message))}>Use Key</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <main className="main flow-mode">
        <div className="menubar">
          <button className="menu-toggle-btn" onClick={() => setShowMenuDrawer(true)}><img src="/minecraft-icon.png" alt="Menu" className="menu-toggle-logo" /></button>
          <strong className="brand">MC Control Panel</strong>
          <div className="menu-actions">
            <strong>{activeServer?.name || "No server selected"}</strong>
            <span className={isOnline ? "tiny online-dot" : "tiny offline-dot"}>
              {isStarting ? "Starting" : isStopping ? "Stopping" : isRestarting ? "Restarting" : isOnline ? "Online" : "Offline"}
            </span>
            <span className="uptime-pill">Uptime: {formatUptime(status?.uptimeMs || 0)}</span>
            {canOperateServer && <>
              <button className="btn-start" disabled={disableStart} onClick={() => runServerAction("start").catch((e) => setMessage(e.message))}><i className="fa-solid fa-play" aria-hidden="true" /> Start</button>
              <button className="btn-stop" disabled={disableStop} onClick={() => runServerAction("stop").catch((e) => setMessage(e.message))}><i className="fa-solid fa-stop" aria-hidden="true" /> Stop</button>
              <button className="btn-restart" disabled={disableRestart} onClick={() => runServerAction("restart").catch((e) => setMessage(e.message))}><i className="fa-solid fa-rotate-right" aria-hidden="true" /> Restart</button>
            </>}
            <button className="logout-btn-inline logout-icon-btn" title="Logout" aria-label="Logout" onClick={() => doLogout().catch((e) => setMessage(e.message))}><i className="fa-solid fa-right-from-bracket" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="workspace">
          <aside className="servers-column card">
            <h2>Servers</h2>
            <div className="server-list-vertical">{servers.map((server) => {
              const addonSummary = serverAddonSummaries[server.id];
              const summaryTitle = addonSummary?.mode === "plugins" ? "Plugins" : addonSummary?.mode === "mods" ? "Mods" : "Mods/Plugins";
              return (
                <div
                  key={server.id}
                  className={selectedServerId === server.id ? "server-pill active server-item" : "server-pill server-item"}
                  onClick={() => setSelectedServerId(server.id)}
                >
                  <img className="server-list-icon" src={`/api/servers/${encodeURIComponent(server.id)}/icon`} alt={`${server.name} icon`} />
                  <div className="server-pill-text">
                    <strong>{server.name}</strong>
                    <small>{server.type} {server.version}</small>
                  </div>
                  <div className="server-item-meta">
                    <button
                      className="server-info-btn"
                      aria-label={`${server.name} addons`}
                      title={`${summaryTitle}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openServerAddonsModal(server).catch((err) => setMessage(err.message));
                      }}
                    >
                      <i className="fa-solid fa-circle-info" aria-hidden="true" />
                    </button>
                    {canOperateServer && <button className="server-rename-btn" aria-label="Rename server" onClick={(e) => { e.stopPropagation(); setServerToRename(server); setRenameServerName(server.name); setShowRenameServerModal(true); }} title="Rename server"><i className="fa-solid fa-pencil" aria-hidden="true" /></button>}
                    {canOperateServer && server.type === "purpur" && <button className="server-update-btn" aria-label="Update server jar" onClick={(e) => { e.stopPropagation(); updateServerNow(server).catch((err) => setMessage(err.message)); }} title="Update server jar" disabled={!!updatingServerId}><i className="fa-solid fa-rotate-right" aria-hidden="true" /></button>}
                    {canOperateServer && <button className="server-delete-btn" aria-label="Delete server" onClick={(e) => { e.stopPropagation(); setServerToDelete(server); setShowDeleteModal(true); }} title="Delete"><i className="fa-solid fa-trash-can" aria-hidden="true" /></button>}
                  </div>
                </div>
              );
            })}</div>
            {canOperateServer && (
              <div className="server-sidebar-actions">
                <button onClick={() => openServerModal("import")}><i className="fa-solid fa-file-import" aria-hidden="true" /> Import Server</button>
                <button className="btn-start" onClick={() => openServerModal("install")}><i className="fa-solid fa-server" aria-hidden="true" /> Create Server</button>
              </div>
            )}
          </aside>

          <section className="card grow panel-content-card">
            {activeView === "console" && <>
              <h2>Console</h2>
              <div className="view-layout">
                <div className="console-panel">
                  <div className="console-toolbar">
                    <span className="muted">{consoleLoading ? "Updating..." : `Lines: ${consoleLines.length}`}</span>
                    <label className="row muted console-autoscroll-toggle">
                      <input type="checkbox" checked={consoleAutoScroll} onChange={(e) => setConsoleAutoScroll(e.target.checked)} />
                      Auto Scroll
                    </label>
                    <button className="icon-only-btn refresh-btn" aria-label="Refresh console" title="Refresh" onClick={() => loadConsoleHistory(0).catch((e) => setMessage(e.message))}><i className="fa-solid fa-rotate-right" aria-hidden="true" /></button>
                  </div>
                  <div ref={consoleScrollRef} className="console modern-console">
                    {!consoleLines.length && <div className="empty-list">No console output yet.</div>}
                    {consoleLines.map((line) => (
                      <div key={line.cursor} className={`line ${line.source === "stderr" ? "stderr" : ""}`}>
                        <span className="muted">[{new Date(line.ts).toLocaleTimeString()}]</span> {line.line}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="row console-command-row">
                  <input
                    value={consoleCommand}
                    onChange={(e) => setConsoleCommand(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendConsoleCommand().catch((err) => setMessage(err.message)); }}
                    placeholder="Type command..."
                  />
                  <button className="btn-start" onClick={() => sendConsoleCommand().catch((e) => setMessage(e.message))}>Send</button>
                </div>
              </div>
            </>}

            {activeView === "players" && <>
              <h2>Players</h2>
              <div className="view-layout">
                <div className="settings-card modern-settings-card">
                  <div className="players-toolbar">
                    <input
                      value={addPlayerUsername}
                      onChange={(e) => setAddPlayerUsername(e.target.value)}
                      placeholder="Minecraft username"
                      disabled={!canOperateServer || addPlayerBusy}
                    />
                    <label className="row muted">
                      <input
                        type="checkbox"
                        checked={addPlayerWhitelisted}
                        disabled={!canOperateServer || addPlayerBusy}
                        onChange={(e) => setAddPlayerWhitelisted(e.target.checked)}
                      />
                      Whitelist
                    </label>
                    <label className="row muted">
                      <input
                        type="checkbox"
                        checked={addPlayerOperator}
                        disabled={!canOperateServer || addPlayerBusy}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setAddPlayerOperator(next);
                          if (next) setAddPlayerWhitelisted(true);
                        }}
                      />
                      Operator
                    </label>
                    <button className="btn-start" disabled={!canOperateServer || addPlayerBusy} onClick={() => addPlayerNow().catch((e) => setMessage(e.message))}>
                      <i className="fa-solid fa-user-plus" aria-hidden="true" /> {addPlayerBusy ? "Adding..." : "Add Player"}
                    </button>
                  </div>
                  <div className="players-list">
                    {playersLoading && <div className="empty-list">Loading players...</div>}
                    {!playersLoading && !players.length && <div className="empty-list">No whitelist or operator entries yet.</div>}
                    {!playersLoading && players.map((player) => (
                      <div key={player.uuid} className="player-row">
                        <div className="player-main">
                          <img className="player-head" src={player.headUrl} alt={`${player.name} head`} />
                          <div className="player-meta">
                            <strong>{player.name}</strong>
                            <small className="muted">{player.uuid}</small>
                          </div>
                        </div>
                        <div className="player-actions">
                          <label className="row muted">
                            <input
                              type="checkbox"
                              checked={player.whitelisted}
                              disabled={!canOperateServer}
                              onChange={(e) => togglePlayerState(player, { whitelisted: e.target.checked }).catch((err) => setMessage(err.message))}
                            />
                            Whitelisted
                          </label>
                          <label className="row muted">
                            <input
                              type="checkbox"
                              checked={player.operator}
                              disabled={!canOperateServer}
                              onChange={(e) => togglePlayerState(player, { operator: e.target.checked, whitelisted: e.target.checked ? true : player.whitelisted }).catch((err) => setMessage(err.message))}
                            />
                            Operator
                          </label>
                          {canOperateServer && (
                            <button className="btn-danger" onClick={() => removePlayerNow(player).catch((e) => setMessage(e.message))}>
                              <i className="fa-solid fa-user-minus" aria-hidden="true" /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>}

            {activeView === "files" && <>
              <h2>Files</h2>
              <div className="view-layout">
                <div className="row file-toolbar">
                  <button onClick={() => loadFiles(".").catch((e) => setMessage(e.message))}>Root</button>
                  <button onClick={() => {
                    const parts = (filesPath === "." ? "." : filesPath).split("/").filter(Boolean);
                    parts.pop();
                    loadFiles(parts.length ? parts.join("/") : ".").catch((e) => setMessage(e.message));
                  }}>Up</button>
                  <span className="path-pill">{filesPath}</span>
                  <span className="toolbar-spacer" />
                  <button className="btn-create-entry" aria-label="Create file or folder" title="Create" onClick={() => { setShowCreateFsModal(true); setCreateFsType(""); setCreateFsName(""); setCreateFsError(""); }}><i className="fa-solid fa-plus" aria-hidden="true" /></button>
                </div>

                <div className="file-list modern-file-table">
                  <div className="file-table-header">
                    <span />
                    <span>Name</span>
                    <span>Size</span>
                    <span>Last Modified</span>
                    <span />
                  </div>
                  {filesLoading && <div className="empty-list">Loading files...</div>}
                  {!filesLoading && !filesEntries.length && <div className="empty-list">No files found.</div>}
                  {!filesLoading && filesEntries.map((entry) => (
                    <div key={entry.path} className={selectedPaths.includes(entry.path) ? "file-item selected modern-file-row" : "file-item modern-file-row"}>
                      <span className="row-check">
                        <input
                          type="checkbox"
                          checked={selectedPaths.includes(entry.path)}
                          onChange={() => togglePathSelection(entry.path)}
                        />
                      </span>
                      <div className="entry-main modern-name-cell" onClick={() => openFileEntry(entry).catch((e) => setMessage(e.message))}>
                        <span className={entry.type === "directory" ? "entry-icon directory" : "entry-icon file"} />
                        <span className="entry-name">{entry.name}</span>
                      </div>
                      <span className="muted">{entry.type === "directory" ? "-" : `${entry.size || 0} B`}</span>
                      <span className="muted">{entry.mtime ? new Date(entry.mtime).toLocaleString() : "-"}</span>
                      <button className="list-action-btn" onClick={() => openFileEntry(entry).catch((e) => setMessage(e.message))}>
                        Open
                      </button>
                    </div>
                  ))}
                </div>

                <div className="files-bottom-actions files-bottom-left">
                  <button className="btn-danger" disabled={!selectedPaths.length} onClick={() => deleteSelectedFiles().catch((e) => setMessage(e.message))}>Delete Selected</button>
                </div>
              </div>
            </>}

            {activeView === "plugins" && <>
              <h2>Plugins/Mods</h2>
              <div className="view-layout">
                {!addonsEnabled ? (
                  <div className="empty-list">Vanilla server selected. Plugins/Mods are disabled for vanilla.</div>
                ) : (
                  <>
                    <div className="row file-toolbar">
                      <input ref={pluginBrowseRef} type="file" multiple hidden onChange={(e) => browsePluginInstall([...(e.target.files || [])]).catch((err) => setMessage(err.message))} />
                      <input ref={modBrowseRef} type="file" multiple hidden onChange={(e) => browseModInstall([...(e.target.files || [])]).catch((err) => setMessage(err.message))} />
                      {addonsMode === "plugins" ? <button onClick={() => pluginBrowseRef.current?.click()}>Add Plugin</button> : <button onClick={() => modBrowseRef.current?.click()}>Add Mod/Pack</button>}
                      <button className="btn-danger" disabled={!selectedAddonKeys.length} onClick={() => deleteSelectedAddons().catch((e) => setMessage(e.message))}>Remove Selected</button>
                      {addonsMode === "plugins" && (
                        <label className="row muted">
                          <input
                            type="checkbox"
                            checked={deletePluginConfigOnRemove}
                            onChange={(e) => setDeletePluginConfigOnRemove(e.target.checked)}
                          />
                          Also delete config folder
                        </label>
                      )}
                    </div>
                    <div className="users-list users-table-wrap addons-table-wrap">
                      {(pluginsLoading || modsLoading) && <div className="empty-list">Loading plugins/mods...</div>}
                      {addonsMode === "plugins" && !pluginsLoading && !plugins.length && <div className="empty-list">No plugins installed.</div>}
                      {addonsMode === "mods" && !modsLoading && !mods.length && <div className="empty-list">No mods installed.</div>}
                      {addonsMode === "plugins" && !pluginsLoading && !!plugins.length && (
                        <table className="users-table addons-table">
                          <thead>
                            <tr>
                              <th />
                              <th>Name</th>
                              <th>Version</th>
                              <th>File</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plugins.map((plugin) => {
                              const key = `plugin:${plugin.pluginId}`;
                              const selected = selectedAddonKeys.includes(key);
                              return (
                                <tr key={key} className={selected ? "selected-row" : ""} onClick={() => toggleAddonSelection(key)}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => toggleAddonSelection(key)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </td>
                                  <td>{plugin.name || plugin.pluginId}</td>
                                  <td>{plugin.version || "-"}</td>
                                  <td className="muted">{plugin.jarPath || plugin.folderPath || "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      {addonsMode === "mods" && !modsLoading && !!mods.length && (
                        <table className="users-table addons-table">
                          <thead>
                            <tr>
                              <th />
                              <th>Name</th>
                              <th>Version</th>
                              <th>File</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mods.map((mod) => {
                              const key = `mod:${mod.modId}`;
                              const selected = selectedAddonKeys.includes(key);
                              return (
                                <tr key={key} className={selected ? "selected-row" : ""} onClick={() => toggleAddonSelection(key)}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => toggleAddonSelection(key)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </td>
                                  <td>{mod.modId}</td>
                                  <td>-</td>
                                  <td className="muted">{mod.jarPath}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>}

            {activeView === "settings" && <>
              <h2>Server Management</h2>
              <div className="view-layout">
                {settingsLoading ? (
                  <div className="empty-list">Loading server management...</div>
                ) : (
                  <div className="settings-layout">
                    <div className="settings-card modern-settings-card">
                      <div className="management-section">
                        <h3>EULA</h3>
                        <div className="eula-card">
                          <div>
                            <strong>{eulaState?.accepted ? "Accepted" : "Not accepted"}</strong>
                            <p className="muted">Minecraft requires EULA acceptance before the server can start.</p>
                          </div>
                          <div className="row wrap">
                            <a className="playit-link-btn" href={eulaState?.link || "https://aka.ms/MinecraftEULA"} target="_blank" rel="noreferrer">Read Minecraft's EULA</a>
                            {canOperateServer && (
                              <button onClick={() => api.setEula(!(eulaState?.accepted)).then((out) => setEulaState(out.eula)).catch((e) => setMessage(e.message))}>
                                {eulaState?.accepted ? "Mark Unaccepted" : "Accept EULA"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="management-section">
                        <h3>Runtime Settings</h3>
                      <div className="settings-grid">
                        <label className="settings-field">
                          <span>Auto Restart</span>
                          <select
                            value={serverSettings.autoRestart ? "true" : "false"}
                            onChange={(e) => setServerSettings((prev) => ({ ...prev, autoRestart: e.target.value === "true" }))}
                          >
                            <option value="true">Enabled</option>
                            <option value="false">Disabled</option>
                          </select>
                        </label>

                        <label className="settings-field">
                          <span>Playit Tunnel</span>
                          <select
                            value={serverSettings.playitEnabled ? "true" : "false"}
                            onChange={(e) => setServerSettings((prev) => ({ ...prev, playitEnabled: e.target.value === "true" }))}
                          >
                            <option value="false">Disabled</option>
                            <option value="true">Enabled</option>
                          </select>
                        </label>

                        <label className="settings-field">
                          <span>RAM Min (GB)</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={serverSettings.ramMinGb ?? ""}
                            onChange={(e) => setServerSettings((prev) => ({ ...prev, ramMinGb: e.target.value === "" ? null : Number(e.target.value) }))}
                          />
                        </label>

                        <label className="settings-field">
                          <span>RAM Max (GB)</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={serverSettings.ramMaxGb ?? ""}
                            onChange={(e) => setServerSettings((prev) => ({ ...prev, ramMaxGb: e.target.value === "" ? null : Number(e.target.value) }))}
                          />
                        </label>

                        <label className="settings-field">
                          <span>Server IP</span>
                          <input
                            value={serverSettings.serverIp}
                            onChange={(e) => setServerSettings((prev) => ({ ...prev, serverIp: e.target.value }))}
                            placeholder="Leave blank for all interfaces"
                          />
                        </label>

                        <label className="settings-field">
                          <span>Server Port</span>
                          <input
                            type="number"
                            min={1}
                            max={65535}
                            value={serverSettings.serverPort ?? ""}
                            onChange={(e) => setServerSettings((prev) => ({ ...prev, serverPort: e.target.value === "" ? null : Number(e.target.value) }))}
                          />
                        </label>

                        <label className="settings-field settings-field-wide">
                          <span>Playit Command</span>
                          <input
                            value={serverSettings.playitCommand}
                            onChange={(e) => setServerSettings((prev) => ({ ...prev, playitCommand: e.target.value }))}
                            placeholder="playit"
                          />
                        </label>
                      </div>
                      </div>

                      <div className="management-section">
                        <h3>Server Properties</h3>
                        {groupedPropertyFields.map((group) => (
                          <div key={group.category} className="properties-group management-subcard">
                            <div className="properties-group-head">
                              <div>
                                <h4>{group.label}</h4>
                                <p className="muted">{PROPERTY_CATEGORY_DESCRIPTIONS[group.category]}</p>
                              </div>
                            </div>
                            <div className="properties-grid">
                              {group.fields.map((field) => {
                                const sensitive = isSensitiveProperty(field.key);
                                const isRevealed = !!revealedPropertyKeys[field.key];
                                const description = propertyDescription(field);
                                return (
                                  <div key={field.key} className="property-card">
                                    <div className="property-card-head">
                                      <div className="property-title-wrap">
                                        <span>{field.label}</span>
                                        <div className="property-info-wrap">
                                          <button type="button" className="property-info-btn" aria-label={`About ${field.label}`}>
                                            <i className="fa-solid fa-circle-info" aria-hidden="true" />
                                          </button>
                                          <div className="property-tooltip">{description}</div>
                                        </div>
                                      </div>
                                      <small className="muted property-key">{field.key}</small>
                                    </div>
                                    <div className="property-input-wrap">
                                      {field.control === "boolean" ? (
                                        <select value={field.value} onChange={(e) => updatePropertyField(field.key, e.target.value)}>
                                          <option value="true">True</option>
                                          <option value="false">False</option>
                                        </select>
                                      ) : field.control === "select" ? (
                                        <select value={field.value} onChange={(e) => updatePropertyField(field.key, e.target.value)}>
                                          {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                      ) : (
                                        <div className="password-input-wrap property-value-wrap">
                                          <input
                                            type={sensitive && !isRevealed ? "password" : field.control === "number" ? "number" : "text"}
                                            value={field.value}
                                            onChange={(e) => updatePropertyField(field.key, e.target.value)}
                                          />
                                          {sensitive && (
                                            <button type="button" className="password-toggle-btn" onClick={() => togglePropertyVisibility(field.key)}>
                                              {isRevealed ? "Hide" : "Show"}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="property-card-footer">
                                      {canOperateServer && field.isCustom && (
                                        <button type="button" className="list-action-btn property-remove-btn" onClick={() => removePropertyField(field.key)}>
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {canOperateServer && (
                          <div className="custom-property-row">
                            <input value={newPropertyKey} onChange={(e) => setNewPropertyKey(e.target.value)} placeholder="custom.property-key" />
                            <input value={newPropertyValue} onChange={(e) => setNewPropertyValue(e.target.value)} placeholder="value" />
                            <button onClick={addCustomProperty}>Add Property</button>
                          </div>
                        )}
                      </div>

                      <div className="playit-section">
                        <h3>Playit.gg Setup</h3>
                        <p className="muted">Download the Playit agent, run it on this machine, then enable the tunnel settings below.</p>
                        <div className="playit-downloads">
                          <a className="playit-link-btn" href="https://playit.gg/download/windows" target="_blank" rel="noreferrer">Download Windows</a>
                          <a className="playit-link-btn" href="https://playit.gg/download/linux" target="_blank" rel="noreferrer">Download Linux</a>
                          <a className="playit-link-btn" href="https://playit.gg/download/macos" target="_blank" rel="noreferrer">Download macOS</a>
                        </div>
                        <div className="playit-steps">
                          <p><strong>1.</strong> Run the agent and claim it to your account.</p>
                          <p><strong>2.</strong> Create a tunnel and set local port to your Minecraft server port.</p>
                          <p><strong>3.</strong> In this panel, set <strong>Playit Tunnel</strong> to enabled and keep command as <code>playit</code>.</p>
                          <p><strong>4.</strong> Start the server and join with the Playit address.</p>
                        </div>
                        <div className="playit-code-block">
                          <div className="muted">Linux apt install (official docs):</div>
                          <code>curl -SsL https://playit-cloud.github.io/ppa/key.gpg | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/playit.gpg &gt;/dev/null</code>
                          <code>echo "deb [signed-by=/etc/apt/trusted.gpg.d/playit.gpg] https://playit-cloud.github.io/ppa/data ./" | sudo tee /etc/apt/sources.list.d/playit-cloud.list</code>
                          <code>sudo apt update &amp;&amp; sudo apt install playit</code>
                          <code>playit setup</code>
                        </div>
                      </div>
                    </div>
                    <div className="row settings-actions settings-bottom-actions">
                      <button onClick={() => loadServerManagement().catch((e) => setMessage(e.message))}><i className="fa-solid fa-rotate-left" aria-hidden="true" /> Reset</button>
                      <button className="btn-start" disabled={settingsSaving || !canOperateServer} onClick={() => saveServerSettings().catch((e) => setMessage(e.message))}>
                        <i className="fa-solid fa-floppy-disk" aria-hidden="true" /> {settingsSaving ? "Saving..." : "Save Server Management"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>}

            {activeView === "users" && canManageUsers && <>
              <h2>Users</h2>
              <div className="users-layout">
                <div className="users-top">
                  {canEditUsers && <button className="btn-start create-user-btn" onClick={() => { setNewUsername(""); setNewEmail(""); setNewPassword(""); setNewRole("viewer"); setShowAddUserModal(true); }}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Add User</button>}
                </div>
                <div className="users-bottom users-list users-table-wrap">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const isOwner = user.role === "owner";
                        return (
                          <tr key={user.id}>
                            <td>{user.username}</td>
                            <td>{user.email || "no-email"}</td>
                            <td>
                              <select
                                disabled={!canEditUsers || isOwner}
                                value={isOwner ? "owner" : (userRoleDraft[user.id] || user.role)}
                                onChange={(e) => setUserRoleDraft((prev) => ({ ...prev, [user.id]: e.target.value as UserRole }))}
                              >
                                {isOwner ? (
                                  <option value="owner">owner</option>
                                ) : (
                                  <>
                                    <option value="admin">admin</option>
                                    <option value="viewer">user</option>
                                  </>
                                )}
                              </select>
                            </td>
                            <td>{user.active ? "active" : "disabled"}</td>
                            <td>
                              <div className="row wrap">
                                <button disabled={!canEditUsers || isOwner} onClick={() => api.updateUser(user.id, { role: userRoleDraft[user.id] || user.role }).then(refreshUsers).catch((e) => setMessage(e.message))}><i className="fa-solid fa-floppy-disk" aria-hidden="true" /> Save Role</button>
                                <button disabled={!canEditUsers || isOwner} onClick={() => api.updateUser(user.id, { active: !user.active }).then(refreshUsers).catch((e) => setMessage(e.message))}>{user.active ? <><i className="fa-solid fa-user-slash" aria-hidden="true" /> Disable</> : <><i className="fa-solid fa-user-check" aria-hidden="true" /> Enable</>}</button>
                                {isOwner && <button onClick={() => regenerateRecoveryKeysForUser(user.id, user.username).catch((e) => setMessage(e.message))}><i className="fa-solid fa-key" aria-hidden="true" /> New PassKeys</button>}
                                <button disabled={!canEditUsers || isOwner} className="btn-danger" onClick={() => api.deleteUser(user.id).then(refreshUsers).catch((e) => setMessage(e.message))}><i className="fa-solid fa-user-minus" aria-hidden="true" /> Remove</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}
          </section>
        </div>

        <footer className="footer-note app-footer">
          This project is not affiliated with Mojang or Microsoft in any way. Licensed under{" "}
          <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noreferrer">GNU v3</a>. Source:{" "}
          <a href="https://github.com/surgamingoninsulin/MC-Control-Panel" target="_blank">MC Control Panel</a>.
        </footer>

        {showServerAddonsModal && (
          <div className="modal-backdrop" onClick={() => setShowServerAddonsModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <ModalCloseButton onClick={() => setShowServerAddonsModal(false)} />
              <h3>Server Addons</h3>
              {serverAddonLoadingId === serverAddonsModalServerId && !serverAddonSummaries[serverAddonsModalServerId] ? (
                <div className="muted">Loading...</div>
              ) : serverAddonSummaries[serverAddonsModalServerId]?.items?.length ? (
                <div className="addon-summary-table-wrap">
                  <table className="addon-summary-table">
                    <thead><tr><th>Name</th><th>Version</th></tr></thead>
                    <tbody>
                      {serverAddonSummaries[serverAddonsModalServerId]!.items.map((item, idx) => (
                        <tr key={`${item.name}-${idx}`}>
                          <td>{item.name}</td>
                          <td>{item.version || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted">No mods/plugins...</div>
              )}
              <div className="row">
                <button onClick={() => setShowServerAddonsModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {showCreateFsModal && (
          <div className="modal-backdrop" onClick={() => setShowCreateFsModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <ModalCloseButton onClick={() => setShowCreateFsModal(false)} />
              {!createFsType && (
                <>
                  <h3>Create New</h3>
                  <div className="row">
                    <button className="btn-start" onClick={() => setCreateFsType("file")}>New File</button>
                    <button onClick={() => setCreateFsType("folder")}>New Folder</button>
                  </div>
                  <div className="row">
                    <button onClick={() => setShowCreateFsModal(false)}>Cancel</button>
                  </div>
                </>
              )}
              {!!createFsType && (
                <>
                  <h3>{createFsType === "file" ? "New File" : "New Folder"}</h3>
                  <input
                    value={createFsName}
                    onChange={(e) => setCreateFsName(e.target.value)}
                    placeholder={createFsType === "file" ? "newfile.txt" : "folder-name"}
                    autoFocus
                  />
                  {!!createFsError && <div className="banner warn">{createFsError}</div>}
                  <div className="row">
                    <button onClick={() => { setCreateFsType(""); setCreateFsName(""); setCreateFsError(""); }}>Back</button>
                    <button className="btn-start" onClick={() => createFsEntryNow().catch((e) => setCreateFsError(e.message))}>Create</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {showMenuDrawer && <div className="menu-drawer-backdrop" onClick={() => setShowMenuDrawer(false)}><aside className="menu-drawer" onClick={(e) => e.stopPropagation()}><div className="menu-drawer-header"><h3>MC Control Panel</h3><button className="menu-toggle-btn" onClick={() => setShowMenuDrawer(false)}><img src="/minecraft-icon.png" alt="Toggle menu" className="menu-toggle-logo" /></button></div><nav className="menu-drawer-nav"><button className={activeView === "console" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("console"); setShowMenuDrawer(false); }}>Console</button><button className={activeView === "players" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("players"); setShowMenuDrawer(false); }}>Players</button><button className={activeView === "files" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("files"); setShowMenuDrawer(false); }}>Files</button><button disabled={!addonsEnabled} title={!addonsEnabled ? "Disabled for vanilla servers" : "Plugins/Mods"} className={activeView === "plugins" ? "menu-btn active" : "menu-btn"} onClick={() => { if (!addonsEnabled) return; goToView("plugins"); setShowMenuDrawer(false); }}>Plugins/Mods</button><button className={activeView === "settings" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("settings"); setShowMenuDrawer(false); }}>Server Management</button>{canManageUsers && <button className={activeView === "users" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("users"); setShowMenuDrawer(false); }}>Users</button>}</nav></aside></div>}

        {showDeleteModal && serverToDelete && <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><ModalCloseButton onClick={() => setShowDeleteModal(false)} /><h3>Delete Server</h3><p>Delete <strong>{serverToDelete.name}</strong>? This cannot be undone.</p><div className="row"><button onClick={() => setShowDeleteModal(false)}>Cancel</button><button className="btn-danger" onClick={() => deleteServerNow().catch((e) => setMessage(e.message))}>Delete</button></div></div></div>}

        {showRenameServerModal && serverToRename && <div className="modal-backdrop" onClick={() => setShowRenameServerModal(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><ModalCloseButton onClick={() => setShowRenameServerModal(false)} /><h3>Rename Server</h3><p>Rename <strong>{serverToRename.name}</strong> and its server folder.</p><input value={renameServerName} onChange={(e) => setRenameServerName(e.target.value)} placeholder="New server name" autoFocus /><div className="row"><button onClick={() => setShowRenameServerModal(false)}>Cancel</button><button className="btn-start" onClick={() => renameServerNow().catch((e) => setMessage(e.message))}>Rename</button></div></div></div>}

        {showEulaModal && (
          <div className="modal-backdrop" onClick={() => setShowEulaModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <ModalCloseButton onClick={() => setShowEulaModal(false)} />
              <h3>Minecraft EULA Required</h3>
              <p>This server cannot start until the Minecraft EULA is accepted.</p>
              <p className="muted">Review the EULA before continuing.</p>
              <div className="row wrap">
                <a className="playit-link-btn" href={eulaState?.link || "https://aka.ms/MinecraftEULA"} target="_blank" rel="noreferrer">Read Minecraft's EULA</a>
              </div>
              <div className="row">
                <button onClick={() => setShowEulaModal(false)}>Cancel</button>
                <button className="btn-start" disabled={serverActionBusy} onClick={() => acceptEulaAndStart().catch((e) => setMessage(e.message))}>
                  {serverActionBusy ? "Starting..." : "Accept EULA and Start"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddServerModal && (
          <div className="modal-backdrop" onClick={() => setShowAddServerModal(false)}>
            <div className="modal-card setup-modal" onClick={(e) => e.stopPropagation()}>
              <ModalCloseButton onClick={() => setShowAddServerModal(false)} />
              <h3>Add Server</h3>
              {addServerMode === "install" && (
                <>
                  <input value={installName} onChange={(e) => setInstallName(e.target.value)} placeholder="Server name" />
                  <div className="jar-options">
                    {serverTypeOptions.map((t) => (
                      <button
                        key={t.id}
                        className={installType === t.id ? "menu-btn active" : "menu-btn"}
                        disabled={!t.enabled}
                        title={t.enabled ? t.label : t.tooltip || "soon"}
                        onClick={() => t.enabled && setInstallType(t.id as ServerInstallType)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <select value={installVersion} onChange={(e) => setInstallVersion(e.target.value)}>
                    <option value="">Choose version</option>
                    {installVersionOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <div className="row">
                    <button onClick={() => openIconModal("install").catch((e) => setMessage(e.message))}>Select Server Icon (Optional)</button>
                  </div>
                  <small className="muted">
                    {installIconFile
                      ? `Selected icon: ${installIconFile}`
                      : "No icon selected. Default icon _31278649105.png will be used."}
                  </small>
                  <div className="row">
                    <button className="btn-start" onClick={() => installServerNow().catch((e) => setMessage(e.message))}>Install</button>
                  </div>
                </>
              )}
              {addServerMode === "import" && (
                <>
                  <input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Server name" />
                  <input
                    ref={importRef}
                    type="file"
                    multiple
                    hidden
                    {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                    onChange={(e) => setImportFiles([...(e.target.files || [])])}
                  />
                  <div className="row">
                    <button onClick={() => importRef.current?.click()}>Browse Folder</button>
                  </div>
                  <div className="row">
                    <button onClick={() => openIconModal("import").catch((e) => setMessage(e.message))}>Select Server Icon (Optional)</button>
                  </div>
                  <small className="muted">
                    {importFiles.length
                      ? `${importFiles.length} files selected from folder`
                      : "Choose the server root folder to import"}
                  </small>
                  <small className="muted">
                    {importIconFile
                      ? `Selected icon: ${importIconFile} (will replace imported server-icon.png if present)`
                      : "No icon selected. Keep imported icon if present, otherwise use default."}
                  </small>
                  <div className="row">
                    <button className="btn-start" onClick={() => importServerNow().catch((e) => setMessage(e.message))}>Import</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {showInstallIconModal && (
          <div className="modal-backdrop" onClick={() => setShowInstallIconModal(false)}>
            <div className="modal-card setup-modal icon-picker-modal" onClick={(e) => e.stopPropagation()}>
              <ModalCloseButton onClick={() => setShowInstallIconModal(false)} />
              <h3>Select Server Icon</h3>
              <div className="icon-picker-grid">
                {iconDatabaseEntries.map((entry) => (
                  <div
                    key={entry.file}
                    className={installIconModalSelectedFile === entry.file ? "icon-picker-item active" : "icon-picker-item"}
                    onClick={() => {
                      setInstallIconModalSelectedFile(entry.file);
                      setInstallIconModalUpload(null);
                    }}
                    title={entry.file}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setInstallIconModalSelectedFile(entry.file);
                        setInstallIconModalUpload(null);
                      }
                    }}
                  >
                    {!entry.isDefault && <button type="button" className="icon-picker-delete-btn" aria-label={`Delete ${entry.file}`} title="Delete image" onClick={(e) => { e.stopPropagation(); deleteInstallIconEntry(entry.file).catch((err) => setMessage(err.message)); }}><i className="fa-solid fa-trash-can" aria-hidden="true" /></button>}
                    <img src={entry.url} alt={entry.file} />
                    <span>{entry.isDefault ? `${entry.file} (default)` : entry.file}</span>
                  </div>
                ))}
              </div>
              <input
                ref={installIconRef}
                type="file"
                accept=".png,image/png"
                hidden
                onChange={(e) => {
                  const file = (e.target.files && e.target.files[0]) || null;
                  setInstallIconModalUpload(file);
                }}
              />
              <div className="row icon-picker-actions">
                <button type="button" onClick={() => installIconRef.current?.click()}>Browse Other Image</button>
                <button type="button" className="btn-start" onClick={() => confirmIconSelection().catch((e) => setMessage(e.message))}>Select Image</button>
              </div>
              <small className="muted">
                {installIconModalUpload
                  ? `Pending upload: ${installIconModalUpload.name}`
                  : installIconModalSelectedFile
                    ? `Selected: ${installIconModalSelectedFile}`
                    : "Select an image or browse a new .png"}
              </small>
            </div>
          </div>
        )}

        {showConfigEditor && configEditor && <div className="modal-backdrop" onClick={() => closeConfigEditor()}><div className="modal-card config-editor-modal" onClick={(e) => e.stopPropagation()}><ModalCloseButton onClick={() => closeConfigEditor()} /><h3>Config Editor</h3><div className="muted">{configEditor.path}</div><div className="config-editor-monaco"><Editor height="55dvh" language={configLanguage(configEditor.path)} theme="vs-dark" value={configEditor.content} onChange={(value) => setConfigEditor({ ...configEditor, content: value ?? "" })} options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", automaticLayout: true }} /></div>{!!configEditorError && <div className="banner warn">{configEditorError}</div>}<div className="row"><button onClick={() => closeConfigEditor()}>Cancel</button><button className="btn-start" onClick={() => saveConfigEditor().catch((e) => setConfigEditorError(e.message))}>Save</button></div></div></div>}

        {currentUser?.mustChangePassword && <div className="modal-backdrop" onClick={(e) => e.stopPropagation()}><div className="modal-card" onClick={(e) => e.stopPropagation()}><ModalCloseButton onClick={() => doLogout().catch((e) => setForcePasswordError(e.message))} /><h3>Set New Password</h3><p>You logged in with a temporary password. Set a new password to continue.</p>{needsRecoveryKeyRegeneration && <div className="banner info">You have 1 or fewer recovery keys left. Regenerate 10 new keys after setting your password.</div>}<div className="password-input-wrap"><input type={showForcePassword ? "text" : "password"} value={forcePassword} onChange={(e) => setForcePassword(e.target.value)} placeholder="New password" /><button type="button" className="password-toggle-btn" onClick={() => setShowForcePassword((prev) => !prev)}>{showForcePassword ? "Hide" : "Show"}</button></div><div className="password-input-wrap"><input type={showForcePasswordConfirm ? "text" : "password"} value={forcePasswordConfirm} onChange={(e) => setForcePasswordConfirm(e.target.value)} placeholder="Confirm password" /><button type="button" className="password-toggle-btn" onClick={() => setShowForcePasswordConfirm((prev) => !prev)}>{showForcePasswordConfirm ? "Hide" : "Show"}</button></div>{!!forcePasswordError && <div className="banner warn">{forcePasswordError}</div>}<div className="row"><button className="btn-start" onClick={() => setForcedPasswordNow().catch((e) => setForcePasswordError(e.message))}>Set</button>{needsRecoveryKeyRegeneration && <button onClick={() => regenerateRecoveryKeysNow().catch((e) => setForcePasswordError(e.message))}>Regenerate Keys</button>}</div></div></div>}

        {showAddUserModal && (
          <div className="modal-backdrop" onClick={() => setShowAddUserModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <ModalCloseButton onClick={() => setShowAddUserModal(false)} />
              <h3>Add User</h3>
              <div className="auth-form-stack">
                <label>Enter username</label>
                <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Enter username" autoFocus />
                <label>Enter email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Enter email" />
                <label>Enter password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter password" />
                <label>Select role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as UiUserRole)}>
                  <option value="viewer">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="row">
                <button onClick={() => setShowAddUserModal(false)}>Cancel</button>
                <button className="btn-start btn-finish" onClick={() => createUserNow().catch((e) => setMessage(e.message))}>Finish</button>
              </div>
            </div>
          </div>
        )}

        {showRecoveryKeysModal && <div className="modal-backdrop" onClick={() => setShowRecoveryKeysModal(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><ModalCloseButton onClick={() => setShowRecoveryKeysModal(false)} /><h3>{recoveryKeysModalTitle}</h3><p className="muted">Save these keys now. Each key can be used once for password recovery.</p><textarea readOnly value={recoveryKeysModalKeys.join("\n")} rows={10} /><div className="row"><button onClick={() => copyRecoveryKeys(recoveryKeysModalKeys).catch((e) => setMessage(e.message))}>Copy</button><button onClick={() => downloadRecoveryKeys(recoveryKeysModalKeys)}>Download</button><button className="btn-start" onClick={() => setShowRecoveryKeysModal(false)}>Done</button></div></div></div>}

        {showInfoModal && <div className="modal-backdrop" onClick={() => setShowInfoModal(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><ModalCloseButton onClick={() => setShowInfoModal(false)} /><h3>Notice</h3><p>{infoModalDetail}</p><div className="row"><button onClick={() => setShowInfoModal(false)}>Close</button></div></div></div>}

        {dragOverlayVisible && (activeView === "files" || (activeView === "plugins" && addonsEnabled)) && <div className="drop-overlay-modal" onDragOver={(e) => e.preventDefault()}><div className="drop-overlay-content"><div className="drop-icon"><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /></div><h3>Drop Files Here</h3><p>{activeView === "files" ? "Upload into current folder" : addonsMode === "plugins" ? "Install plugin artifact(s)" : "Install mod/modpack artifact(s)"}</p></div></div>}
      </main>
    </div>
  );
}
