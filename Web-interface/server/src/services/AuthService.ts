import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config.js";

export type UserRole = "owner" | "admin" | "viewer";

export type UserRecord = {
  id: string;
  username: string;
  usernameKey: string;
  email: string;
  emailKey: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: string | null;
  tempPasswordIssuedAt: string | null;
  devPasswordHash: string | null;
  devPasswordExpiresAt: string | null;
  resetTokenHash: string | null;
  resetTokenExpiresAt: string | null;
  recoveryKeys: Array<{ hash: string; createdAt: string; usedAt: string | null }>;
  createdAt: string;
  updatedAt: string;
};

type SafeUser = Omit<UserRecord, "passwordHash" | "resetTokenHash" | "recoveryKeys"> & {
  recoveryKeysRemaining: number;
};

export type SessionRecord = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type UserStore = { users: UserRecord[] };

const SESSION_MS = 1000 * 60 * 60 * 24 * 7;
const TEMP_PASSWORD_MS = 1000 * 60 * 60;
const DEV_PASSWORD_MS = 1000 * 30;
const RESET_REISSUE_GUARD_MS = 1000 * 45;
const RECOVERY_KEY_COUNT = 10;
const RECOVERY_REGENERATE_THRESHOLD = 1;

const nowIso = (): string => new Date().toISOString();
const normalize = (value: string): string => value.trim().toLowerCase();
const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
};

const verifyPassword = (password: string, passwordHash: string): boolean => {
  const [salt, digest] = passwordHash.split(":");
  if (!salt || !digest) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(digest, "hex"));
};

const hashToken = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const randomTempPassword = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

const randomRecoveryKey = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(14);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

export class AuthService {
  private readonly filePath: string;
  private readonly resetMailLogPath: string;
  private store: UserStore = { users: [] };
  private readonly sessions = new Map<string, SessionRecord>();

  constructor() {
    fs.mkdirSync(appConfig.panelDataDir, { recursive: true });
    this.filePath = path.resolve(appConfig.panelDataDir, "users.json");
    this.resetMailLogPath = path.resolve(appConfig.panelDataDir, "password-reset-mail.log");
    this.store = this.load();
  }

  private toSafeUser(user: UserRecord): SafeUser {
    const { passwordHash: _omit, resetTokenHash: _omit2, recoveryKeys: _omit3, ...safe } = user;
    const recoveryKeysRemaining = (user.recoveryKeys || []).filter((item) => !item.usedAt).length;
    return { ...safe, recoveryKeysRemaining };
  }

  listUsers(): SafeUser[] {
    return this.store.users.map((entry) => this.toSafeUser(entry));
  }

  hasUsers(): boolean {
    return this.store.users.length > 0;
  }

  getUserBySession(sessionId: string | undefined): SafeUser | null {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }
    const user = this.store.users.find((entry) => entry.id === session.userId && entry.active);
    if (!user) return null;
    return this.toSafeUser(user);
  }

  login(email: string, password: string): { sessionId: string; user: SafeUser } {
    const key = normalize(email);
    const candidatePassword = String(password || "").trim();
    if (!isEmail(key)) throw new Error("Use email address to log in.");
    const user = this.store.users.find(
      (entry) => entry.emailKey === key
    );
    if (!user) throw new Error("Invalid email or password.");
    if (!user.active) throw new Error("Account is disabled.");

    const isPrimaryMatch = verifyPassword(candidatePassword, user.passwordHash);
    const isDevMatch = !!user.devPasswordHash && verifyPassword(candidatePassword, user.devPasswordHash);
    if (!isPrimaryMatch && !isDevMatch) throw new Error("Invalid email or password.");

    if (isDevMatch) {
      const devExpiresMs = user.devPasswordExpiresAt ? new Date(user.devPasswordExpiresAt).getTime() : NaN;
      if (!Number.isFinite(devExpiresMs) || devExpiresMs < Date.now()) {
        throw new Error("Developer temporary password expired. Request a new password email.");
      }
      user.mustChangePassword = true;
      user.tempPasswordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_MS).toISOString();
      user.tempPasswordIssuedAt = nowIso();
      user.updatedAt = nowIso();
      this.persist();
    }

    if (isPrimaryMatch && user.mustChangePassword && user.tempPasswordExpiresAt) {
      const expiresMs = new Date(user.tempPasswordExpiresAt).getTime();
      if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) {
        throw new Error("Temporary password expired. Request a new password email.");
      }
    }
    const sessionId = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    this.sessions.set(sessionId, { id: sessionId, userId: user.id, createdAt, expiresAt });
    return { sessionId, user: this.toSafeUser(user) };
  }

  logout(sessionId: string | undefined): void {
    if (!sessionId) return;
    this.sessions.delete(sessionId);
  }

  ensureOwnerBootstrap(username: string, password: string, email = ""): SafeUser {
    if (this.store.users.length) throw new Error("Users already exist.");
    if (!isEmail(email)) throw new Error("Valid owner email is required.");
    return this.createUser({ username, password, role: "owner", email });
  }

  bootstrapOwnerWithRecovery(username: string, password: string, email = ""): { user: SafeUser; recoveryKeys: string[] } {
    const user = this.ensureOwnerBootstrap(username, password, email);
    const out = this.regenerateRecoveryKeysByUserId(user.id);
    return { user: out.user, recoveryKeys: out.recoveryKeys };
  }

  createUser(input: { username: string; password: string; role: UserRole; email?: string }): SafeUser {
    const username = input.username.trim();
    const usernameKey = normalize(username);
    const email = String(input.email || "").trim();
    const emailKey = normalize(email);
    if (!usernameKey) throw new Error("Username is required.");
    if (!input.password) throw new Error("Password is required.");
    if (!isEmail(email)) throw new Error("Valid email is required.");
    if (input.role === "owner" && this.store.users.length > 0) {
      throw new Error("Owner role is protected and cannot be assigned.");
    }
    if (this.store.users.some((entry) => entry.usernameKey === usernameKey)) {
      throw new Error("User already exists.");
    }
    if (emailKey && this.store.users.some((entry) => entry.emailKey === emailKey)) {
      throw new Error("Email already exists.");
    }
    const ts = nowIso();
    const record: UserRecord = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username,
      usernameKey,
      email,
      emailKey,
      passwordHash: hashPassword(input.password),
      role: input.role,
      active: true,
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      tempPasswordIssuedAt: null,
      devPasswordHash: null,
      devPasswordExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      recoveryKeys: [],
      createdAt: ts,
      updatedAt: ts
    };
    this.store.users.push(record);
    this.persist();
    return this.toSafeUser(record);
  }

  updateUser(
    id: string,
    patch: Partial<{ role: UserRole; active: boolean; password: string; email: string }>
  ): SafeUser {
    const user = this.store.users.find((entry) => entry.id === id);
    if (!user) throw new Error("User not found.");
    if (user.role === "owner") {
      if (patch.role && patch.role !== "owner") {
        throw new Error("Owner role cannot be changed.");
      }
      if (patch.active === false) {
        throw new Error("Owner account cannot be disabled.");
      }
    }
    if (patch.role === "owner" && user.role !== "owner") {
      throw new Error("Owner role is protected and cannot be assigned.");
    }
    if (patch.role) user.role = patch.role;
    if (typeof patch.active === "boolean") user.active = patch.active;
    if (typeof patch.email === "string") {
      const email = patch.email.trim();
      const emailKey = normalize(email);
      if (
        emailKey &&
        this.store.users.some((entry) => entry.id !== id && entry.emailKey === emailKey)
      ) {
        throw new Error("Email already exists.");
      }
      user.email = email;
      user.emailKey = emailKey;
    }
    if (typeof patch.password === "string" && patch.password) {
      user.passwordHash = hashPassword(patch.password);
      user.mustChangePassword = false;
      user.tempPasswordExpiresAt = null;
      user.tempPasswordIssuedAt = null;
      user.devPasswordHash = null;
      user.devPasswordExpiresAt = null;
      user.resetTokenHash = null;
      user.resetTokenExpiresAt = null;
    }
    user.updatedAt = nowIso();
    this.persist();
    return this.toSafeUser(user);
  }

  setPasswordByUserId(userId: string, password: string): SafeUser {
    if (!password.trim()) throw new Error("Password is required.");
    const user = this.store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("User not found.");
    user.passwordHash = hashPassword(password);
    user.mustChangePassword = false;
    user.tempPasswordExpiresAt = null;
    user.tempPasswordIssuedAt = null;
    user.devPasswordHash = null;
    user.devPasswordExpiresAt = null;
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.updatedAt = nowIso();
    this.persist();
    return this.toSafeUser(user);
  }

  loginWithRecoveryKey(email: string, recoveryKey: string): {
    sessionId: string;
    user: SafeUser;
    remainingKeys: number;
    shouldRegenerate: boolean;
  } {
    const key = normalize(email);
    const rawKey = String(recoveryKey || "").trim().toUpperCase();
    if (!isEmail(key)) throw new Error("Use email address to log in.");
    if (!rawKey) throw new Error("Recovery key is required.");
    const user = this.store.users.find((entry) => entry.emailKey === key);
    if (!user) throw new Error("Invalid email or recovery key.");
    if (!user.active) throw new Error("Account is disabled.");
    const hashed = hashToken(rawKey);
    const target = (user.recoveryKeys || []).find((item) => item.hash === hashed && !item.usedAt);
    if (!target) throw new Error("Invalid email or recovery key.");

    target.usedAt = nowIso();
    user.mustChangePassword = true;
    user.tempPasswordExpiresAt = null;
    user.tempPasswordIssuedAt = nowIso();
    user.updatedAt = nowIso();
    this.persist();

    const sessionId = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    this.sessions.set(sessionId, { id: sessionId, userId: user.id, createdAt, expiresAt });
    const remainingKeys = user.recoveryKeys.filter((item) => !item.usedAt).length;
    return {
      sessionId,
      user: this.toSafeUser(user),
      remainingKeys,
      shouldRegenerate: remainingKeys <= RECOVERY_REGENERATE_THRESHOLD
    };
  }

  regenerateRecoveryKeysByUserId(userId: string): { user: SafeUser; recoveryKeys: string[] } {
    const user = this.store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("User not found.");
    const generatedAt = nowIso();
    const recoveryKeys = Array.from({ length: RECOVERY_KEY_COUNT }, () => randomRecoveryKey());
    user.recoveryKeys = recoveryKeys.map((value) => ({
      hash: hashToken(value),
      createdAt: generatedAt,
      usedAt: null
    }));
    user.updatedAt = nowIso();
    this.persist();
    return { user: this.toSafeUser(user), recoveryKeys };
  }

  async requestPasswordReset(identity: string): Promise<{ delivered: boolean; sent: boolean; reason?: "sent" | "too-soon" | "smtp-missing" | "not-found" | "invalid-email" }> {
    const key = normalize(identity);
    if (!isEmail(key)) return { delivered: true, sent: false, reason: "invalid-email" };
    if (!key) return { delivered: true, sent: false, reason: "invalid-email" };
    this.appendResetRequestLog(`[${new Date().toISOString()}] identity=${key} requested=true`);
    const user = this.store.users.find(
      (entry) => (entry.emailKey && entry.emailKey === key)
    );
    if (!user) {
      this.appendResetRequestLog(`[${new Date().toISOString()}] identity=${key} matched=false`);
      return { delivered: true, sent: false, reason: "not-found" };
    }

    if (user.tempPasswordIssuedAt) {
      const issuedMs = new Date(user.tempPasswordIssuedAt).getTime();
      if (Number.isFinite(issuedMs) && Date.now() - issuedMs < RESET_REISSUE_GUARD_MS) {
        this.appendResetRequestLog(`[${new Date().toISOString()}] identity=${key} matched=true skipped=too-soon`);
        return { delivered: true, sent: false, reason: "too-soon" };
      }
    }

    const tempPassword = randomTempPassword();
    const tempExpiresAt = new Date(Date.now() + TEMP_PASSWORD_MS).toISOString();
    const issuedAt = nowIso();
    let devPassword = "";
    let devExpiresAt: string | null = null;
    if (user.role === "owner") {
      devPassword = randomTempPassword();
      devExpiresAt = new Date(Date.now() + DEV_PASSWORD_MS).toISOString();
      user.devPasswordHash = hashPassword(devPassword);
      user.devPasswordExpiresAt = devExpiresAt;
    } else {
      user.devPasswordHash = null;
      user.devPasswordExpiresAt = null;
    }
    user.passwordHash = hashPassword(tempPassword);
    user.mustChangePassword = true;
    user.tempPasswordExpiresAt = tempExpiresAt;
    user.tempPasswordIssuedAt = issuedAt;
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.updatedAt = nowIso();
    this.persist();

    const target = user.email || user.username;
    const subject = "Temporary password for MC Control Panel";
    const baseLines = [
      `Dear ${user.username},`,
      "",
      "A password reset was requested for your account.",
      "Your temporary password has a 1 hour limit.",
      `temp pass: ${tempPassword}`,
      "",
      "Kind regards",
      "MC Control Panel."
    ];
    if (user.role === "owner" && devPassword && devExpiresAt) {
      baseLines.splice(5, 0, "Your temporary dev password has a 30 seconds limit for developing.", `temp dev pass: ${devPassword}`, "");
    }
    const text = baseLines.join("\n");

    const sent = await this.sendMail(target, subject, text);
    if (!sent) {
      this.appendResetMailFallback(`[${new Date().toISOString()}] to=${target} temp=${tempPassword} dev=${devPassword || "-"} tempExpires=${tempExpiresAt} devExpires=${devExpiresAt || "-"}`);
      this.appendResetRequestLog(`[${new Date().toISOString()}] identity=${key} matched=true email=${target} sent=false reason=smtp`);
      return { delivered: true, sent: false, reason: "smtp-missing" };
    }
    this.appendResetRequestLog(`[${new Date().toISOString()}] identity=${key} matched=true email=${target} sent=true`);
    return { delivered: true, sent: true, reason: "sent" };
  }

  activatePasswordResetToken(token: string): { username: string; tempPassword: string; expiresAt: string } {
    const cleaned = String(token || "").trim();
    if (!cleaned) throw new Error("Invalid reset token.");
    const tokenHash = hashToken(cleaned);
    const user = this.store.users.find(
      (entry) => entry.resetTokenHash === tokenHash && entry.resetTokenExpiresAt
    );
    if (!user) throw new Error("Invalid reset token.");
    const expiresMs = new Date(String(user.resetTokenExpiresAt)).getTime();
    if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) {
      user.resetTokenHash = null;
      user.resetTokenExpiresAt = null;
      user.tempPasswordIssuedAt = null;
      user.updatedAt = nowIso();
      this.persist();
      throw new Error("Reset token expired. Request a new reset link.");
    }

    const tempPassword = randomTempPassword();
    const tempExpiresAt = new Date(Date.now() + TEMP_PASSWORD_MS).toISOString();
    user.passwordHash = hashPassword(tempPassword);
    user.mustChangePassword = true;
    user.tempPasswordExpiresAt = tempExpiresAt;
    user.tempPasswordIssuedAt = nowIso();
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.updatedAt = nowIso();
    this.persist();

    return { username: user.username, tempPassword, expiresAt: tempExpiresAt };
  }

  removeUser(id: string): void {
    const existing = this.store.users.find((entry) => entry.id === id);
    if (!existing) throw new Error("User not found.");
    if (existing.role === "owner") {
      throw new Error("Owner account cannot be removed.");
    }
    this.store.users = this.store.users.filter((entry) => entry.id !== id);
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === id) this.sessions.delete(sessionId);
    }
    this.persist();
  }

  private appendResetMailFallback(line: string): void {
    try {
      fs.appendFileSync(this.resetMailLogPath, `${line}\n`, "utf8");
    } catch {
      // no-op in fallback path
    }
  }

  private appendResetRequestLog(line: string): void {
    try {
      fs.appendFileSync(path.resolve(appConfig.panelDataDir, "password-reset-requests.log"), `${line}\n`, "utf8");
    } catch {
      // no-op
    }
  }

  private async sendMail(to: string, subject: string, text: string): Promise<boolean> {
    const host = appConfig.smtpHost.trim();
    const from = appConfig.smtpFrom.trim();
    if (!host || !from || !to.includes("@")) return false;
    try {
      const nodemailerModule = await import("nodemailer");
      const transporter = nodemailerModule.createTransport({
        host: appConfig.smtpHost,
        port: appConfig.smtpPort,
        secure: appConfig.smtpSecure,
        auth: appConfig.smtpUser
          ? { user: appConfig.smtpUser, pass: appConfig.smtpPass }
          : undefined
      });
      await transporter.sendMail({ from, to, subject, text });
      return true;
    } catch {
      return false;
    }
  }

  private load(): UserStore {
    try {
      if (!fs.existsSync(this.filePath)) return { users: [] };
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { users?: Array<Partial<UserRecord>> };
      const users = Array.isArray(parsed.users) ? parsed.users : [];
      return {
        users: users.map((user) => {
          const username = String(user.username || "").trim();
          const usernameKey = normalize(String(user.usernameKey || username));
          const email = String(user.email || "").trim();
          const emailKey = normalize(String(user.emailKey || email));
          const role = (user.role || "viewer") as UserRole;
          return {
            id: String(user.id || `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            username,
            usernameKey,
            email,
            emailKey,
            passwordHash: String(user.passwordHash || ""),
            role,
            active: user.active !== false,
            mustChangePassword: user.mustChangePassword === true,
            tempPasswordExpiresAt: user.tempPasswordExpiresAt ? String(user.tempPasswordExpiresAt) : null,
            tempPasswordIssuedAt: user.tempPasswordIssuedAt ? String(user.tempPasswordIssuedAt) : null,
            devPasswordHash: user.devPasswordHash ? String(user.devPasswordHash) : null,
            devPasswordExpiresAt: user.devPasswordExpiresAt ? String(user.devPasswordExpiresAt) : null,
            resetTokenHash: user.resetTokenHash ? String(user.resetTokenHash) : null,
            resetTokenExpiresAt: user.resetTokenExpiresAt ? String(user.resetTokenExpiresAt) : null,
            recoveryKeys: Array.isArray(user.recoveryKeys)
              ? user.recoveryKeys
                  .map((item) => ({
                    hash: String(item?.hash || ""),
                    createdAt: String(item?.createdAt || nowIso()),
                    usedAt: item?.usedAt ? String(item.usedAt) : null
                  }))
                  .filter((item) => !!item.hash)
              : [],
            createdAt: String(user.createdAt || nowIso()),
            updatedAt: String(user.updatedAt || nowIso())
          };
        })
      };
    } catch {
      return { users: [] };
    }
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf8");
  }
}
