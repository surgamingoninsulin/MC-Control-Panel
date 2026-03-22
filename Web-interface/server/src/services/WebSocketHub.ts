import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { WsEnvelope } from "../types.js";

export class WebSocketHub {
  private readonly wss: WebSocketServer;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
  }

  broadcast(payload: WsEnvelope): void {
    const data = JSON.stringify(payload);
    this.wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    });
  }
}
