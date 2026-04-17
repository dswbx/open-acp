import type { AgentAdapter } from "./AgentAdapter.ts";

export class AdapterRegistry {
  private readonly adapters = new Map<string, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.agentId)) {
      throw new Error(`Adapter already registered: ${adapter.agentId}`);
    }
    this.adapters.set(adapter.agentId, adapter);
  }

  get(agentId: string): AgentAdapter {
    const adapter = this.adapters.get(agentId);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${agentId}`);
    }
    return adapter;
  }

  list(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }
}

