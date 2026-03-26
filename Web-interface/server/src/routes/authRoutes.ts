import { Router } from "express";
import type { AppContext } from "../context.js";
import { readSessionId, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { appConfig } from "../config.js";
import QRCode from "qrcode";

const COOKIE_NAME = "panel_session";
const cookieTemplate = (): string => {
  const parts = [`${COOKIE_NAME}=__VALUE__`, "Path=/", "HttpOnly", `SameSite=${appConfig.cookieSameSite}`];
  if (appConfig.cookieSecure) parts.push("Secure");
  return parts.join("; ");
};
const setSessionCookie = (sessionId: string): string => cookieTemplate().replace("__VALUE__", encodeURIComponent(sessionId));
const clearSessionCookie = (): string => `${cookieTemplate().replace("__VALUE__", "")}; Max-Age=0`;

export const createAuthRoutes = (ctx: AppContext): Router => {
  const router = Router();

  router.get("/state", (_req, res) => {
    res.json({ needsBootstrap: !ctx.auth.hasUsers() });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: (req as AuthedRequest).user });
  });

  router.post("/bootstrap", (req, res) => {
    try {
      const username = String(req.body?.username || "");
      const password = String(req.body?.password || "");
      const email = String(req.body?.email || "");
      const out = ctx.auth.bootstrapOwnerWithRecovery(username, password, email);
      const login = ctx.auth.login(email, password);
      if (login.kind !== "ok") return res.status(400).json({ error: "Bootstrap cannot require two-factor authentication." });
      res.setHeader("Set-Cookie", setSessionCookie(login.sessionId));
      return res.json({ user: out.user, recoveryKeys: out.recoveryKeys });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/login", (req, res) => {
    try {
      const email = String(req.body?.email || req.body?.username || "");
      const password = String(req.body?.password || "");
      const out = ctx.auth.login(email, password);
      if (out.kind === "2fa_required") return res.json({ requiresTwoFactor: true, challengeId: out.challengeId });
      res.setHeader("Set-Cookie", setSessionCookie(out.sessionId));
      return res.json({ user: out.user });
    } catch (error) {
      return res.status(401).json({ error: (error as Error).message });
    }
  });

  router.post("/login/2fa", (req, res) => {
    try {
      const challengeId = String(req.body?.challengeId || "");
      const code = String(req.body?.code || "");
      const out = ctx.auth.completeTwoFactorLogin(challengeId, code);
      res.setHeader("Set-Cookie", setSessionCookie(out.sessionId));
      return res.json({ user: out.user });
    } catch (error) {
      return res.status(401).json({ error: (error as Error).message });
    }
  });

  router.post("/recovery-login", (req, res) => {
    try {
      const email = String(req.body?.email || req.body?.identity || "");
      const recoveryKey = String(req.body?.recoveryKey || req.body?.passkey || "");
      const out = ctx.auth.loginWithRecoveryKey(email, recoveryKey);
      res.setHeader("Set-Cookie", setSessionCookie(out.sessionId));
      return res.json({
        user: out.user,
        remainingKeys: out.remainingKeys,
        shouldRegenerate: out.shouldRegenerate
      });
    } catch (error) {
      return res.status(401).json({ error: (error as Error).message });
    }
  });

  router.post("/logout", (req, res) => {
    const sid = readSessionId(req);
    ctx.auth.logout(sid);
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.json({ ok: true });
  });

  router.post("/request-password-reset", async (req, res) => {
    return res.status(400).json({ error: "Email password reset is disabled. Use your recovery key." });
  });

  router.get("/reset-password/activate", (req, res) => {
    try {
      const token = String(req.query.token || "");
      const out = ctx.auth.activatePasswordResetToken(token);
      return res
        .status(200)
        .type("html")
        .send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Temporary Password Activated</title></head>
<body style="font-family:Arial,sans-serif;padding:24px;">
<h2>Temporary Password Activated</h2>
<p>Username: <strong>${out.username}</strong></p>
<p>Temporary Password: <strong>${out.tempPassword}</strong></p>
<p>Expires at: <strong>${out.expiresAt}</strong></p>
<p>Log in with this temporary password, then set your new password when prompted.</p>
</body></html>`);
    } catch (error) {
      return res
        .status(400)
        .type("html")
        .send(`<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;"><h2>Reset Link Invalid</h2><p>${(error as Error).message}</p></body></html>`);
    }
  });

  router.post("/set-password", requireAuth, (req, res) => {
    try {
      const password = String(req.body?.password || "");
      const user = (req as AuthedRequest).user;
      if (!user) return res.status(401).json({ error: "Authentication required." });
      const updated = ctx.auth.setPasswordByUserId(user.id, password);
      return res.json({ user: updated });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/recovery-keys/regenerate", requireAuth, (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      if (!user) return res.status(401).json({ error: "Authentication required." });
      const out = ctx.auth.regenerateRecoveryKeysByUserId(user.id);
      return res.json({ user: out.user, recoveryKeys: out.recoveryKeys });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/2fa/state", requireAuth, (req, res) => {
    const user = (req as AuthedRequest).user;
    return res.json({ enabled: !!user?.twoFactorEnabled });
  });

  router.post("/2fa/setup", requireAuth, async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      if (!user) return res.status(401).json({ error: "Authentication required." });
      const out = ctx.auth.beginTwoFactorSetup(user.id);
      const qrCodeDataUrl = await QRCode.toDataURL(out.otpAuthUrl);
      return res.json({ secret: out.secret, otpAuthUrl: out.otpAuthUrl, qrCodeDataUrl });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/2fa/enable", requireAuth, (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      if (!user) return res.status(401).json({ error: "Authentication required." });
      const updated = ctx.auth.enableTwoFactor(user.id, String(req.body?.code || ""));
      return res.json({ user: updated });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/2fa/disable", requireAuth, (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      if (!user) return res.status(401).json({ error: "Authentication required." });
      const updated = ctx.auth.disableTwoFactor(user.id, String(req.body?.code || ""));
      return res.json({ user: updated });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
};
