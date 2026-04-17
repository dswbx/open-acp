export interface ACPJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface ACPJsonRpcRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: number;
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
  id: number;
  result: TData;
}

export interface ACPJsonRpcFailure {
  jsonrpc: "2.0";
  id: number | null;
  error: ACPJsonRpcError;
}

export type ACPJsonRpcResponse<TData = unknown> =
  | ACPJsonRpcSuccess<TData>
  | ACPJsonRpcFailure;

export type ACPInboundMessage =
  | ACPJsonRpcNotification
  | ACPJsonRpcResponse;

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

export type ACPMcpServer =
  | ACPMcpStdioServer
  | ACPMcpHttpServer
  | ACPMcpSseServer;

export interface ACPSessionNewParams {
  cwd: string;
  mcpServers?: ACPMcpServer[];
}

export interface ACPSessionNewResult {
  sessionId: string;
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
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

export interface ACPSessionUpdate {
  sessionUpdate: string;
  [key: string]: unknown;
}

export interface ACPSessionUpdateParams {
  sessionId: string;
  update: ACPSessionUpdate;
}
