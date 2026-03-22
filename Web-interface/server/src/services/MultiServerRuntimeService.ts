import { EventEmitter } from "node:events";
import { spawn, spawnSync, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ConsoleLine } from "../types.js";
import { appConfig } from "../config.js";
import type { ServerSettings, ServerSettingsService } from "./ServerSettingsService.js";

export type ServerRuntimeStatus = {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  uptimeMs: number;
  phase: "offline" | "starting" | "online" | "stopping" | "restarting";
};

type RuntimeState = {
  process: ChildProcessWithoutNullStreams | null;
  playitProcess: ChildProcess | null;
  startedAt: Date | null;
  stopRequested: boolean;
  actionInProgress: boolean;
  pendingRestart: boolean;
  lockPath: string | null;
  phase: "offline" | "starting" | "online" | "stopping" | "restarting";
  buffer: ConsoleLine[];
  cursor: number;
};

const MAX_BUFFER = 3000;
const ANSI_ESCAPE_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export class MultiServerRuntimeService {
  private readonly events = new EventEmitter();
  private readonly states = new Map<string, RuntimeState>();

  constructor(private readonly settings: ServerSettingsService) {}

  onConsole(listener: (payload: { serverId: string; line: ConsoleLine }) => void): void {
    this.events.on("console", listener);
  }

  onStatus(listener: (payload: { serverId: string; status: ServerRuntimeStatus }) => void): void {
    this.events.on("status", listener);
  }

  getStatus(serverId: string): ServerRuntimeStatus {
    const state = this.getState(serverId);
    const uptimeMs = state.startedAt && state.process ? Date.now() - state.startedAt.getTime() : 0;
    return {
      running: !!state.process,
      pid: state.process?.pid || null,
      startedAt: state.startedAt?.toISOString() || null,
      uptimeMs,
      phase: state.phase
    };
  }

  getHistory(serverId: string, cursor?: number): ConsoleLine[] {
    const state = this.getState(serverId);
    if (!cursor) return [...state.buffer];
    return state.buffer.filter((line) => line.cursor > cursor);
  }

  clearHistory(serverId: string): void {
    const state = this.getState(serverId);
    state.buffer = [];
    state.cursor = 0;
  }

  start(serverId: string, serverRoot: string): ServerRuntimeStatus {
    const state = this.getState(serverId);
    if (state.actionInProgress) {
      throw new Error("A server action is already in progress. Please wait a moment.");
    }
    if (state.process) return this.getStatus(serverId);
    if (this.isElevatedRuntime()) throw new Error("Refused to start: do not run panel as Administrator/root.");
    state.actionInProgress = true;
    state.phase = "starting";
    try {
      this.acquireInstanceLock(serverId, serverRoot);
      const runtimeSettings = this.settings.get(serverId);
      this.applyServerProperties(serverId, serverRoot, runtimeSettings.serverIp, runtimeSettings.serverPort);
      const startCommand = this.buildStartCommand(serverId, serverRoot, runtimeSettings);
      state.stopRequested = false;
      state.process = spawn(startCommand, { cwd: serverRoot, shell: true });
      state.startedAt = new Date();
      this.pushSystemLine(serverId, `Server start command: ${startCommand}`);
      state.process.stdout.on("data", (chunk) => this.pushText(serverId, "stdout", chunk));
      state.process.stderr.on("data", (chunk) => this.pushText(serverId, "stderr", chunk));
      state.process.once("error", (error) => {
        this.pushSystemLine(serverId, `Server failed to start: ${error.message}`);
        state.process = null;
        state.startedAt = null;
        state.actionInProgress = false;
        state.phase = "offline";
        this.releaseInstanceLock(serverId, serverRoot);
        this.events.emit("status", { serverId, status: this.getStatus(serverId) });
      });
      state.process.once("exit", (code, signal) => {
        this.pushSystemLine(serverId, `Server exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`);
        const shouldAutoRestart = this.settings.get(serverId).autoRestart && !state.stopRequested;
        const shouldRequestedRestart = state.pendingRestart;
        this.stopPlayit(serverId);
        state.process = null;
        state.startedAt = null;
        state.stopRequested = false;
        state.pendingRestart = false;
        state.actionInProgress = false;
        state.phase = "offline";
        this.releaseInstanceLock(serverId, serverRoot);
        this.events.emit("status", { serverId, status: this.getStatus(serverId) });
        if (shouldRequestedRestart || shouldAutoRestart) {
          const delayMs = shouldRequestedRestart ? 800 : 2000;
          this.pushSystemLine(serverId, shouldRequestedRestart ? "Restart requested. Starting server..." : "Auto-restart is enabled. Restarting server in 2 seconds...");
          setTimeout(() => {
            if (!state.process) {
              try {
                this.start(serverId, serverRoot);
              } catch (error) {
                this.pushSystemLine(serverId, `Restart failed: ${(error as Error).message}`);
              }
            }
          }, delayMs);
        }
      });
      this.startPlayitIfEnabled(serverId, serverRoot);
      state.actionInProgress = false;
      this.events.emit("status", { serverId, status: this.getStatus(serverId) });
      return this.getStatus(serverId);
    } catch (error) {
      state.actionInProgress = false;
      state.phase = "offline";
      throw error;
    }
  }

  stop(serverId: string): ServerRuntimeStatus {
    const state = this.getState(serverId);
    if (!state.process) return this.getStatus(serverId);
    if (state.actionInProgress) return this.getStatus(serverId);
    state.stopRequested = true;
    state.pendingRestart = false;
    state.actionInProgress = true;
    state.phase = "stopping";
    try {
      this.sendCommand(serverId, "stop");
    } catch (error) {
      state.actionInProgress = false;
      throw error;
    }
    return this.getStatus(serverId);
  }

  restart(serverId: string, serverRoot: string): ServerRuntimeStatus {
    const state = this.getState(serverId);
    if (!state.process) return this.start(serverId, serverRoot);
    if (state.actionInProgress) {
      state.pendingRestart = true;
      state.phase = "restarting";
      return this.getStatus(serverId);
    }
    state.pendingRestart = true;
    state.stopRequested = true;
    state.actionInProgress = true;
    state.phase = "restarting";
    try {
      this.sendCommand(serverId, "stop");
    } catch (error) {
      state.actionInProgress = false;
      throw error;
    }
    return this.getStatus(serverId);
  }

  sendCommand(serverId: string, command: string): void {
    const state = this.getState(serverId);
    if (!state.process) throw new Error("Server is not running.");
    state.process.stdin.write(`${command.trim()}\n`);
    this.pushSystemLine(serverId, `> ${command.trim()}`);
  }

  isRunning(serverId: string): boolean {
    return !!this.getState(serverId).process;
  }

  private getState(serverId: string): RuntimeState {
    const existing = this.states.get(serverId);
    if (existing) return existing;
    const next: RuntimeState = {
      process: null,
      playitProcess: null,
      startedAt: null,
      stopRequested: false,
      actionInProgress: false,
      pendingRestart: false,
      lockPath: null,
      phase: "offline",
      buffer: [],
      cursor: 0
    };
    this.states.set(serverId, next);
    return next;
  }

  private pushText(serverId: string, source: "stdout" | "stderr", chunk: Buffer): void {
    const lines = chunk.toString("utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) this.pushLine(serverId, source, line);
  }

  private pushSystemLine(serverId: string, line: string): void {
    this.pushLine(serverId, "system", line);
  }

  private pushLine(serverId: string, source: "stdout" | "stderr" | "system", line: string): void {
    const state = this.getState(serverId);
    const cleanLine = this.stripAnsi(line);
    if (!cleanLine) return;
    if (source !== "system" && state.process && (state.phase === "starting" || state.phase === "restarting")) {
      if (/done \([0-9.]+s\)!/i.test(cleanLine) || /for help, type "help"/i.test(cleanLine)) {
        state.phase = "online";
        this.events.emit("status", { serverId, status: this.getStatus(serverId) });
      }
    }
    const item: ConsoleLine = { cursor: ++state.cursor, ts: new Date().toISOString(), source, line: cleanLine };
    state.buffer.push(item);
    if (state.buffer.length > MAX_BUFFER) state.buffer.shift();
    this.events.emit("console", { serverId, line: item });
  }

  private stripAnsi(input: string): string {
    return String(input || "").replace(ANSI_ESCAPE_REGEX, "").replace(/\u0007/g, "").trimEnd();
  }

  private buildStartCommand(serverId: string, serverRoot: string, settings: ServerSettings): string {
    if (settings.startupScript.trim()) return settings.startupScript.trim();
    if (appConfig.startCommand.trim()) return appConfig.startCommand.trim();
    const jar = this.resolveJarPath(serverRoot);
    if (!appConfig.ramAutoEnabled) {
      return `${appConfig.javaBinary} -Dterminal.jline=false -Dterminal.ansi=true -Xms2G -Xmx4G -jar "${jar}"${appConfig.useNogui ? " nogui" : ""}`;
    }
    const pluginCount = this.countPluginJars(serverRoot);
    const whitelistedPlayers = this.countWhitelistedPlayers(serverRoot);
    const totalSystemGb = os.totalmem() / (1024 * 1024 * 1024);
    const usableGb = Math.max(1, totalSystemGb - appConfig.ramReserveOsGb);
    const targetGb =
      appConfig.ramBaseGb +
      (pluginCount * appConfig.ramPerPluginMb) / 1024 +
      (whitelistedPlayers * appConfig.ramPerWhitelistedPlayerMb) / 1024;
    const minBoundGb = Math.max(1, settings.ramMinGb ?? 1);
    const maxBoundGb = Math.max(minBoundGb, settings.ramMaxGb ?? usableGb);
    const boundedGb = Math.min(maxBoundGb, Math.max(minBoundGb, targetGb, 1));
    const xmxMb = Math.max(1024, Math.floor(Math.min(usableGb, boundedGb) * 1024));
    const xmsMb = Math.max(1024, Math.floor(xmxMb * Math.max(0.1, appConfig.ramXmsRatio)));
    this.pushSystemLine(
      serverId,
      `Auto RAM: system=${totalSystemGb.toFixed(1)}G, plugins=${pluginCount}, whitelist=${whitelistedPlayers}, min=${minBoundGb.toFixed(2)}G, max=${maxBoundGb.toFixed(2)}G, Xms=${xmsMb}M, Xmx=${xmxMb}M`
    );
    return `${appConfig.javaBinary} -Dterminal.jline=false -Dterminal.ansi=true -Xms${xmsMb}M -Xmx${xmxMb}M -jar "${jar}"${appConfig.useNogui ? " nogui" : ""}`;
  }

  private resolveJarPath(serverRoot: string): string {
    const configured = path.resolve(serverRoot, appConfig.serverJar);
    if (fs.existsSync(configured)) return configured;
    const entries = fs
      .readdirSync(serverRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
      .map((entry) => entry.name);
    const blocked = entries.filter((name) => /(installer|buildtools|launcher-installer)\.jar$/i.test(name));
    const runnable = entries.filter((name) => !blocked.includes(name));
    const pool = runnable.length ? runnable : entries;
    const preferred =
      pool.find((name) => /fabric-server-launch\.jar$/i.test(name)) ||
      pool.find((name) => /minecraft_server/i.test(name)) ||
      pool.find((name) => /purpur|paper|spigot|forge|neoforge|server/i.test(name)) ||
      pool[0];
    if (!preferred) return configured;
    return path.resolve(serverRoot, preferred);
  }

  private countPluginJars(serverRoot: string): number {
    try {
      const pluginsDir = path.resolve(serverRoot, "plugins");
      if (!fs.existsSync(pluginsDir)) return 0;
      return fs
        .readdirSync(pluginsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar")).length;
    } catch {
      return 0;
    }
  }

  private countWhitelistedPlayers(serverRoot: string): number {
    try {
      const filePath = path.resolve(serverRoot, "whitelist.json");
      if (!fs.existsSync(filePath)) return 0;
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }

  private isElevatedRuntime(): boolean {
    if (process.platform === "win32") {
      try {
        const check = spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "(New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
          ],
          { encoding: "utf8" }
        );
        const out = (check.stdout || "").trim().toLowerCase();
        return out === "true";
      } catch {
        return false;
      }
    }
    if (typeof process.getuid === "function") return process.getuid() === 0;
    return false;
  }

  private applyServerProperties(serverId: string, serverRoot: string, serverIp: string, serverPort: number | null): void {
    if (!serverIp && serverPort === null) return;
    const filePath = path.resolve(serverRoot, "server.properties");
    try {
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, "utf8");
      const lines = raw.split(/\r?\n/);
      const out: string[] = [];
      let ipHandled = false;
      let portHandled = false;
      for (const line of lines) {
        if (line.startsWith("server-ip=")) {
          out.push(`server-ip=${serverIp || ""}`);
          ipHandled = true;
          continue;
        }
        if (line.startsWith("server-port=")) {
          out.push(`server-port=${serverPort ?? 25565}`);
          portHandled = true;
          continue;
        }
        out.push(line);
      }
      if (!ipHandled) out.push(`server-ip=${serverIp || ""}`);
      if (!portHandled) out.push(`server-port=${serverPort ?? 25565}`);
      fs.writeFileSync(filePath, out.join("\n"), "utf8");
      this.pushSystemLine(serverId, `Applied network settings to server.properties.`);
    } catch (error) {
      this.pushSystemLine(serverId, `Could not update server.properties: ${(error as Error).message}`);
    }
  }

  private startPlayitIfEnabled(serverId: string, serverRoot: string): void {
    const settings = this.settings.get(serverId);
    const state = this.getState(serverId);
    if (!settings.playitEnabled || state.playitProcess) return;
    const command = settings.playitCommand.trim() || "playit";
    state.playitProcess = spawn(command, { cwd: serverRoot, shell: true });
    this.pushSystemLine(serverId, `Starting playit.gg tunnel with command: ${command}`);
    state.playitProcess.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) {
        this.pushSystemLine(serverId, `[playit] ${line}`);
      }
    });
    state.playitProcess.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) {
        this.pushSystemLine(serverId, `[playit] ${line}`);
      }
    });
    state.playitProcess.on("exit", (code, signal) => {
      this.pushSystemLine(serverId, `playit.gg exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`);
      state.playitProcess = null;
    });
  }

  private stopPlayit(serverId: string): void {
    const state = this.getState(serverId);
    if (!state.playitProcess) return;
    state.playitProcess.kill();
    state.playitProcess = null;
  }

  private acquireInstanceLock(serverId: string, serverRoot: string): void {
    const state = this.getState(serverId);
    const lockPath = path.resolve(serverRoot, ".mc-control-panel.instance.lock");
    const payload = JSON.stringify(
      { serverId, panelPid: process.pid, createdAt: new Date().toISOString() },
      null,
      2
    );
    const writeLock = () => {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, payload, "utf8");
      fs.closeSync(fd);
      state.lockPath = lockPath;
    };
    try {
      writeLock();
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
    }
    if (this.tryClearStaleLock(lockPath)) {
      writeLock();
      return;
    }
    throw new Error("Another process is already using this server folder. Wait for it to stop or kill the other process first.");
  }

  private releaseInstanceLock(serverId: string, serverRoot: string): void {
    const state = this.getState(serverId);
    const lockPath = state.lockPath || path.resolve(serverRoot, ".mc-control-panel.instance.lock");
    try {
      if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
    } catch {
      // no-op
    }
    state.lockPath = null;
  }

  private tryClearStaleLock(lockPath: string): boolean {
    try {
      const raw = fs.readFileSync(lockPath, "utf8");
      const parsed = JSON.parse(raw) as { panelPid?: number };
      const pid = Number(parsed?.panelPid || 0);
      if (pid > 0 && this.isProcessAlive(pid)) return false;
      fs.rmSync(lockPath, { force: true });
      return true;
    } catch {
      try {
        fs.rmSync(lockPath, { force: true });
        return true;
      } catch {
        return false;
      }
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
