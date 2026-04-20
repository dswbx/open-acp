import { AdapterRegistry } from "./AdapterRegistry.ts";
import type { NormalizedAgentCapabilities } from "./AgentAdapter.ts";

export class CapabilityDiscoveryService {
  private readonly registry: AdapterRegistry;

  constructor(registry: AdapterRegistry) {
    this.registry = registry;
  }

  async discover(agentId: string): Promise<NormalizedAgentCapabilities> {
    const adapter = this.registry.get(agentId);
    return adapter.initialize();
  }

  async discoverAll(): Promise<Record<string, NormalizedAgentCapabilities>> {
    const results: Record<string, NormalizedAgentCapabilities> = {};
    for (const adapter of this.registry.list()) {
      results[adapter.agentId] = await adapter.initialize();
    }
    return results;
  }
}
