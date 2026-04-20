import { AdapterRegistry } from "../adapters/AdapterRegistry.ts";
import type {
  AgentSessionInfo,
  AgentSessionUpdateEvent,
  CreateAgentSessionRequest,
  NormalizedAgentCapabilities,
} from "../adapters/AgentAdapter.ts";
import { OrchestratorError, wrapOrchestratorError } from "./OrchestratorError.ts";

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
    const adapter = this.resolveAgent(agentId);
    this.ensureUpdateSubscription(agentId);
    try {
      return await adapter.initialize();
    } catch (error) {
      throw wrapOrchestratorError(
        "AGENT_INITIALIZE_FAILED",
        `Failed to initialize agent ${agentId}`,
        { agentId },
        error,
      );
    }
  }

  async createSession(request: CreateOrchestratedSessionRequest): Promise<{ sessionId: string }> {
    const adapter = this.resolveAgent(request.agentId);
    this.ensureUpdateSubscription(request.agentId);

    try {
      const session = await adapter.createSession({
        cwd: request.cwd,
        mcpServers: request.mcpServers,
      });
      this.sessionOwners.set(session.sessionId, request.agentId);
      return session;
    } catch (error) {
      throw wrapOrchestratorError(
        "SESSION_CREATE_FAILED",
        `Failed to create session on agent ${request.agentId}`,
        { agentId: request.agentId },
        error,
      );
    }
  }

  async listSessions(agentId: string, cwd?: string): Promise<AgentSessionInfo[]> {
    const adapter = this.resolveAgent(agentId);
    this.ensureUpdateSubscription(agentId);

    try {
      const sessions = await adapter.listSessions(cwd);
      for (const session of sessions) {
        this.sessionOwners.set(session.sessionId, agentId);
      }
      return sessions;
    } catch (error) {
      throw wrapOrchestratorError(
        "SESSION_LIST_FAILED",
        `Failed to list sessions for agent ${agentId}`,
        { agentId },
        error,
      );
    }
  }

  async prompt(sessionId: string, prompt: string): Promise<void> {
    const { adapter, agentId } = this.getSessionAdapter(sessionId);
    try {
      await adapter.sendPrompt(sessionId, prompt);
    } catch (error) {
      throw wrapOrchestratorError(
        "SESSION_PROMPT_FAILED",
        `Failed to send prompt to session ${sessionId}`,
        { agentId, sessionId },
        error,
      );
    }
  }

  async cancel(sessionId: string, promptId?: string): Promise<void> {
    const { adapter, agentId } = this.getSessionAdapter(sessionId);
    try {
      await adapter.cancelPrompt(sessionId, promptId);
    } catch (error) {
      throw wrapOrchestratorError(
        "SESSION_CANCEL_FAILED",
        `Failed to cancel prompt on session ${sessionId}`,
        { agentId, sessionId, promptId },
        error,
      );
    }
  }

  onSessionUpdate(listener: (event: OrchestratorSessionUpdate) => void): void {
    this.updateListeners.add(listener);
  }

  offSessionUpdate(listener: (event: OrchestratorSessionUpdate) => void): void {
    this.updateListeners.delete(listener);
  }

  private resolveAgent(agentId: string) {
    try {
      return this.registry.get(agentId);
    } catch (error) {
      throw wrapOrchestratorError(
        "UNKNOWN_AGENT",
        `Unknown agent: ${agentId}`,
        { agentId },
        error,
      );
    }
  }

  private getSessionAdapter(sessionId: string) {
    const agentId = this.sessionOwners.get(sessionId);
    if (!agentId) {
      throw new OrchestratorError("UNKNOWN_SESSION", `Unknown session: ${sessionId}`, {
        sessionId,
      });
    }
    return { adapter: this.resolveAgent(agentId), agentId };
  }

  private ensureUpdateSubscription(agentId: string): void {
    if (this.subscribedAgents.has(agentId)) {
      return;
    }
    const adapter = this.resolveAgent(agentId);
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
