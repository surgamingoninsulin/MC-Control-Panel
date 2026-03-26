import type { MultiServerRuntimeService, ServerRuntimeStatus } from "./MultiServerRuntimeService.js";
import type { ServerRecord } from "./ServerRegistryService.js";
import type { NodeService } from "./NodeService.js";
import type { ServerSettingsService } from "./ServerSettingsService.js";

type RemoteRuntimePayload = {
  serverId: string;
  rootPath: string;
  settings?: ReturnType<ServerSettingsService["get"]>;
  command?: string;
};

type RemoteStatusResponse = { status: ServerRuntimeStatus };

export class NodeExecutionService {
  constructor(
    private readonly nodes: NodeService,
    private readonly runtime: MultiServerRuntimeService,
    private readonly settings: ServerSettingsService
  ) {}

  async getStatus(server: ServerRecord): Promise<ServerRuntimeStatus> {
    if (server.nodeId === "local") return this.runtime.getStatus(server.id);
    const out = await this.remoteRequest<RemoteStatusResponse>(server.nodeId, "/api/agent/runtime/status", {
      serverId: server.id,
      rootPath: server.rootPath
    });
    return out.status;
  }

  async start(server: ServerRecord): Promise<ServerRuntimeStatus> {
    if (server.nodeId === "local") return this.runtime.start(server.id, server.rootPath);
    const out = await this.remoteRequest<RemoteStatusResponse>(server.nodeId, "/api/agent/runtime/start", {
      serverId: server.id,
      rootPath: server.rootPath,
      settings: this.settings.get(server.id)
    });
    return out.status;
  }

  async stop(server: ServerRecord): Promise<ServerRuntimeStatus> {
    if (server.nodeId === "local") return this.runtime.stop(server.id);
    const out = await this.remoteRequest<RemoteStatusResponse>(server.nodeId, "/api/agent/runtime/stop", {
      serverId: server.id,
      rootPath: server.rootPath
    });
    return out.status;
  }

  async restart(server: ServerRecord): Promise<ServerRuntimeStatus> {
    if (server.nodeId === "local") return this.runtime.restart(server.id, server.rootPath);
    const out = await this.remoteRequest<RemoteStatusResponse>(server.nodeId, "/api/agent/runtime/restart", {
      serverId: server.id,
      rootPath: server.rootPath,
      settings: this.settings.get(server.id)
    });
    return out.status;
  }

  async sendCommand(server: ServerRecord, command: string): Promise<void> {
    if (server.nodeId === "local") {
      this.runtime.sendCommand(server.id, command);
      return;
    }
    await this.remoteRequest<{ ok: true }>(server.nodeId, "/api/agent/runtime/command", {
      serverId: server.id,
      rootPath: server.rootPath,
      command
    });
  }

  async probeNode(nodeId: string): Promise<{ ok: boolean; capabilities: unknown }> {
    const out = await this.remoteRequest<{ ok: boolean; capabilities: unknown }>(nodeId, "/api/agent/health", null, "GET");
    this.nodes.update(nodeId, { status: "online" });
    return out;
  }

  private async remoteRequest<T>(nodeId: string, route: string, payload: RemoteRuntimePayload | null, method: "GET" | "POST" = "POST"): Promise<T> {
    const node = this.nodes.getById(nodeId);
    const res = await fetch(`${node.baseUrl}${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(node.authToken ? { Authorization: `Bearer ${node.authToken}` } : {})
      },
      body: method === "GET" ? undefined : JSON.stringify(payload || {})
    });
    if (!res.ok) {
      this.nodes.update(nodeId, { status: "offline" });
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // ignore body parse issues
      }
      throw new Error(message);
    }
    this.nodes.update(nodeId, { status: "online" });
    return res.json() as Promise<T>;
  }
}
