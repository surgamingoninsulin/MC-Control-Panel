import type { NextFunction, Request, Response } from "express";
import type { AuthService, UserRole } from "../services/AuthService.js";
import type { ApiTokenScope } from "../platformTypes.js";
import { TokenService } from "../services/TokenService.js";

export type RequestUser = {
  id: string;
  username: string;
  usernameKey: string;
  email: string;
  emailKey: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled?: boolean;
  tempPasswordExpiresAt: string | null;
  resetTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  authScopes?: ApiTokenScope[];
};

export type AuthedRequest = Request & { user?: RequestUser };

const parseSessionId = (cookieHeader: string | undefined): string | undefined => {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";").map((v) => v.trim());
  const token = parts.find((v) => v.startsWith("panel_session="));
  if (!token) return undefined;
  return decodeURIComponent(token.slice("panel_session=".length));
};

const readBearerToken = (authHeader: string | undefined): string | undefined => {
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) return undefined;
  return authHeader.replace(/^Bearer\s+/i, "").trim();
};

export const authMiddleware = (auth: AuthService, tokens?: TokenService) => {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const sessionId = parseSessionId(req.headers.cookie);
    const user = auth.getUserBySession(sessionId);
    if (user) req.user = user;
    if (!req.user && tokens) {
      const rawToken = readBearerToken(req.header("authorization"));
      if (rawToken) {
        const token = tokens.authenticate(rawToken);
        if (token) {
          const tokenUser = auth.getUserById(token.userId);
          if (tokenUser) req.user = { ...tokenUser, authScopes: token.scopes };
        }
      }
    }
    next();
  };
};

export const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required." });
  return next();
};

export const requireRole = (roles: UserRole[]) => {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required." });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Not authorized." });
    return next();
  };
};

export const readSessionId = (req: Request): string | undefined => parseSessionId(req.headers.cookie);
