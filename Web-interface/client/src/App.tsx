import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "./api";
import type { ConsoleLine, FileEntry, ModEntry, PluginEntry, ServerInstallType, ServerProfile, ServerSettings, ServerStatus, ServerTypeOption, UserRecord, UserRole } from "./types";

type View = "console" | "files" | "plugins" | "settings" | "users";
type AddServerMode = "chooser" | "install" | "import";
type UiUserRole = "admin" | "viewer";

type ConfigEditorState = { path: string; content: string; originalContent: string; mtime: string };
const STORAGE_KEY_SETUP = "panel.setup.complete";
const STORAGE_KEY_LOGIN_REMEMBER = "panel.login.remember";
const STORAGE_KEY_LOGIN_EMAIL = "panel.login.email";
const STORAGE_KEY_LOGIN_PASSWORD = "panel.login.password";
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

const isAuthRelatedMessage = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    lower.includes("authentication required") ||
    lower.includes("401") ||
    lower.includes("account is disabled") ||
    lower.includes("invalid email or password")
  );
};

const viewFromPath = (pathName: string): View => {
  const lower = String(pathName || "/").toLowerCase();
  if (lower === "/files") return "files";
  if (lower === "/plugins-mods") return "plugins";
  if (lower === "/settings") return "settings";
  if (lower === "/users") return "users";
  return "console";
};

const pathFromView = (view: View): string => {
  if (view === "files") return "/files";
  if (view === "plugins") return "/plugins-mods";
  if (view === "settings") return "/settings";
  if (view === "users") return "/users";
  return "/console";
};

export default function App() {
  const [activeView, setActiveView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [message, setMessage] = useState("");
  const [showAuthErrorModal, setShowAuthErrorModal] = useState(false);
  const [authErrorDetail, setAuthErrorDetail] = useState("");
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

  const [loginUsername, setLoginUsername] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_EMAIL) || "");
  const [loginPassword, setLoginPassword] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_PASSWORD) || "");
  const [rememberCredentials, setRememberCredentials] = useState(() => localStorage.getItem(STORAGE_KEY_LOGIN_REMEMBER) === "1");
  const [loginError, setLoginError] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotModalNotice, setForgotModalNotice] = useState("");
  const [forgotModalError, setForgotModalError] = useState("");

  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [serverSettings, setServerSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [consoleCursor, setConsoleCursor] = useState(0);
  const [consoleCommand, setConsoleCommand] = useState("");
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleAutoScroll, setConsoleAutoScroll] = useState(true);
  const [serverActionBusy, setServerActionBusy] = useState(false);
  const consoleScrollRef = useRef<HTMLDivElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<ServerProfile | null>(null);
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [addServerMode, setAddServerMode] = useState<AddServerMode>("chooser");

  const [serverTypeOptions, setServerTypeOptions] = useState<ServerTypeOption[]>([]);
  const [setupVersionOptions, setSetupVersionOptions] = useState<string[]>([]);
  const [installVersionOptions, setInstallVersionOptions] = useState<string[]>([]);
  const [installName, setInstallName] = useState("");
  const [installType, setInstallType] = useState<ServerInstallType | "">("");
  const [installVersion, setInstallVersion] = useState("");
  const [installIconFile, setInstallIconFile] = useState<File | null>(null);
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
      setSelectedAddonKeys((prev) => prev.filter((id) => !id.startsWith("plugin:") || out.plugins.some((p) => `plugin:${p.pluginId}` === id)));
    } finally { setPluginsLoading(false); }
  };

  const loadMods = async () => {
    setModsLoading(true);
    try {
      const out = await api.listMods();
      setMods(out.mods);
      setSelectedAddonKeys((prev) => prev.filter((id) => !id.startsWith("mod:") || out.mods.some((m) => `mod:${m.modId}` === id)));
    } finally { setModsLoading(false); }
  };

  const refreshUsers = async () => {
    if (!canManageUsers) return;
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
    if (activeView === "files") loadFiles(".").catch((e) => setMessage(e.message));
    if (activeView === "plugins" && addonsEnabled) {
      if (addonsMode === "plugins") {
        loadPlugins().catch((e) => setMessage(e.message));
      } else if (addonsMode === "mods") {
        loadMods().catch((e) => setMessage(e.message));
      }
    }
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
    if (activeView === "settings" && selectedServerId) loadServerSettings().catch((e) => setMessage(e.message));
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
    if (!message || !isAuthRelatedMessage(message)) return;
    setAuthErrorDetail(message);
    setShowAuthErrorModal(true);
    setMessage("");
  }, [message]);

  useEffect(() => {
    if (!message || isAuthRelatedMessage(message)) return;
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
    if (showAddServerModal && importRef.current) {
      importRef.current.setAttribute("webkitdirectory", "");
      importRef.current.setAttribute("directory", "");
    }
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
      const files = Array.from(e.dataTransfer?.files || []);
      dragCounterRef.current = 0;
      setDragOverlayVisible(false);
      if (!files.length || !(activeViewRef.current === "files" || activeViewRef.current === "plugins")) return;
      e.preventDefault();
      try {
        if (activeViewRef.current === "files") {
          await api.uploadFiles(filesPathRef.current, files);
          await loadFiles(filesPathRef.current);
        } else {
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
      if (rememberCredentials) {
        localStorage.setItem(STORAGE_KEY_LOGIN_REMEMBER, "1");
        localStorage.setItem(STORAGE_KEY_LOGIN_EMAIL, email);
        localStorage.setItem(STORAGE_KEY_LOGIN_PASSWORD, loginPassword);
      } else {
        localStorage.removeItem(STORAGE_KEY_LOGIN_REMEMBER);
        localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL);
        localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD);
      }
      await loadMe();
      await Promise.all([loadTypes(), loadServers()]);
      setActiveView(viewFromPath(window.location.pathname));
      setNeedsBootstrap(false);
    } catch (error) { setLoginError((error as Error).message); }
  };

  const doForgotPassword = async () => {
    setForgotModalNotice("");
    setForgotModalError("");
    const email = forgotEmail.trim();
    if (!email) return setForgotModalError("Enter email.");
    try {
      const out = await api.requestPasswordReset(email);
      if (out.sent) {
        setForgotModalNotice("If the email exists, the email is sent.");
      } else if (out.reason === "too-soon") {
        setForgotModalNotice("A temporary password was sent recently. Use the newest email and wait 45 seconds before requesting again.");
      } else if (out.reason === "smtp-missing") {
        setForgotModalNotice("If the email exists, reset data is generated, but SMTP is not configured to send mail.");
      } else {
        setForgotModalNotice("If the email exists, the email is sent.");
      }
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
    try {
      await api.authBootstrap(setupUsername.trim(), setupPassword, setupEmail.trim());
      await api.installServer({ name: setupServerName.trim(), type: setupServerType as ServerInstallType, version: setupVersion });
      localStorage.setItem(STORAGE_KEY_SETUP, "1");
      setShowSetupModal(false);
      setNeedsBootstrap(false);
      await loadMe();
      await Promise.all([loadTypes(), loadServers()]);
    } catch (error) { setSetupError((error as Error).message); }
  };

  const doLogout = async () => { await api.authLogout(); setCurrentUser(null); setIsAuthenticated(false); setUsers([]); setUserRoleDraft({}); setShowSetupModal(false); };
  const installServerNow = async () => {
    await api.installServer({
      name: installName.trim(),
      type: installType as ServerInstallType,
      version: installVersion,
      icon: installIconFile
    });
    setShowAddServerModal(false); setAddServerMode("chooser"); setInstallName(""); setInstallType(""); setInstallVersion(""); setInstallIconFile(null);
    if (installIconRef.current) installIconRef.current.value = "";
    await loadServers();
  };
  const importServerNow = async () => {
    if (!importName.trim()) throw new Error("Server name is required.");
    if (!importFiles.length) throw new Error("Select a server root folder first.");
    await api.importServer({ name: importName.trim(), files: importFiles });
    setShowAddServerModal(false); setAddServerMode("chooser"); setImportName(""); setImportFiles([]);
    await loadServers();
  };
  const deleteServerNow = async () => { if (!serverToDelete) return; await api.deleteServer(serverToDelete.id); setShowDeleteModal(false); setServerToDelete(null); await loadServers(); };
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
    await api.authSetPassword(forcePassword);
    setForcePassword(""); setForcePasswordConfirm("");
    await loadMe();
  };

  const runServerAction = async (action: "start" | "stop" | "restart") => {
    if (!selectedServerId) return;
    if (serverActionBusy) return;
    goToView("console");
    setConsoleLines([]);
    setConsoleCursor(0);
    setServerActionBusy(true);
    try {
      await api.clearConsoleHistory();
      if (action === "start") await api.startServer();
      if (action === "stop") await api.stopServer();
      if (action === "restart") await api.restartServer();
      await Promise.all([loadStatus(), loadConsoleHistory(0)]);
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
        await api.removePlugin(addonKey.slice("plugin:".length), false);
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
      const out = await api.updateServerSettings({
        ...serverSettings,
        startupScript: ""
      });
      setServerSettings(out.settings);
      setMessage("Server settings saved.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const openServerModal = (mode: AddServerMode) => {
    if (mode === "import") setImportFiles([]);
    if (mode === "install") {
      setInstallIconFile(null);
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

  if (!isAuthenticated || showSetupModal) {
    return (
      <div className="shell auth-shell">
        <main className="main flow-mode auth-main">
          {showSetupModal ? (
            <div className="auth-panel setup-panel">
              <h2 className="auth-title">Sign Up</h2>
              <p className="muted auth-subtitle">Initial Setup ({setupStep + 1}/5)</p>
              {setupStep === 0 && <div className="auth-form-stack"><label>Username</label><input value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} placeholder="Set username" autoFocus /><label>Email</label><input type="email" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} placeholder="Owner email" /></div>}
              {setupStep === 1 && <div className="auth-form-stack"><label>Password</label><input type="password" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} placeholder="Set password" autoFocus /></div>}
              {setupStep === 2 && <div className="auth-form-stack"><label>Server Name</label><input value={setupServerName} onChange={(e) => setSetupServerName(e.target.value)} placeholder="Set server name" autoFocus /></div>}
              {setupStep === 3 && <div className="auth-form-stack"><label>Server Type</label><div className="jar-options">{serverTypeOptions.map((t) => <button key={t.id} className={setupServerType === t.id ? "menu-btn active" : "menu-btn"} disabled={!t.enabled} title={t.enabled ? t.label : t.tooltip || "soon"} onClick={() => t.enabled && setSetupServerType(t.id as ServerInstallType)}>{t.label}</button>)}</div></div>}
              {setupStep === 4 && <div className="auth-form-stack"><label>Version</label><select value={setupVersion} onChange={(e) => setSetupVersion(e.target.value)}><option value="">Choose version</option>{setupVersionOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>}
              {!!setupError && <div className="banner warn">{setupError}</div>}
              <div className="row auth-actions-row">{setupStep > 0 && <button onClick={() => setSetupStep((prev) => prev - 1)}>Back</button>}<button className="btn-start auth-primary-btn" onClick={() => finishSetup().catch((e) => setSetupError(e.message))}>{setupStep < 4 ? "Next" : "Finish Setup"}</button></div>
            </div>
          ) : (
            <section className="auth-panel login-panel">
              <h2 className="auth-title login-title">Log In</h2>
              {needsBootstrap && <div className="banner warn">No account exists yet. Run initial setup.</div>}
              <div className="auth-form-stack"><label>Email</label><input type="email" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="Email address" /><label>Password</label><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doLogin().catch((err) => setLoginError(err.message)); }} placeholder="Password" /><div className="login-meta-row"><button className="link-btn" onClick={() => { setForgotEmail(""); setForgotModalNotice(""); setForgotModalError(""); setShowForgotModal(true); }}>Forgot password</button><span className="meta-divider" aria-hidden="true">|</span><label className="remember-row"><input type="checkbox" checked={rememberCredentials} onChange={(e) => { const next = e.target.checked; setRememberCredentials(next); if (!next) { localStorage.removeItem(STORAGE_KEY_LOGIN_REMEMBER); localStorage.removeItem(STORAGE_KEY_LOGIN_EMAIL); localStorage.removeItem(STORAGE_KEY_LOGIN_PASSWORD); } }} />Remember login</label></div></div>
              {!!loginError && <div className="banner warn">{loginError}</div>}
              <button className="auth-primary-btn" onClick={() => doLogin().catch((e) => setLoginError(e.message))}>Log In</button>
              {needsBootstrap && <button onClick={() => { setShowSetupModal(true); window.history.pushState({}, "", "/setup"); }}>Open Setup</button>}
            </section>
          )}
          {showForgotModal && (
            <div className="modal-backdrop" onClick={() => setShowForgotModal(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <h3>Forgot Password</h3>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter email"
                />
                {!!forgotModalError && <div className="banner warn">{forgotModalError}</div>}
                {!!forgotModalNotice && <div className="banner info">{forgotModalNotice}</div>}
                <div className="row">
                  <button onClick={() => setShowForgotModal(false)}>Close</button>
                  <button className="btn-start" onClick={() => doForgotPassword().catch((e) => setForgotModalError(e.message))}>Send</button>
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
            <div className="server-list-vertical">{servers.map((server) => <div key={server.id} className={selectedServerId === server.id ? "server-pill active server-item" : "server-pill server-item"} onClick={() => setSelectedServerId(server.id)}><img className="server-list-icon" src={`/api/servers/${encodeURIComponent(server.id)}/icon`} alt={`${server.name} icon`} /><div className="server-pill-text"><strong>{server.name}</strong><small>{server.type} {server.version}</small></div>{canOperateServer && <button className="server-delete-btn" aria-label="Delete server" onClick={(e) => { e.stopPropagation(); setServerToDelete(server); setShowDeleteModal(true); }} title="Delete"><i className="fa-solid fa-trash-can" aria-hidden="true" /></button>}</div>)}</div>
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
                    </div>
                    <div className="file-list">
                      {(pluginsLoading || modsLoading) && <div className="empty-list">Loading plugins/mods...</div>}
                      {addonsMode === "plugins" && !pluginsLoading && !plugins.length && <div className="empty-list">No plugins installed.</div>}
                      {addonsMode === "mods" && !modsLoading && !mods.length && <div className="empty-list">No mods installed.</div>}
                      {addonsMode === "plugins" && !pluginsLoading && plugins.map((plugin) => (
                        <div key={`plugin:${plugin.pluginId}`} className={selectedAddonKeys.includes(`plugin:${plugin.pluginId}`) ? "file-item selected plugin-row" : "file-item plugin-row"} onClick={() => toggleAddonSelection(`plugin:${plugin.pluginId}`)}>
                          <div className="entry-main">
                            <span className="entry-icon file" />
                            <span className="entry-name">[Plugin] {plugin.pluginId}</span>
                          </div>
                          <small className="muted">{plugin.jarPath || plugin.folderPath || "plugin"}</small>
                        </div>
                      ))}
                      {addonsMode === "mods" && !modsLoading && mods.map((mod) => (
                        <div key={`mod:${mod.modId}`} className={selectedAddonKeys.includes(`mod:${mod.modId}`) ? "file-item selected plugin-row" : "file-item plugin-row"} onClick={() => toggleAddonSelection(`mod:${mod.modId}`)}>
                          <div className="entry-main">
                            <span className="entry-icon file" />
                            <span className="entry-name">[Mod] {mod.modId}</span>
                          </div>
                          <small className="muted">{mod.jarPath}</small>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>}

            {activeView === "settings" && <>
              <h2>Settings</h2>
              <div className="view-layout">
                {settingsLoading ? (
                  <div className="empty-list">Loading settings...</div>
                ) : (
                  <div className="settings-layout">
                    <div className="settings-card modern-settings-card">
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
                      <button onClick={() => loadServerSettings().catch((e) => setMessage(e.message))}><i className="fa-solid fa-rotate-left" aria-hidden="true" /> Reset</button>
                      <button className="btn-start" disabled={settingsSaving} onClick={() => saveServerSettings().catch((e) => setMessage(e.message))}>
                        <i className="fa-solid fa-floppy-disk" aria-hidden="true" /> {settingsSaving ? "Saving..." : "Save Settings"}
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
                  <button className="btn-start create-user-btn" onClick={() => { setNewUsername(""); setNewEmail(""); setNewPassword(""); setNewRole("viewer"); setShowAddUserModal(true); }}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Add User</button>
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
                                disabled={isOwner}
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
                                <button disabled={isOwner} onClick={() => api.updateUser(user.id, { role: userRoleDraft[user.id] || user.role }).then(refreshUsers).catch((e) => setMessage(e.message))}><i className="fa-solid fa-floppy-disk" aria-hidden="true" /> Save Role</button>
                                <button disabled={isOwner} onClick={() => api.updateUser(user.id, { active: !user.active }).then(refreshUsers).catch((e) => setMessage(e.message))}>{user.active ? <><i className="fa-solid fa-user-slash" aria-hidden="true" /> Disable</> : <><i className="fa-solid fa-user-check" aria-hidden="true" /> Enable</>}</button>
                                <button disabled={isOwner} className="btn-danger" onClick={() => api.deleteUser(user.id).then(refreshUsers).catch((e) => setMessage(e.message))}><i className="fa-solid fa-user-minus" aria-hidden="true" /> Remove</button>
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
          <a href="#">MC Control Panel</a>.
        </footer>

        {showCreateFsModal && (
          <div className="modal-backdrop" onClick={() => setShowCreateFsModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
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

        {showMenuDrawer && <div className="menu-drawer-backdrop" onClick={() => setShowMenuDrawer(false)}><aside className="menu-drawer" onClick={(e) => e.stopPropagation()}><div className="menu-drawer-header"><h3>MC Control Panel</h3><button className="menu-toggle-btn" onClick={() => setShowMenuDrawer(false)}><img src="/minecraft-icon.png" alt="Toggle menu" className="menu-toggle-logo" /></button></div><nav className="menu-drawer-nav"><button className={activeView === "console" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("console"); setShowMenuDrawer(false); }}>Console</button><button className={activeView === "files" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("files"); setShowMenuDrawer(false); }}>Files</button><button disabled={!addonsEnabled} title={!addonsEnabled ? "Disabled for vanilla servers" : "Plugins/Mods"} className={activeView === "plugins" ? "menu-btn active" : "menu-btn"} onClick={() => { if (!addonsEnabled) return; goToView("plugins"); setShowMenuDrawer(false); }}>Plugins/Mods</button><button className={activeView === "settings" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("settings"); setShowMenuDrawer(false); }}>Settings</button>{canManageUsers && <button className={activeView === "users" ? "menu-btn active" : "menu-btn"} onClick={() => { goToView("users"); setShowMenuDrawer(false); }}>Users</button>}</nav></aside></div>}

        {showDeleteModal && serverToDelete && <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><h3>Delete Server</h3><p>Delete <strong>{serverToDelete.name}</strong>? This cannot be undone.</p><div className="row"><button onClick={() => setShowDeleteModal(false)}>Cancel</button><button className="btn-danger" onClick={() => deleteServerNow().catch((e) => setMessage(e.message))}>Delete</button></div></div></div>}

        {showAddServerModal && (
          <div className="modal-backdrop" onClick={() => setShowAddServerModal(false)}>
            <div className="modal-card setup-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Add Server</h3>
              {addServerMode === "chooser" && (
                <div className="row">
                  <button className="btn-start" onClick={() => setAddServerMode("install")}><i className="fa-solid fa-server" aria-hidden="true" /> Install New</button>
                  <button onClick={() => setAddServerMode("import")}><i className="fa-solid fa-file-import" aria-hidden="true" /> Import Server</button>
                </div>
              )}
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
                  <input
                    ref={installIconRef}
                    type="file"
                    accept=".png,image/png"
                    hidden
                    onChange={(e) => setInstallIconFile((e.target.files && e.target.files[0]) || null)}
                  />
                  <div className="row">
                    <button onClick={() => installIconRef.current?.click()}>Select Server Icon (Optional)</button>
                  </div>
                  <small className="muted">{installIconFile ? installIconFile.name : "No icon selected. Default server-icon.png will be used."}</small>
                  <div className="row">
                    <button onClick={() => setAddServerMode("chooser")}>Back</button>
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
                  <small className="muted">
                    {importFiles.length
                      ? `${importFiles.length} files selected from folder`
                      : "Choose the server root folder to import"}
                  </small>
                  <div className="row">
                    <button onClick={() => setAddServerMode("chooser")}>Back</button>
                    <button className="btn-start" onClick={() => importServerNow().catch((e) => setMessage(e.message))}>Import</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {showConfigEditor && configEditor && <div className="modal-backdrop" onClick={() => closeConfigEditor()}><div className="modal-card config-editor-modal" onClick={(e) => e.stopPropagation()}><h3>Config Editor</h3><div className="muted">{configEditor.path}</div><div className="config-editor-monaco"><Editor height="55dvh" language={configLanguage(configEditor.path)} theme="vs-dark" value={configEditor.content} onChange={(value) => setConfigEditor({ ...configEditor, content: value ?? "" })} options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", automaticLayout: true }} /></div>{!!configEditorError && <div className="banner warn">{configEditorError}</div>}<div className="row"><button onClick={() => closeConfigEditor()}>Cancel</button><button className="btn-start" onClick={() => saveConfigEditor().catch((e) => setConfigEditorError(e.message))}>Save</button></div></div></div>}

        {currentUser?.mustChangePassword && <div className="modal-backdrop" onClick={(e) => e.stopPropagation()}><div className="modal-card" onClick={(e) => e.stopPropagation()}><h3>Set New Password</h3><p>You logged in with a temporary password. Set a new password to continue.</p><input type="password" value={forcePassword} onChange={(e) => setForcePassword(e.target.value)} placeholder="New password" /><input type="password" value={forcePasswordConfirm} onChange={(e) => setForcePasswordConfirm(e.target.value)} placeholder="Confirm password" />{!!forcePasswordError && <div className="banner warn">{forcePasswordError}</div>}<div className="row"><button className="btn-start" onClick={() => setForcedPasswordNow().catch((e) => setForcePasswordError(e.message))}>Set</button></div></div></div>}

        {showAddUserModal && (
          <div className="modal-backdrop" onClick={() => setShowAddUserModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
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

        {showAuthErrorModal && <div className="modal-backdrop" onClick={() => setShowAuthErrorModal(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><h3>Authentication Required</h3><p>Login is required for this action, or your account does not have permission.</p><p className="muted">Details: {authErrorDetail}</p><div className="row"><button onClick={() => setShowAuthErrorModal(false)}>Close</button><button className="btn-start" onClick={() => doLogout().finally(() => setShowAuthErrorModal(false))}>Go To Login</button></div></div></div>}

        {showInfoModal && <div className="modal-backdrop" onClick={() => setShowInfoModal(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><h3>Notice</h3><p>{infoModalDetail}</p><div className="row"><button onClick={() => setShowInfoModal(false)}>Close</button></div></div></div>}

        {dragOverlayVisible && (activeView === "files" || (activeView === "plugins" && addonsEnabled)) && <div className="drop-overlay-modal" onDragOver={(e) => e.preventDefault()}><div className="drop-overlay-content"><div className="drop-icon"><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /></div><h3>Drop Files Here</h3><p>{activeView === "files" ? "Upload into current folder" : addonsMode === "plugins" ? "Install plugin artifact(s)" : "Install mod/modpack artifact(s)"}</p></div></div>}
      </main>
    </div>
  );
}
