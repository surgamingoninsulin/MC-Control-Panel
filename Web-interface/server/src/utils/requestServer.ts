import type { Request } from "express";

export const readServerId = (req: Request): string => {
  const header = req.header("x-server-id");
  const query = typeof req.query.serverId === "string" ? req.query.serverId : undefined;
  const body = typeof req.body?.serverId === "string" ? req.body.serverId : undefined;
  const value = header || query || body || "";
  if (!value.trim()) throw new Error("serverId is required.");
  return value.trim();
};

