const jsonHeaders = { "Content-Type": "application/json" };
let activeServerId = "";
const withServerHeaders = (headers) => {
    if (!activeServerId)
        return headers || {};
    return { ...(headers || {}), "x-server-id": activeServerId };
};
async function request(url, init) {
    const res = await fetch(url, {
        ...init,
        headers: withServerHeaders(init?.headers)
    });
    if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try {
            const body = await res.json();
            if (body?.error)
                message = body.error;
        }
        catch {
            // no-op
        }
        throw new Error(message);
    }
    return res.json();
}
export const api = {
    setActiveServerId: (serverId) => {
        activeServerId = serverId;
    },
    panelInfo: () => request("/api/panel/info"),
    authMe: () => request("/api/auth/me"),
    authState: () => request("/api/auth/state"),
    authBootstrap: (username, password, email = "") => request("/api/auth/bootstrap", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ username, password, email })
    }),
    authLogin: (email, password) => request("/api/auth/login", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email, password })
    }),
    authLogout: () => request("/api/auth/logout", { method: "POST" }),
    requestPasswordReset: (identity) => request("/api/auth/request-password-reset", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ identity })
    }),
    authSetPassword: (password) => request("/api/auth/set-password", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ password })
    }),
    listUsers: () => request("/api/users"),
    createUser: (payload) => request("/api/users", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload)
    }),
    updateUser: (id, payload) => request(`/api/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload)
    }),
    deleteUser: (id) => request(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
    listServers: () => request("/api/servers"),
    deleteServer: (id) => request(`/api/servers/${encodeURIComponent(id)}`, { method: "DELETE" }),
    installServer: async (payload) => {
        const form = new FormData();
        form.append("name", payload.name);
        form.append("type", payload.type);
        form.append("version", payload.version);
        if (payload.icon)
            form.append("icon", payload.icon, payload.icon.name);
        const res = await fetch("/api/servers/install", {
            method: "POST",
            body: form
        });
        if (!res.ok)
            throw new Error((await res.json()).error || "Server install failed");
        return res.json();
    },
    importServer: async (payload) => {
        const form = new FormData();
        form.append("name", payload.name);
        for (const file of payload.files) {
            const relative = "webkitRelativePath" in file ? String(file.webkitRelativePath || "").trim() : "";
            form.append("files[]", file, relative || file.name);
        }
        const res = await fetch("/api/servers/import", { method: "POST", body: form });
        if (!res.ok)
            throw new Error((await res.json()).error || "Server import failed");
        return res.json();
    },
    getServerTypes: () => request("/api/server-types"),
    getServerVersions: (type) => request(`/api/server-versions?type=${encodeURIComponent(type)}`),
    serverStatus: () => request("/api/server/status"),
    startServer: () => request("/api/server/start", { method: "POST" }),
    stopServer: () => request("/api/server/stop", { method: "POST" }),
    restartServer: () => request("/api/server/restart", { method: "POST" }),
    getServerSettings: () => request("/api/server/settings"),
    updateServerSettings: (settings) => request("/api/server/settings", {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(settings)
    }),
    sendCommand: (command) => request("/api/server/command", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ command })
    }),
    consoleHistory: (cursor = 0) => request(`/api/console/history?cursor=${cursor}`),
    clearConsoleHistory: () => request("/api/console/clear", { method: "POST" }),
    listFiles: (inputPath = ".") => request(`/api/files/tree?path=${encodeURIComponent(inputPath)}`),
    readFile: (inputPath) => request(`/api/files/read?path=${encodeURIComponent(inputPath)}`),
    writeFile: (body) => request("/api/files/write", {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(body)
    }),
    mkdir: (inputPath) => request("/api/files/mkdir", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ path: inputPath })
    }),
    move: (from, to) => request("/api/files/move", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ from, to })
    }),
    rename: (from, to) => request("/api/files/rename", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ from, to })
    }),
    deletePaths: (paths) => request("/api/files/delete", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ paths })
    }),
    uploadFiles: async (targetPath, files) => {
        const form = new FormData();
        form.append("targetPath", targetPath);
        for (const file of files)
            form.append("files[]", file);
        const res = await fetch("/api/files/upload", {
            method: "POST",
            body: form,
            headers: withServerHeaders()
        });
        if (!res.ok)
            throw new Error((await res.json()).error || "Upload failed");
        return res.json();
    },
    listPlugins: () => request("/api/plugins/list"),
    installPlugin: async (artifact, mode, confirmOverwrite = false) => {
        const form = new FormData();
        form.append("artifact", artifact);
        form.append("mode", mode);
        form.append("confirmOverwrite", String(confirmOverwrite));
        const res = await fetch("/api/plugins/install", {
            method: "POST",
            body: form,
            headers: withServerHeaders()
        });
        if (!res.ok)
            throw new Error((await res.json()).error || "Plugin install failed");
        return res.json();
    },
    removePlugin: (pluginId, deleteConfig) => request("/api/plugins/remove", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ pluginId, deleteConfig })
    }),
    listMods: () => request("/api/mods/list"),
    installMod: async (artifact, mode, confirmOverwrite = false) => {
        const form = new FormData();
        form.append("artifact", artifact);
        form.append("mode", mode);
        form.append("confirmOverwrite", String(confirmOverwrite));
        const res = await fetch("/api/mods/install", {
            method: "POST",
            body: form,
            headers: withServerHeaders()
        });
        if (!res.ok)
            throw new Error((await res.json()).error || "Mod install failed");
        return res.json();
    },
    removeMod: (modId) => request("/api/mods/remove", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ modId })
    }),
    validateConfig: (inputPath) => request(`/api/config/validate?path=${encodeURIComponent(inputPath)}`)
};
