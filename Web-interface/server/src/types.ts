export type WsEnvelope = {
  channel: "console:stream" | "fs:events" | "tasks:events";
  event: string;
  data: unknown;
  serverId?: string;
};

export type ConsoleLine = {
  cursor: number;
  ts: string;
  source: "stdout" | "stderr" | "system";
  line: string;
};
