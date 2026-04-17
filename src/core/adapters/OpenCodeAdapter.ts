import type { SessionUpdateListener } from "../acp/ACPClient.ts";
import { ACPProtocolInsights } from "../acp/ACPProtocolInsights.ts";
import type {
  ACPInitializeResult,
  ACPMcpServer,
  ACPSessionListResult,
  ACPSessionUpdateParams
} from "../acp/ACPTypes.ts";
import { AgentAdapter } from "./AgentAdapter.ts";
import type {
  AgentSessionInfo,
  AgentSessionUpdateEvent,
  CreateAgentSessionRequest,
  NormalizedAgentCapabilities
} from "./AgentAdapter.ts";
import { normalizeProviderModelOptions } from "../../shared/providerModels.ts";

interface ACPClientLike {
  initialize(params: {
    protocolVersion: number;
    clientCapabilities: {
      fs: {
        readTextFile: boolean;
        writeTextFile: boolean;
      };
      terminal: boolean;
    };
    clientInfo: {
      name: string;
      title: string;
      version: string;
    };
  }): Promise<ACPInitializeResult>;
  createSession(params: {
    cwd: string;
    mcpServers?: ACPMcpServer[];
  }): Promise<{ sessionId: string }>;
  listSessions(params?: { cwd?: string }): Promise<ACPSessionListResult>;
  prompt(params: {
    sessionId: string;
    prompt: [{ type: "text"; text: string }];
  }): Promise<unknown>;
  cancel(params: { sessionId: string; promptId?: string }): Promise<void>;
  onSessionUpdate(listener: SessionUpdateListener): void;
  offSessionUpdate(listener: SessionUpdateListener): void;
}

export class OpenCodeAdapter extends AgentAdapter {
  readonly agentId = "opencode";

  private readonly client: ACPClientLike;
  private cachedCapabilities?: NormalizedAgentCapabilities;
  private sessionUpdateForwarder?: SessionUpdateListener;

  constructor(client: ACPClientLike) {
    super();
    this.client = client;
  }

  async initialize(): Promise<NormalizedAgentCapabilities> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    const initializeResult = await this.client.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true
        },
        terminal: true
      },
      clientInfo: {
        name: "agent-orchestrator-poc",
        title: "Agent Orchestrator POC",
        version: "0.1.0"
      }
    });

    this.cachedCapabilities =
      this.mapInitializeResultToCapabilities(initializeResult);
    return this.cachedCapabilities;
  }

  async createSession(
    request: CreateAgentSessionRequest
  ): Promise<{ sessionId: string }> {
    return this.client.createSession({
      cwd: request.cwd,
      mcpServers: request.mcpServers
    });
  }

  async listSessions(cwd?: string): Promise<AgentSessionInfo[]> {
    const result = await this.client.listSessions({ cwd });
    return result.sessions.map((session) => ({
      sessionId: session.sessionId,
      cwd: session.cwd,
      title: session.title,
      updatedAt: session.updatedAt,
      meta: session._meta
    }));
  }

  async sendPrompt(sessionId: string, prompt: string): Promise<void> {
    await this.client.prompt({
      sessionId,
      prompt: [
        {
          type: "text",
          text: prompt
        }
      ]
    });
  }

  async cancelPrompt(sessionId: string, promptId?: string): Promise<void> {
    await this.client.cancel({ sessionId, promptId });
  }

  setSessionUpdateListener(
    listener: (event: AgentSessionUpdateEvent) => void
  ): void {
    if (this.sessionUpdateForwarder) {
      this.client.offSessionUpdate(this.sessionUpdateForwarder);
    }

    this.sessionUpdateForwarder = (params: ACPSessionUpdateParams) => {
      listener({
        sessionId: params.sessionId,
        update: params.update
      });
    };
    this.client.onSessionUpdate(this.sessionUpdateForwarder);
  }

  private mapInitializeResultToCapabilities(
    result: ACPInitializeResult
  ): NormalizedAgentCapabilities {
    const sessionCapabilities = result.agentCapabilities.sessionCapabilities;

    return {
      loadSession: Boolean(result.agentCapabilities.loadSession),
      authMethods: (result.authMethods ?? []).map((method) => method.type),
      supportsTerminalAuth: (result.authMethods ?? []).some(
        (method) => method.type === "terminal"
      ),
      session: {
        list: Boolean(sessionCapabilities?.list),
        fork: Boolean(sessionCapabilities?.fork),
        resume: Boolean(sessionCapabilities?.resume),
        setModel: false,
        stop: false
      },
      models: normalizeProviderModelOptions(result._meta?.models)
    };
  }

  getKnownLimitations() {
    return ACPProtocolInsights.listKnownLimitations();
  }
}
