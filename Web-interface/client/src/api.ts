import type {
  EulaState,
  FileEntry,
  ModEntry,
  PlayerRecord,
  PluginEntry,
  ServerAddonSummary,
  ServerPropertiesState,
  StartServerResult,
  ServerInstallType,
  ServerProfile,
  ServerSettings,
  ServerStatus,
  ServerTypeOption,
  UserRecord
} from "./types";

const jsonHeaders = { "Content-Type": "application/json" };
let activeServerId = "";

const withServerHeaders = (headers?: HeadersInit): HeadersInit => {
  if (!activeServerId) return headers || {};
  return { ...(headers || {}), "x-server-id": activeServerId };
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: withServerHeaders(init?.headers)
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // no-op
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  setActiveServerId: (serverId: string) => {
    activeServerId = serverId;
  },
  panelInfo: () => request<{ insecure: boolean; serverRoot: string }>("/api/panel/info"),

  authMe: () => request<{ user: UserRecord }>("/api/auth/me"),
  authState: () => request<{ needsBootstrap: boolean }>("/api/auth/state"),
  authBootstrap: (username: string, password: string, email = "") =>
    request<{ user: UserRecord }>("/api/auth/bootstrap", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ username, password, email })
    }),
  authLogin: (email: string, password: string) =>
    request<{ user: UserRecord }>("/api/auth/login", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email, password })
    }),
  authLogout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  requestPasswordReset: (identity: string) =>
    request<{ ok: true; sent: boolean; reason?: string }>("/api/auth/request-password-reset", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ identity })
    }),
  authSetPassword: (password: string) =>
    request<{ user: UserRecord }>("/api/auth/set-password", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ password })
    }),

  listUsers: () => request<{ users: UserRecord[] }>("/api/users"),
  createUser: (payload: { username: string; password: string; role: UserRecord["role"]; email?: string }) =>
    request<{ user: UserRecord }>("/api/users", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  updateUser: (id: string, payload: { role?: UserRecord["role"]; active?: boolean; password?: string; email?: string }) =>
    request<{ user: UserRecord }>(`/api/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  deleteUser: (id: string) =>
    request<{ ok: true }>(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listServers: () => request<{ servers: ServerProfile[] }>("/api/servers"),
  deleteServer: (id: string) =>
    request<{ removed: ServerProfile }>(`/api/servers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  renameServer: (id: string, name: string) =>
    request<{ server: ServerProfile }>(`/api/servers/${encodeURIComponent(id)}/rename`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name })
    }),
  updateServer: (id: string) =>
    request<{ server: ServerProfile; update: { jarPath: string; version: string; build: string | null; updated: boolean; infoPath: string } }>(
      `/api/servers/${encodeURIComponent(id)}/update`,
      { method: "POST" }
    ),
  installServer: async (payload: { name: string; type: ServerInstallType; version: string; icon?: File | null }) => {
    const form = new FormData();
    form.append("name", payload.name);
    form.append("type", payload.type);
    form.append("version", payload.version);
    if (payload.icon) form.append("icon", payload.icon, payload.icon.name);
    const res = await fetch("/api/servers/install", {
      method: "POST",
      body: form
    });
    if (!res.ok) throw new Error((await res.json()).error || "Server install failed");
    return res.json() as Promise<{ server: ServerProfile; install: { jarPath: string } }>;
  },
  importServer: async (payload: { name: string; files: File[] }) => {
    const form = new FormData();
    form.append("name", payload.name);
    for (const file of payload.files) {
      const relative = "webkitRelativePath" in file ? String(file.webkitRelativePath || "").trim() : "";
      form.append("files[]", file, relative || file.name);
    }
    const res = await fetch("/api/servers/import", { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json()).error || "Server import failed");
    return res.json() as Promise<{ server: ServerProfile; saved: string[] }>;
  },
  getServerTypes: () => request<{ types: ServerTypeOption[] }>("/api/server-types"),
  getServerAddonSummary: (id: string) =>
    request<{ summary: ServerAddonSummary }>(`/api/servers/${encodeURIComponent(id)}/addons-summary`),
  getServerVersions: (type: ServerInstallType) =>
    request<{ versions: string[] }>(`/api/server-versions?type=${encodeURIComponent(type)}`),

  serverStatus: () => request<ServerStatus>("/api/server/status"),
  startServer: () => request<StartServerResult>("/api/server/start", { method: "POST" }),
  startServerAfterEula: () => request<StartServerResult>("/api/server/start-force", { method: "POST" }),
  stopServer: () => request("/api/server/stop", { method: "POST" }),
  restartServer: () => request("/api/server/restart", { method: "POST" }),
  getServerSettings: () => request<{ settings: ServerSettings }>("/api/server/settings"),
  updateServerSettings: (settings: ServerSettings) =>
    request<{ settings: ServerSettings }>("/api/server/settings", {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(settings)
    }),
  sendCommand: (command: string) =>
    request("/api/server/command", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ command })
    }),
  listPlayers: () => request<{ players: PlayerRecord[] }>("/api/server/players"),
  addPlayer: (payload: {
    username: string;
    whitelisted?: boolean;
    operator?: boolean;
    opLevel?: number;
    bypassesPlayerLimit?: boolean;
  }) =>
    request<{ player: PlayerRecord }>("/api/server/players", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  updatePlayer: (
    uuid: string,
    payload: { name?: string; whitelisted?: boolean; operator?: boolean; opLevel?: number; bypassesPlayerLimit?: boolean }
  ) =>
    request<{ player: PlayerRecord }>(`/api/server/players/${encodeURIComponent(uuid)}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  removePlayer: (uuid: string, name?: string) =>
    request<{ ok: true }>(`/api/server/players/${encodeURIComponent(uuid)}${name ? `?name=${encodeURIComponent(name)}` : ""}`, {
      method: "DELETE"
    }),
  getEula: () => request<{ eula: EulaState }>("/api/server/eula"),
  setEula: (accepted: boolean) =>
    request<{ eula: EulaState }>("/api/server/eula", {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ accepted })
    }),
  getServerProperties: () => request<ServerPropertiesState>("/api/server/properties"),
  updateServerProperties: (payload: { fields: Array<{ key: string; value: string }>; expectedMtime?: string | null }) =>
    request<ServerPropertiesState>("/api/server/properties", {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  consoleHistory: (cursor = 0) =>
    request<{ lines: unknown[]; nextCursor: number }>(`/api/console/history?cursor=${cursor}`),
  clearConsoleHistory: () => request<{ ok: true }>("/api/console/clear", { method: "POST" }),
  listFiles: (inputPath = ".") =>
    request<{ entries: FileEntry[] }>(`/api/files/tree?path=${encodeURIComponent(inputPath)}`),
  readFile: (inputPath: string) =>
    request<{ path: string; content: string; mtime: string }>(
      `/api/files/read?path=${encodeURIComponent(inputPath)}`
    ),
  writeFile: (body: {
    path: string;
    content: string;
    encoding?: string;
    expectedMtime?: string;
  }) =>
    request<{ mtime: string }>("/api/files/write", {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(body)
    }),
  mkdir: (inputPath: string) =>
    request("/api/files/mkdir", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path: inputPath })
    }),
  move: (from: string, to: string) =>
    request("/api/files/move", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ from, to })
    }),
  rename: (from: string, to: string) =>
    request("/api/files/rename", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ from, to })
    }),
  deletePaths: (paths: string[]) =>
    request("/api/files/delete", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ paths })
    }),
  uploadFiles: async (targetPath: string, files: File[]) => {
    const form = new FormData();
    form.append("targetPath", targetPath);
    for (const file of files) form.append("files[]", file);
    const res = await fetch("/api/files/upload", {
      method: "POST",
      body: form,
      headers: withServerHeaders() as HeadersInit
    });
    if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
    return res.json() as Promise<{ saved: string[] }>;
  },
  listPlugins: () => request<{ plugins: PluginEntry[] }>("/api/plugins/list"),
  installPlugin: async (artifact: File, mode: "jar" | "zip", confirmOverwrite = false) => {
    const form = new FormData();
    form.append("artifact", artifact);
    form.append("mode", mode);
    form.append("confirmOverwrite", String(confirmOverwrite));
    const res = await fetch("/api/plugins/install", {
      method: "POST",
      body: form,
      headers: withServerHeaders() as HeadersInit
    });
    if (!res.ok) throw new Error((await res.json()).error || "Plugin install failed");
    return res.json() as Promise<{ changed: string[] }>;
  },
  removePlugin: (pluginId: string, deleteConfig: boolean) =>
    request<{ changed: string[] }>("/api/plugins/remove", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ pluginId, deleteConfig })
    }),
  listMods: () => request<{ mods: ModEntry[] }>("/api/mods/list"),
  installMod: async (artifact: File, mode: "jar" | "zip", confirmOverwrite = false) => {
    const form = new FormData();
    form.append("artifact", artifact);
    form.append("mode", mode);
    form.append("confirmOverwrite", String(confirmOverwrite));
    const res = await fetch("/api/mods/install", {
      method: "POST",
      body: form,
      headers: withServerHeaders() as HeadersInit
    });
    if (!res.ok) throw new Error((await res.json()).error || "Mod install failed");
    return res.json() as Promise<{ changed: string[]; skipped: string[] }>;
  },
  removeMod: (modId: string) =>
    request<{ changed: string[] }>("/api/mods/remove", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ modId })
    }),
  validateConfig: (inputPath: string) =>
    request<{ ok: boolean; format: string; errors: string[]; hints: string[] }>(
      `/api/config/validate?path=${encodeURIComponent(inputPath)}`
    )
};
