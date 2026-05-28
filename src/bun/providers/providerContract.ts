import type {
  AvailableCommand,
  ApprovalLocation,
  ApprovalOption,
  ApprovalOutcome,
} from "../../shared/AppRPC.ts";
import type { ProviderModelOption, SmokeProvider } from "../../shared/providerModels.ts";

export type ProviderTransportKind = "acp" | "codex-native";

export interface ProviderConfigSelectOption {
  value: string;
  name: string;
  description?: string;
}

export interface ProviderConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: string;
  currentValue?: string | boolean;
  options?: ProviderConfigSelectOption[];
  _meta?: Record<string, unknown>;
}

export type ProviderModeKind = "plan" | "execute" | "ask" | "custom";

export interface ProviderModeOption {
  id: string;
  kind: ProviderModeKind;
  label: string;
  rawModeId: string;
  source: "config_option" | "legacy_modes" | "provider";
  description?: string;
}

export interface ProviderModeState {
  currentModeId?: string;
  availableModes: ProviderModeOption[];
  configOptionId?: string;
  source?: ProviderModeOption["source"];
}

export interface ProviderConfigState {
  options: ProviderConfigOption[];
  mode: ProviderModeState;
}

export interface ProviderReplayMetadata {
  transport: ProviderTransportKind;
  providerSessionId?: string;
  currentModeId?: string;
  _meta?: Record<string, unknown>;
}

export interface ProviderSessionHandle {
  sessionId: string;
  cwd: string;
  provider: SmokeProvider;
  models: ProviderModelOption[];
  config: ProviderConfigState;
  replay: ProviderReplayMetadata;
  _meta?: Record<string, unknown>;
}

export interface ProviderSessionCapabilities {
  list: boolean;
  fork: boolean;
  resume: boolean;
  close: boolean;
}

export interface ProviderExtensionCapabilities {
  userInput: boolean;
}

export interface ProviderCapabilities {
  loadSession: boolean;
  authMethods: string[];
  supportsTerminalAuth: boolean;
  session: ProviderSessionCapabilities;
  config: {
    setConfigOption: boolean;
    setMode: boolean;
  };
  extensions: ProviderExtensionCapabilities;
  models: ProviderModelOption[];
  _meta?: Record<string, unknown>;
}

export interface ProviderInitializeParams {
  protocolVersion: number;
  clientCapabilities?: Record<string, unknown>;
  clientInfo?: {
    name: string;
    title?: string;
    version: string;
  };
}

export interface ProviderCreateSessionParams {
  cwd: string;
  mcpServers?: unknown[];
}

export interface ProviderLoadSessionParams {
  sessionId: string;
  cwd: string;
  mcpServers?: unknown[];
}

export interface ProviderSendPromptParams {
  sessionId: string;
  prompt: Array<{ type: "text"; text: string }>;
}

export interface ProviderCancelTurnParams {
  sessionId: string;
  promptId?: string;
}

export interface ProviderSetConfigOptionParams {
  sessionId: string;
  optionId: string;
  value: string | boolean;
}

export interface ProviderSetModeParams {
  sessionId: string;
  modeId: string;
}

export interface ProviderApprovalRequest {
  approvalId: string;
  sessionId: string;
  requestId?: string;
  toolCallId: string;
  toolKind?: string;
  rawInput?: string;
  locations: ApprovalLocation[];
  options: ApprovalOption[];
  _meta?: Record<string, unknown>;
}

export interface ProviderUserInputOption {
  value: string;
  label: string;
  description?: string;
}

export interface ProviderUserInputField {
  id: string;
  header?: string;
  question: string;
  options: ProviderUserInputOption[];
  allowOther?: boolean;
  secret?: boolean;
}

export interface ProviderUserInputRequest {
  inputId: string;
  sessionId: string;
  requestId?: string;
  fields: ProviderUserInputField[];
  _meta?: Record<string, unknown>;
}

export type ProviderUserInputOutcome =
  | {
      outcome: "cancelled";
    }
  | {
      outcome: "submitted";
      answers: Array<{
        fieldId: string;
        value: string;
      }>;
    };

export interface ProviderToolCallEvent {
  toolCallId: string;
  title?: string;
  kind?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export interface ProviderPlanUpdate {
  textDelta?: string;
  summary?: string;
  detail?: string;
  format: "text_delta" | "summary";
}

export interface ProviderUsageUpdate {
  used: number;
  size: number;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export type ProviderEvent =
  | {
      type: "available_commands";
      sessionId: string;
      commands: AvailableCommand[];
    }
  | {
      type: "message_chunk";
      sessionId: string;
      text: string;
    }
  | {
      type: "thought_chunk";
      sessionId: string;
      text: string;
    }
  | {
      type: "plan_update";
      sessionId: string;
      plan: ProviderPlanUpdate;
    }
  | {
      type: "tool_call";
      sessionId: string;
      tool: ProviderToolCallEvent;
    }
  | {
      type: "tool_call_update";
      sessionId: string;
      tool: ProviderToolCallEvent;
    }
  | {
      type: "usage";
      sessionId: string;
      usage: ProviderUsageUpdate;
    }
  | {
      type: "session_info";
      sessionId: string;
      title?: string | null;
      updatedAt?: string | null;
    }
  | {
      type: "reasoning";
      sessionId: string;
      updateType: string;
      summary: string;
      detail?: string;
    }
  | {
      type: "config";
      sessionId: string;
      config: ProviderConfigState;
      replay?: Partial<ProviderReplayMetadata>;
    }
  | {
      type: "approval_request";
      request: ProviderApprovalRequest;
    }
  | {
      type: "user_input_request";
      request: ProviderUserInputRequest;
    };

export interface ProviderAdapter {
  readonly provider: SmokeProvider;
  readonly transportKind: ProviderTransportKind;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  initialize(params: ProviderInitializeParams): Promise<ProviderCapabilities>;
  createSession(params: ProviderCreateSessionParams): Promise<ProviderSessionHandle>;
  loadSession(params: ProviderLoadSessionParams): Promise<ProviderSessionHandle>;
  sendPrompt(params: ProviderSendPromptParams): Promise<{ stopReason?: string }>;
  cancelTurn(params: ProviderCancelTurnParams): Promise<void>;
  setConfigOption(
    params: ProviderSetConfigOptionParams,
  ): Promise<ProviderSessionHandle | undefined>;
  setMode(params: ProviderSetModeParams): Promise<ProviderSessionHandle | undefined>;
  respondToApproval(approvalId: string, outcome: ApprovalOutcome): Promise<void>;
  respondToUserInput(inputId: string, outcome: ProviderUserInputOutcome): Promise<void>;
  subscribe(listener: (event: ProviderEvent) => void): () => void;
}

export interface ProviderAdapterDiagnostics {
  onStderr?: (chunk: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onMessageSent?: (message: unknown) => void;
  onMessageReceived?: (message: unknown) => void;
}
