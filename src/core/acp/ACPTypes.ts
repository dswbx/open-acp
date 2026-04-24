export interface ACPJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type ACPRequestId = number | string | null;

export interface ACPJsonRpcRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: ACPRequestId;
  method: string;
  params?: TParams;
}

export interface ACPJsonRpcNotification<TParams = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
}

export interface ACPJsonRpcSuccess<TData = unknown> {
  jsonrpc: "2.0";
  id: ACPRequestId;
  result: TData;
}

export interface ACPJsonRpcFailure {
  jsonrpc: "2.0";
  id: ACPRequestId;
  error: ACPJsonRpcError;
}

export type ACPJsonRpcResponse<TData = unknown> = ACPJsonRpcSuccess<TData> | ACPJsonRpcFailure;

export type ACPInboundMessage = ACPJsonRpcRequest | ACPJsonRpcNotification | ACPJsonRpcResponse;

export interface ACPClientInfo {
  name: string;
  title?: string;
  version: string;
}

export interface ACPClientCapabilities {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
  _meta?: Record<string, unknown>;
}

export interface ACPInitializeParams {
  protocolVersion: number;
  clientCapabilities?: ACPClientCapabilities;
  clientInfo?: ACPClientInfo;
}

export interface ACPAgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  sessionCapabilities?: {
    list?: Record<string, never>;
    fork?: Record<string, never>;
    resume?: Record<string, never>;
    close?: Record<string, never>;
  };
  _meta?: Record<string, unknown>;
}

export interface ACPAuthMethod {
  type: string;
  _meta?: Record<string, unknown>;
}

export interface ACPInitializeResult {
  protocolVersion: number;
  agentCapabilities: ACPAgentCapabilities;
  agentInfo?: ACPClientInfo;
  authMethods?: ACPAuthMethod[];
  _meta?: Record<string, unknown>;
}

export interface ACPMcpEnvVariable {
  name: string;
  value: string;
}

export interface ACPMcpStdioServer {
  name: string;
  command: string;
  args: string[];
  env?: ACPMcpEnvVariable[];
}

export interface ACPMcpHttpHeader {
  name: string;
  value: string;
}

export interface ACPMcpHttpServer {
  type: "http";
  name: string;
  url: string;
  headers: ACPMcpHttpHeader[];
}

export interface ACPMcpSseServer {
  type: "sse";
  name: string;
  url: string;
  headers: ACPMcpHttpHeader[];
}

export type ACPMcpServer = ACPMcpStdioServer | ACPMcpHttpServer | ACPMcpSseServer;

export interface ACPSessionNewParams {
  cwd: string;
  mcpServers?: ACPMcpServer[];
}

export interface ACPSessionNewResult {
  sessionId: string;
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
  modes?: ACPSessionModeState | null;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionLoadParams {
  sessionId: string;
  cwd: string;
  mcpServers?: ACPMcpServer[];
}

export interface ACPSessionModelInfo {
  modelId: string;
  name: string;
  description?: string;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionModelState {
  currentModelId: string;
  availableModels: ACPSessionModelInfo[];
  _meta?: Record<string, unknown>;
}

export interface ACPSessionModeInfo {
  id: string;
  name: string;
  description?: string;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionModeState {
  currentModeId: string;
  availableModes: ACPSessionModeInfo[];
  _meta?: Record<string, unknown>;
}

export interface ACPSessionConfigSelectOption {
  value: string;
  name: string;
  description?: string;
}

export interface ACPSessionConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: string;
  currentValue?: string | boolean;
  options?: ACPSessionConfigSelectOption[];
  _meta?: Record<string, unknown>;
}

export interface ACPSessionLoadResult {
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
  modes?: ACPSessionModeState | null;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionListParams {
  cwd?: string;
  cursor?: string;
}

export interface ACPSessionInfo {
  sessionId: string;
  cwd: string;
  title?: string;
  updatedAt?: string;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionListResult {
  sessions: ACPSessionInfo[];
  nextCursor?: string;
}

export interface ACPTextContentBlock {
  type: "text";
  text: string;
}

export type ACPContentBlock = ACPTextContentBlock;

export interface ACPSessionPromptParams {
  sessionId: string;
  prompt: ACPContentBlock[];
}

export interface ACPSessionPromptResult {
  stopReason?: "cancelled" | "completed" | "error" | string;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionCancelParams {
  sessionId: string;
  promptId?: string;
}

export interface ACPSessionSetModelParams {
  sessionId: string;
  modelId: string;
}

export interface ACPSessionSetConfigOptionParams {
  sessionId: string;
  configId: string;
  type?: string;
  value: string | boolean;
  _meta?: Record<string, unknown> | null;
}

export interface ACPSessionSetConfigOptionResult {
  configOptions: ACPSessionConfigOption[];
  modes?: ACPSessionModeState | null;
  _meta?: Record<string, unknown> | null;
}

export interface ACPSessionModeInfo {
  id: string;
  name: string;
  description?: string;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionModeState {
  currentModeId: string;
  availableModes: ACPSessionModeInfo[];
  _meta?: Record<string, unknown>;
}

export interface ACPSessionSetModeParams {
  sessionId: string;
  modeId: string;
  _meta?: Record<string, unknown> | null;
}

export interface ACPSessionSetModeResult {
  modes?: ACPSessionModeState | null;
  _meta?: Record<string, unknown> | null;
}

export interface ACPToolCallLocation {
  path: string;
  line?: number | null;
  _meta?: Record<string, unknown> | null;
}

export interface ACPToolCallUpdate {
  toolCallId: string;
  kind?: string | null;
  rawInput?: string | null;
  locations?: ACPToolCallLocation[] | null;
  status?: string | null;
  content?: unknown[] | null;
  title?: string | null;
  _meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ACPPermissionOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
  _meta?: Record<string, unknown> | null;
}

export interface ACPSessionRequestPermissionParams {
  sessionId: string;
  toolCall: ACPToolCallUpdate;
  options: ACPPermissionOption[];
  _meta?: Record<string, unknown> | null;
}

export type ACPRequestPermissionOutcome =
  | {
      outcome: "cancelled";
    }
  | {
      outcome: "selected";
      optionId: string;
      _meta?: Record<string, unknown> | null;
    };

export interface ACPSessionRequestPermissionResult {
  outcome: ACPRequestPermissionOutcome;
  _meta?: Record<string, unknown> | null;
}

export interface OpenACPRequestUserInputOption {
  value: string;
  label: string;
  description?: string;
}

export interface OpenACPRequestUserInputField {
  id: string;
  header?: string;
  question: string;
  options?: OpenACPRequestUserInputOption[] | null;
  isOther?: boolean | null;
  isSecret?: boolean | null;
  _meta?: Record<string, unknown> | null;
}

export interface OpenACPRequestUserInputParams {
  sessionId: string;
  fields: OpenACPRequestUserInputField[];
  _meta?: Record<string, unknown> | null;
}

export type OpenACPUserInputOutcome =
  | {
      outcome: "cancelled";
      _meta?: Record<string, unknown> | null;
    }
  | {
      outcome: "submitted";
      answers: Array<{
        fieldId: string;
        value: string;
      }>;
      _meta?: Record<string, unknown> | null;
    };

export interface OpenACPRequestUserInputResult {
  outcome: OpenACPUserInputOutcome;
  _meta?: Record<string, unknown> | null;
}

export interface ACPSessionUpdate {
  sessionUpdate: string;
  [key: string]: unknown;
}

export interface ACPSessionPlanEntry {
  content: string;
  priority: string;
  status: string;
  _meta?: Record<string, unknown> | null;
}

export interface ACPSessionPlanUpdate extends ACPSessionUpdate {
  sessionUpdate: "plan";
  entries: ACPSessionPlanEntry[];
}

export interface ACPSessionCurrentModeUpdate extends ACPSessionUpdate {
  sessionUpdate: "current_mode_update";
  currentModeId: string;
}

export interface ACPSessionConfigOptionUpdate extends ACPSessionUpdate {
  sessionUpdate: "config_option_update";
  configOptions: ACPSessionConfigOption[];
}

export interface ACPSessionUpdateParams {
  sessionId: string;
  update: ACPSessionUpdate;
}
