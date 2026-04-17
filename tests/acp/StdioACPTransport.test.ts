import type {
  ChildProcessWithoutNullStreams,
  SpawnOptionsWithoutStdio
} from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { StdioACPTransport } from "../../src/core/acp/StdioACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse
} from "../../src/core/acp/ACPTypes.ts";

type SpawnImplementation = typeof import("node:child_process").spawn;

type FakeChildProcess = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};

function createFakeChildProcess(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal?: NodeJS.Signals | number) => {
    child.killed = true;
    child.signalCode = typeof signal === "string" ? signal : null;
    child.exitCode = child.signalCode ? null : 0;
    child.emit("exit", child.exitCode, child.signalCode);
    return true;
  };
  return child;
}

function createSpawnMock(
  child: FakeChildProcess
): ReturnType<typeof vi.fn<SpawnImplementation>> {
  return vi.fn(
    (
      _command: string,
      _args?: readonly string[],
      _options?: SpawnOptionsWithoutStdio
    ) => child as unknown as ChildProcessWithoutNullStreams
  );
}

describe("StdioACPTransport", () => {
  it("serializes outbound request, notification, and response as JSON lines", async () => {
    const child = createFakeChildProcess();
    const writes: string[] = [];
    child.stdin.on("data", (chunk: Buffer) => {
      writes.push(chunk.toString("utf8"));
    });

    const spawnMock = createSpawnMock(child);
    const transport = new StdioACPTransport("fake-agent", ["--stdio"], {
      cwd: "/workspace",
      env: { ACP_TEST: "1" },
      spawnImplementation: spawnMock as unknown as SpawnImplementation
    });

    await transport.connect();

    const request: ACPJsonRpcRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: 1 }
    };
    const notification: ACPJsonRpcNotification = {
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId: "session-1" }
    };
    const response: ACPJsonRpcResponse = {
      jsonrpc: "2.0",
      id: "approval-1",
      result: {
        outcome: {
          outcome: "selected",
          optionId: "allow-once"
        }
      }
    };

    await transport.sendRequest(request);
    await transport.sendNotification(notification);
    await transport.sendResponse(response);

    expect(spawnMock).toHaveBeenCalledWith("fake-agent", ["--stdio"], {
      cwd: "/workspace",
      env: { ACP_TEST: "1" },
      stdio: "pipe"
    });
    expect(writes.join("")).toBe(
      `${JSON.stringify(request)}\n${JSON.stringify(notification)}\n${JSON.stringify(response)}\n`
    );

    await transport.disconnect();
  });

  it("parses inbound messages from split stdout chunks", async () => {
    const child = createFakeChildProcess();
    const transport = new StdioACPTransport("fake-agent", [], {
      spawnImplementation: createSpawnMock(child) as unknown as SpawnImplementation
    });
    const received: ACPInboundMessage[] = [];
    transport.setMessageHandler((message) => {
      received.push(message);
    });

    await transport.connect();

    child.stdout.write('{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s');
    child.stdout.write('1","update":{"sessionUpdate":"agent_message_chunk"}}}\n');
      child.stdout.write('{"jsonrpc":"2.0","id":"approval-1","method":"session/request_permission","params":{"sessionId":"s1","toolCall":{"toolCallId":"tool-1"},"options":[]}}\n');
      child.stdout.write('{"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n');

    expect(received).toEqual([
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_message_chunk"
          }
        }
      },
      {
        jsonrpc: "2.0",
        id: "approval-1",
        method: "session/request_permission",
        params: {
          sessionId: "s1",
          toolCall: {
            toolCallId: "tool-1"
          },
          options: []
        }
      },
      {
        jsonrpc: "2.0",
        id: 7,
        result: {
          ok: true
        }
      }
    ]);

    await transport.disconnect();
  });

  it("ignores malformed JSON lines without throwing", async () => {
    const child = createFakeChildProcess();
    const transport = new StdioACPTransport("fake-agent", [], {
      spawnImplementation: createSpawnMock(child) as unknown as SpawnImplementation
    });
    const received: ACPInboundMessage[] = [];

    transport.setMessageHandler((message) => {
      received.push(message);
    });

    await transport.connect();

    expect(() => {
      child.stdout.write("{bad json}\n");
      child.stdout.write('{"jsonrpc":"2.0","id":"oops","result":{}}\n');
      child.stdout.write('{"jsonrpc":"2.0","id":9,"result":{"ok":true}}\n');
    }).not.toThrow();

    expect(received).toEqual([
      {
        jsonrpc: "2.0",
        id: "oops",
        result: {}
      },
      {
        jsonrpc: "2.0",
        id: 9,
        result: {
          ok: true
        }
      }
    ]);

    await transport.disconnect();
  });
});
