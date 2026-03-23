import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "./api";
const STORAGE_KEY_SETUP = "panel.setup.complete";
const STORAGE_KEY_LOGIN_REMEMBER = "panel.login.remember";
const STORAGE_KEY_LOGIN_EMAIL = "panel.login.email";
const STORAGE_KEY_LOGIN_PASSWORD = "panel.login.password";
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
const isAuthRelatedMessage = (value) => {
    const lower = value.toLowerCase();
    return (lower.includes("authentication required") ||
        lower.includes("401") ||
        lower.includes("account is disabled") ||
        lower.includes("invalid email or password"));
};
const viewFromPath = (pathName) => {
    const lower = String(pathName || "/").toLowerCase();
    if (lower === "/files")
        return "files";
    if (lower === "/plugins-mods")
        return "plugins";
    if (lower === "/settings")
        return "settings";
    if (lower === "/users")
        return "users";
    return "console";
};
const pathFromView = (view) => {
    if (view === "files")
        return "/files";
    if (view === "plugins")
        return "/plugins-mods";
    if (view === "settings")
        return "/settings";
    if (view === "users")
        return "/users";
    return "/console";
};
export default function App() {
    const [activeView, setActiveView] = useState(() => viewFromPath(window.location.pathname));
    const [showMenuDrawer, setShowMenuDrawer] = useState(false);
    const [message, setMessage] = useState("");
    const [showAuthErrorModal, setShowAuthErrorModal] = useState(false);
    const [authErrorDetail, setAuthErrorDetail] = useState("");
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
    const [loginUsername, setLoginUsername] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_EMAIL) || "");
    const [loginPassword, setLoginPassword] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_PASSWORD) || "");
    const [rememberCredentials, setRememberCredentials] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_REMEMBER) === "1");
    const [loginError, setLoginError] = useState("");
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotModalNotice, setForgotModalNotice] = useState("");
    const [forgotModalError, setForgotModalError] = useState("");
    const [servers, setServers] = useState([]);
    const [selectedServerId, setSelectedServerId] = useState("");
    const [status, setStatus] = useState(null);
    const [serverSettings, setServerSettings] = useState(DEFAULT_SETTINGS);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [consoleLines, setConsoleLines] = useState([]);
    const [consoleCursor, setConsoleCursor] = useState(0);
    const [consoleCommand, setConsoleCommand] = useState("");
    const [consoleLoading, setConsoleLoading] = useState(false);
    const [consoleAutoScroll, setConsoleAutoScroll] = useState(true);
    const [serverActionBusy, setServerActionBusy] = useState(false);
    const consoleScrollRef = useRef(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [serverToDelete, setServerToDelete] = useState(null);
    const [updatingServerId, setUpdatingServerId] = useState("");
    const [showAddServerModal, setShowAddServerModal] = useState(false);
    const [addServerMode, setAddServerMode] = useState("chooser");
    const [serverTypeOptions, setServerTypeOptions] = useState([]);
    const [setupVersionOptions, setSetupVersionOptions] = useState([]);
    const [installVersionOptions, setInstallVersionOptions] = useState([]);
    const [installName, setInstallName] = useState("");
    const [installType, setInstallType] = useState("");
    const [installVersion, setInstallVersion] = useState("");
    const [installIconFile, setInstallIconFile] = useState(null);
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
    const canManageUsers = currentUser?.role === "owner";
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
        setSettingsLoading(true);
        try {
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
        if (activeView === "files")
            loadFiles(".").catch((e) => setMessage(e.message));
        if (activeView === "plugins" && addonsEnabled) {
            if (addonsMode === "plugins") {
                loadPlugins().catch((e) => setMessage(e.message));
            }
            else if (addonsMode === "mods") {
                loadMods().catch((e) => setMessage(e.message));
            }
        }
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
            loadServerSettings().catch((e) => setMessage(e.message));
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
        if (!message || !isAuthRelatedMessage(message))
            return;
        setAuthErrorDetail(message);
        setShowAuthErrorModal(true);
        setMessage("");
    }, [message]);
    useEffect(() => {
        if (!message || isAuthRelatedMessage(message))
            return;
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
        if (showAddServerModal && importRef.current) {
            importRef.current.setAttribute("webkitdirectory", "");
            importRef.current.setAttribute("directory", "");
        }
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
            const files = Array.from(e.dataTransfer?.files || []);
            dragCounterRef.current = 0;
            setDragOverlayVisible(false);
            if (!files.length || !(activeViewRef.current === "files" || activeViewRef.current === "plugins"))
                return;
            e.preventDefault();
            try {
                if (activeViewRef.current === "files") {
                    await api.uploadFiles(filesPathRef.current, files);
                    await loadFiles(filesPathRef.current);
                }
                else {
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
            if (rememberCredentials) {
                localStorage.setItem(STORAGE_KEY_LOGIN_REMEMBER, "1");
                localStorage.setItem(STORAGE_KEY_LOGIN_EMAIL, email);
                localStorage.setItem(STORAGE_KEY_LOGIN_PASSWORD, loginPassword);
            }
            else {
                localStorage.removeItem(STORAGE_KEY_LOGIN_REMEMBER);
                localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL);
                localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD);
            }
            await loadMe();
            await Promise.all([loadTypes(), loadServers()]);
            setActiveView(viewFromPath(window.location.pathname));
            setNeedsBootstrap(false);
        }
        catch (error) {
            setLoginError(error.message);
        }
    };
    const doForgotPassword = async () => {
        setForgotModalNotice("");
        setForgotModalError("");
        const email = forgotEmail.trim();
        if (!email)
            return setForgotModalError("Enter email.");
        try {
            const out = await api.requestPasswordReset(email);
            if (out.sent) {
                setForgotModalNotice("If the email exists, the email is sent.");
            }
            else if (out.reason === "too-soon") {
                setForgotModalNotice("A temporary password was sent recently. Use the newest email and wait 45 seconds before requesting again.");
            }
            else if (out.reason === "smtp-missing") {
                setForgotModalNotice("If the email exists, reset data is generated, but SMTP is not configured to send mail.");
            }
            else {
                setForgotModalNotice("If the email exists, the email is sent.");
            }
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
        try {
            await api.authBootstrap(setupUsername.trim(), setupPassword, setupEmail.trim());
            await api.installServer({ name: setupServerName.trim(), type: setupServerType, version: setupVersion });
            localStorage.setItem(STORAGE_KEY_SETUP, "1");
            setShowSetupModal(false);
            setNeedsBootstrap(false);
            await loadMe();
            await Promise.all([loadTypes(), loadServers()]);
        }
        catch (error) {
            setSetupError(error.message);
        }
    };
    const doLogout = async () => { await api.authLogout(); setCurrentUser(null); setIsAuthenticated(false); setUsers([]); setUserRoleDraft({}); setShowSetupModal(false); };
    const installServerNow = async () => {
        await api.installServer({
            name: installName.trim(),
            type: installType,
            version: installVersion,
            icon: installIconFile
        });
        setShowAddServerModal(false);
        setAddServerMode("chooser");
        setInstallName("");
        setInstallType("");
        setInstallVersion("");
        setInstallIconFile(null);
        if (installIconRef.current)
            installIconRef.current.value = "";
        await loadServers();
    };
    const importServerNow = async () => {
        if (!importName.trim())
            throw new Error("Server name is required.");
        if (!importFiles.length)
            throw new Error("Select a server root folder first.");
        await api.importServer({ name: importName.trim(), files: importFiles });
        setShowAddServerModal(false);
        setAddServerMode("chooser");
        setImportName("");
        setImportFiles([]);
        await loadServers();
    };
    const deleteServerNow = async () => { if (!serverToDelete)
        return; await api.deleteServer(serverToDelete.id); setShowDeleteModal(false); setServerToDelete(null); await loadServers(); };
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
        await api.authSetPassword(forcePassword);
        setForcePassword("");
        setForcePasswordConfirm("");
        await loadMe();
    };
    const runServerAction = async (action) => {
        if (!selectedServerId)
            return;
        if (serverActionBusy)
            return;
        goToView("console");
        setConsoleLines([]);
        setConsoleCursor(0);
        setServerActionBusy(true);
        try {
            await api.clearConsoleHistory();
            if (action === "start")
                await api.startServer();
            if (action === "stop")
                await api.stopServer();
            if (action === "restart")
                await api.restartServer();
            await Promise.all([loadStatus(), loadConsoleHistory(0)]);
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
            const out = await api.updateServerSettings({
                ...serverSettings,
                startupScript: ""
            });
            setServerSettings(out.settings);
            setMessage("Server settings saved.");
        }
        finally {
            setSettingsSaving(false);
        }
    };
    const openServerModal = (mode) => {
        if (mode === "import")
            setImportFiles([]);
        if (mode === "install") {
            setInstallIconFile(null);
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
    if (!isAuthenticated || showSetupModal) {
        return (_jsx("div", { className: "shell auth-shell", children: _jsxs("main", { className: "main flow-mode auth-main", children: [showSetupModal ? (_jsxs("div", { className: "auth-panel setup-panel", children: [_jsx("h2", { className: "auth-title", children: "Sign Up" }), _jsxs("p", { className: "muted auth-subtitle", children: ["Initial Setup (", setupStep + 1, "/5)"] }), setupStep === 0 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Username" }), _jsx("input", { value: setupUsername, onChange: (e) => setSetupUsername(e.target.value), placeholder: "Set username", autoFocus: true }), _jsx("label", { children: "Email" }), _jsx("input", { type: "email", value: setupEmail, onChange: (e) => setSetupEmail(e.target.value), placeholder: "Owner email" })] }), setupStep === 1 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Password" }), _jsx("input", { type: "password", value: setupPassword, onChange: (e) => setSetupPassword(e.target.value), placeholder: "Set password", autoFocus: true })] }), setupStep === 2 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Server Name" }), _jsx("input", { value: setupServerName, onChange: (e) => setSetupServerName(e.target.value), placeholder: "Set server name", autoFocus: true })] }), setupStep === 3 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Server Type" }), _jsx("div", { className: "jar-options", children: serverTypeOptions.map((t) => _jsx("button", { className: setupServerType === t.id ? "menu-btn active" : "menu-btn", disabled: !t.enabled, title: t.enabled ? t.label : t.tooltip || "soon", onClick: () => t.enabled && setSetupServerType(t.id), children: t.label }, t.id)) })] }), setupStep === 4 && _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Version" }), _jsxs("select", { value: setupVersion, onChange: (e) => setSetupVersion(e.target.value), children: [_jsx("option", { value: "", children: "Choose version" }), setupVersionOptions.map((v) => _jsx("option", { value: v, children: v }, v))] })] }), !!setupError && _jsx("div", { className: "banner warn", children: setupError }), _jsxs("div", { className: "row auth-actions-row", children: [setupStep > 0 && _jsx("button", { onClick: () => setSetupStep((prev) => prev - 1), children: "Back" }), _jsx("button", { className: "btn-start auth-primary-btn", onClick: () => finishSetup().catch((e) => setSetupError(e.message)), children: setupStep < 4 ? "Next" : "Finish Setup" })] })] })) : (_jsxs("section", { className: "auth-panel login-panel", children: [_jsx("h2", { className: "auth-title login-title", children: "Log In" }), needsBootstrap && _jsx("div", { className: "banner warn", children: "No account exists yet. Run initial setup." }), _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Email" }), _jsx("input", { type: "email", value: loginUsername, onChange: (e) => setLoginUsername(e.target.value), placeholder: "Email address" }), _jsx("label", { children: "Password" }), _jsx("input", { type: "password", value: loginPassword, onChange: (e) => setLoginPassword(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                                            doLogin().catch((err) => setLoginError(err.message)); }, placeholder: "Password" }), _jsxs("div", { className: "login-meta-row", children: [_jsx("button", { className: "link-btn", onClick: () => { setForgotEmail(""); setForgotModalNotice(""); setForgotModalError(""); setShowForgotModal(true); }, children: "Forgot password" }), _jsx("span", { className: "meta-divider", "aria-hidden": "true", children: "|" }), _jsxs("label", { className: "remember-row", children: [_jsx("input", { type: "checkbox", checked: rememberCredentials, onChange: (e) => { const next = e.target.checked; setRememberCredentials(next); if (!next) {
                                                            localStorage.removeItem(STORAGE_KEY_LOGIN_REMEMBER);
                                                            localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL);
                                                            localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD);
                                                        } } }), "Remember login"] })] })] }), !!loginError && _jsx("div", { className: "banner warn", children: loginError }), _jsx("button", { className: "auth-primary-btn", onClick: () => doLogin().catch((e) => setLoginError(e.message)), children: "Log In" }), needsBootstrap && _jsx("button", { onClick: () => { setShowSetupModal(true); window.history.pushState({}, "", "/setup"); }, children: "Open Setup" })] })), showForgotModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowForgotModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Forgot Password" }), _jsx("input", { type: "email", value: forgotEmail, onChange: (e) => setForgotEmail(e.target.value), placeholder: "Enter email" }), !!forgotModalError && _jsx("div", { className: "banner warn", children: forgotModalError }), !!forgotModalNotice && _jsx("div", { className: "banner info", children: forgotModalNotice }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowForgotModal(false), children: "Close" }), _jsx("button", { className: "btn-start", onClick: () => doForgotPassword().catch((e) => setForgotModalError(e.message)), children: "Send" })] })] }) }))] }) }));
    }
    return (_jsx("div", { className: "shell", children: _jsxs("main", { className: "main flow-mode", children: [_jsxs("div", { className: "menubar", children: [_jsx("button", { className: "menu-toggle-btn", onClick: () => setShowMenuDrawer(true), children: _jsx("img", { src: "/minecraft-icon.png", alt: "Menu", className: "menu-toggle-logo" }) }), _jsx("strong", { className: "brand", children: "MC Control Panel" }), _jsxs("div", { className: "menu-actions", children: [_jsx("strong", { children: activeServer?.name || "No server selected" }), _jsx("span", { className: isOnline ? "tiny online-dot" : "tiny offline-dot", children: isStarting ? "Starting" : isStopping ? "Stopping" : isRestarting ? "Restarting" : isOnline ? "Online" : "Offline" }), _jsxs("span", { className: "uptime-pill", children: ["Uptime: ", formatUptime(status?.uptimeMs || 0)] }), canOperateServer && _jsxs(_Fragment, { children: [_jsxs("button", { className: "btn-start", disabled: disableStart, onClick: () => runServerAction("start").catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-play", "aria-hidden": "true" }), " Start"] }), _jsxs("button", { className: "btn-stop", disabled: disableStop, onClick: () => runServerAction("stop").catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-stop", "aria-hidden": "true" }), " Stop"] }), _jsxs("button", { className: "btn-restart", disabled: disableRestart, onClick: () => runServerAction("restart").catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-rotate-right", "aria-hidden": "true" }), " Restart"] })] }), _jsx("button", { className: "logout-btn-inline logout-icon-btn", title: "Logout", "aria-label": "Logout", onClick: () => doLogout().catch((e) => setMessage(e.message)), children: _jsx("i", { className: "fa-solid fa-right-from-bracket", "aria-hidden": "true" }) })] })] }), _jsxs("div", { className: "workspace", children: [_jsxs("aside", { className: "servers-column card", children: [_jsx("h2", { children: "Servers" }), _jsx("div", { className: "server-list-vertical", children: servers.map((server) => _jsxs("div", { className: selectedServerId === server.id ? "server-pill active server-item" : "server-pill server-item", onClick: () => setSelectedServerId(server.id), children: [_jsx("img", { className: "server-list-icon", src: `/api/servers/${encodeURIComponent(server.id)}/icon`, alt: `${server.name} icon` }), _jsxs("div", { className: "server-pill-text", children: [_jsx("strong", { children: server.name }), _jsxs("small", { children: [server.type, " ", server.version] })] }), canOperateServer && server.type === "purpur" && _jsx("button", { className: "server-update-btn", "aria-label": "Update server jar", onClick: (e) => { e.stopPropagation(); updateServerNow(server).catch((err) => setMessage(err.message)); }, title: "Update server jar", disabled: !!updatingServerId, children: _jsx("i", { className: "fa-solid fa-rotate-right", "aria-hidden": "true" }) }), canOperateServer && _jsx("button", { className: "server-delete-btn", "aria-label": "Delete server", onClick: (e) => { e.stopPropagation(); setServerToDelete(server); setShowDeleteModal(true); }, title: "Delete", children: _jsx("i", { className: "fa-solid fa-trash-can", "aria-hidden": "true" }) })] }, server.id)) }), canOperateServer && (_jsxs("div", { className: "server-sidebar-actions", children: [_jsxs("button", { onClick: () => openServerModal("import"), children: [_jsx("i", { className: "fa-solid fa-file-import", "aria-hidden": "true" }), " Import Server"] }), _jsxs("button", { className: "btn-start", onClick: () => openServerModal("install"), children: [_jsx("i", { className: "fa-solid fa-server", "aria-hidden": "true" }), " Create Server"] })] }))] }), _jsxs("section", { className: "card grow panel-content-card", children: [activeView === "console" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Console" }), _jsxs("div", { className: "view-layout", children: [_jsxs("div", { className: "console-panel", children: [_jsxs("div", { className: "console-toolbar", children: [_jsx("span", { className: "muted", children: consoleLoading ? "Updating..." : `Lines: ${consoleLines.length}` }), _jsxs("label", { className: "row muted console-autoscroll-toggle", children: [_jsx("input", { type: "checkbox", checked: consoleAutoScroll, onChange: (e) => setConsoleAutoScroll(e.target.checked) }), "Auto Scroll"] }), _jsx("button", { className: "icon-only-btn refresh-btn", "aria-label": "Refresh console", title: "Refresh", onClick: () => loadConsoleHistory(0).catch((e) => setMessage(e.message)), children: _jsx("i", { className: "fa-solid fa-rotate-right", "aria-hidden": "true" }) })] }), _jsxs("div", { ref: consoleScrollRef, className: "console modern-console", children: [!consoleLines.length && _jsx("div", { className: "empty-list", children: "No console output yet." }), consoleLines.map((line) => (_jsxs("div", { className: `line ${line.source === "stderr" ? "stderr" : ""}`, children: [_jsxs("span", { className: "muted", children: ["[", new Date(line.ts).toLocaleTimeString(), "]"] }), " ", line.line] }, line.cursor)))] })] }), _jsxs("div", { className: "row console-command-row", children: [_jsx("input", { value: consoleCommand, onChange: (e) => setConsoleCommand(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                                                                sendConsoleCommand().catch((err) => setMessage(err.message)); }, placeholder: "Type command..." }), _jsx("button", { className: "btn-start", onClick: () => sendConsoleCommand().catch((e) => setMessage(e.message)), children: "Send" })] })] })] }), activeView === "files" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Files" }), _jsxs("div", { className: "view-layout", children: [_jsxs("div", { className: "row file-toolbar", children: [_jsx("button", { onClick: () => loadFiles(".").catch((e) => setMessage(e.message)), children: "Root" }), _jsx("button", { onClick: () => {
                                                                const parts = (filesPath === "." ? "." : filesPath).split("/").filter(Boolean);
                                                                parts.pop();
                                                                loadFiles(parts.length ? parts.join("/") : ".").catch((e) => setMessage(e.message));
                                                            }, children: "Up" }), _jsx("span", { className: "path-pill", children: filesPath }), _jsx("span", { className: "toolbar-spacer" }), _jsx("button", { className: "btn-create-entry", "aria-label": "Create file or folder", title: "Create", onClick: () => { setShowCreateFsModal(true); setCreateFsType(""); setCreateFsName(""); setCreateFsError(""); }, children: _jsx("i", { className: "fa-solid fa-plus", "aria-hidden": "true" }) })] }), _jsxs("div", { className: "file-list modern-file-table", children: [_jsxs("div", { className: "file-table-header", children: [_jsx("span", {}), _jsx("span", { children: "Name" }), _jsx("span", { children: "Size" }), _jsx("span", { children: "Last Modified" }), _jsx("span", {})] }), filesLoading && _jsx("div", { className: "empty-list", children: "Loading files..." }), !filesLoading && !filesEntries.length && _jsx("div", { className: "empty-list", children: "No files found." }), !filesLoading && filesEntries.map((entry) => (_jsxs("div", { className: selectedPaths.includes(entry.path) ? "file-item selected modern-file-row" : "file-item modern-file-row", children: [_jsx("span", { className: "row-check", children: _jsx("input", { type: "checkbox", checked: selectedPaths.includes(entry.path), onChange: () => togglePathSelection(entry.path) }) }), _jsxs("div", { className: "entry-main modern-name-cell", onClick: () => openFileEntry(entry).catch((e) => setMessage(e.message)), children: [_jsx("span", { className: entry.type === "directory" ? "entry-icon directory" : "entry-icon file" }), _jsx("span", { className: "entry-name", children: entry.name })] }), _jsx("span", { className: "muted", children: entry.type === "directory" ? "-" : `${entry.size || 0} B` }), _jsx("span", { className: "muted", children: entry.mtime ? new Date(entry.mtime).toLocaleString() : "-" }), _jsx("button", { className: "list-action-btn", onClick: () => openFileEntry(entry).catch((e) => setMessage(e.message)), children: "Open" })] }, entry.path)))] }), _jsx("div", { className: "files-bottom-actions files-bottom-left", children: _jsx("button", { className: "btn-danger", disabled: !selectedPaths.length, onClick: () => deleteSelectedFiles().catch((e) => setMessage(e.message)), children: "Delete Selected" }) })] })] }), activeView === "plugins" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Plugins/Mods" }), _jsx("div", { className: "view-layout", children: !addonsEnabled ? (_jsx("div", { className: "empty-list", children: "Vanilla server selected. Plugins/Mods are disabled for vanilla." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row file-toolbar", children: [_jsx("input", { ref: pluginBrowseRef, type: "file", multiple: true, hidden: true, onChange: (e) => browsePluginInstall([...(e.target.files || [])]).catch((err) => setMessage(err.message)) }), _jsx("input", { ref: modBrowseRef, type: "file", multiple: true, hidden: true, onChange: (e) => browseModInstall([...(e.target.files || [])]).catch((err) => setMessage(err.message)) }), addonsMode === "plugins" ? _jsx("button", { onClick: () => pluginBrowseRef.current?.click(), children: "Add Plugin" }) : _jsx("button", { onClick: () => modBrowseRef.current?.click(), children: "Add Mod/Pack" }), _jsx("button", { className: "btn-danger", disabled: !selectedAddonKeys.length, onClick: () => deleteSelectedAddons().catch((e) => setMessage(e.message)), children: "Remove Selected" }), addonsMode === "plugins" && (_jsxs("label", { className: "row muted", children: [_jsx("input", { type: "checkbox", checked: deletePluginConfigOnRemove, onChange: (e) => setDeletePluginConfigOnRemove(e.target.checked) }), "Also delete config folder"] }))] }), _jsxs("div", { className: "file-list", children: [(pluginsLoading || modsLoading) && _jsx("div", { className: "empty-list", children: "Loading plugins/mods..." }), addonsMode === "plugins" && !pluginsLoading && !plugins.length && _jsx("div", { className: "empty-list", children: "No plugins installed." }), addonsMode === "mods" && !modsLoading && !mods.length && _jsx("div", { className: "empty-list", children: "No mods installed." }), addonsMode === "plugins" && !pluginsLoading && plugins.map((plugin) => (_jsxs("div", { className: selectedAddonKeys.includes(`plugin:${plugin.pluginId}`) ? "file-item selected plugin-row" : "file-item plugin-row", onClick: () => toggleAddonSelection(`plugin:${plugin.pluginId}`), children: [_jsxs("div", { className: "entry-main", children: [_jsx("span", { className: "entry-icon file" }), _jsxs("span", { className: "entry-name", children: ["[Plugin] ", plugin.pluginId] })] }), _jsx("small", { className: "muted", children: plugin.jarPath || plugin.folderPath || "plugin" })] }, `plugin:${plugin.pluginId}`))), addonsMode === "mods" && !modsLoading && mods.map((mod) => (_jsxs("div", { className: selectedAddonKeys.includes(`mod:${mod.modId}`) ? "file-item selected plugin-row" : "file-item plugin-row", onClick: () => toggleAddonSelection(`mod:${mod.modId}`), children: [_jsxs("div", { className: "entry-main", children: [_jsx("span", { className: "entry-icon file" }), _jsxs("span", { className: "entry-name", children: ["[Mod] ", mod.modId] })] }), _jsx("small", { className: "muted", children: mod.jarPath })] }, `mod:${mod.modId}`)))] })] })) })] }), activeView === "settings" && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Settings" }), _jsx("div", { className: "view-layout", children: settingsLoading ? (_jsx("div", { className: "empty-list", children: "Loading settings..." })) : (_jsxs("div", { className: "settings-layout", children: [_jsxs("div", { className: "settings-card modern-settings-card", children: [_jsxs("div", { className: "settings-grid", children: [_jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Auto Restart" }), _jsxs("select", { value: serverSettings.autoRestart ? "true" : "false", onChange: (e) => setServerSettings((prev) => ({ ...prev, autoRestart: e.target.value === "true" })), children: [_jsx("option", { value: "true", children: "Enabled" }), _jsx("option", { value: "false", children: "Disabled" })] })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Playit Tunnel" }), _jsxs("select", { value: serverSettings.playitEnabled ? "true" : "false", onChange: (e) => setServerSettings((prev) => ({ ...prev, playitEnabled: e.target.value === "true" })), children: [_jsx("option", { value: "false", children: "Disabled" }), _jsx("option", { value: "true", children: "Enabled" })] })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "RAM Min (GB)" }), _jsx("input", { type: "number", min: 1, step: 1, value: serverSettings.ramMinGb ?? "", onChange: (e) => setServerSettings((prev) => ({ ...prev, ramMinGb: e.target.value === "" ? null : Number(e.target.value) })) })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "RAM Max (GB)" }), _jsx("input", { type: "number", min: 1, step: 1, value: serverSettings.ramMaxGb ?? "", onChange: (e) => setServerSettings((prev) => ({ ...prev, ramMaxGb: e.target.value === "" ? null : Number(e.target.value) })) })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Server IP" }), _jsx("input", { value: serverSettings.serverIp, onChange: (e) => setServerSettings((prev) => ({ ...prev, serverIp: e.target.value })), placeholder: "Leave blank for all interfaces" })] }), _jsxs("label", { className: "settings-field", children: [_jsx("span", { children: "Server Port" }), _jsx("input", { type: "number", min: 1, max: 65535, value: serverSettings.serverPort ?? "", onChange: (e) => setServerSettings((prev) => ({ ...prev, serverPort: e.target.value === "" ? null : Number(e.target.value) })) })] }), _jsxs("label", { className: "settings-field settings-field-wide", children: [_jsx("span", { children: "Playit Command" }), _jsx("input", { value: serverSettings.playitCommand, onChange: (e) => setServerSettings((prev) => ({ ...prev, playitCommand: e.target.value })), placeholder: "playit" })] })] }), _jsxs("div", { className: "playit-section", children: [_jsx("h3", { children: "Playit.gg Setup" }), _jsx("p", { className: "muted", children: "Download the Playit agent, run it on this machine, then enable the tunnel settings below." }), _jsxs("div", { className: "playit-downloads", children: [_jsx("a", { className: "playit-link-btn", href: "https://playit.gg/download/windows", target: "_blank", rel: "noreferrer", children: "Download Windows" }), _jsx("a", { className: "playit-link-btn", href: "https://playit.gg/download/linux", target: "_blank", rel: "noreferrer", children: "Download Linux" }), _jsx("a", { className: "playit-link-btn", href: "https://playit.gg/download/macos", target: "_blank", rel: "noreferrer", children: "Download macOS" })] }), _jsxs("div", { className: "playit-steps", children: [_jsxs("p", { children: [_jsx("strong", { children: "1." }), " Run the agent and claim it to your account."] }), _jsxs("p", { children: [_jsx("strong", { children: "2." }), " Create a tunnel and set local port to your Minecraft server port."] }), _jsxs("p", { children: [_jsx("strong", { children: "3." }), " In this panel, set ", _jsx("strong", { children: "Playit Tunnel" }), " to enabled and keep command as ", _jsx("code", { children: "playit" }), "."] }), _jsxs("p", { children: [_jsx("strong", { children: "4." }), " Start the server and join with the Playit address."] })] }), _jsxs("div", { className: "playit-code-block", children: [_jsx("div", { className: "muted", children: "Linux apt install (official docs):" }), _jsx("code", { children: "curl -SsL https://playit-cloud.github.io/ppa/key.gpg | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/playit.gpg >/dev/null" }), _jsx("code", { children: "echo \"deb [signed-by=/etc/apt/trusted.gpg.d/playit.gpg] https://playit-cloud.github.io/ppa/data ./\" | sudo tee /etc/apt/sources.list.d/playit-cloud.list" }), _jsx("code", { children: "sudo apt update && sudo apt install playit" }), _jsx("code", { children: "playit setup" })] })] })] }), _jsxs("div", { className: "row settings-actions settings-bottom-actions", children: [_jsxs("button", { onClick: () => loadServerSettings().catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-rotate-left", "aria-hidden": "true" }), " Reset"] }), _jsxs("button", { className: "btn-start", disabled: settingsSaving, onClick: () => saveServerSettings().catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-floppy-disk", "aria-hidden": "true" }), " ", settingsSaving ? "Saving..." : "Save Settings"] })] })] })) })] }), activeView === "users" && canManageUsers && _jsxs(_Fragment, { children: [_jsx("h2", { children: "Users" }), _jsxs("div", { className: "users-layout", children: [_jsx("div", { className: "users-top", children: _jsxs("button", { className: "btn-start create-user-btn", onClick: () => { setNewUsername(""); setNewEmail(""); setNewPassword(""); setNewRole("viewer"); setShowAddUserModal(true); }, children: [_jsx("i", { className: "fa-solid fa-user-plus", "aria-hidden": "true" }), " Add User"] }) }), _jsx("div", { className: "users-bottom users-list users-table-wrap", children: _jsxs("table", { className: "users-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Username" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: users.map((user) => {
                                                                    const isOwner = user.role === "owner";
                                                                    return (_jsxs("tr", { children: [_jsx("td", { children: user.username }), _jsx("td", { children: user.email || "no-email" }), _jsx("td", { children: _jsx("select", { disabled: isOwner, value: isOwner ? "owner" : (userRoleDraft[user.id] || user.role), onChange: (e) => setUserRoleDraft((prev) => ({ ...prev, [user.id]: e.target.value })), children: isOwner ? (_jsx("option", { value: "owner", children: "owner" })) : (_jsxs(_Fragment, { children: [_jsx("option", { value: "admin", children: "admin" }), _jsx("option", { value: "viewer", children: "user" })] })) }) }), _jsx("td", { children: user.active ? "active" : "disabled" }), _jsx("td", { children: _jsxs("div", { className: "row wrap", children: [_jsxs("button", { disabled: isOwner, onClick: () => api.updateUser(user.id, { role: userRoleDraft[user.id] || user.role }).then(refreshUsers).catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-floppy-disk", "aria-hidden": "true" }), " Save Role"] }), _jsx("button", { disabled: isOwner, onClick: () => api.updateUser(user.id, { active: !user.active }).then(refreshUsers).catch((e) => setMessage(e.message)), children: user.active ? _jsxs(_Fragment, { children: [_jsx("i", { className: "fa-solid fa-user-slash", "aria-hidden": "true" }), " Disable"] }) : _jsxs(_Fragment, { children: [_jsx("i", { className: "fa-solid fa-user-check", "aria-hidden": "true" }), " Enable"] }) }), _jsxs("button", { disabled: isOwner, className: "btn-danger", onClick: () => api.deleteUser(user.id).then(refreshUsers).catch((e) => setMessage(e.message)), children: [_jsx("i", { className: "fa-solid fa-user-minus", "aria-hidden": "true" }), " Remove"] })] }) })] }, user.id));
                                                                }) })] }) })] })] })] })] }), _jsxs("footer", { className: "footer-note app-footer", children: ["This project is not affiliated with Mojang or Microsoft in any way. Licensed under", " ", _jsx("a", { href: "https://www.gnu.org/licenses/gpl-3.0.en.html", target: "_blank", rel: "noreferrer", children: "GNU v3" }), ". Source:", " ", _jsx("a", { href: "#", children: "MC Control Panel" }), "."] }), showCreateFsModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowCreateFsModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [!createFsType && (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Create New" }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn-start", onClick: () => setCreateFsType("file"), children: "New File" }), _jsx("button", { onClick: () => setCreateFsType("folder"), children: "New Folder" })] }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => setShowCreateFsModal(false), children: "Cancel" }) })] })), !!createFsType && (_jsxs(_Fragment, { children: [_jsx("h3", { children: createFsType === "file" ? "New File" : "New Folder" }), _jsx("input", { value: createFsName, onChange: (e) => setCreateFsName(e.target.value), placeholder: createFsType === "file" ? "newfile.txt" : "folder-name", autoFocus: true }), !!createFsError && _jsx("div", { className: "banner warn", children: createFsError }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => { setCreateFsType(""); setCreateFsName(""); setCreateFsError(""); }, children: "Back" }), _jsx("button", { className: "btn-start", onClick: () => createFsEntryNow().catch((e) => setCreateFsError(e.message)), children: "Create" })] })] }))] }) })), showMenuDrawer && _jsx("div", { className: "menu-drawer-backdrop", onClick: () => setShowMenuDrawer(false), children: _jsxs("aside", { className: "menu-drawer", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "menu-drawer-header", children: [_jsx("h3", { children: "MC Control Panel" }), _jsx("button", { className: "menu-toggle-btn", onClick: () => setShowMenuDrawer(false), children: _jsx("img", { src: "/minecraft-icon.png", alt: "Toggle menu", className: "menu-toggle-logo" }) })] }), _jsxs("nav", { className: "menu-drawer-nav", children: [_jsx("button", { className: activeView === "console" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("console"); setShowMenuDrawer(false); }, children: "Console" }), _jsx("button", { className: activeView === "files" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("files"); setShowMenuDrawer(false); }, children: "Files" }), _jsx("button", { disabled: !addonsEnabled, title: !addonsEnabled ? "Disabled for vanilla servers" : "Plugins/Mods", className: activeView === "plugins" ? "menu-btn active" : "menu-btn", onClick: () => { if (!addonsEnabled)
                                            return; goToView("plugins"); setShowMenuDrawer(false); }, children: "Plugins/Mods" }), _jsx("button", { className: activeView === "settings" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("settings"); setShowMenuDrawer(false); }, children: "Settings" }), canManageUsers && _jsx("button", { className: activeView === "users" ? "menu-btn active" : "menu-btn", onClick: () => { goToView("users"); setShowMenuDrawer(false); }, children: "Users" })] })] }) }), showDeleteModal && serverToDelete && _jsx("div", { className: "modal-backdrop", onClick: () => setShowDeleteModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Delete Server" }), _jsxs("p", { children: ["Delete ", _jsx("strong", { children: serverToDelete.name }), "? This cannot be undone."] }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowDeleteModal(false), children: "Cancel" }), _jsx("button", { className: "btn-danger", onClick: () => deleteServerNow().catch((e) => setMessage(e.message)), children: "Delete" })] })] }) }), showAddServerModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowAddServerModal(false), children: _jsxs("div", { className: "modal-card setup-modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Add Server" }), addServerMode === "chooser" && (_jsxs("div", { className: "row", children: [_jsxs("button", { className: "btn-start", onClick: () => setAddServerMode("install"), children: [_jsx("i", { className: "fa-solid fa-server", "aria-hidden": "true" }), " Install New"] }), _jsxs("button", { onClick: () => setAddServerMode("import"), children: [_jsx("i", { className: "fa-solid fa-file-import", "aria-hidden": "true" }), " Import Server"] })] })), addServerMode === "install" && (_jsxs(_Fragment, { children: [_jsx("input", { value: installName, onChange: (e) => setInstallName(e.target.value), placeholder: "Server name" }), _jsx("div", { className: "jar-options", children: serverTypeOptions.map((t) => (_jsx("button", { className: installType === t.id ? "menu-btn active" : "menu-btn", disabled: !t.enabled, title: t.enabled ? t.label : t.tooltip || "soon", onClick: () => t.enabled && setInstallType(t.id), children: t.label }, t.id))) }), _jsxs("select", { value: installVersion, onChange: (e) => setInstallVersion(e.target.value), children: [_jsx("option", { value: "", children: "Choose version" }), installVersionOptions.map((v) => (_jsx("option", { value: v, children: v }, v)))] }), _jsx("input", { ref: installIconRef, type: "file", accept: ".png,image/png", hidden: true, onChange: (e) => setInstallIconFile((e.target.files && e.target.files[0]) || null) }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => installIconRef.current?.click(), children: "Select Server Icon (Optional)" }) }), _jsx("small", { className: "muted", children: installIconFile ? installIconFile.name : "No icon selected. Default server-icon.png will be used." }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setAddServerMode("chooser"), children: "Back" }), _jsx("button", { className: "btn-start", onClick: () => installServerNow().catch((e) => setMessage(e.message)), children: "Install" })] })] })), addServerMode === "import" && (_jsxs(_Fragment, { children: [_jsx("input", { value: importName, onChange: (e) => setImportName(e.target.value), placeholder: "Server name" }), _jsx("input", { ref: importRef, type: "file", multiple: true, hidden: true, ...{ webkitdirectory: "", directory: "" }, onChange: (e) => setImportFiles([...(e.target.files || [])]) }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => importRef.current?.click(), children: "Browse Folder" }) }), _jsx("small", { className: "muted", children: importFiles.length
                                            ? `${importFiles.length} files selected from folder`
                                            : "Choose the server root folder to import" }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setAddServerMode("chooser"), children: "Back" }), _jsx("button", { className: "btn-start", onClick: () => importServerNow().catch((e) => setMessage(e.message)), children: "Import" })] })] }))] }) })), showConfigEditor && configEditor && _jsx("div", { className: "modal-backdrop", onClick: () => closeConfigEditor(), children: _jsxs("div", { className: "modal-card config-editor-modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Config Editor" }), _jsx("div", { className: "muted", children: configEditor.path }), _jsx("div", { className: "config-editor-monaco", children: _jsx(Editor, { height: "55dvh", language: configLanguage(configEditor.path), theme: "vs-dark", value: configEditor.content, onChange: (value) => setConfigEditor({ ...configEditor, content: value ?? "" }), options: { minimap: { enabled: false }, fontSize: 13, wordWrap: "on", automaticLayout: true } }) }), !!configEditorError && _jsx("div", { className: "banner warn", children: configEditorError }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => closeConfigEditor(), children: "Cancel" }), _jsx("button", { className: "btn-start", onClick: () => saveConfigEditor().catch((e) => setConfigEditorError(e.message)), children: "Save" })] })] }) }), currentUser?.mustChangePassword && _jsx("div", { className: "modal-backdrop", onClick: (e) => e.stopPropagation(), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Set New Password" }), _jsx("p", { children: "You logged in with a temporary password. Set a new password to continue." }), _jsx("input", { type: "password", value: forcePassword, onChange: (e) => setForcePassword(e.target.value), placeholder: "New password" }), _jsx("input", { type: "password", value: forcePasswordConfirm, onChange: (e) => setForcePasswordConfirm(e.target.value), placeholder: "Confirm password" }), !!forcePasswordError && _jsx("div", { className: "banner warn", children: forcePasswordError }), _jsx("div", { className: "row", children: _jsx("button", { className: "btn-start", onClick: () => setForcedPasswordNow().catch((e) => setForcePasswordError(e.message)), children: "Set" }) })] }) }), showAddUserModal && (_jsx("div", { className: "modal-backdrop", onClick: () => setShowAddUserModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Add User" }), _jsxs("div", { className: "auth-form-stack", children: [_jsx("label", { children: "Enter username" }), _jsx("input", { value: newUsername, onChange: (e) => setNewUsername(e.target.value), placeholder: "Enter username", autoFocus: true }), _jsx("label", { children: "Enter email" }), _jsx("input", { type: "email", value: newEmail, onChange: (e) => setNewEmail(e.target.value), placeholder: "Enter email" }), _jsx("label", { children: "Enter password" }), _jsx("input", { type: "password", value: newPassword, onChange: (e) => setNewPassword(e.target.value), placeholder: "Enter password" }), _jsx("label", { children: "Select role" }), _jsxs("select", { value: newRole, onChange: (e) => setNewRole(e.target.value), children: [_jsx("option", { value: "viewer", children: "user" }), _jsx("option", { value: "admin", children: "admin" })] })] }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowAddUserModal(false), children: "Cancel" }), _jsx("button", { className: "btn-start btn-finish", onClick: () => createUserNow().catch((e) => setMessage(e.message)), children: "Finish" })] })] }) })), showAuthErrorModal && _jsx("div", { className: "modal-backdrop", onClick: () => setShowAuthErrorModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Authentication Required" }), _jsx("p", { children: "Login is required for this action, or your account does not have permission." }), _jsxs("p", { className: "muted", children: ["Details: ", authErrorDetail] }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: () => setShowAuthErrorModal(false), children: "Close" }), _jsx("button", { className: "btn-start", onClick: () => doLogout().finally(() => setShowAuthErrorModal(false)), children: "Go To Login" })] })] }) }), showInfoModal && _jsx("div", { className: "modal-backdrop", onClick: () => setShowInfoModal(false), children: _jsxs("div", { className: "modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Notice" }), _jsx("p", { children: infoModalDetail }), _jsx("div", { className: "row", children: _jsx("button", { onClick: () => setShowInfoModal(false), children: "Close" }) })] }) }), dragOverlayVisible && (activeView === "files" || (activeView === "plugins" && addonsEnabled)) && _jsx("div", { className: "drop-overlay-modal", onDragOver: (e) => e.preventDefault(), children: _jsxs("div", { className: "drop-overlay-content", children: [_jsx("div", { className: "drop-icon", children: _jsx("i", { className: "fa-solid fa-cloud-arrow-up", "aria-hidden": "true" }) }), _jsx("h3", { children: "Drop Files Here" }), _jsx("p", { children: activeView === "files" ? "Upload into current folder" : addonsMode === "plugins" ? "Install plugin artifact(s)" : "Install mod/modpack artifact(s)" })] }) })] }) }));
}
