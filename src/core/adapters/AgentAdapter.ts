import type {
  ACPMcpServer,
  ACPSessionUpdate
} from "../acp/ACPTypes.ts";

export interface NormalizedModelMetadata {
  id: string;
  title?: string;
  contextWindowTokens?: number | null;
}

export interface NormalizedSessionCapabilities {
  list: boolean;
  fork: boolean;
  resume: boolean;
  setModel: boolean;
  stop: boolean;
}

export interface NormalizedAgentCapabilities {
  loadSession: boolean;
  authMethods: string[];
  supportsTerminalAuth: boolean;
  session: NormalizedSessionCapabilities;
  models: NormalizedModelMetadata[];
}

export interface AgentSessionInfo {
  sessionId: string;
  cwd: string;
  title?: string;
  updatedAt?: string;
  meta?: Record<string, unknown>;
}

export interface AgentSessionUpdateEvent {
  sessionId: string;
  update: ACPSessionUpdate;
}

export interface CreateAgentSessionRequest {
  cwd: string;
  mcpServers?: ACPMcpServer[];
}

export abstract class AgentAdapter {
  abstract readonly agentId: string;

  abstract initialize(): Promise<NormalizedAgentCapabilities>;

  abstract createSession(
    request: CreateAgentSessionRequest
  ): Promise<{ sessionId: string }>;

  abstract listSessions(cwd?: string): Promise<AgentSessionInfo[]>;

  abstract sendPrompt(sessionId: string, prompt: string): Promise<void>;

  abstract cancelPrompt(sessionId: string, promptId?: string): Promise<void>;

  abstract setSessionUpdateListener(
    listener: (event: AgentSessionUpdateEvent) => void
  ): void;
}

