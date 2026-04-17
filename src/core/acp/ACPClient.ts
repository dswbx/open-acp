import { ACPTransport } from "./ACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPInitializeParams,
  ACPInitializeResult,
  ACPJsonRpcFailure,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse,
  ACPSessionCancelParams,
  ACPSessionListParams,
  ACPSessionListResult,
  ACPSessionLoadParams,
  ACPSessionLoadResult,
  ACPSessionNewParams,
  ACPSessionNewResult,
  ACPSessionPromptParams,
  ACPSessionPromptResult,
  ACPSessionSetModelParams,
  ACPSessionUpdateParams
} from "./ACPTypes.ts";

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class ACPRequestError extends Error {
  readonly code: number;
  readonly data?: unknown;
  readonly method: string;

  constructor(method: string, code: number, message: string, data?: unknown) {
    super(`[${method}] ${message} (${code})`);
    this.name = "ACPRequestError";
    this.method = method;
    this.code = code;
    this.data = data;
  }
}

export class ACPVersionMismatchError extends Error {
  constructor(requestedVersion: number, receivedVersion: number) {
    super(
      `ACP protocol version mismatch: requested ${requestedVersion}, received ${receivedVersion}.`
    );
    this.name = "ACPVersionMismatchError";
  }
}

export type SessionUpdateListener = (params: ACPSessionUpdateParams) => void;

export class ACPClient {
  private readonly transport: ACPTransport;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly sessionUpdateListeners = new Set<SessionUpdateListener>();
  private nextId = 1;
  private initialized = false;
  private initializeResult?: ACPInitializeResult;

  constructor(transport: ACPTransport) {
    this.transport = transport;
    this.transport.setMessageHandler((message) => {
      this.handleMessage(message);
    });
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error("ACP client disconnected while request was pending."));
    }
    this.pendingRequests.clear();
    this.sessionUpdateListeners.clear();
    await this.transport.disconnect();
  }

  async initialize(params: ACPInitializeParams): Promise<ACPInitializeResult> {
    const result = await this.sendRequest<ACPInitializeResult>(
      "initialize",
      params
    );

    if (result.protocolVersion !== params.protocolVersion) {
      throw new ACPVersionMismatchError(
        params.protocolVersion,
        result.protocolVersion
      );
    }

    this.initialized = true;
    this.initializeResult = result;
    return result;
  }

  async createSession(params: ACPSessionNewParams): Promise<ACPSessionNewResult> {
    this.assertInitialized("session/new");
    return this.sendRequest<ACPSessionNewResult>("session/new", params);
  }

  async loadSession(
    params: ACPSessionLoadParams
  ): Promise<ACPSessionLoadResult> {
    this.assertInitialized("session/load");
    return this.sendRequest<ACPSessionLoadResult>("session/load", params);
  }

  async listSessions(
    params: ACPSessionListParams = {}
  ): Promise<ACPSessionListResult> {
    this.assertInitialized("session/list");
    return this.sendRequest<ACPSessionListResult>("session/list", params);
  }

  async prompt(
    params: ACPSessionPromptParams
  ): Promise<ACPSessionPromptResult> {
    this.assertInitialized("session/prompt");
    return this.sendRequest<ACPSessionPromptResult>("session/prompt", params);
  }

  async cancel(params: ACPSessionCancelParams): Promise<void> {
    this.assertInitialized("session/cancel");
    await this.sendNotification("session/cancel", params);
  }

  async setModel(params: ACPSessionSetModelParams): Promise<void> {
    this.assertInitialized("session/set_model");
    await this.sendRequest("session/set_model", params);
  }

  onSessionUpdate(listener: SessionUpdateListener): void {
    this.sessionUpdateListeners.add(listener);
  }

  offSessionUpdate(listener: SessionUpdateListener): void {
    this.sessionUpdateListeners.delete(listener);
  }

  getInitializeResult(): ACPInitializeResult | undefined {
    return this.initializeResult;
  }

  private assertInitialized(method: string): void {
    if (!this.initialized) {
      throw new Error(
        `ACP client is not initialized. Call initialize before ${method}.`
      );
    }
  }

  private async sendRequest<TData>(
    method: string,
    params?: unknown
  ): Promise<TData> {
    const id = this.nextId++;
    const request: ACPJsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const responsePromise = new Promise<TData>((resolve, reject) => {
      this.pendingRequests.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject
      });
    });

    try {
      await this.transport.sendRequest(request);
    } catch (error) {
      this.pendingRequests.delete(id);
      throw error;
    }

    return responsePromise;
  }

  private async sendNotification(
    method: string,
    params?: unknown
  ): Promise<void> {
    const notification: ACPJsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params
    };
    await this.transport.sendNotification(notification);
  }

  private handleMessage(message: ACPInboundMessage): void {
    if (this.isResponse(message)) {
      this.handleResponse(message);
      return;
    }

    this.handleNotification(message);
  }

  private isResponse(message: ACPInboundMessage): message is ACPJsonRpcResponse {
    return "id" in message;
  }

  private handleResponse(response: ACPJsonRpcResponse): void {
    const requestId = response.id;
    if (requestId === null) {
      return;
    }

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(requestId);

    if ("error" in response) {
      pending.reject(this.toRequestError(pending.method, response));
      return;
    }

    pending.resolve(response.result);
  }

  private toRequestError(method: string, response: ACPJsonRpcFailure): Error {
    return new ACPRequestError(
      method,
      response.error.code,
      response.error.message,
      response.error.data
    );
  }

  private handleNotification(notification: ACPJsonRpcNotification): void {
    if (notification.method !== "session/update") {
      return;
    }
    const params = notification.params as ACPSessionUpdateParams | undefined;
    if (!params) {
      return;
    }
    for (const listener of this.sessionUpdateListeners) {
      listener(params);
    }
  }
}
