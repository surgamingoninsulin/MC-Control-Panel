import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "./api";
const STORAGE_KEY_SETUP = "panel.setup.complete";
const STORAGE_KEY_LOGIN_EMAIL = "panel.login.email";
const STORAGE_KEY_LOGIN_PASSWORD = "panel.login.password";
const STORAGE_KEY_REMEMBER_EMAIL = "panel.login.remember.email";
const STORAGE_KEY_REMEMBER_PASSWORD = "panel.login.remember.password";
const STORAGE_KEY_REMEMBER_BOTH = "panel.login.remember.both";
const CONFIG_EXTENSIONS = new Set([".yml", ".yaml", ".json", ".toml", ".properties", ".ini", ".cfg", ".conf"]);
const DEFAULT_SETTINGS = {
    startupScript: "",
    autoRestart: true,
    ramMinGb: null,
    ramMaxGb: null,
    serverIp: "",
    serverPort: null,
    playitEnabled: false,
    playitCommand: ""
};
const DEFAULT_PROPERTIES = {
    path: "server.properties",
    mtime: null,
    fields: []
};
const PROPERTY_CATEGORY_LABELS = {
    access: "Access",
    world: "World",
    gameplay: "Gameplay",
    network: "Network",
    performance: "Performance",
    advanced: "Advanced / Custom"
};
const PROPERTY_CATEGORY_DESCRIPTIONS = {
    access: "Player access, permissions, authentication, and operator-facing rules.",
    world: "World generation and persistent world behavior.",
    gameplay: "Core survival and player experience settings.",
    network: "Ports, MOTD, status visibility, and external connectivity.",
    performance: "Settings that affect load, ticking, and runtime efficiency.",
    advanced: "Specialized or custom properties that usually need extra care."
};
const PROPERTY_DESCRIPTIONS = {
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
const propertyDescription = (field) => PROPERTY_DESCRIPTIONS[field.key] || `Controls the "${field.label}" server property.`;
const isSensitiveProperty = (key) => {
    const lower = key.toLowerCase();
    return lower.includes("secret") || lower.includes("password");
};
const isConfigPath = (pathValue) => {
    const lower = pathValue.toLowerCase();
    const idx = lower.lastIndexOf(".");
    return idx >= 0 && CONFIG_EXTENSIONS.has(lower.slice(idx));
};
const formatUptime = (uptimeMs = 0) => {
    const totalSec = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hours}h ${mins}m ${secs}s`;
};
const configLanguage = (pathValue) => {
    const lower = pathValue.toLowerCase();
    if (lower.endsWith(".json"))
        return "json";
    if (lower.endsWith(".yml") || lower.endsWith(".yaml"))
        return "yaml";
    if (lower.endsWith(".toml"))
        return "ini";
    if (lower.endsWith(".properties") || lower.endsWith(".ini") || lower.endsWith(".cfg") || lower.endsWith(".conf"))
        return "ini";
    return "plaintext";
};
const viewFromPath = (pathName) => {
    const lower = String(pathName || "/").toLowerCase();
    if (lower === "/players")
        return "players";
    if (lower === "/files")
        return "files";
    if (lower === "/plugins-mods")
        return "plugins";
    if (lower === "/settings" || lower === "/server-management")
        return "settings";
    if (lower === "/users")
        return "users";
    return "console";
};
const pathFromView = (view) => {
    if (view === "players")
        return "/players";
    if (view === "files")
        return "/files";
    if (view === "plugins")
        return "/plugins-mods";
    if (view === "settings")
        return "/server-management";
    if (view === "users")
        return "/users";
    return "/console";
};
const ModalCloseButton = ({ onClick }) => (_jsx("button", { type: "button", className: "modal-close-btn", "aria-label": "Close", onClick: onClick, children: _jsx("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" }) }));
const normalizeRelPath = (value) => String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
const readDirectoryEntries = async (reader) => {
    const out = [];
    while (true) {
        const batch = await new Promise((resolve) => {
            reader.readEntries((items) => resolve(items || []), () => resolve([]));
        });
        if (!batch.length)
            break;
        out.push(...batch);
    }
    return out;
};
const walkDroppedEntry = async (entry, parentPath = "") => {
    if (!entry)
        return [];
    if (entry.isFile) {
        return await new Promise((resolve) => {
            entry.file((file) => {
                const rel = normalizeRelPath(parentPath ? `${parentPath}/${file.name}` : file.name);
                resolve([{ file, relativePath: rel }]);
            }, () => resolve([]));
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
const collectDroppedUploads = async (dt) => {
    const items = Array.from(dt.items || []);
    const fromEntries = [];
    for (const item of items) {
        const getEntry = item.webkitGetAsEntry?.bind(item);
        const entry = getEntry ? getEntry() : null;
        if (!entry)
            continue;
        const chunk = await walkDroppedEntry(entry);
        fromEntries.push(...chunk);
    }
    if (fromEntries.length)
        return fromEntries;
    const files = Array.from(dt.files || []);
    return files.map((file) => {
        const rel = "webkitRelativePath" in file ? normalizeRelPath(String(file.webkitRelativePath || "")) : "";
        return { file, relativePath: rel || file.name };
    });
};
export default function App() {
    const [activeView, setActiveView] = useState(() => viewFromPath(window.location.pathname));
    const [showMenuDrawer, setShowMenuDrawer] = useState(false);
    const [message, setMessage] = useState("");
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [infoModalDetail, setInfoModalDetail] = useState("");
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [needsBootstrap, setNeedsBootstrap] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(() => localStorage.getItem(STORAGE_KEY_SETUP) !== "1");
    const [setupStep, setSetupStep] = useState(0);
    const [setupError, setSetupError] = useState("");
    const [setupUsername, setSetupUsername] = useState("");
    const [setupEmail, setSetupEmail] = useState("");
    const [setupPassword, setSetupPassword] = useState("");
    const [setupServerName, setSetupServerName] = useState("");
    const [setupServerType, setSetupServerType] = useState("");
    const [setupVersion, setSetupVersion] = useState("");
    const [setupRecoveryKeys, setSetupRecoveryKeys] = useState([]);
    const [loginUsername, setLoginUsername] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_EMAIL) || "");
    const [loginPassword, setLoginPassword] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_PASSWORD) || "");
    const [rememberEmail, setRememberEmail] = useState(() => localStorage.getItem(STORAGE_KEY_REMEMBER_EMAIL) === "1" || localStorage.getItem(STORAGE_KEY_REMEMBER_BOTH) === "1");
    const [rememberPassword, setRememberPassword] = useState(() => localStorage.getItem(STORAGE_KEY_REMEMBER_PASSWORD) === "1" || localStorage.getItem(STORAGE_KEY_REMEMBER_BOTH) === "1");
    const [loginError, setLoginError] = useState("");
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotRecoveryKey, setForgotRecoveryKey] = useState("");
    const [forgotModalNotice, setForgotModalNotice] = useState("");
    const [forgotModalError, setForgotModalError] = useState("");
    const [needsRecoveryKeyRegeneration, setNeedsRecoveryKeyRegeneration] = useState(false);
    const [showRecoveryKeysModal, setShowRecoveryKeysModal] = useState(false);
    const [recoveryKeysModalTitle, setRecoveryKeysModalTitle] = useState("Recovery Keys");
    const [recoveryKeysModalKeys, setRecoveryKeysModalKeys] = useState([]);
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showSetupPassword, setShowSetupPassword] = useState(false);
    const [servers, setServers] = useState([]);
    const [selectedServerId, setSelectedServerId] = useState("");
    const [status, setStatus] = useState(null);
    const [serverSettings, setServerSettings] = useState(DEFAULT_SETTINGS);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [serverProperties, setServerProperties] = useState(DEFAULT_PROPERTIES);
    const [eulaState, setEulaState] = useState(null);
    const [newPropertyKey, setNewPropertyKey] = useState("");
    const [newPropertyValue, setNewPropertyValue] = useState("");
    const [consoleLines, setConsoleLines] = useState([]);
    const [consoleCursor, setConsoleCursor] = useState(0);
    const [consoleCommand, setConsoleCommand] = useState("");
    const [consoleLoading, setConsoleLoading] = useState(false);
    const [consoleAutoScroll, setConsoleAutoScroll] = useState(true);
    const [serverActionBusy, setServerActionBusy] = useState(false);
    const consoleScrollRef = useRef(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [serverToDelete, setServerToDelete] = useState(null);
    const [showRenameServerModal, setShowRenameServerModal] = useState(false);
    const [serverToRename, setServerToRename] = useState(null);
    const [renameServerName, setRenameServerName] = useState("");
    const [updatingServerId, setUpdatingServerId] = useState("");
    const [hoveredServerId, setHoveredServerId] = useState("");
    const [serverAddonSummaries, setServerAddonSummaries] = useState({});
    const [serverAddonLoadingId, setServerAddonLoadingId] = useState("");
    const [showAddServerModal, setShowAddServerModal] = useState(false);
    const [showServerAddonsModal, setShowServerAddonsModal] = useState(false);
    const [serverAddonsModalServerId, setServerAddonsModalServerId] = useState("");
    const [addServerMode, setAddServerMode] = useState("install");
    const [serverTypeOptions, setServerTypeOptions] = useState([]);
    const [setupVersionOptions, setSetupVersionOptions] = useState([]);
    const [installVersionOptions, setInstallVersionOptions] = useState([]);
    const [installName, setInstallName] = useState("");
    const [installType, setInstallType] = useState("");
    const [installVersion, setInstallVersion] = useState("");
    const [iconDatabaseEntries, setIconDatabaseEntries] = useState([]);
    const [installIconFile, setInstallIconFile] = useState("");
    const [importIconFile, setImportIconFile] = useState("");
    const [iconPickerTarget, setIconPickerTarget] = useState("install");
    const [showInstallIconModal, setShowInstallIconModal] = useState(false);
    const [installIconModalSelectedFile, setInstallIconModalSelectedFile] = useState("");
    const [installIconModalUpload, setInstallIconModalUpload] = useState(null);
    const installIconRef = useRef(null);
    const [importName, setImportName] = useState("");
    const [importFiles, setImportFiles] = useState([]);
    const importRef = useRef(null);
    const [filesPath, setFilesPath] = useState(".");
    const [filesEntries, setFilesEntries] = useState([]);
    const [filesLoading, setFilesLoading] = useState(false);
    const [selectedPaths, setSelectedPaths] = useState([]);
    const [showConfigEditor, setShowConfigEditor] = useState(false);
    const [configEditor, setConfigEditor] = useState(null);
    const [configEditorError, setConfigEditorError] = useState("");
    const [showCreateFsModal, setShowCreateFsModal] = useState(false);
    const [createFsType, setCreateFsType] = useState("");
    const [createFsName, setCreateFsName] = useState("");
    const [createFsError, setCreateFsError] = useState("");
    const [plugins, setPlugins] = useState([]);
    const [pluginsLoading, setPluginsLoading] = useState(false);
    const [selectedAddonKeys, setSelectedAddonKeys] = useState([]);
    const [deletePluginConfigOnRemove, setDeletePluginConfigOnRemove] = useState(true);
    const pluginBrowseRef = useRef(null);
    const [mods, setMods] = useState([]);
    const [modsLoading, setModsLoading] = useState(false);
    const modBrowseRef = useRef(null);
    const [dragOverlayVisible, setDragOverlayVisible] = useState(false);
    const dragCounterRef = useRef(0);
    const activeViewRef = useRef("console");
    const filesPathRef = useRef(".");
    const [users, setUsers] = useState([]);
    const [userRoleDraft, setUserRoleDraft] = useState({});
    const [newUsername, setNewUsername] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState("viewer");
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [forcePassword, setForcePassword] = useState("");
    const [forcePasswordConfirm, setForcePasswordConfirm] = useState("");
    const [forcePasswordError, setForcePasswordError] = useState("");
    const [showForcePassword, setShowForcePassword] = useState(false);
    const [showForcePasswordConfirm, setShowForcePasswordConfirm] = useState(false);
    const [players, setPlayers] = useState([]);
    const [playersLoading, setPlayersLoading] = useState(false);
    const [addPlayerUsername, setAddPlayerUsername] = useState("");
    const [addPlayerWhitelisted, setAddPlayerWhitelisted] = useState(true);
    const [addPlayerOperator, setAddPlayerOperator] = useState(false);
    const [addPlayerBusy, setAddPlayerBusy] = useState(false);
    const [showEulaModal, setShowEulaModal] = useState(false);
    const [revealedPropertyKeys, setRevealedPropertyKeys] = useState({});
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
    const addonsMode = !activeServer || activeServer.type === "vanilla"
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
        }
        catch {
            setCurrentUser(null);
            setIsAuthenticated(false);
            return false;
        }
    };
    const loadServers = async () => {
        const out = await api.listServers();
        setServers(out.servers);
        if (!selectedServerId && out.servers.length)
            setSelectedServerId(out.servers[0].id);
        if (selectedServerId && out.servers.length && !out.servers.some((s) => s.id === selectedServerId))
            setSelectedServerId(out.servers[0].id);
    };
    const loadStatus = async () => { if (!selectedServerId)
        return; setStatus(await api.serverStatus()); };
    const loadServerSettings = async () => {
        if (!selectedServerId)
            return;
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
        if (!selectedServerId)
            return;
        const out = await api.getServerProperties();
        setServerProperties({
            path: out.path,
            mtime: out.mtime,
            fields: out.fields
        });
    };
    const loadEula = async () => {
        if (!selectedServerId)
            return;
        const out = await api.getEula();
        setEulaState(out.eula);
    };
    const loadServerManagement = async () => {
        if (!selectedServerId)
            return;
        setSettingsLoading(true);
        try {
            await Promise.all([loadServerSettings(), loadServerProperties(), loadEula()]);
        }
        finally {
            setSettingsLoading(false);
        }
    };
    const loadConsoleHistory = async (cursor = 0) => {
        if (!selectedServerId)
            return;
        api.setActiveServerId(selectedServerId);
        const out = await api.consoleHistory(cursor);
        setConsoleLines((prev) => {
            if (!cursor)
                return out.lines;
            const next = [...prev, ...out.lines];
            const dedup = new Map(next.map((line) => [line.cursor, line]));
            return Array.from(dedup.values()).sort((a, b) => a.cursor - b.cursor);
        });
        setConsoleCursor(out.nextCursor || cursor);
    };
    const sendConsoleCommand = async () => {
        const command = consoleCommand.trim();
        if (!command)
            return;
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
    const loadVersions = async (type, target) => {
        if (!type) {
            if (target === "setup")
                setSetupVersionOptions([]);
            if (target === "install")
                setInstallVersionOptions([]);
            return;
        }
        const versions = (await api.getServerVersions(type)).versions;
        if (target === "setup")
            setSetupVersionOptions(versions);
        if (target === "install")
            setInstallVersionOptions(versions);
    };
    const loadFiles = async (nextPath = filesPath) => {
        setFilesLoading(true);
        try {
            const out = await api.listFiles(nextPath);
            setFilesPath(nextPath);
            setFilesEntries(out.entries);
            setSelectedPaths([]);
        }
        finally {
            setFilesLoading(false);
        }
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
        }
        finally {
            setPluginsLoading(false);
        }
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
        }
        finally {
            setModsLoading(false);
        }
    };
    const refreshUsers = async () => {
        if (!canManageUsers)
            return;
        const out = await api.listUsers();
        setUsers(out.users);
        setUserRoleDraft(Object.fromEntries(out.users.map((u) => [u.id, u.role])));
    };
    const loadServerAddonSummary = async (server) => {
        setServerAddonLoadingId(server.id);
        try {
            const out = await api.getServerAddonSummary(server.id);
            setServerAddonSummaries((prev) => ({ ...prev, [server.id]: out.summary }));
        }
        finally {
            setServerAddonLoadingId("");
        }
    };
    const loadPlayers = async () => {
        if (!selectedServerId)
            return;
        setPlayersLoading(true);
        try {
            const out = await api.listPlayers();
            setPlayers(out.players);
        }
        finally {
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
            if (state.needsBootstrap) {
                setShowSetupModal(true);
                await loadTypes();
            }
        }).catch(() => void 0);
    }, []);
    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname.toLowerCase();
            if (path === "/setup") {
                setShowSetupModal(true);
                return;
            }
            if (!isAuthenticated)
                return;
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
        if (!selectedServerId)
            return;
        api.setActiveServerId(selectedServerId);
        loadStatus().catch((e) => setMessage(e.message));
        loadConsoleHistory(0).catch((e) => setMessage(e.message));
        loadEula().catch((e) => setMessage(e.message));
        if (activeView === "files")
            loadFiles(".").catch((e) => setMessage(e.message));
        if (activeView === "players")
            loadPlayers().catch((e) => setMessage(e.message));
        if (activeView === "plugins" && addonsEnabled) {
            if (addonsMode === "plugins") {
                loadPlugins().catch((e) => setMessage(e.message));
            }
            else if (addonsMode === "mods") {
                loadMods().catch((e) => setMessage(e.message));
            }
        }
        if (activeView === "settings")
            loadServerManagement().catch((e) => setMessage(e.message));
    }, [selectedServerId]);
    useEffect(() => {
        if (!isAuthenticated || showSetupModal || !selectedServerId)
            return;
        let stopped = false;
        const tick = async () => {
            if (stopped)
                return;
            try {
                await loadStatus();
            }
            catch {
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
    useEffect(() => { if (showSetupModal)
        loadTypes().catch(() => void 0); }, [showSetupModal]);
    useEffect(() => {
        if (activeView === "players" && selectedServerId)
            loadPlayers().catch((e) => setMessage(e.message));
        if (activeView === "users")
            refreshUsers().catch((e) => setMessage(e.message));
        if (activeView === "console" && selectedServerId)
            loadConsoleHistory(0).catch((e) => setMessage(e.message));
        if (activeView === "files" && selectedServerId)
            loadFiles(filesPath).catch((e) => setMessage(e.message));
        if (activeView === "plugins" && selectedServerId && addonsEnabled) {
            if (addonsMode === "plugins") {
                loadPlugins().catch((e) => setMessage(e.message));
            }
            else if (addonsMode === "mods") {
                loadMods().catch((e) => setMessage(e.message));
            }
        }
        if (activeView === "settings" && selectedServerId)
            loadServerManagement().catch((e) => setMessage(e.message));
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
        if (activeView !== "console" || !selectedServerId)
            return;
        setConsoleLoading(true);
        const tick = async () => {
            try {
                await loadConsoleHistory(consoleCursor);
            }
            catch (error) {
                setMessage(error.message);
            }
            finally {
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
        if (!consoleAutoScroll || activeView !== "console")
            return;
        const node = consoleScrollRef.current;
        if (!node)
            return;
        node.scrollTop = node.scrollHeight;
    }, [consoleLines, consoleAutoScroll, activeView]);
    useEffect(() => {
        if (!message)
            return;
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
            if (currentPath !== "/setup")
                window.history.replaceState({}, "", "/setup");
            return;
        }
        if (!isAuthenticated) {
            if (currentPath !== "/login")
                window.history.replaceState({}, "", "/login");
            return;
        }
        const nextPath = pathFromView(activeView);
        if (currentPath !== nextPath)
            window.history.replaceState({}, "", nextPath);
    }, [activeView, isAuthenticated, showSetupModal]);
    useEffect(() => {
        if (!showAddServerModal)
            return;
        if (addServerMode === "import" && importRef.current) {
            importRef.current.setAttribute("webkitdirectory", "");
            importRef.current.setAttribute("directory", "");
        }
        loadServerIcons().catch((e) => setMessage(e.message));
    }, [showAddServerModal, addServerMode]);
    useEffect(() => { loadVersions(installType, "install").catch(() => void 0); }, [installType]);
    useEffect(() => { loadVersions(setupServerType, "setup").catch(() => void 0); }, [setupServerType]);
    useEffect(() => {
        const hasFiles = (dt) => !!dt && Array.from(dt.types || []).includes("Files");
        const handleDragEnter = (e) => {
            if (!hasFiles(e.dataTransfer))
                return;
            dragCounterRef.current += 1;
            if (isAuthenticated && !showSetupModal && (activeViewRef.current === "files" || activeViewRef.current === "plugins"))
                setDragOverlayVisible(true);
            e.preventDefault();
        };
        const handleDragOver = (e) => { if (!hasFiles(e.dataTransfer))
            return; e.preventDefault(); };
        const handleDragLeave = (e) => {
            if (!hasFiles(e.dataTransfer))
                return;
            dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
            if (dragCounterRef.current === 0)
                setDragOverlayVisible(false);
            e.preventDefault();
        };
        const handleDrop = async (e) => {
            const dataTransfer = e.dataTransfer;
            dragCounterRef.current = 0;
            setDragOverlayVisible(false);
            if (!dataTransfer || !(activeViewRef.current === "files" || activeViewRef.current === "plugins"))
                return;
            e.preventDefault();
            try {
                if (activeViewRef.current === "files") {
                    const uploads = await collectDroppedUploads(dataTransfer);
                    if (!uploads.length)
                        return;
                    await api.uploadFiles(filesPathRef.current, uploads);
                    await loadFiles(filesPathRef.current);
                }
                else {
                    const files = Array.from(dataTransfer.files || []);
                    if (!files.length)
                        return;
                    if (!addonsEnabled)
                        return;
                    if (addonsMode === "plugins") {
                        for (const file of files)
                            await api.installPlugin(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
                        await loadPlugins();
                    }
                    else {
                        for (const file of files)
                            await api.installMod(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
                        await loadMods();
                    }
                }
            }
            catch (error) {
                setMessage(error.message);
            }
        };
        const handleEsc = (e) => { if (e.key === "Escape") {
            dragCounterRef.current = 0;
            setDragOverlayVisible(false);
        } };
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
        if (!email.includes("@"))
            return setLoginError("Use email address to log in.");
        try {
            await api.authLogin(email, loginPassword);
            const shouldRememberEmail = rememberEmail;
            const shouldRememberPassword = rememberPassword;
            if (shouldRememberEmail) {
                localStorage.setItem(STORAGE_KEY_LOGIN_EMAIL, email);
            }
            else {
                localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL);
            }
            if (shouldRememberPassword) {
                localStorage.setItem(STORAGE_KEY_LOGIN_PASSWORD, loginPassword);
            }
            else {
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
        }
        catch (error) {
            setLoginError(error.message);
        }
    };
    const doForgotPassword = async () => {
        setForgotModalNotice("");
        setForgotModalError("");
        const email = forgotEmail.trim();
        const passkey = forgotRecoveryKey.trim();
        if (!email)
            return setForgotModalError("Enter email.");
        if (!passkey)
            return setForgotModalError("Enter a recovery key.");
        try {
            const out = await api.authRecoveryLogin(email, passkey);
            setForgotModalNotice("Recovery key accepted. Set a new password now.");
            setShowForgotModal(false);
            setForgotEmail("");
            setForgotRecoveryKey("");
            setNeedsRecoveryKeyRegeneration(out.shouldRegenerate);
            await loadMe();
        }
        catch (error) {
            setForgotModalError(error.message);
        }
    };
    const finishSetup = async () => {
        setSetupError("");
        if (setupStep === 0 && !setupUsername.trim())
            return setSetupError("Set username.");
        if (setupStep === 0 && !setupEmail.trim())
            return setSetupError("Set owner email.");
        if (setupStep === 1 && !setupPassword)
            return setSetupError("Set password.");
        if (setupStep === 2 && !setupServerName.trim())
            return setSetupError("Set server name.");
        if (setupStep === 3 && !setupServerType)
            return setSetupError("Choose server type.");
        if (setupStep === 4 && !setupVersion)
            return setSetupError("Choose version.");
        if (setupStep < 4)
            return setSetupStep((prev) => prev + 1);
        if (setupStep === 4) {
            try {
                const bootstrap = await api.authBootstrap(setupUsername.trim(), setupPassword, setupEmail.trim());
                await api.installServer({ name: setupServerName.trim(), type: setupServerType, version: setupVersion });
                setSetupRecoveryKeys(bootstrap.recoveryKeys || []);
                setSetupStep(5);
            }
            catch (error) {
                setSetupError(error.message);
            }
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
            type: installType,
            version: installVersion,
            iconDatabaseFile: installIconFile
        });
        setShowAddServerModal(false);
        setInstallName("");
        setInstallType("");
        setInstallVersion("");
        setInstallIconFile("");
        setInstallIconModalSelectedFile("");
        setInstallIconModalUpload(null);
        if (installIconRef.current)
            installIconRef.current.value = "";
        await loadServers();
    };
    const importServerNow = async () => {
        if (!importName.trim())
            throw new Error("Server name is required.");
        if (!importFiles.length)
            throw new Error("Select a server root folder first.");
        await api.importServer({ name: importName.trim(), files: importFiles, iconDatabaseFile: importIconFile || undefined });
        setShowAddServerModal(false);
        setImportName("");
        setImportFiles([]);
        setImportIconFile("");
        setInstallIconModalSelectedFile("");
        setInstallIconModalUpload(null);
        if (installIconRef.current)
            installIconRef.current.value = "";
        await loadServers();
    };
    const deleteServerNow = async () => { if (!serverToDelete)
        return; await api.deleteServer(serverToDelete.id); setShowDeleteModal(false); setServerToDelete(null); await loadServers(); };
    const renameServerNow = async () => {
        if (!serverToRename)
            return;
        const out = await api.renameServer(serverToRename.id, renameServerName.trim());
        setShowRenameServerModal(false);
        setServerToRename(null);
        setRenameServerName("");
        await loadServers();
        setSelectedServerId(out.server.id);
    };
    const updateServerNow = async (server) => {
        if (updatingServerId)
            return;
        setUpdatingServerId(server.id);
        try {
            const out = await api.updateServer(server.id);
            await loadServers();
            if (selectedServerId === server.id)
                await loadStatus();
            setMessage(out.update.updated ? `Updated ${out.server.name} to ${out.server.version}.` : `${out.server.name} is already on ${out.server.version}.`);
        }
        finally {
            setUpdatingServerId("");
        }
    };
    const createUserNow = async () => {
        await api.createUser({ username: newUsername.trim(), email: newEmail.trim(), password: newPassword, role: newRole });
        setNewUsername("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("viewer");
        setShowAddUserModal(false);
        await refreshUsers();
    };
    const setForcedPasswordNow = async () => {
        setForcePasswordError("");
        if (!forcePassword)
            return setForcePasswordError("Enter a new password.");
        if (forcePassword !== forcePasswordConfirm)
            return setForcePasswordError("Passwords do not match.");
        const nextPassword = forcePassword;
        await api.authSetPassword(forcePassword);
        setForcePassword("");
        setForcePasswordConfirm("");
        setLoginPassword(nextPassword);
        if (rememberPassword) {
            localStorage.setItem(STORAGE_KEY_LOGIN_PASSWORD, nextPassword);
        }
        await loadMe();
    };
    const copyRecoveryKeys = async (keys) => {
        const value = keys.join("\n");
        try {
            await navigator.clipboard.writeText(value);
            setInfoModalDetail("Recovery keys copied to clipboard.");
            setShowInfoModal(true);
        }
        catch {
            setInfoModalDetail("Copy failed. Please use Download.");
            setShowInfoModal(true);
        }
    };
    const downloadRecoveryKeys = (keys) => {
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
    const regenerateRecoveryKeysForUser = async (userId, username) => {
        const out = await api.regenerateUserRecoveryKeys(userId);
        await refreshUsers();
        setRecoveryKeysModalTitle(`New PassKeys (${username})`);
        setRecoveryKeysModalKeys(out.recoveryKeys || []);
        setShowRecoveryKeysModal(true);
    };
    const runServerAction = async (action) => {
        if (!selectedServerId)
            return;
        if (serverActionBusy)
            return;
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
            }
            else {
                setConsoleLines([]);
                setConsoleCursor(0);
                await api.clearConsoleHistory();
                if (action === "stop")
                    await api.stopServer();
                if (action === "restart")
                    await api.restartServer();
            }
            await Promise.all([loadStatus(), loadConsoleHistory(0)]);
        }
        finally {
            setServerActionBusy(false);
        }
    };
    const acceptEulaAndStart = async () => {
        if (!selectedServerId)
            return;
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
        }
        finally {
            setServerActionBusy(false);
        }
    };
    const openFileEntry = async (entry) => {
        if (entry.type === "directory")
            return loadFiles(entry.path);
        if (entry.path.toLowerCase().endsWith(".jar"))
            return;
        const out = await api.readFile(entry.path);
        setConfigEditor({ path: out.path, content: out.content, originalContent: out.content, mtime: out.mtime });
        setConfigEditorError("");
        setShowConfigEditor(true);
    };
    const closeConfigEditor = () => {
        if (configEditor && configEditor.content !== configEditor.originalContent) {
            if (!window.confirm("You have unsaved changes. Close anyway?"))
                return;
        }
        setShowConfigEditor(false);
        setConfigEditor(null);
        setConfigEditorError("");
    };
    const saveConfigEditor = async () => {
        if (!configEditor)
            return;
        try {
            const out = await api.writeFile({ path: configEditor.path, content: configEditor.content, expectedMtime: configEditor.mtime });
            setConfigEditor({ ...configEditor, mtime: out.mtime, originalContent: configEditor.content });
            await loadFiles(filesPath);
        }
        catch (error) {
            setConfigEditorError(error.message);
        }
    };
    const togglePathSelection = (filePath) => setSelectedPaths((prev) => prev.includes(filePath) ? prev.filter((entry) => entry !== filePath) : [...prev, filePath]);
    const deleteSelectedFiles = async () => { if (!selectedPaths.length)
        return; await api.deletePaths(selectedPaths); await loadFiles(filesPath); };
    const toggleAddonSelection = (addonKey) => setSelectedAddonKeys((prev) => (prev.includes(addonKey) ? prev.filter((id) => id !== addonKey) : [...prev, addonKey]));
    const deleteSelectedAddons = async () => {
        if (!selectedAddonKeys.length)
            return;
        if (addonsMode === "none")
            return;
        for (const addonKey of selectedAddonKeys) {
            if (addonKey.startsWith("plugin:")) {
                await api.removePlugin(addonKey.slice("plugin:".length), deletePluginConfigOnRemove);
            }
            else if (addonKey.startsWith("mod:")) {
                await api.removeMod(addonKey.slice("mod:".length));
            }
        }
        setSelectedAddonKeys([]);
        if (addonsMode === "plugins") {
            await loadPlugins();
        }
        else if (addonsMode === "mods") {
            await loadMods();
        }
    };
    const browsePluginInstall = async (files) => {
        if (!files.length)
            return;
        if (addonsMode !== "plugins") {
            for (const file of files)
                await api.installMod(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
            await loadMods();
            return;
        }
        for (const file of files)
            await api.installPlugin(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
        await loadPlugins();
    };
    const browseModInstall = async (files) => {
        if (!files.length)
            return;
        if (addonsMode !== "mods") {
            for (const file of files)
                await api.installPlugin(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
            await loadPlugins();
            return;
        }
        for (const file of files)
            await api.installMod(file, file.name.toLowerCase().endsWith(".zip") ? "zip" : "jar");
        await loadMods();
    };
    const createFsEntryNow = async () => {
        setCreateFsError("");
        if (!createFsType)
            return setCreateFsError("Choose new file or new folder.");
        const name = createFsName.trim().replace(/\\/g, "/");
        if (!name || name.includes("/") || name.includes(".."))
            return setCreateFsError("Use a valid single name.");
        if (createFsType === "file" && !name.includes("."))
            return setCreateFsError("File name needs extension, e.g. newfile.txt");
        const base = filesPath === "." ? "" : filesPath;
        const target = base ? `${base}/${name}` : name;
        if (createFsType === "folder") {
            await api.mkdir(target);
        }
        else {
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
        }
        finally {
            setSettingsSaving(false);
        }
    };
    const addCustomProperty = () => {
        const key = newPropertyKey.trim();
        if (!key)
            return setMessage("Property key is required.");
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
    const updatePropertyField = (key, value) => {
        setServerProperties((prev) => ({
            ...prev,
            fields: prev.fields.map((field) => (field.key === key ? { ...field, value } : field))
        }));
    };
    const togglePropertyVisibility = (key) => {
        setRevealedPropertyKeys((prev) => ({ ...prev, [key]: !prev[key] }));
    };
    const removePropertyField = (key) => {
        setServerProperties((prev) => ({
            ...prev,
            fields: prev.fields.filter((field) => field.key !== key)
        }));
    };
    const addPlayerNow = async () => {
        const username = addPlayerUsername.trim();
        if (!username)
            return setMessage("Player username is required.");
        if (!addPlayerWhitelisted && !addPlayerOperator)
            return setMessage("Choose whitelist and/or operator.");
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
        }
        finally {
            setAddPlayerBusy(false);
        }
    };
    const togglePlayerState = async (player, patch) => {
        await api.updatePlayer(player.uuid, patch);
        await loadPlayers();
    };
    const removePlayerNow = async (player) => {
        await api.removePlayer(player.uuid, player.name);
        await loadPlayers();
    };
    const openServerAddonsModal = async (server) => {
        setServerAddonsModalServerId(server.id);
        setShowServerAddonsModal(true);
        await loadServerAddonSummary(server);
    };
    const openIconModal = async (target) => {
        setIconPickerTarget(target);
        const icons = await loadServerIcons();
        setInstallIconModalUpload(null);
        const selectedIcon = target === "install" ? installIconFile : importIconFile;
        setInstallIconModalSelectedFile(selectedIcon || icons.find((entry) => entry.isDefault)?.file || "");
        if (installIconRef.current)
            installIconRef.current.value = "";
        setShowInstallIconModal(true);
    };
    const confirmIconSelection = async () => {
        if (installIconModalUpload) {
            const out = await api.uploadServerIcon(installIconModalUpload);
            await loadServerIcons();
            if (iconPickerTarget === "install")
                setInstallIconFile(out.icon.file);
            else
                setImportIconFile(out.icon.file);
            setShowInstallIconModal(false);
            setInstallIconModalUpload(null);
            setInstallIconModalSelectedFile(out.icon.file);
            return;
        }
        if (iconPickerTarget === "install")
            setInstallIconFile(installIconModalSelectedFile);
        else
            setImportIconFile(installIconModalSelectedFile);
        setShowInstallIconModal(false);
    };
    const deleteInstallIconEntry = async (file) => {
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
    const openServerModal = (mode) => {
        if (mode === "import") {
            setImportFiles([]);
            setImportIconFile("");
        }
        if (mode === "install") {
            setInstallIconFile("");
            setInstallIconModalSelectedFile("");
            setInstallIconModalUpload(null);
            if (installIconRef.current)
                installIconRef.current.value = "";
        }
        setAddServerMode(mode);
        setShowAddServerModal(true);
    };
    const goToView = (view) => {
        setActiveView(view);
        const nextPath = pathFromView(view);
        if (window.location.pathname !== nextPath)
            window.history.pushState({}, "", nextPath);
    };
    const groupedPropertyFields = Object.keys(PROPERTY_CATEGORY_LABELS)
        .map((category) => ({
        category,
        label: PROPERTY_CATEGORY_LABELS[category],
        fields: serverProperties.fields.filter((field) => field.category === category)
    }))
        .filter((group) => group.fields.length > 0);
    if (!isAuthenticated || showSetupModal) {
        return (_jsx("div", { className: "shell auth-shell", children: _jsxs("main", { className: "main flow-mode auth-main", children: [showSetupModal ? (_jsxs("div", { className: "auth-panel setup-panel", children: [_jsx("h2", { className: "auth-title", children: "Sign Up" }), _jsxs("p", { className: "muted auth-subtitle", children: ["Initial Setup (", setupStep + 1, "/6)"] }), setupStep === 0 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Username" }), _jsx("input", { value: setupUsername, onChange: (e) => setSetupUsername(e.target.value), placeholder: "Set username", autoFocus: true }), _jsx("label", { children: "Email" }), _jsx("input", { type: "email", value: setupEmail, onChange: (e) => setSetupEmail(e.target.value), placeholder: "Owner email" })] }), setupStep === 1 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Password" }), _jsxs("div", { className: "password-input-wrap", children: [_jsx("input", { type: showSetupPassword ? "text" : "password", value: setupPassword, onChange: (e) => setSetupPassword(e.target.value), placeholder: "Set password", autoFocus: true }), _jsx("button", { type: "button", className: "password-toggle-btn", onClick: () => setShowSetupPassword((prev) => !prev), children: showSetupPassword ? "Hide" : "Show" })] })] }), setupStep === 2 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Server Name" }), _jsx("input", { value: setupServerName, onChange: (e) => setSetupServerName(e.target.value), placeholder: "Set server name", autoFocus: true })] }), setupStep === 3 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Server Type" }), _jsx("div", { className: "jar-options", children: serverTypeOptions.map((t) => _jsx("button", { className: setupServerType === t.id ? "menu-btn active" : "menu-btn", disabled: !t.enabled, title: t.enabled ? t.label : t.tooltip || "soon", onClick: () => t.enabled && setSetupServerType(t.id), children: t.label }, t.id)) })] }), setupStep === 4 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Version" }), _jsxs("select", { value: setupVersion, onChange: (e) => setSetupVersion(e.target.value), children: [_jsx("option", { value: "", children: "Choose version" }), setupVersionOptions.map((v) => _jsx("option", { value: v, children: v }, v))] })] }), setupStep === 5 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Recovery Keys" }), _jsx("p", { className: "muted", children: "Save these 10 keys now. Each key can be used once to recover access if you forget your password." }), _jsx("textarea", { readOnly: true, value: setupRecoveryKeys.join("\n"), rows: 10 }), _jsxs("div", { className: "row", children: [_jsx("button", { type: "button", onClick: () => copyRecoveryKeys(setupRecoveryKeys).catch((e) => setSetupError(e.message)), children: "Copy Keys" }), _jsx("button", { type: "button", onClick: () => downloadRecoveryKeys(setupRecoveryKeys), children: "Download Keys" })] })] }), !!setupError && _jsx("div", { className: "banner warn", children: setupError }), _jsxs("div", { className: "row auth-actions-row", children: [setupStep > 0 && setupStep < 5 && _jsx("button", { onClick: () => setSetupStep((prev) => prev - 1), children: "Back" }), _jsx("button", { className: "btn-start auth-primary-btn", onClick: () => finishSetup().catch((e) => setSetupError(e.message)), children: setupStep < 4 ? "Next" : setupStep === 4 ? "Generate Recovery Keys" : "Finish Setup" })] })] })) : (_jsxs("section", { className: "auth-panel login-panel", children: [_jsx("h2", { className: "auth-title login-title", children: "Log In" }), needsBootstrap && _jsx("div", { className: "banner warn", children: "No account exists yet. Run initial setup." }), _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Email" }), _jsx("input", { type: "email", value: loginUsername, onChange: (e) => setLoginUsername(e.target.value), placeholder: "Email address" }), _jsx("label", { children: "Password" }), _jsxs("div", { className: "password-input-wrap", children: [_jsx("input", { type: showLoginPassword ? "text" : "password", value: loginPassword, onChange: (e) => setLoginPassword(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                                                    doLogin().catch((err) => setLoginError(err.message)); }, placeholder: "Password" }), _jsx("button", { type: "button", className: "password-toggle-btn", onClick: () => setShowLoginPassword((prev) => !prev), children: showLoginPassword ? "Hide" : "Show" })] }), _jsxs("div", { className: "remember-options remember-options-grid", children: [_jsxs("label", { className: "remember-row", children: [_jsx("input", { type: "checkbox", checked: rememberEmail, onChange: (e) => { const next = e.target.checked; setRememberEmail(next); if (!next) {
                                                            localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL);
                                                            localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, "0");
                                                        } } }), "Remember email"] }), _jsxs("button", { type: "button", className: "remember-row remember-action-row", onClick: () => { setForgotEmail(""); setForgotRecoveryKey(""); setForgotModalNotice(""); setForgotModalError(""); setShowForgotModal(true); }, children: [_jsx("span", { className: "remember-action-icon", children: _jsx("i", { className: "fa-solid fa-key", "aria-hidden": "true" }) }), _jsx("span", { children: "Forgot password" })] }), _jsxs("label", { className: "remember-row", children: [_jsx("input", { type: "checkbox", checked: rememberPassword, onChange: (e) => { const next = e.target.checked; setRememberPassword(next); if (!next) {
                                                            localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD);
                                                            localStorage.setItem(STORAGE_KEY_REMEMBER_PASSWORD, "0");
                                                        } } }), "Remember password"] })] })] }), !!loginError && _jsx("div", { className: "banner warn", children: loginError }), _jsx("button", { className: "auth-primary-btn", onClick: () => doLogin().catch((e) => setLoginError(e.message)), children: "Log In" }), needsBootstrap && _jsx("button", { onClick: () => { setShowSetupModal(true); window.history.pushState({}, "", "/setup"); }, children: "Open Setup" })] })), showForgotModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowForgotModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowForgotModal(false) }), _jsx("h3", { children: "Forgot Password" }), _jsx("input", { type: "email", value: forgotEmail, onChange: (e) => setForgotEmail(e.target.value), placeholder: "Enter email" }), _jsx("input", { value: forgotRecoveryKey, onChange: (e) => setForgotRecoveryKey(e.target.value), placeholder: "Enter recovery key" }), !!forgotModalError && _jsx("div", { className: "banner warn", children: forgotModalError }), !!forgotModalNotice && _jsx("div", { className: "banner info", children: forgotModalNotice }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowForgotModal(false), children: "Close" }), _jsx("button", { className: "btn-start", onClick: () => doForgotPassword().catch((e) => setForgotModalError(e.message)), children: "Use Key" })] })] }) }))] }) }));
    }
    return (_jsx("div", { className: "shell", children: _jsxs("main", { className: "main flow-mode", children: [_jsxs("div", { className: "menubar", children: [_jsx("button", { className: "menu-toggle-btn", onClick: () => setShowMenuDrawer(true), children: _jsx("img", { src: "/minecraft-icon.png", alt: "Menu", className: "menu-toggle-logo" }) }), _jsx("strong", { className: "brand", children: "MC Control Panel" }), _jsxs("div", { className: "menu-actions", children: [_jsx("strong", { children: activeServer?.name || "No server selected" }), _jsx("span", { className: isOnline ? "tiny online-dot" : "tiny offline-dot", children: isStarting ? "Starting" : isStopping ? "Stopping" : isRestarting ? "Restarting" : isOnline ? "Online" : "Offline" }), _jsxs("span", { className: "uptime-pill", children: ["Uptime: ", formatUptime(status?.uptimeMs || 0)] }), canOperateServer && _jsxs(_Fragment, { children: [_jsxs("button", { className: "btn-start", disabled: disableStart, onClick: () => runServerAction("start").catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-play", "aria-hidden": "true" }), " Start"] }), _jsxs("button", { className: "btn-stop", disabled: disableStop, onClick: () => runServerAction("stop").catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-stop", "aria-hidden": "true" }), " Stop"] }), _jsxs("button", { className: "btn-restart", disabled: disableRestart, onClick: () => runServerAction("restart").catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-rotate-right", "aria-hidden": "true" }), " Restart"] })] }), _jsx("button", { className: "logout-btn-inline logout-icon-btn", title: "Logout", "aria-label": "Logout", onClick: () => doLogout().catch((e) => setMessage(e.message)), children: _jsx("i", { className: "fa-solid fa-right-from-bracket", "aria-hidden": "true" }) })] })] }), _jsxs("div", { className: "workspace", children: [_jsxs("aside", { className: "servers-column card", children: [_jsx("h2", { children: "Servers" }), _jsx("div", { className: "server-list-vertical", children: servers.map((server) => {
                                        const addonSummary = serverAddonSummaries[server.id];
                                        const summaryTitle = addonSummary?.mode === "plugins" ? "Plugins" : addonSummary?.mode === "mods" ? "Mods" : "Mods/Plugins";
                                        return (_jsxs("div", { className: selectedServerId === server.id ? "server-pill active server-item" : "server-pill server-item", onClick: () => setSelectedServerId(server.id), children: [_jsx("img", { className: "server-list-icon", src: `/api/servers/${encodeURIComponent(server.id)}/icon`, alt: `${server.name} icon` }), _jsxs("div", { className: "server-pill-text", children: [_jsx("strong", { children: server.name }), _jsxs("small", { children: [server.type, " ", server.version] })] }), _jsxs("div", { className: "server-item-meta", children: [_jsx("button", { className: "server-info-btn", "aria-label": `${server.name} addons`, title: `${summaryTitle}`, onClick: (e) => {
                                                                e.stopPropagation();
                                                                openServerAddonsModal(server).catch((err) => setMessage(err.message));
                                                            }, children: _jsx("i", { className: "fa-solid fa-circle-info", "aria-hidden": "true" }) }), canOperateServer && _jsx("button", { className: "server-rename-btn", "aria-label": "Rename server", onClick: (e) => { e.stopPropagation(); setServerToRename(server); setRenameServerName(server.name); setShowRenameServerModal(true); }, title: "Rename server", children: _jsx("i", { className: "fa-solid fa-pencil", "aria-hidden": "true" }) }), canOperateServer && server.type === "purpur" && _jsx("button", { className: "server-update-btn", "aria-label": "Update server jar", onClick: (e) => { e.stopPropagation(); updateServerNow(server).catch((err) => setMessage(err.message)); }, title: "Update server jar", disabled: !!updatingServerId, children: _jsx("i", { className: "fa-solid fa-rotate-right", "aria-hidden": "true" }) }), canOperateServer && _jsx("button", { className: "server-delete-btn", "aria-label": "Delete server", onClick: (e) => { e.stopPropagation(); setServerToDelete(server); setShowDeleteModal(true); }, title: "Delete", children: _jsx("i", { className: "fa-solid fa-trash-can", "aria-hidden": "true" }) })] })] }, server.id));
                                    }) }), canOperateServer && (_jsxs("div", { className: "server-sidebar-actions", children: [_jsxs("button", { onClick: () => openServerModal("import"), children: [_jsx("i", { className: "fa-solid fa-file-import", "aria-hidden": "true" }), " Import Server"] }), _jsxs("button", { className: "btn-start", onClick: () => openServerModal("install"), children: [_jsx("i", { className: "fa-solid fa-server", "aria-hidden": "true" }), " Create Server"] })] }))] }), _jsxs("section", { className: "card grow panel-content-card", children: [activeView === "console" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Console" }), _jsxs("div", { className: "view-layout", children: [_jsxs("div", { className: "console-panel", children: [_jsxs("div", { className: "console-toolbar", children: [_jsx("span", { className: "muted", children: consoleLoading ? "Updating..." : `Lines: ${consoleLines.length}` }), _jsxs("label", { className: "row muted console-autoscroll-toggle", children: [_jsx("input", { type: "checkbox", checked: consoleAutoScroll, onChange: (e) => setConsoleAutoScroll(e.target.checked) }), "Auto Scroll"] }), _jsx("button", { className: "icon-only-btn refresh-btn", "aria-label": "Refresh console", title: "Refresh", onClick: () => loadConsoleHistory(0).catch((e) => setMessage(e.message)), children: _jsx("i", { className: "fa-solid fa-rotate-right", "aria-hidden": "true" }) })] }), _jsxs("div", { ref: consoleScrollRef, className: "console modern-console", children: [!consoleLines.length && _jsx("div", { className: "empty-list", children: "No console output yet." }), consoleLines.map((line) => (_jsxs("div", { className: `line ${line.source === "stderr" ? "stderr" : ""}`, children: [_jsxs("span", { className: "muted", children: ["[", new Date(line.ts).toLocaleTimeString(), "]"] }), " ", line.line] }, line.cursor)))] })] }), _jsxs("div", { className: "row console-command-row", children: [_jsx("input", { value: consoleCommand, onChange: (e) => setConsoleCommand(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                                                                sendConsoleCommand().catch((err) => setMessage(err.message)); }, placeholder: "Type command..." }), _jsx("button", { className: "btn-start", onClick: () => sendConsoleCommand().catch((e) => setMessage(e.message)), children: "Send" })] })] })] }), activeView === "players" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Players" }), _jsx("div", { className: "view-layout", children: _jsxs("div", { className: "settings-card modern-settings-card", children: [_jsxs("div", { className: "players-toolbar", children: [_jsx("input", { value: addPlayerUsername, onChange: (e) => setAddPlayerUsername(e.target.value), placeholder: "Minecraft username", disabled: !canOperateServer || addPlayerBusy }), _jsxs("label", { className: "row muted", children: [_jsx("input", { type: "checkbox", checked: addPlayerWhitelisted, disabled: !canOperateServer || addPlayerBusy, onChange: (e) => setAddPlayerWhitelisted(e.target.checked) }), "Whitelist"] }), _jsxs("label", { className: "row muted", children: [_jsx("input", { type: "checkbox", checked: addPlayerOperator, disabled: !canOperateServer || addPlayerBusy, onChange: (e) => {
                                                                            const next = e.target.checked;
                                                                            setAddPlayerOperator(next);
                                                                            if (next)
                                                                                setAddPlayerWhitelisted(true);
                                                                        } }), "Operator"] }), _jsxs("button", { className: "btn-start", disabled: !canOperateServer || addPlayerBusy, onClick: () => addPlayerNow().catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-user-plus", "aria-hidden": "true" }), " ", addPlayerBusy ? "Adding..." : "Add Player"] })] }), _jsxs("div", { className: "players-list", children: [playersLoading && _jsx("div", { className: "empty-list", children: "Loading players..." }), !playersLoading && !players.length && _jsx("div", { className: "empty-list", children: "No whitelist or operator entries yet." }), !playersLoading && players.map((player) => (_jsxs("div", { className: "player-row", children: [_jsxs("div", { className: "player-main", children: [_jsx("img", { className: "player-head", src: player.headUrl, alt: `${player.name} head` }), _jsxs("div", { className: "player-meta", children: [_jsx("strong", { children: player.name }), _jsx("small", { className: "muted", children: player.uuid })] })] }), _jsxs("div", { className: "player-actions", children: [_jsxs("label", { className: "row muted", children: [_jsx("input", { type: "checkbox", checked: player.whitelisted, disabled: !canOperateServer, onChange: (e) => togglePlayerState(player, { whitelisted: e.target.checked }).catch((err) => setMessage(err.message)) }), "Whitelisted"] }), _jsxs("label", { className: "row muted", children: [_jsx("input", { type: "checkbox", checked: player.operator, disabled: !canOperateServer, onChange: (e) => togglePlayerState(player, { operator: e.target.checked, whitelisted: e.target.checked ? true : player.whitelisted }).catch((err) => setMessage(err.message)) }), "Operator"] }), canOperateServer && (_jsxs("button", { className: "btn-danger", onClick: () => removePlayerNow(player).catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-user-minus", "aria-hidden": "true" }), " Remove"] }))] })] }, player.uuid)))] })] }) })] }), activeView === "files" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Files" }), _jsxs("div", { className: "view-layout", children: [_jsxs("div", { className: "row file-toolbar", children: [_jsx("button", { onClick: () => loadFiles(".").catch((e) => setMessage(e.message)), children: "Root" }), _jsx("button", { onClick: () => {
                                                                const parts = (filesPath === "." ? "." : filesPath).split("/").filter(Boolean);
                                                                parts.pop();
                                                                loadFiles(parts.length ? parts.join("/") : ".").catch((e) => setMessage(e.message));
                                                            }, children: "Up" }), _jsx("span", { className: "path-pill", children: filesPath }), _jsx("span", { className: "toolbar-spacer" }), _jsx("button", { className: "btn-create-entry", "aria-label": "Create file or folder", title: "Create", onClick: () => { setShowCreateFsModal(true); setCreateFsType(""); setCreateFsName(""); setCreateFsError(""); }, children: _jsx("i", { className: "fa-solid fa-plus", "aria-hidden": "true" }) })] }), _jsxs("div", { className: "file-list modern-file-table", children: [_jsxs("div", { className: "file-table-header", children: [_jsx("span", {}), _jsx("span", { children: "Name" }), _jsx("span", { children: "Size" }), _jsx("span", { children: "Last Modified" }), _jsx("span", {})] }), filesLoading && _jsx("div", { className: "empty-list", children: "Loading files..." }), !filesLoading && !filesEntries.length && _jsx("div", { className: "empty-list", children: "No files found." }), !filesLoading && filesEntries.map((entry) => (_jsxs("div", { className: selectedPaths.includes(entry.path) ? "file-item selected modern-file-row" : "file-item modern-file-row", children: [_jsx("span", { className: "row-check", children: _jsx("input", { type: "checkbox", checked: selectedPaths.includes(entry.path), onChange: () => togglePathSelection(entry.path) }) }), _jsxs("div", { className: "entry-main modern-name-cell", onClick: () => openFileEntry(entry).catch((e) => setMessage(e.message)), children: [_jsx("span", { className: entry.type === "directory" ? "entry-icon directory" : "entry-icon file" }), _jsx("span", { className: "entry-name", children: entry.name })] }), _jsx("span", { className: "muted", children: entry.type === "directory" ? "-" : `${entry.size || 0} B` }), _jsx("span", { className: "muted", children: entry.mtime ? new Date(entry.mtime).toLocaleString() : "-" }), _jsx("button", { className: "list-action-btn", onClick: () => openFileEntry(entry).catch((e) => setMessage(e.message)), children: "Open" })] }, entry.path)))] }), _jsx("div", { className: "files-bottom-actions files-bottom-left", children: _jsx("button", { className: "btn-danger", disabled: !selectedPaths.length, onClick: () => deleteSelectedFiles().catch((e) => setMessage(e.message)), children: "Delete Selected" }) })] })] }), activeView === "plugins" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Plugins/Mods" }), _jsx("div", { className: "view-layout", children: !addonsEnabled ? (_jsx("div", { className: "empty-list", children: "Vanilla server selected. Plugins/Mods are disabled for vanilla." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row file-toolbar", children: [_jsx("input", { ref: pluginBrowseRef, type: "file", multiple: true, hidden: true, onChange: (e) => browsePluginInstall([...(e.target.files || [])]).catch((err) => setMessage(err.message)) }), _jsx("input", { ref: modBrowseRef, type: "file", multiple: true, hidden: true, onChange: (e) => browseModInstall([...(e.target.files || [])]).catch((err) => setMessage(err.message)) }), addonsMode === "plugins" ? _jsx("button", { onClick: () => pluginBrowseRef.current?.click(), children: "Add Plugin" }) : _jsx("button", { onClick: () => modBrowseRef.current?.click(), children: "Add Mod/Pack" }), _jsx("button", { className: "btn-danger", disabled: !selectedAddonKeys.length, onClick: () => deleteSelectedAddons().catch((e) => setMessage(e.message)), children: "Remove Selected" }), addonsMode === "plugins" && (_jsxs("label", { className: "row muted", children: [_jsx("input", { type: "checkbox", checked: deletePluginConfigOnRemove, onChange: (e) => setDeletePluginConfigOnRemove(e.target.checked) }), "Also delete config folder"] }))] }), _jsxs("div", { className: "users-list users-table-wrap addons-table-wrap", children: [(pluginsLoading || modsLoading) && _jsx("div", { className: "empty-list", children: "Loading plugins/mods..." }), addonsMode === "plugins" && !pluginsLoading && !plugins.length && _jsx("div", { className: "empty-list", children: "No plugins installed." }), addonsMode === "mods" && !modsLoading && !mods.length && _jsx("div", { className: "empty-list", children: "No mods installed." }), addonsMode === "plugins" && !pluginsLoading && !!plugins.length && (_jsxs("table", { className: "users-table addons-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Name" }), _jsx("th", { children: "Version" }), _jsx("th", { children: "File" })] }) }), _jsx("tbody", { children: plugins.map((plugin) => {
                                                                            const key = `plugin:${plugin.pluginId}`;
                                                                            const selected = selectedAddonKeys.includes(key);
                                                                            return (_jsxs("tr", { className: selected ? "selected-row" : "", onClick: () => toggleAddonSelection(key), children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: selected, onChange: () => toggleAddonSelection(key), onClick: (e) => e.stopPropagation() }) }), _jsx("td", { children: plugin.name || plugin.pluginId }), _jsx("td", { children: plugin.version || "-" }), _jsx("td", { className: "muted", children: plugin.jarPath || plugin.folderPath || "-" })] }, key));
                                                                        }) })] })), addonsMode === "mods" && !modsLoading && !!mods.length && (_jsxs("table", { className: "users-table addons-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Name" }), _jsx("th", { children: "Version" }), _jsx("th", { children: "File" })] }) }), _jsx("tbody", { children: mods.map((mod) => {
                                                                            const key = `mod:${mod.modId}`;
                                                                            const selected = selectedAddonKeys.includes(key);
                                                                            return (_jsxs("tr", { className: selected ? "selected-row" : "", onClick: () => toggleAddonSelection(key), children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: selected, onChange: () => toggleAddonSelection(key), onClick: (e) => e.stopPropagation() }) }), _jsx("td", { children: mod.modId }), _jsx("td", { children: "-" }), _jsx("td", { className: "muted", children: mod.jarPath })] }, key));
                                                                        }) })] }))] })] })) })] }), activeView === "settings" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Server Management" }), _jsx("div", { className: "view-layout", children: settingsLoading ? (_jsx("div", { className: "empty-list", children: "Loading server management..." })) : (_jsxs("div", { className: "settings-layout", children: [_jsxs("div", { className: "settings-card modern-settings-card", children: [_jsxs("div", { className: "management-section", children: [_jsx("h3", { children: "EULA" }), _jsxs("div", { className: "eula-card", children: [_jsxs("div", { children: [_jsx("strong", { children: eulaState?.accepted ? "Accepted" : "Not accepted" }), _jsx("p", { className: "muted", children: "Minecraft requires EULA acceptance before the server can start." })] }), _jsxs("div", { className: "row wrap", children: [_jsx("a", { className: "playit-link-btn", href: eulaState?.link || "https://aka.ms/MinecraftEULA", target: "_blank", rel: "noreferrer", children: "Read Minecraft's EULA" }), canOperateServer && (_jsx("button", { onClick: () => api.setEula(!(eulaState?.accepted)).then((out) => setEulaState(out.eula)).catch((e) => setMessage(e.message)), children: eulaState?.accepted ? "Mark Unaccepted" : "Accept EULA" }))] })] })] }), _jsxs("div", { className: "management-section", children: [_jsx("h3", { children: "Runtime Settings" }), _jsxs("div", { className: "settings-grid", children: [_jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Auto Restart" }), _jsxs("select", { value: serverSettings.autoRestart ? "true" : "false", onChange: (e) => setServerSettings((prev) => ({ ...prev, autoRestart: e.target.value === "true" })), children: [_jsx("option", { value: "true", children: "Enabled" }), _jsx("option", { value: "false", children: "Disabled" })] })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Playit Tunnel" }), _jsxs("select", { value: serverSettings.playitEnabled ? "true" : "false", onChange: (e) => setServerSettings((prev) => ({ ...prev, playitEnabled: e.target.value === "true" })), children: [_jsx("option", { value: "false", children: "Disabled" }), _jsx("option", { value: "true", children: "Enabled" })] })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "RAM Min (GB)" }), _jsx("input", { type: "number", min: 1, step: 1, value: serverSettings.ramMinGb ?? "", onChange: (e) => setServerSettings((prev) => ({ ...prev, ramMinGb: e.target.value === "" ? null : Number(e.target.value) })) })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "RAM Max (GB)" }), _jsx("input", { type: "number", min: 1, step: 1, value: serverSettings.ramMaxGb ?? "", onChange: (e) => setServerSettings((prev) => ({ ...prev, ramMaxGb: e.target.value === "" ? null : Number(e.target.value) })) })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Server IP" }), _jsx("input", { value: serverSettings.serverIp, onChange: (e) => setServerSettings((prev) => ({ ...prev, serverIp: e.target.value })), placeholder: "Leave blank for all interfaces" })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Server Port" }), _jsx("input", { type: "number", min: 1, max: 65535, value: serverSettings.serverPort ?? "", onChange: (e) => setServerSettings((prev) => ({ ...prev, serverPort: e.target.value === "" ? null : Number(e.target.value) })) })] }), _jsxs("label", { className: "settings-field settings-field-wide", children: [_jsx("span", { children: "Playit Command" }), _jsx("input", { value: serverSettings.playitCommand, onChange: (e) => setServerSettings((prev) => ({ ...prev, playitCommand: e.target.value })), placeholder: "playit" })] })] })] }), _jsxs("div", { className: "management-section", children: [_jsx("h3", { children: "Server Properties" }), groupedPropertyFields.map((group) => (_jsxs("div", { className: "properties-group management-subcard", children: [_jsx("div", { className: "properties-group-head", children: _jsxs("div", { children: [_jsx("h4", { children: group.label }), _jsx("p", { className: "muted", children: PROPERTY_CATEGORY_DESCRIPTIONS[group.category] })] }) }), _jsx("div", { className: "properties-grid", children: group.fields.map((field) => {
                                                                                    const sensitive = isSensitiveProperty(field.key);
                                                                                    const isRevealed = !!revealedPropertyKeys[field.key];
                                                                                    const description = propertyDescription(field);
                                                                                    return (_jsxs("div", { className: "property-card", children: [_jsxs("div", { className: "property-card-head", children: [_jsxs("div", { className: "property-title-wrap", children: [_jsx("span", { children: field.label }), _jsxs("div", { className: "property-info-wrap", children: [_jsx("button", { type: "button", className: "property-info-btn", "aria-label": `About ${field.label}`, children: _jsx("i", { className: "fa-solid fa-circle-info", "aria-hidden": "true" }) }), _jsx("div", { className: "property-tooltip", children: description })] })] }), _jsx("small", { className: "muted property-key", children: field.key })] }), _jsx("div", { className: "property-input-wrap", children: field.control === "boolean" ? (_jsxs("select", { value: field.value, onChange: (e) => updatePropertyField(field.key, e.target.value), children: [_jsx("option", { value: "true", children: "True" }), _jsx("option", { value: "false", children: "False" })] })) : field.control === "select" ? (_jsx("select", { value: field.value, onChange: (e) => updatePropertyField(field.key, e.target.value), children: (field.options || []).map((option) => _jsx("option", { value: option, children: option }, option)) })) : (_jsxs("div", { className: "password-input-wrap property-value-wrap", children: [_jsx("input", { type: sensitive && !isRevealed ? "password" : field.control === "number" ? "number" : "text", value: field.value, onChange: (e) => updatePropertyField(field.key, e.target.value) }), sensitive && (_jsx("button", { type: "button", className: "password-toggle-btn", onClick: () => togglePropertyVisibility(field.key), children: isRevealed ? "Hide" : "Show" }))] })) }), _jsx("div", { className: "property-card-footer", children: canOperateServer && field.isCustom && (_jsx("button", { type: "button", className: "list-action-btn property-remove-btn", onClick: () => removePropertyField(field.key), children: "Remove" })) })] }, field.key));
                                                                                }) })] }, group.category))), canOperateServer && (_jsxs("div", { className: "custom-property-row", children: [_jsx("input", { value: newPropertyKey, onChange: (e) => setNewPropertyKey(e.target.value), placeholder: "custom.property-key" }), _jsx("input", { value: newPropertyValue, onChange: (e) => setNewPropertyValue(e.target.value), placeholder: "value" }), _jsx("button", { onClick: addCustomProperty, children: "Add Property" })] }))] }), _jsxs("div", { className: "playit-section", children: [_jsx("h3", { children: "Playit.gg Setup" }), _jsx("p", { className: "muted", children: "Download the Playit agent, run it on this machine, then enable the tunnel settings below." }), _jsxs("div", { className: "playit-downloads", children: [_jsx("a", { className: "playit-link-btn", href: "https://playit.gg/download/windows", target: "_blank", rel: "noreferrer", children: "Download Windows" }), _jsx("a", { className: "playit-link-btn", href: "https://playit.gg/download/linux", target: "_blank", rel: "noreferrer", children: "Download Linux" }), _jsx("a", { className: "playit-link-btn", href: "https://playit.gg/download/macos", target: "_blank", rel: "noreferrer", children: "Download macOS" })] }), _jsxs("div", { className: "playit-steps", children: [_jsxs("p", { children: [_jsx("strong", { children: "1." }), " Run the agent and claim it to your account."] }), _jsxs("p", { children: [_jsx("strong", { children: "2." }), " Create a tunnel and set local port to your Minecraft server port."] }), _jsxs("p", { children: [_jsx("strong", { children: "3." }), " In this panel, set ", _jsx("strong", { children: "Playit Tunnel" }), " to enabled and keep command as ", _jsx("code", { children: "playit" }), "."] }), _jsxs("p", { children: [_jsx("strong", { children: "4." }), " Start the server and join with the Playit address."] })] }), _jsxs("div", { className: "playit-code-block", children: [_jsx("div", { className: "muted", children: "Linux apt install (official docs):" }), _jsx("code", { children: "curl -SsL https://playit-cloud.github.io/ppa/key.gpg | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/playit.gpg >/dev/null" }), _jsx("code", { children: "echo \"deb [signed-by=/etc/apt/trusted.gpg.d/playit.gpg] https://playit-cloud.github.io/ppa/data ./\" | sudo tee /etc/apt/sources.list.d/playit-cloud.list" }), _jsx("code", { children: "sudo apt update && sudo apt install playit" }), _jsx("code", { children: "playit setup" })] })] })] }), _jsxs("div", { className: "row settings-actions settings-bottom-actions", children: [_jsxs("button", { onClick: () => loadServerManagement().catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-rotate-left", "aria-hidden": "true" }), " Reset"] }), _jsxs("button", { className: "btn-start", disabled: settingsSaving || !canOperateServer, onClick: () => saveServerSettings().catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-floppy-disk", "aria-hidden": "true" }), " ", settingsSaving ? "Saving..." : "Save Server Management"] })] })] })) })] }), activeView === "users" && canManageUsers && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Users" }), _jsxs("div", { className: "users-layout", children: [_jsx("div", { className: "users-top", children: canEditUsers && _jsxs("button", { className: "btn-start create-user-btn", onClick: () => { setNewUsername(""); setNewEmail(""); setNewPassword(""); setNewRole("viewer"); setShowAddUserModal(true); }, children: [_jsx("i", { className: "fa-solid fa-user-plus", "aria-hidden": "true" }), " Add User"] }) }), _jsx("div", { className: "users-bottom users-list users-table-wrap", children: _jsxs("table", { className: "users-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Username" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: users.map((user) => {
                                                                    const isOwner = user.role === "owner";
                                                                    return (_jsxs("tr", { children: [_jsx("td", { children: user.username }), _jsx("td", { children: user.email || "no-email" }), _jsx("td", { children: _jsx("select", { disabled: !canEditUsers || isOwner, value: isOwner ? "owner" : (userRoleDraft[user.id] || user.role), onChange: (e) => setUserRoleDraft((prev) => ({ ...prev, [user.id]: e.target.value })), children: isOwner ? (_jsx("option", { value: "owner", children: "owner" })) : (_jsxs(_Fragment, { children: [_jsx("option", { value: "admin", children: "admin" }), _jsx("option", { value: "viewer", children: "user" })] })) }) }), _jsx("td", { children: user.active ? "active" : "disabled" }), _jsx("td", { children: _jsxs("div", { className: "row wrap", children: [_jsxs("button", { disabled: !canEditUsers || isOwner, onClick: () => api.updateUser(user.id, { role: userRoleDraft[user.id] || user.role }).then(refreshUsers).catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-floppy-disk", "aria-hidden": "true" }), " Save Role"] }), _jsx("button", { disabled: !canEditUsers || isOwner, onClick: () => api.updateUser(user.id, { active: !user.active }).then(refreshUsers).catch((e) => setMessage(e.message)), children: user.active ? _jsxs(_Fragment, { children: [_jsx("i", { className: "fa-solid fa-user-slash", "aria-hidden": "true" }), " Disable"] }) : _jsxs(_Fragment, { children: [_jsx("i", { className: "fa-solid fa-user-check", "aria-hidden": "true" }), " Enable"] }) }), isOwner && _jsxs("button", { onClick: () => regenerateRecoveryKeysForUser(user.id, user.username).catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-key", "aria-hidden": "true" }), " New PassKeys"] }), _jsxs("button", { disabled: !canEditUsers || isOwner, className: "btn-danger", onClick: () => api.deleteUser(user.id).then(refreshUsers).catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-user-minus", "aria-hidden": "true" }), " Remove"] })] }) })] }, user.id));
                                                                }) })] }) })] })] })] })] }), _jsxs("footer", { className: "footer-note app-footer", children: ["This project is not affiliated with Mojang or Microsoft in any way. Licensed under", " ", _jsx("a", { href: "https://www.gnu.org/licenses/gpl-3.0.en.html", target: "_blank", rel: "noreferrer", children: "GNU v3" }), ". Source:", " ", _jsx("a", { href: "https://github.com/surgamingoninsulin/MC-Control-Panel", target: "_blank", children: "MC Control Panel" }), "."] }), showServerAddonsModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowServerAddonsModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowServerAddonsModal(false) }), _jsx("h3", { children: "Server Addons" }), serverAddonLoadingId === serverAddonsModalServerId && !serverAddonSummaries[serverAddonsModalServerId] ? (_jsx("div", { className: "muted", children: "Loading..." })) : serverAddonSummaries[serverAddonsModalServerId]?.items?.length ? (_jsx("div", { className: "addon-summary-table-wrap", children: _jsxs("table", { className: "addon-summary-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Version" })] }) }), _jsx("tbody", { children: serverAddonSummaries[serverAddonsModalServerId].items.map((item, idx) => (_jsxs("tr", { children: [_jsx("td", { children: item.name }), _jsx("td", { children: item.version || "-" })] }, `${item.name}-${idx}`))) })] }) })) : (_jsx("div", { className: "muted", children: "No mods/plugins..." })), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => setShowServerAddonsModal(false), children: "Close" }) })] }) })), showCreateFsModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowCreateFsModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowCreateFsModal(false) }), !createFsType && (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Create New" }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn-start", onClick: () => setCreateFsType("file"), children: "New File" }), _jsx("button", { onClick: () => setCreateFsType("folder"), children: "New Folder" })] }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => setShowCreateFsModal(false), children: "Cancel" }) })] })), !!createFsType && (_jsxs(_Fragment, { children: [_jsx("h3", { children: createFsType === "file" ? "New File" : "New Folder" }), _jsx("input", { value: createFsName, onChange: (e) => setCreateFsName(e.target.value), placeholder: createFsType === "file" ? "newfile.txt" : "folder-name", autoFocus: true }), !!createFsError && _jsx("div", { className: "banner warn", children: createFsError }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => { setCreateFsType(""); setCreateFsName(""); setCreateFsError(""); }, children: "Back" }), _jsx("button", { className: "btn-start", onClick: () => createFsEntryNow().catch((e) => setCreateFsError(e.message)), children: "Create" })] })] }))] }) })), showMenuDrawer && _jsx("div", { className: "menu-drawer-backdrop", onClick: () => setShowMenuDrawer(false), children: _jsxs("aside", { className: "menu-drawer", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "menu-drawer-header", children: [_jsx("h3", { children: "MC Control Panel" }), _jsx("button", { className: "menu-toggle-btn", onClick: () => setShowMenuDrawer(false), children: _jsx("img", { src: "/minecraft-icon.png", alt: "Toggle menu", className: "menu-toggle-logo" }) })] }), _jsxs("nav", { className: "menu-drawer-nav", children: [_jsx("button", { className: activeView === "console" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("console"); setShowMenuDrawer(false); }, children: "Console" }), _jsx("button", { className: activeView === "players" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("players"); setShowMenuDrawer(false); }, children: "Players" }), _jsx("button", { className: activeView === "files" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("files"); setShowMenuDrawer(false); }, children: "Files" }), _jsx("button", { disabled: !addonsEnabled, title: !addonsEnabled ? "Disabled for vanilla servers" : "Plugins/Mods", className: activeView === "plugins" ? "menu-btn active" : "menu-btn", onClick: () => { if (!addonsEnabled)
                                            return; goToView("plugins"); setShowMenuDrawer(false); }, children: "Plugins/Mods" }), _jsx("button", { className: activeView === "settings" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("settings"); setShowMenuDrawer(false); }, children: "Server Management" }), canManageUsers && _jsx("button", { className: activeView === "users" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("users"); setShowMenuDrawer(false); }, children: "Users" })] })] }) }), showDeleteModal && serverToDelete && _jsx("div", { className: "modal-backdrop", onClick: () => setShowDeleteModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowDeleteModal(false) }), _jsx("h3", { children: "Delete Server" }), _jsxs("p", { children: ["Delete ", _jsx("strong", { children: serverToDelete.name }), "? This cannot be undone."] }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowDeleteModal(false), children: "Cancel" }), _jsx("button", { className: "btn-danger", onClick: () => deleteServerNow().catch((e) => setMessage(e.message)), children: "Delete" })] })] }) }), showRenameServerModal && serverToRename && _jsx("div", { className: "modal-backdrop", onClick: () => setShowRenameServerModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowRenameServerModal(false) }), _jsx("h3", { children: "Rename Server" }), _jsxs("p", { children: ["Rename ", _jsx("strong", { children: serverToRename.name }), " and its server folder."] }), _jsx("input", { value: renameServerName, onChange: (e) => setRenameServerName(e.target.value), placeholder: "New server name", autoFocus: true }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowRenameServerModal(false), children: "Cancel" }), _jsx("button", { className: "btn-start", onClick: () => renameServerNow().catch((e) => setMessage(e.message)), children: "Rename" })] })] }) }), showEulaModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowEulaModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowEulaModal(false) }), _jsx("h3", { children: "Minecraft EULA Required" }), _jsx("p", { children: "This server cannot start until the Minecraft EULA is accepted." }), _jsx("p", { className: "muted", children: "Review the EULA before continuing." }), _jsx("div", { className: "row wrap", children: _jsx("a", { className: "playit-link-btn", href: eulaState?.link || "https://aka.ms/MinecraftEULA", target: "_blank", rel: "noreferrer", children: "Read Minecraft's EULA" }) }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowEulaModal(false), children: "Cancel" }), _jsx("button", { className: "btn-start", disabled: serverActionBusy, onClick: () => acceptEulaAndStart().catch((e) => setMessage(e.message)), children: serverActionBusy ? "Starting..." : "Accept EULA and Start" })] })] }) })), showAddServerModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowAddServerModal(false), children: _jsxs("div", { className: "modal-card setup-modal", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowAddServerModal(false) }), _jsx("h3", { children: "Add Server" }), addServerMode === "install" && (_jsxs(_Fragment, { children: [_jsx("input", { value: installName, onChange: (e) => setInstallName(e.target.value), placeholder: "Server name" }), _jsx("div", { className: "jar-options", children: serverTypeOptions.map((t) => (_jsx("button", { className: installType === t.id ? "menu-btn active" : "menu-btn", disabled: !t.enabled, title: t.enabled ? t.label : t.tooltip || "soon", onClick: () => t.enabled && setInstallType(t.id), children: t.label }, t.id))) }), _jsxs("select", { value: installVersion, onChange: (e) => setInstallVersion(e.target.value), children: [_jsx("option", { value: "", children: "Choose version" }), installVersionOptions.map((v) => (_jsx("option", { value: v, children: v }, v)))] }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => openIconModal("install").catch((e) => setMessage(e.message)), children: "Select Server Icon (Optional)" }) }), _jsx("small", { className: "muted", children: installIconFile
                                            ? `Selected icon: ${installIconFile}`
                                            : "No icon selected. Default icon _31278649105.png will be used." }), _jsx("div", { className: "row", children: _jsx("button", { className: "btn-start", onClick: () => installServerNow().catch((e) => setMessage(e.message)), children: "Install" }) })] })), addServerMode === "import" && (_jsxs(_Fragment, { children: [_jsx("input", { value: importName, onChange: (e) => setImportName(e.target.value), placeholder: "Server name" }), _jsx("input", { ref: importRef, type: "file", multiple: true, hidden: true, ...{ webkitdirectory: "", directory: "" }, onChange: (e) => setImportFiles([...(e.target.files || [])]) }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => importRef.current?.click(), children: "Browse Folder" }) }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => openIconModal("import").catch((e) => setMessage(e.message)), children: "Select Server Icon (Optional)" }) }), _jsx("small", { className: "muted", children: importFiles.length
                                            ? `${importFiles.length} files selected from folder`
                                            : "Choose the server root folder to import" }), _jsx("small", { className: "muted", children: importIconFile
                                            ? `Selected icon: ${importIconFile} (will replace imported server-icon.png if present)`
                                            : "No icon selected. Keep imported icon if present, otherwise use default." }), _jsx("div", { className: "row", children: _jsx("button", { className: "btn-start", onClick: () => importServerNow().catch((e) => setMessage(e.message)), children: "Import" }) })] }))] }) })), showInstallIconModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowInstallIconModal(false), children: _jsxs("div", { className: "modal-card setup-modal icon-picker-modal", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowInstallIconModal(false) }), _jsx("h3", { children: "Select Server Icon" }), _jsx("div", { className: "icon-picker-grid", children: iconDatabaseEntries.map((entry) => (_jsxs("div", { className: installIconModalSelectedFile === entry.file ? "icon-picker-item active" : "icon-picker-item", onClick: () => {
                                        setInstallIconModalSelectedFile(entry.file);
                                        setInstallIconModalUpload(null);
                                    }, title: entry.file, role: "button", tabIndex: 0, onKeyDown: (e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setInstallIconModalSelectedFile(entry.file);
                                            setInstallIconModalUpload(null);
                                        }
                                    }, children: [!entry.isDefault && _jsx("button", { type: "button", className: "icon-picker-delete-btn", "aria-label": `Delete ${entry.file}`, title: "Delete image", onClick: (e) => { e.stopPropagation(); deleteInstallIconEntry(entry.file).catch((err) => setMessage(err.message)); }, children: _jsx("i", { className: "fa-solid fa-trash-can", "aria-hidden": "true" }) }), _jsx("img", { src: entry.url, alt: entry.file }), _jsx("span", { children: entry.isDefault ? `${entry.file} (default)` : entry.file })] }, entry.file))) }), _jsx("input", { ref: installIconRef, type: "file", accept: ".png,image/png", hidden: true, onChange: (e) => {
                                    const file = (e.target.files && e.target.files[0]) || null;
                                    setInstallIconModalUpload(file);
                                } }), _jsxs("div", { className: "row icon-picker-actions", children: [_jsx("button", { type: "button", onClick: () => installIconRef.current?.click(), children: "Browse Other Image" }), _jsx("button", { type: "button", className: "btn-start", onClick: () => confirmIconSelection().catch((e) => setMessage(e.message)), children: "Select Image" })] }), _jsx("small", { className: "muted", children: installIconModalUpload
                                    ? `Pending upload: ${installIconModalUpload.name}`
                                    : installIconModalSelectedFile
                                        ? `Selected: ${installIconModalSelectedFile}`
                                        : "Select an image or browse a new .png" })] }) })), showConfigEditor && configEditor && _jsx("div", { className: "modal-backdrop", onClick: () => closeConfigEditor(), children: _jsxs("div", { className: "modal-card config-editor-modal", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => closeConfigEditor() }), _jsx("h3", { children: "Config Editor" }), _jsx("div", { className: "muted", children: configEditor.path }), _jsx("div", { className: "config-editor-monaco", children: _jsx(Editor, { height: "55dvh", language: configLanguage(configEditor.path), theme: "vs-dark", value: configEditor.content, onChange: (value) => setConfigEditor({ ...configEditor, content: value ?? "" }), options: { minimap: { enabled: false }, fontSize: 13, wordWrap: "on", automaticLayout: true } }) }), !!configEditorError && _jsx("div", { className: "banner warn", children: configEditorError }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => closeConfigEditor(), children: "Cancel" }), _jsx("button", { className: "btn-start", onClick: () => saveConfigEditor().catch((e) => setConfigEditorError(e.message)), children: "Save" })] })] }) }), currentUser?.mustChangePassword && _jsx("div", { className: "modal-backdrop", onClick: (e) => e.stopPropagation(), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => doLogout().catch((e) => setForcePasswordError(e.message)) }), _jsx("h3", { children: "Set New Password" }), _jsx("p", { children: "You logged in with a temporary password. Set a new password to continue." }), needsRecoveryKeyRegeneration && _jsx("div", { className: "banner info", children: "You have 1 or fewer recovery keys left. Regenerate 10 new keys after setting your password." }), _jsxs("div", { className: "password-input-wrap", children: [_jsx("input", { type: showForcePassword ? "text" : "password", value: forcePassword, onChange: (e) => setForcePassword(e.target.value), placeholder: "New password" }), _jsx("button", { type: "button", className: "password-toggle-btn", onClick: () => setShowForcePassword((prev) => !prev), children: showForcePassword ? "Hide" : "Show" })] }), _jsxs("div", { className: "password-input-wrap", children: [_jsx("input", { type: showForcePasswordConfirm ? "text" : "password", value: forcePasswordConfirm, onChange: (e) => setForcePasswordConfirm(e.target.value), placeholder: "Confirm password" }), _jsx("button", { type: "button", className: "password-toggle-btn", onClick: () => setShowForcePasswordConfirm((prev) => !prev), children: showForcePasswordConfirm ? "Hide" : "Show" })] }), !!forcePasswordError && _jsx("div", { className: "banner warn", children: forcePasswordError }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn-start", onClick: () => setForcedPasswordNow().catch((e) => setForcePasswordError(e.message)), children: "Set" }), needsRecoveryKeyRegeneration && _jsx("button", { onClick: () => regenerateRecoveryKeysNow().catch((e) => setForcePasswordError(e.message)), children: "Regenerate Keys" })] })] }) }), showAddUserModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowAddUserModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowAddUserModal(false) }), _jsx("h3", { children: "Add User" }), _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Enter username" }), _jsx("input", { value: newUsername, onChange: (e) => setNewUsername(e.target.value), placeholder: "Enter username", autoFocus: true }), _jsx("label", { children: "Enter email" }), _jsx("input", { type: "email", value: newEmail, onChange: (e) => setNewEmail(e.target.value), placeholder: "Enter email" }), _jsx("label", { children: "Enter password" }), _jsx("input", { type: "password", value: newPassword, onChange: (e) => setNewPassword(e.target.value), placeholder: "Enter password" }), _jsx("label", { children: "Select role" }), _jsxs("select", { value: newRole, onChange: (e) => setNewRole(e.target.value), children: [_jsx("option", { value: "viewer", children: "user" }), _jsx("option", { value: "admin", children: "admin" })] })] }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowAddUserModal(false), children: "Cancel" }), _jsx("button", { className: "btn-start btn-finish", onClick: () => createUserNow().catch((e) => setMessage(e.message)), children: "Finish" })] })] }) })), showRecoveryKeysModal && _jsx("div", { className: "modal-backdrop", onClick: () => setShowRecoveryKeysModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowRecoveryKeysModal(false) }), _jsx("h3", { children: recoveryKeysModalTitle }), _jsx("p", { className: "muted", children: "Save these keys now. Each key can be used once for password recovery." }), _jsx("textarea", { readOnly: true, value: recoveryKeysModalKeys.join("\n"), rows: 10 }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => copyRecoveryKeys(recoveryKeysModalKeys).catch((e) => setMessage(e.message)), children: "Copy" }), _jsx("button", { onClick: () => downloadRecoveryKeys(recoveryKeysModalKeys), children: "Download" }), _jsx("button", { className: "btn-start", onClick: () => setShowRecoveryKeysModal(false), children: "Done" })] })] }) }), showInfoModal && _jsx("div", { className: "modal-backdrop", onClick: () => setShowInfoModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx(ModalCloseButton, { onClick: () => setShowInfoModal(false) }), _jsx("h3", { children: "Notice" }), _jsx("p", { children: infoModalDetail }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => setShowInfoModal(false), children: "Close" }) })] }) }), dragOverlayVisible && (activeView === "files" || (activeView === "plugins" && addonsEnabled)) && _jsx("div", { className: "drop-overlay-modal", onDragOver: (e) => e.preventDefault(), children: _jsxs("div", { className: "drop-overlay-content", children: [_jsx("div", { className: "drop-icon", children: _jsx("i", { className: "fa-solid fa-cloud-arrow-up", "aria-hidden": "true" }) }), _jsx("h3", { children: "Drop Files Here" }), _jsx("p", { children: activeView === "files" ? "Upload into current folder" : addonsMode === "plugins" ? "Install plugin artifact(s)" : "Install mod/modpack artifact(s)" })] }) })] }) }));
}
