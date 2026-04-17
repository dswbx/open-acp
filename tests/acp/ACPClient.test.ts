import { describe, expect, it, vi } from "vitest";
import {
  ACPClient,
  ACPVersionMismatchError
} from "../../src/core/acp/ACPClient.ts";
import { ACPTransport } from "../../src/core/acp/ACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest
} from "../../src/core/acp/ACPTypes.ts";

class TestACPTransport extends ACPTransport {
  readonly requests: ACPJsonRpcRequest[] = [];
  readonly notifications: ACPJsonRpcNotification[] = [];
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
});
