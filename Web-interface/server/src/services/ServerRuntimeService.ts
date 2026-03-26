import { EventEmitter } from "node:events";
import {
  spawn,
  spawnSync,
  type ChildProcess,
  type ChildProcessWithoutNullStreams
} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ConsoleLine } from "../types.js";
import { appConfig } from "../config.js";
import { ServerSettingsService } from "./ServerSettingsService.js";

type ServerStatus = {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  uptimeMs: number;
};

const quoteExecutable = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("\"") && raw.endsWith("\"")) return raw;
  return /\s/.test(raw) ? `"${raw}"` : raw;
};

export class ServerRuntimeService {
  private readonly legacyServerId = "__legacy__";
  private process: ChildProcessWithoutNullStreams | null = null;
  private playitProcess: ChildProcess | null = null;
  private readonly events = new EventEmitter();
  private readonly buffer: ConsoleLine[] = [];
  private cursor = 0;
  private startedAt: Date | null = null;
  private stopRequested = false;
  private readonly maxBuffer = 3000;

  constructor(private readonly settings: ServerSettingsService) {}

  onConsole(listener: (line: ConsoleLine) => void): void {
    this.events.on("console", listener);
  }

  onStatus(listener: (status: ServerStatus) => void): void {
    this.events.on("status", listener);
  }

  getStatus(): ServerStatus {
    const uptimeMs =
      this.startedAt && this.process ? Date.now() - this.startedAt.getTime() : 0;
    return {
      running: !!this.process,
      pid: this.process?.pid || null,
      startedAt: this.startedAt?.toISOString() || null,
      uptimeMs
    };
  }

  getHistory(cursor?: number): ConsoleLine[] {
    if (!cursor) return [...this.buffer];
    return this.buffer.filter((line) => line.cursor > cursor);
  }

  start(): ServerStatus {
    if (this.process) return this.getStatus();
    if (this.isElevatedRuntime()) {
      this.pushSystemLine("Refused to start server: panel is running with elevated/admin privileges.");
      throw new Error("Refused to start: do not run the panel as Administrator/root.");
    }
    const runtimeSettings = this.settings.get(this.legacyServerId);
    this.applyServerProperties(runtimeSettings.serverIp, runtimeSettings.serverPort);
    const startCommand = this.buildStartCommand();
    this.stopRequested = false;

    this.process = spawn(startCommand, {
      cwd: appConfig.serverRoot,
      shell: true
    });
    this.startedAt = new Date();
    this.pushSystemLine(`Server start command: ${startCommand}`);

    this.process.stdout.on("data", (chunk) => this.pushText("stdout", chunk));
    this.process.stderr.on("data", (chunk) => this.pushText("stderr", chunk));

    this.process.once("exit", (code, signal) => {
      this.pushSystemLine(`Server exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`);
      const shouldAutoRestart = this.settings.get(this.legacyServerId).autoRestart && !this.stopRequested;
      this.stopPlayit();
      this.process = null;
      this.startedAt = null;
      this.stopRequested = false;
      this.events.emit("status", this.getStatus());
      if (shouldAutoRestart) {
        this.pushSystemLine("Auto-restart is enabled. Restarting server in 2 seconds...");
        setTimeout(() => {
          if (!this.process) this.start();
        }, 2000);
      }
    });

    this.startPlayitIfEnabled();
    this.events.emit("status", this.getStatus());
    return this.getStatus();
  }

  stop(): ServerStatus {
    if (!this.process) return this.getStatus();
    this.stopRequested = true;
    this.sendCommand("stop");
    return this.getStatus();
  }

  restart(): ServerStatus {
    if (!this.process) return this.start();
    this.stopRequested = true;
    this.sendCommand("stop");
    setTimeout(() => {
      if (!this.process) this.start();
    }, 2500);
    return this.getStatus();
  }

  sendCommand(command: string): void {
    if (!this.process) throw new Error("Server is not running.");
    this.process.stdin.write(`${command.trim()}\n`);
    this.pushSystemLine(`> ${command.trim()}`);
  }

  private pushText(source: "stdout" | "stderr", chunk: Buffer): void {
    const text = chunk.toString("utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.length);
    for (const line of lines) {
      this.pushLine(source, line);
    }
  }

  private pushSystemLine(line: string): void {
    this.pushLine("system", line);
  }

  private pushLine(source: "stdout" | "stderr" | "system", line: string): void {
    const item: ConsoleLine = {
      cursor: ++this.cursor,
      ts: new Date().toISOString(),
      source,
      line
    };
    this.buffer.push(item);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    this.events.emit("console", item);
  }

  private buildStartCommand(): string {
    const settings = this.settings.get(this.legacyServerId);
    if (settings.startupScript.trim()) return settings.startupScript.trim();
    if (appConfig.startCommand.trim()) return appConfig.startCommand.trim();
    const javaBinary = quoteExecutable(appConfig.javaBinary);
    if (!appConfig.ramAutoEnabled) {
      const jar = this.resolveJarPath();
      return `${javaBinary} -Dterminal.jline=false -Dterminal.ansi=true -Xms2G -Xmx4G -jar "${jar}"${appConfig.useNogui ? " nogui" : ""}`;
    }

    const pluginCount = this.countPluginJars();
    const whitelistedPlayers = this.countWhitelistedPlayers();
    const totalSystemGb = os.totalmem() / (1024 * 1024 * 1024);
    const usableGb = Math.max(1, totalSystemGb - appConfig.ramReserveOsGb);
    const targetGb =
      appConfig.ramBaseGb +
      (pluginCount * appConfig.ramPerPluginMb) / 1024 +
      (whitelistedPlayers * appConfig.ramPerWhitelistedPlayerMb) / 1024;
    const minBoundGb = Math.max(1, settings.ramMinGb ?? 1);
    const maxBoundGb = Math.max(minBoundGb, settings.ramMaxGb ?? usableGb);
    const boundedGb = Math.min(
      maxBoundGb,
      Math.max(minBoundGb, targetGb, 1)
    );
    const xmxMb = Math.max(1024, Math.floor(Math.min(usableGb, boundedGb) * 1024));
    const xmsMb = Math.max(1024, Math.floor(xmxMb * Math.max(0.1, appConfig.ramXmsRatio)));
    const jar = this.resolveJarPath();

    this.pushSystemLine(
      `Auto RAM: system=${totalSystemGb.toFixed(1)}G, plugins=${pluginCount}, whitelist=${whitelistedPlayers}, min=${minBoundGb.toFixed(2)}G, max=${maxBoundGb.toFixed(2)}G, Xms=${xmsMb}M, Xmx=${xmxMb}M`
    );

    return `${javaBinary} -Dterminal.jline=false -Dterminal.ansi=true -Xms${xmsMb}M -Xmx${xmxMb}M -jar "${jar}"${appConfig.useNogui ? " nogui" : ""}`;
  }

  private resolveJarPath(): string {
    const configured = path.resolve(appConfig.serverRoot, appConfig.serverJar);
    if (fs.existsSync(configured)) return configured;

    const entries = fs
      .readdirSync(appConfig.serverRoot, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".jar"))
      .map((e) => e.name);
    const preferred =
      entries.find((n) => /purpur|paper|spigot|server/i.test(n)) || entries[0];
    if (!preferred) return configured;
    return path.resolve(appConfig.serverRoot, preferred);
  }

  private countPluginJars(): number {
    try {
      const pluginsDir = path.resolve(appConfig.serverRoot, "plugins");
      if (!fs.existsSync(pluginsDir)) return 0;
      return fs
        .readdirSync(pluginsDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".jar")).length;
    } catch {
      return 0;
    }
  }

  private countWhitelistedPlayers(): number {
    try {
      const filePath = path.resolve(appConfig.serverRoot, "whitelist.json");
      if (!fs.existsSync(filePath)) return 0;
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return 0;
      return parsed.length;
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

    if (typeof process.getuid === "function") {
      return process.getuid() === 0;
    }
    return false;
  }

  private applyServerProperties(serverIp: string, serverPort: number | null): void {
    if (!serverIp && serverPort === null) return;
    const filePath = path.resolve(appConfig.serverRoot, "server.properties");
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
      this.pushSystemLine(
        `Applied network settings to server.properties (server-ip=${serverIp || "auto"}, server-port=${serverPort ?? 25565}).`
      );
    } catch (error) {
      this.pushSystemLine(`Could not update server.properties: ${(error as Error).message}`);
    }
  }

  private startPlayitIfEnabled(): void {
    const settings = this.settings.get(this.legacyServerId);
    if (!settings.playitEnabled || this.playitProcess) return;
    const command = settings.playitCommand.trim() || "playit";
    this.playitProcess = spawn(command, {
      cwd: appConfig.serverRoot,
      shell: true
    });
    this.pushSystemLine(`Starting playit.gg tunnel with command: ${command}`);

    this.playitProcess.stdout?.on("data", (chunk: Buffer) => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/)
        .filter(Boolean);
      for (const line of lines) this.pushSystemLine(`[playit] ${line}`);
    });
    this.playitProcess.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/)
        .filter(Boolean);
      for (const line of lines) this.pushSystemLine(`[playit] ${line}`);
    });
    this.playitProcess.on("exit", (code, signal) => {
      this.pushSystemLine(
        `playit.gg process exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`
      );
      this.playitProcess = null;
    });
  }

  private stopPlayit(): void {
    if (!this.playitProcess) return;
    this.playitProcess.kill();
    this.playitProcess = null;
  }
}
