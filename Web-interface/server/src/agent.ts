import express from "express";
import { MultiServerRuntimeService } from "./services/MultiServerRuntimeService.js";
import { ServerSettingsService } from "./services/ServerSettingsService.js";
import { ServerAdminService } from "./services/ServerAdminService.js";

const app = express();
const host = process.env.AGENT_BIND_HOST || "127.0.0.1";
const port = Number(process.env.AGENT_BIND_PORT || 4300);
const authToken = String(process.env.AGENT_AUTH_TOKEN || "").trim();

const settings = new ServerSettingsService();
const runtime = new MultiServerRuntimeService(settings);
const admin = new ServerAdminService(runtime);

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (!authToken) return res.status(500).json({ error: "AGENT_AUTH_TOKEN is not configured." });
  const header = String(req.header("authorization") || "");
  if (header !== `Bearer ${authToken}`) return res.status(401).json({ error: "Unauthorized agent request." });
  next();
});

app.get("/api/agent/health", (_req, res) => {
  res.json({
    ok: true,
    capabilities: { runtime: true, metrics: true },
    host,
    port,
    platform: process.platform
  });
});

app.post("/api/agent/runtime/status", (req, res) => {
  try {
    const serverId = String(req.body?.serverId || "");
    if (!serverId) return res.status(400).json({ error: "serverId is required." });
    return res.json({ status: runtime.getStatus(serverId) });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/agent/runtime/start", async (req, res) => {
  try {
    const serverId = String(req.body?.serverId || "");
    const rootPath = String(req.body?.rootPath || "");
    if (!serverId || !rootPath) return res.status(400).json({ error: "serverId and rootPath are required." });
    if (req.body?.settings) settings.update(serverId, req.body.settings);
    const eula = await admin.getEula(rootPath);
    if (!eula.accepted) return res.status(400).json({ error: "Minecraft EULA must be accepted on the remote node before start." });
    return res.json({ status: runtime.start(serverId, rootPath) });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/agent/runtime/stop", (req, res) => {
  try {
    const serverId = String(req.body?.serverId || "");
    if (!serverId) return res.status(400).json({ error: "serverId is required." });
    return res.json({ status: runtime.stop(serverId) });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/agent/runtime/restart", (req, res) => {
  try {
    const serverId = String(req.body?.serverId || "");
    const rootPath = String(req.body?.rootPath || "");
    if (!serverId || !rootPath) return res.status(400).json({ error: "serverId and rootPath are required." });
    if (req.body?.settings) settings.update(serverId, req.body.settings);
    return res.json({ status: runtime.restart(serverId, rootPath) });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/agent/runtime/command", (req, res) => {
  try {
    const serverId = String(req.body?.serverId || "");
    const command = String(req.body?.command || "");
    if (!serverId || !command.trim()) return res.status(400).json({ error: "serverId and command are required." });
    runtime.sendCommand(serverId, command);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.listen(port, host, () => {
  console.log(`MC Control Panel agent listening on http://${host}:${port}`);
});
