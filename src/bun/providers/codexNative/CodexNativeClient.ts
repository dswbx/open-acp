import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeSessionId } from "../../SessionTranscriptStore.ts";
import type {
  ACPInitializeParams,
  ACPInitializeResult,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse,
  ACPRequestId,
  ACPRequestPermissionOutcome,
  ACPSessionCancelParams,
  ACPSessionLoadParams,
  ACPSessionLoadResult,
  ACPSessionNewParams,
  ACPSessionNewResult,
  ACPSessionPromptParams,
  ACPSessionPromptResult,
  ACPSessionRequestPermissionParams,
  ACPSessionSetModelParams,
  ACPSessionUpdateParams,
} from "../../../core/acp/ACPTypes.ts";
import type { PermissionRequestHandler, SessionUpdateListener } from "../../../core/acp/ACPClient.ts";
import { logger } from "../../../shared/logger.ts";
import {
  buildCodexNativeConfigOptions,
  buildCodexNativeSessionModelState,
  loadCodexNativeConfigState,
  resolveCodexTurnConfig,
  type CodexNativeConfigState,
} from "./config.ts";

type JsonRpcMessage =
  | ACPJsonRpcRequest
  | ACPJsonRpcNotification
  | ACPJsonRpcResponse
  | Record<string, unknown>;

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface NativeSessionState {
  sessionId: string;
  cwd: string;
  providerSessionId?: string;
  selectedModelId?: string;
  configState: CodexNativeConfigState;
}

interface ActiveTurn {
  sessionId: string;
  threadId: string;
  turnId: string;
  resolve: (result: ACPSessionPromptResult) => void;
  reject: (error: Error) => void;
}

export interface CodexNativeClientOptions {
  cwd: string;
  workspaceRoot: string;
  currentModeId?: string;
  onStderr?: (chunk: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onMessageSent?: (message: unknown) => void;
  onMessageReceived?: (message: unknown) => void;
}

export class CodexNativeClient {
  private readonly cwd: string;
  private readonly workspaceRoot: string;
  private readonly onStderr?: (chunk: string) => void;
  private readonly onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  private readonly onMessageSent?: (message: unknown) => void;
  private readonly onMessageReceived?: (message: unknown) => void;
  private process?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = "";
  private readonly pendingRequests = new Map<ACPRequestId, PendingRequest>();
  private readonly sessionUpdateListeners = new Set<SessionUpdateListener>();
  private permissionRequestHandler?: PermissionRequestHandler;
  private readonly sessions = new Map<string, NativeSessionState>();
  private currentSessionId?: string;
  private nextId = 1;
  private initialized = false;
  private activeTurn?: ActiveTurn;
  private currentModeId: string;

  constructor(options: CodexNativeClientOptions) {
    this.cwd = options.cwd;
    this.workspaceRoot = options.workspaceRoot;
    this.onStderr = options.onStderr;
    this.onExit = options.onExit;
    this.onMessageSent = options.onMessageSent;
    this.onMessageReceived = options.onMessageReceived;
    this.currentModeId = options.currentModeId ?? "build";
  }

  async connect(): Promise<void> {
    if (this.process) {
      return;
    }

    const child = spawn("codex", ["app-server"], {
      cwd: this.cwd,
      stdio: "pipe",
    });

    this.process = child;
    this.stdoutBuffer = "";

    child.stdout.on("data", this.handleStdoutData);
    child.stderr.on("data", this.handleStderrData);
    child.on("exit", this.handleProcessExit);
    child.on("error", this.handleProcessError);
  }

  async disconnect(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    this.stdoutBuffer = "";
    this.initialized = false;
    this.activeTurn = undefined;

    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error("Codex native client disconnected while request was pending."));
    }
    this.pendingRequests.clear();

    if (!child) {
      return;
    }

    child.stdout.off("data", this.handleStdoutData);
    child.stderr.off("data", this.handleStderrData);
    child.off("exit", this.handleProcessExit);
    child.off("error", this.handleProcessError);

    if (!child.stdin.destroyed) {
      child.stdin.end();
    }
    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      child.kill();
    }
    await waitForExit(child);

    if (!child.stdin.destroyed) {
      child.stdin.destroy();
    }
    child.stdout.destroy();
    child.stderr.destroy();
  }

  async initialize(params: ACPInitializeParams): Promise<ACPInitializeResult> {
    if (this.initialized) {
      return {
        protocolVersion: params.protocolVersion,
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: {
            resume: {},
          },
        },
      };
    }

    await this.sendRequest("initialize", {
      clientInfo: params.clientInfo ?? {
        name: "open-acp",
        title: "OpenACP",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    await this.sendNotification("initialized");
    this.initialized = true;

    return {
      protocolVersion: params.protocolVersion,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: {
          resume: {},
        },
      },
      _meta: {
        transport: "codex-native",
      },
    };
  }

  async createSession(params: ACPSessionNewParams): Promise<ACPSessionNewResult> {
    const sessionId = crypto.randomUUID();
    const configState = await loadCodexNativeConfigState(params.cwd);
    const providerSessionId = await this.startThread(params.cwd);

    this.sessions.set(sessionId, {
      sessionId,
      cwd: params.cwd,
      providerSessionId,
      configState,
    });
    this.currentSessionId = sessionId;

    return {
      sessionId,
      models: buildCodexNativeSessionModelState(configState),
      configOptions: buildCodexNativeConfigOptions(configState),
      _meta: {
        providerSessionId,
        transport: "codex-native",
        currentModeId: this.currentModeId,
      },
    };
  }

  async loadSession(params: ACPSessionLoadParams): Promise<ACPSessionLoadResult> {
    const configState = await loadCodexNativeConfigState(params.cwd);
    const metadata = await this.readSessionMetadata(params.sessionId);
    if (typeof metadata?.currentModeId === "string" && metadata.currentModeId.trim().length > 0) {
      this.currentModeId = metadata.currentModeId;
    }
    const providerSessionId = await this.resumeThreadFromMetadata(
      params.sessionId,
      params.cwd,
      metadata,
    );

    this.sessions.set(params.sessionId, {
      sessionId: params.sessionId,
      cwd: params.cwd,
      providerSessionId,
      configState,
    });
    this.currentSessionId = params.sessionId;

    return {
      models: buildCodexNativeSessionModelState(configState),
      configOptions: buildCodexNativeConfigOptions(configState),
      _meta: {
        providerSessionId,
        transport: "codex-native",
        currentModeId: this.currentModeId,
      },
    };
  }

  async prompt(params: ACPSessionPromptParams): Promise<ACPSessionPromptResult> {
    const session = await this.requireSession(params.sessionId);
    let providerSessionId = session.providerSessionId;
    if (!providerSessionId) {
      providerSessionId = await this.startThread(session.cwd);
      session.providerSessionId = providerSessionId;
    }

    const textInput = params.prompt
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n\n")
      .trim();
    if (textInput.length === 0) {
      throw new Error("Codex native prompt requires text input.");
    }

    const resolvedConfig = resolveCodexTurnConfig(session.selectedModelId, session.configState);
    const turnResult = (await this.sendRequest("turn/start", {
      threadId: providerSessionId,
      input: [{ type: "text", text: textInput }],
      model: resolvedConfig.model,
      effort: resolvedConfig.effort,
      serviceTier: resolvedConfig.serviceTier,
      collaborationMode:
        this.currentModeId === "plan"
          ? {
              mode: "plan",
              settings: {
                model: resolvedConfig.model,
                reasoning_effort: resolvedConfig.effort,
                developer_instructions: null,
              },
            }
          : undefined,
    })) as { turn?: { id?: string } };

    const turnId =
      typeof turnResult?.turn?.id === "string" ? turnResult.turn.id : crypto.randomUUID();

    return await new Promise<ACPSessionPromptResult>((resolve, reject) => {
      this.activeTurn = {
        sessionId: session.sessionId,
        threadId: providerSessionId,
        turnId,
        resolve,
        reject,
      };
    });
  }

  async cancel(params: ACPSessionCancelParams): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session?.providerSessionId || !this.activeTurn) {
      return;
    }
    await this.sendRequest("turn/interrupt", {
      threadId: session.providerSessionId,
      turnId: this.activeTurn.turnId,
    });
  }

  async setModel(params: ACPSessionSetModelParams): Promise<void> {
    const session = await this.requireSession(params.sessionId);
    session.selectedModelId = params.modelId;
  }

  onSessionUpdate(listener: SessionUpdateListener): void {
    this.sessionUpdateListeners.add(listener);
  }

  offSessionUpdate(listener: SessionUpdateListener): void {
    this.sessionUpdateListeners.delete(listener);
  }

  setPermissionRequestHandler(handler: PermissionRequestHandler | undefined): void {
    this.permissionRequestHandler = handler;
  }

  private async requireSession(sessionId: string): Promise<NativeSessionState> {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }
    const configState = await loadCodexNativeConfigState(this.cwd);
    const nextSession = {
      sessionId,
      cwd: this.cwd,
      configState,
    } satisfies NativeSessionState;
    this.sessions.set(sessionId, nextSession);
    return nextSession;
  }

  private async resumeThreadFromMetadata(
    sessionId: string,
    cwd: string,
    metadata?: Record<string, unknown>,
  ): Promise<string | undefined> {
    const resolvedMetadata = metadata ?? (await this.readSessionMetadata(sessionId));
    const providerSessionId =
      typeof resolvedMetadata?.providerSessionId === "string"
        ? resolvedMetadata.providerSessionId
        : typeof resolvedMetadata?.providerThreadId === "string"
          ? resolvedMetadata.providerThreadId
          : undefined;
    if (!providerSessionId) {
      return undefined;
    }

    try {
      const result = (await this.sendRequest("thread/resume", {
        threadId: providerSessionId,
        cwd,
      })) as { thread?: { id?: string } };
      return typeof result?.thread?.id === "string" ? result.thread.id : providerSessionId;
    } catch (error) {
      logger.warn("Codex native thread resume failed; starting fresh on next prompt", {
        sessionId,
        providerSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private async startThread(cwd: string): Promise<string> {
    const result = (await this.sendRequest("thread/start", {
      cwd,
      persistExtendedHistory: true,
    })) as { thread?: { id?: string } };
    const providerSessionId = result?.thread?.id;
    if (typeof providerSessionId !== "string" || providerSessionId.trim().length === 0) {
      throw new Error("Codex app-server did not return a thread id.");
    }
    return providerSessionId;
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message = {
      id,
      method,
      params,
    };
    this.onMessageSent?.(message);
    await this.writeLine(`${JSON.stringify(message)}\n`);

    return await new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { method, resolve, reject });
    });
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    const message = params === undefined ? { method } : { method, params };
    this.onMessageSent?.(message);
    await this.writeLine(`${JSON.stringify(message)}\n`);
  }

  private async sendResponse(response: Record<string, unknown>): Promise<void> {
    this.onMessageSent?.(response);
    await this.writeLine(`${JSON.stringify(response)}\n`);
  }

  private async writeLine(line: string): Promise<void> {
    const child = this.process;
    if (!child || child.stdin.destroyed || !child.stdin.writable) {
      throw new Error("Codex native stdio transport is not connected.");
    }

    await new Promise<void>((resolve, reject) => {
      child.stdin.write(line, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private readonly handleStdoutData = (chunk: Buffer | string): void => {
    this.stdoutBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const rawLine = this.stdoutBuffer.slice(0, newlineIndex);
      const line = rawLine.replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.handleStdoutLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  };

  private handleStdoutLine(line: string): void {
    if (line.length === 0) {
      return;
    }

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      this.failActiveTurn(
        `Received invalid JSON from Codex app-server: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    this.onMessageReceived?.(message);

    if (typeof message.id !== "undefined" && ("result" in message || "error" in message)) {
      this.handleResponse(message);
      return;
    }

    if (typeof message.method === "string" && typeof message.id !== "undefined") {
      void this.handleRequest(message);
      return;
    }

    if (typeof message.method === "string") {
      this.handleNotification(message);
    }
  }

  private handleResponse(message: Record<string, unknown>): void {
    const pending = this.pendingRequests.get(message.id as ACPRequestId);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(message.id as ACPRequestId);

    if ("error" in message && message.error) {
      const errorMessage =
        typeof (message.error as { message?: unknown }).message === "string"
          ? (message.error as { message: string }).message
          : `${pending.method} failed`;
      pending.reject(new Error(errorMessage));
      return;
    }

    pending.resolve(message.result);
  }

  private async handleRequest(message: Record<string, unknown>): Promise<void> {
    const method = message.method;
    const requestId = message.id as ACPRequestId;
    if (method === "item/tool/requestUserInput") {
      const error = "Codex requested user input, but question UI is not implemented yet.";
      await this.sendResponse({
        id: requestId,
        error: {
          code: -32601,
          message: error,
        },
      });
      this.failActiveTurn(error);
      return;
    }

    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval" ||
      method === "item/permissions/requestApproval"
    ) {
      const outcome = await this.handleApprovalRequest(message);
      const decision =
        outcome.outcome === "cancelled" ? "cancel" : mapApprovalDecision(outcome.optionId);
      await this.sendResponse({
        id: requestId,
        result: {
          decision,
        },
      });
      return;
    }

    await this.sendResponse({
      id: requestId,
      error: {
        code: -32601,
        message: `Unsupported Codex native request: ${String(method)}`,
      },
    });
  }

  private async handleApprovalRequest(
    message: Record<string, unknown>,
  ): Promise<ACPRequestPermissionOutcome> {
    if (!this.permissionRequestHandler) {
      return { outcome: "cancelled" };
    }

    const method = String(message.method);
    const params = isRecord(message.params) ? message.params : {};
    const sessionId = this.findSessionIdByThreadId(readString(params.threadId)) ?? this.currentSessionId;
    if (!sessionId) {
      return { outcome: "cancelled" };
    }

    const toolCallId = readString(params.itemId) ?? String(message.id);
    const rawInput =
      method === "item/commandExecution/requestApproval"
        ? readString(params.command)
        : method === "item/fileChange/requestApproval"
          ? JSON.stringify(params.changes ?? params, null, 2)
          : JSON.stringify(params.permissions ?? params, null, 2);

    return await this.permissionRequestHandler({
      requestId: message.id as ACPRequestId,
      sessionId,
      toolCall: {
        toolCallId,
        kind:
          method === "item/fileChange/requestApproval"
            ? "file_change"
            : method === "item/permissions/requestApproval"
              ? "permissions"
              : "command_execution",
        rawInput,
        title: readString(params.reason) ?? readString(params.command) ?? method,
        locations: [],
      },
      options: [
        {
          optionId: "accept",
          name: "Allow once",
          kind: "allow_once",
        },
        {
          optionId: "acceptForSession",
          name: "Allow for session",
          kind: "allow_always",
        },
        {
          optionId: "decline",
          name: "Reject",
          kind: "reject_once",
        },
      ],
    } satisfies ACPSessionRequestPermissionParams & { requestId: ACPRequestId });
  }

  private handleNotification(message: Record<string, unknown>): void {
    const method = message.method;
    const params = isRecord(message.params) ? message.params : {};
    const sessionId =
      this.findSessionIdByThreadId(readString(params.threadId)) ?? this.activeTurn?.sessionId;
    if (!sessionId) {
      return;
    }

    switch (method) {
      case "item/agentMessage/delta":
        this.emitSessionUpdate(sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: readString(params.delta) ?? "",
        });
        return;
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta":
      case "item/plan/delta":
        this.emitSessionUpdate(sessionId, {
          sessionUpdate: "agent_thought_chunk",
          content: readString(params.delta) ?? "",
        });
        return;
      case "item/started":
        this.handleItemStarted(sessionId, params);
        return;
      case "item/completed":
        this.handleItemCompleted(sessionId, params);
        return;
      case "item/commandExecution/outputDelta":
        this.emitSessionUpdate(sessionId, {
          sessionUpdate: "tool_call_update",
          toolCallId: readString(params.itemId) ?? crypto.randomUUID(),
          kind: "command_execution",
          status: "running",
          rawOutput: readString(params.delta) ?? "",
        });
        return;
      case "thread/tokenUsage/updated":
        this.emitSessionUpdate(sessionId, {
          sessionUpdate: "usage_update",
          used: readNumber(params.totalTokens, params.total_tokens, params.used) ?? 0,
          size: readNumber(params.maxTokens, params.max_tokens, params.size) ?? 0,
          usage: {
            inputTokens: readNumber(params.inputTokens, params.input_tokens),
            outputTokens: readNumber(params.outputTokens, params.output_tokens),
            reasoningTokens: readNumber(params.reasoningTokens, params.reasoning_tokens),
            cachedInputTokens: readNumber(
              params.cachedInputTokens,
              params.cached_input_tokens,
              params.cacheReadInputTokens,
              params.cache_read_input_tokens,
            ),
          },
        });
        return;
      case "turn/completed":
        this.handleTurnCompleted(params);
        return;
      default:
        return;
    }
  }

  private handleItemStarted(sessionId: string, params: Record<string, unknown>): void {
    const item = isRecord(params.item) ? params.item : {};
    const itemType = readString(item.type);
    const itemId = readString(item.id) ?? readString(params.itemId) ?? crypto.randomUUID();
    if (itemType === "commandExecution") {
      this.emitSessionUpdate(sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: itemId,
        kind: "command_execution",
        title: readString(item.command) ?? "Command execution",
        rawInput: readString(item.command),
        status: "running",
      });
      return;
    }
    if (itemType === "fileChange") {
      this.emitSessionUpdate(sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: itemId,
        kind: "file_change",
        title: "File change",
        rawInput: JSON.stringify(item.changes ?? [], null, 2),
        status: "running",
      });
    }
  }

  private handleItemCompleted(sessionId: string, params: Record<string, unknown>): void {
    const item = isRecord(params.item) ? params.item : {};
    const itemType = readString(item.type);
    if (itemType !== "commandExecution" && itemType !== "fileChange") {
      return;
    }

    this.emitSessionUpdate(sessionId, {
      sessionUpdate: "tool_call_update",
      toolCallId: readString(item.id) ?? crypto.randomUUID(),
      kind: itemType === "commandExecution" ? "command_execution" : "file_change",
      title: itemType === "commandExecution" ? readString(item.command) : "File change",
      status: mapItemStatus(readString(item.status)),
      rawOutput:
        itemType === "commandExecution"
          ? item.aggregatedOutput ?? item
          : item,
    });
  }

  private handleTurnCompleted(params: Record<string, unknown>): void {
    const turn = isRecord(params.turn) ? params.turn : params;
    const turnId = readString(turn.id) ?? this.activeTurn?.turnId;
    if (!this.activeTurn || !turnId || this.activeTurn.turnId !== turnId) {
      return;
    }

    const activeTurn = this.activeTurn;
    this.activeTurn = undefined;

    const status = readString(turn.status);
    if (status === "completed") {
      activeTurn.resolve({ stopReason: "completed" });
      return;
    }
    if (status === "interrupted" || status === "cancelled") {
      activeTurn.resolve({ stopReason: "cancelled" });
      return;
    }

    const errorInfo = isRecord(turn.error) ? turn.error : {};
    const errorMessage =
      readString(errorInfo.message) ??
      readString((isRecord(errorInfo.additionalDetails) ? errorInfo.additionalDetails.message : undefined)) ??
      "Codex turn failed.";
    activeTurn.reject(new Error(errorMessage));
  }

  private failActiveTurn(message: string): void {
    if (this.activeTurn) {
      const activeTurn = this.activeTurn;
      this.activeTurn = undefined;
      activeTurn.reject(new Error(message));
    }
  }

  private emitSessionUpdate(sessionId: string, update: Record<string, unknown>): void {
    const payload: ACPSessionUpdateParams = {
      sessionId,
      update: {
        sessionUpdate: String(update.sessionUpdate ?? "unknown"),
        ...update,
      },
    };
    for (const listener of this.sessionUpdateListeners) {
      listener(payload);
    }
  }

  private findSessionIdByThreadId(threadId: string | undefined): string | undefined {
    if (!threadId) {
      return undefined;
    }
    for (const session of this.sessions.values()) {
      if (session.providerSessionId === threadId) {
        return session.sessionId;
      }
    }
    return undefined;
  }

  private async readSessionMetadata(sessionId: string): Promise<Record<string, unknown> | undefined> {
    try {
      const metadataPath = path.join(
        this.workspaceRoot,
        ".acp",
        "sessions",
        sanitizeSessionId(sessionId),
        "metadata.json",
      );
      const metadataText = await readFile(metadataPath, "utf8");
      return JSON.parse(metadataText) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  private readonly handleStderrData = (chunk: Buffer | string): void => {
    const stderrChunk = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.onStderr?.(stderrChunk);
  };

  private readonly handleProcessExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    this.process = undefined;
    this.stdoutBuffer = "";
    this.onExit?.(code, signal);
    if (this.activeTurn) {
      this.failActiveTurn(
        `Codex app-server exited unexpectedly (code=${String(code)}, signal=${signal ?? "none"}).`,
      );
    }
  };

  private readonly handleProcessError = (error: Error): void => {
    this.onStderr?.(error.message);
    this.failActiveTurn(error.message);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function mapItemStatus(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "completed";
    case "declined":
      return "denied";
    case "failed":
      return "error";
    default:
      return "running";
  }
}

function mapApprovalDecision(optionId: string): string {
  switch (optionId) {
    case "accept":
    case "acceptForSession":
    case "decline":
    case "cancel":
      return optionId;
    default:
      return "decline";
  }
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onExit = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = setTimeout(() => {
      child.off("exit", onExit);
      resolve();
    }, 500);
    child.once("exit", onExit);
  });
}
