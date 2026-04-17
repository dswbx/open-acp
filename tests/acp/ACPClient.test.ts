import { describe, expect, it, vi } from "vitest";
import {
  ACPClient,
  ACPVersionMismatchError
} from "../../src/core/acp/ACPClient.ts";
import { ACPTransport } from "../../src/core/acp/ACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse
} from "../../src/core/acp/ACPTypes.ts";

class TestACPTransport extends ACPTransport {
  readonly requests: ACPJsonRpcRequest[] = [];
  readonly notifications: ACPJsonRpcNotification[] = [];
  readonly responses: ACPJsonRpcResponse[] = [];
  shouldFailSend = false;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async sendRequest(request: ACPJsonRpcRequest): Promise<void> {
    if (this.shouldFailSend) {
      throw new Error("transport send failed");
    }
    this.requests.push(request);
  }

  async sendNotification(
    notification: ACPJsonRpcNotification
  ): Promise<void> {
    this.notifications.push(notification);
  }

  async sendResponse(response: ACPJsonRpcResponse): Promise<void> {
    this.responses.push(response);
  }

  inject(message: ACPInboundMessage): void {
    this.dispatchIncomingMessage(message);
  }
}

describe("ACPClient", () => {
  it("initializes and validates protocol version", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true
        },
        terminal: true
      }
    });

    const initializeRequest = transport.requests[0];
    expect(initializeRequest.method).toBe("initialize");

    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: {
            list: {}
          }
        },
        authMethods: [{ type: "terminal" }]
      }
    });

    await expect(initializePromise).resolves.toMatchObject({
      protocolVersion: 1
    });
  });

  it("returns session/new setup metadata including models and config options", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({
      protocolVersion: 1
    });
    const initializeRequest = transport.requests[0];
    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {}
      }
    });
    await initializePromise;

    const createSessionPromise = client.createSession({
      cwd: "/workspace",
      mcpServers: []
    });
    const createSessionRequest = transport.requests[1];

    transport.inject({
      jsonrpc: "2.0",
      id: createSessionRequest.id,
      result: {
        sessionId: "session-1",
        models: {
          currentModelId: "gpt-5-mini",
          availableModels: [
            {
              modelId: "gpt-5-mini",
              name: "GPT-5 mini",
              description: "Fast coding model"
            }
          ]
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "gpt-5-mini",
            options: [
              {
                value: "gpt-5-mini",
                name: "GPT-5 mini"
              }
            ]
          }
        ]
      }
    });

    await expect(createSessionPromise).resolves.toMatchObject({
      sessionId: "session-1",
      models: {
        currentModelId: "gpt-5-mini"
      },
      configOptions: [expect.objectContaining({ id: "model" })]
    });
  });

  it("returns session/load setup metadata instead of undefined", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({
      protocolVersion: 1
    });
    const initializeRequest = transport.requests[0];

    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true
        }
      }
    });
    await initializePromise;

    const loadSessionPromise = client.loadSession({
      sessionId: "session-1",
      cwd: "/workspace",
      mcpServers: []
    });
    const loadSessionRequest = transport.requests[1];

    transport.inject({
      jsonrpc: "2.0",
      id: loadSessionRequest.id,
      result: {
        models: {
          currentModelId: "claude-default",
          availableModels: [
            {
              modelId: "claude-default",
              name: "Default (recommended)"
            }
          ]
        },
        configOptions: []
      }
    });

    await expect(loadSessionPromise).resolves.toMatchObject({
      models: {
        currentModelId: "claude-default"
      },
      configOptions: []
    });
  });

  it("rejects initialize response with mismatched protocol version", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({
      protocolVersion: 1
    });
    const initializeRequest = transport.requests[0];

    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 2,
        agentCapabilities: {}
      }
    });

    await expect(initializePromise).rejects.toBeInstanceOf(
      ACPVersionMismatchError
    );
  });

  it("forwards session/update notifications to listeners", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const events: string[] = [];
    client.onSessionUpdate((params) => {
      events.push(`${params.sessionId}:${params.update.sessionUpdate}`);
    });

    transport.inject({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk"
        }
      }
    });

    expect(events).toEqual(["s1:agent_message_chunk"]);
  });

  it("sends session/set_model requests with modelId params", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({
      protocolVersion: 1
    });
    const initializeRequest = transport.requests[0];

    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {}
      }
    });
    await initializePromise;

    const setModelPromise = client.setModel({
      sessionId: "session-1",
      modelId: "gpt-5-mini"
    });
    const setModelRequest = transport.requests[1];

    expect(setModelRequest.method).toBe("session/set_model");
    expect(setModelRequest.params).toEqual({
      sessionId: "session-1",
      modelId: "gpt-5-mini"
    });

    transport.inject({
      jsonrpc: "2.0",
      id: setModelRequest.id,
      result: {}
    });

    await expect(setModelPromise).resolves.toBeUndefined();
  });

  it("rejects requests when transport send fails", async () => {
    const transport = new TestACPTransport();
    transport.shouldFailSend = true;
    const client = new ACPClient(transport);

    await expect(
      client.initialize({
        protocolVersion: 1
      })
    ).rejects.toThrow("transport send failed");
  });

  it("rejects pending requests on disconnect", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const pendingInitialize = client.initialize({
      protocolVersion: 1
    });
    await client.disconnect();

    await expect(pendingInitialize).rejects.toThrow(
      "ACP client disconnected while request was pending."
    );
  });

  it("clears session update listeners on disconnect", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);
    const listener = vi.fn();

    client.onSessionUpdate(listener);
    await client.disconnect();

    transport.inject({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk"
        }
      }
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("responds to session/request_permission with the selected option", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    client.setPermissionRequestHandler(async ({ sessionId, toolCall, options, requestId }) => {
      expect(sessionId).toBe("session-1");
      expect(toolCall.toolCallId).toBe("tool-1");
      expect(options.map((option) => option.optionId)).toEqual(["allow-once", "reject-once"]);
      expect(requestId).toBe(42);
      return {
        outcome: "selected",
        optionId: "allow-once"
      };
    });

    transport.inject({
      jsonrpc: "2.0",
      id: 42,
      method: "session/request_permission",
      params: {
        sessionId: "session-1",
        toolCall: {
          toolCallId: "tool-1",
          kind: "bash",
          rawInput: "npm test"
        },
        options: [
          {
            optionId: "allow-once",
            name: "Allow once",
            kind: "allow_once"
          },
          {
            optionId: "reject-once",
            name: "Reject once",
            kind: "reject_once"
          }
        ]
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.responses).toEqual([
      {
        jsonrpc: "2.0",
        id: 42,
        result: {
          outcome: {
            outcome: "selected",
            optionId: "allow-once"
          }
        }
      }
    ]);
  });
});
