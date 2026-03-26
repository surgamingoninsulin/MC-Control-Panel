import type { NodeRecord } from "../platformTypes.js";
import { PlatformDataService } from "./PlatformDataService.js";

const nowIso = (): string => new Date().toISOString();

export class NodeService {
  constructor(private readonly platform: PlatformDataService) {}

  list(): NodeRecord[] {
    return this.platform.read().nodes.sort((a, b) => a.name.localeCompare(b.name));
  }

  create(input: { name: string; baseUrl: string; authToken?: string | null }): NodeRecord {
    const name = String(input.name || "").trim();
    const baseUrl = String(input.baseUrl || "").trim().replace(/\/+$/, "");
    if (!name) throw new Error("Node name is required.");
    if (!/^https?:\/\//i.test(baseUrl)) throw new Error("Node base URL must start with http:// or https://");
    return this.platform.update((state) => {
      const ts = nowIso();
      const node: NodeRecord = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        kind: "agent",
        host: baseUrl,
        baseUrl,
        authToken: input.authToken?.trim() || null,
        status: "offline",
        capabilities: {
          runtime: true,
          files: false,
          backups: false,
          metrics: true,
          docker: false
        },
        lastHeartbeatAt: null,
        createdAt: ts,
        updatedAt: ts
      };
      state.nodes.push(node);
      return { ...node };
    });
  }

  update(id: string, patch: Partial<Pick<NodeRecord, "name" | "baseUrl" | "authToken" | "status" | "capabilities">>): NodeRecord {
    return this.platform.update((state) => {
      const node = state.nodes.find((entry) => entry.id === id);
      if (!node) throw new Error("Node not found.");
      if (node.kind === "local") throw new Error("Local node cannot be edited.");
      if (typeof patch.name === "string" && patch.name.trim()) node.name = patch.name.trim();
      if (typeof patch.baseUrl === "string" && patch.baseUrl.trim()) {
        const baseUrl = patch.baseUrl.trim().replace(/\/+$/, "");
        if (!/^https?:\/\//i.test(baseUrl)) throw new Error("Node base URL must start with http:// or https://");
        node.baseUrl = baseUrl;
        node.host = baseUrl;
      }
      if (typeof patch.authToken === "string") node.authToken = patch.authToken.trim() || null;
      if (patch.capabilities) node.capabilities = patch.capabilities;
      if (patch.status === "online" || patch.status === "offline") node.status = patch.status;
      node.updatedAt = nowIso();
      return { ...node };
    });
  }

  remove(id: string): void {
    this.platform.update((state) => {
      const node = state.nodes.find((entry) => entry.id === id);
      if (!node) throw new Error("Node not found.");
      if (node.kind === "local") throw new Error("Local node cannot be removed.");
      state.nodes = state.nodes.filter((entry) => entry.id !== id);
    });
  }

  getById(id: string): NodeRecord {
    const node = this.platform.read().nodes.find((entry) => entry.id === id);
    if (!node) throw new Error("Node not found.");
    return node;
  }

  heartbeat(id: string): NodeRecord {
    return this.platform.update((state) => {
      const node = state.nodes.find((entry) => entry.id === id);
      if (!node) throw new Error("Node not found.");
      node.status = "online";
      node.lastHeartbeatAt = nowIso();
      node.updatedAt = nowIso();
      return { ...node };
    });
  }
}
