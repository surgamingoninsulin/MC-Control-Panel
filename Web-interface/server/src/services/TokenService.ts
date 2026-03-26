import crypto from "node:crypto";
import type { ApiTokenRecord, ApiTokenScope } from "../platformTypes.js";
import { PlatformDataService } from "./PlatformDataService.js";

const nowIso = (): string => new Date().toISOString();
const hashToken = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

export class TokenService {
  constructor(private readonly platform: PlatformDataService) {}

  listForUser(userId: string): Array<Omit<ApiTokenRecord, "tokenHash">> {
    return this.platform
      .read()
      .apiTokens
      .filter((entry) => entry.userId === userId)
      .map(({ tokenHash: _omit, ...safe }) => safe);
  }

  create(userId: string, label: string, scopes: ApiTokenScope[], expiresAt: string | null): { token: string; record: Omit<ApiTokenRecord, "tokenHash"> } {
    return this.platform.update((state) => {
      const raw = `mcp_${crypto.randomBytes(24).toString("hex")}`;
      const ts = nowIso();
      const record: ApiTokenRecord = {
        id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        label: label.trim() || "API token",
        tokenHash: hashToken(raw),
        scopes: scopes.length ? scopes : ["admin"],
        createdAt: ts,
        updatedAt: ts,
        expiresAt,
        revokedAt: null,
        lastUsedAt: null
      };
      state.apiTokens.push(record);
      const { tokenHash: _omit, ...safe } = record;
      return { token: raw, record: safe };
    });
  }

  revoke(userId: string, id: string): void {
    this.platform.update((state) => {
      const found = state.apiTokens.find((entry) => entry.id === id && entry.userId === userId);
      if (!found) throw new Error("Token not found.");
      found.revokedAt = found.revokedAt || nowIso();
      found.updatedAt = nowIso();
    });
  }

  authenticate(rawToken: string): ApiTokenRecord | null {
    const targetHash = hashToken(rawToken);
    let match: ApiTokenRecord | null = null;
    this.platform.update((state) => {
      const found = state.apiTokens.find((entry) => entry.tokenHash === targetHash && !entry.revokedAt);
      if (!found) return;
      if (found.expiresAt && new Date(found.expiresAt).getTime() < Date.now()) return;
      found.lastUsedAt = nowIso();
      found.updatedAt = nowIso();
      match = { ...found };
    });
    return match;
  }
}
