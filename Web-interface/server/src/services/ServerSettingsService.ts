import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config.js";

export type ServerSettings = {
  startupScript: string;
  autoRestart: boolean;
  ramMinGb: number | null;
  ramMaxGb: number | null;
  serverIp: string;
  serverPort: number | null;
  playitEnabled: boolean;
  playitCommand: string;
};

const DEFAULT_SETTINGS: ServerSettings = {
  startupScript: "",
  autoRestart: false,
  ramMinGb: null,
  ramMaxGb: null,
  serverIp: "",
  serverPort: null,
  playitEnabled: false,
  playitCommand: "playit"
};

export class ServerSettingsService {
  constructor() {
    fs.mkdirSync(appConfig.panelDataDir, { recursive: true });
  }

  get(serverId: string): ServerSettings {
    return this.load(serverId);
  }

  update(serverId: string, input: Partial<ServerSettings>): ServerSettings {
    const current = this.load(serverId);
    const next: ServerSettings = {
      startupScript:
        typeof input.startupScript === "string" ? input.startupScript : current.startupScript,
      autoRestart: typeof input.autoRestart === "boolean" ? input.autoRestart : current.autoRestart,
      ramMinGb: this.normalizeRamValue(input.ramMinGb, current.ramMinGb),
      ramMaxGb: this.normalizeRamValue(input.ramMaxGb, current.ramMaxGb),
      serverIp: typeof input.serverIp === "string" ? input.serverIp.trim() : current.serverIp,
      serverPort: this.normalizePortValue(input.serverPort, current.serverPort),
      playitEnabled:
        typeof input.playitEnabled === "boolean" ? input.playitEnabled : current.playitEnabled,
      playitCommand:
        typeof input.playitCommand === "string" ? input.playitCommand.trim() : current.playitCommand
    };

    if (next.ramMinGb !== null && next.ramMaxGb !== null && next.ramMinGb > next.ramMaxGb) {
      throw new Error("ramMinGb cannot be greater than ramMaxGb.");
    }
    if (next.serverPort !== null && (next.serverPort < 1 || next.serverPort > 65535)) {
      throw new Error("serverPort must be between 1 and 65535.");
    }

    this.persist(serverId, next);
    return next;
  }

  private filePath(serverId: string): string {
    return path.resolve(appConfig.panelDataDir, `server-settings.${serverId}.json`);
  }

  private load(serverId: string): ServerSettings {
    try {
      const filePath = this.filePath(serverId);
      if (!fs.existsSync(filePath)) return { ...DEFAULT_SETTINGS };
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ServerSettings>;
      const current = { ...DEFAULT_SETTINGS };
      return {
        startupScript:
          typeof parsed.startupScript === "string" ? parsed.startupScript : current.startupScript,
        autoRestart: typeof parsed.autoRestart === "boolean" ? parsed.autoRestart : current.autoRestart,
        ramMinGb: this.normalizeRamValue(parsed.ramMinGb, current.ramMinGb),
        ramMaxGb: this.normalizeRamValue(parsed.ramMaxGb, current.ramMaxGb),
        serverIp: typeof parsed.serverIp === "string" ? parsed.serverIp : current.serverIp,
        serverPort: this.normalizePortValue(parsed.serverPort, current.serverPort),
        playitEnabled:
          typeof parsed.playitEnabled === "boolean" ? parsed.playitEnabled : current.playitEnabled,
        playitCommand:
          typeof parsed.playitCommand === "string" ? parsed.playitCommand : current.playitCommand
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private persist(serverId: string, settings: ServerSettings): void {
    fs.writeFileSync(this.filePath(serverId), JSON.stringify(settings, null, 2), "utf8");
  }

  private normalizeRamValue(input: unknown, fallback: number | null): number | null {
    if (input === null || input === undefined || input === "") return null;
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("RAM values must be positive numbers or empty.");
    }
    return parsed;
  }

  private normalizePortValue(input: unknown, fallback: number | null): number | null {
    if (input === null || input === undefined || input === "") return null;
    const parsed = Number(input);
    if (!Number.isInteger(parsed)) {
      throw new Error("serverPort must be an integer.");
    }
    return parsed;
  }
}

