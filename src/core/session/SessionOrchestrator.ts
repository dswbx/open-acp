import { AdapterRegistry } from "../adapters/AdapterRegistry.ts";
import type {
  AgentSessionInfo,
  AgentSessionUpdateEvent,
  CreateAgentSessionRequest,
  NormalizedAgentCapabilities,
} from "../adapters/AgentAdapter.ts";

export interface CreateOrchestratedSessionRequest extends CreateAgentSessionRequest {
  agentId: string;
}

export interface OrchestratorSessionUpdate {
  agentId: string;
  sessionId: string;
  update: AgentSessionUpdateEvent["update"];
}

export class SessionOrchestrator {
  private readonly registry: AdapterRegistry;
  private readonly sessionOwners = new Map<string, string>();
  private readonly subscribedAgents = new Set<string>();
  private readonly updateListeners = new Set<(event: OrchestratorSessionUpdate) => void>();

  constructor(registry: AdapterRegistry) {
    this.registry = registry;
  }

  async initializeAgent(agentId: string): Promise<NormalizedAgentCapabilities> {
    const adapter = this.registry.get(agentId);
    this.ensureUpdateSubscription(agentId);
    return adapter.initialize();
  }

  async createSession(request: CreateOrchestratedSessionRequest): Promise<{ sessionId: string }> {
    const adapter = this.registry.get(request.agentId);
    this.ensureUpdateSubscription(request.agentId);

    const session = await adapter.createSession({
      cwd: request.cwd,
      mcpServers: request.mcpServers,
    });
    this.sessionOwners.set(session.sessionId, request.agentId);
    return session;
  }

  async listSessions(agentId: string, cwd?: string): Promise<AgentSessionInfo[]> {
    const adapter = this.registry.get(agentId);
    this.ensureUpdateSubscription(agentId);
    const sessions = await adapter.listSessions(cwd);

    for (const session of sessions) {
      this.sessionOwners.set(session.sessionId, agentId);
    }
    return sessions;
  }

  async prompt(sessionId: string, prompt: string): Promise<void> {
    const adapter = this.getSessionAdapter(sessionId);
    await adapter.sendPrompt(sessionId, prompt);
  }

  async cancel(sessionId: string, promptId?: string): Promise<void> {
    const adapter = this.getSessionAdapter(sessionId);
    await adapter.cancelPrompt(sessionId, promptId);
  }

  onSessionUpdate(listener: (event: OrchestratorSessionUpdate) => void): void {
    this.updateListeners.add(listener);
  }

  offSessionUpdate(listener: (event: OrchestratorSessionUpdate) => void): void {
    this.updateListeners.delete(listener);
  }

  private getSessionAdapter(sessionId: string) {
    const agentId = this.sessionOwners.get(sessionId);
    if (!agentId) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return this.registry.get(agentId);
  }

  private ensureUpdateSubscription(agentId: string): void {
    if (this.subscribedAgents.has(agentId)) {
      return;
    }
    const adapter = this.registry.get(agentId);
    adapter.setSessionUpdateListener((event) => {
      const owner = this.sessionOwners.get(event.sessionId) ?? agentId;
      this.sessionOwners.set(event.sessionId, owner);
      for (const listener of this.updateListeners) {
        listener({
          agentId: owner,
          sessionId: event.sessionId,
          update: event.update,
        });
      }
    });
    this.subscribedAgents.add(agentId);
  }
}
