import { describe, expect, it } from "vitest";
import type { SessionUpdateListener } from "../../src/core/acp/ACPClient.ts";
import type {
  ACPInitializeParams,
  ACPInitializeResult,
  ACPSessionNewParams,
  ACPSessionNewResult,
  ACPSessionPromptParams,
  ACPSessionPromptResult
} from "../../src/core/acp/ACPTypes.ts";
import {
  RealAgentSmokeRunner,
  type RealAgentSmokeClientLike,
  type RealAgentSmokeOptions
} from "../../src/cli/RealAgentSmoke.ts";

class MockSmokeClient implements RealAgentSmokeClientLike {
  readonly calls: string[] = [];
  initializeParams?: ACPInitializeParams;
  createSessionParams?: ACPSessionNewParams;
  promptParams?: ACPSessionPromptParams;
  private sessionUpdateListener?: SessionUpdateListener;

  async connect(): Promise<void> {
    this.calls.push("connect");
  }

  async disconnect(): Promise<void> {
    this.calls.push("disconnect");
  }

  async initialize(params: ACPInitializeParams): Promise<ACPInitializeResult> {
    this.calls.push("initialize");
    this.initializeParams = params;
    return {
      protocolVersion: params.protocolVersion,
      agentCapabilities: {
        sessionCapabilities: {
          list: {}
        }
      }
    };
  }

  async createSession(params: ACPSessionNewParams): Promise<ACPSessionNewResult> {
    this.calls.push("createSession");
    this.createSessionParams = params;
    return {
      sessionId: "session-smoke-1"
    };
  }

  async prompt(params: ACPSessionPromptParams): Promise<ACPSessionPromptResult> {
    this.calls.push("prompt");
    this.promptParams = params;

    this.sessionUpdateListener?.({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "hello"
        }
      }
    });

    return {
      stopReason: "completed"
    };
  }

  onSessionUpdate(listener: SessionUpdateListener): void {
    this.sessionUpdateListener = listener;
  }

  offSessionUpdate(listener: SessionUpdateListener): void {
    if (this.sessionUpdateListener === listener) {
      this.sessionUpdateListener = undefined;
    }
  }
}

describe("RealAgentSmokeRunner", () => {
  it("parses CLI arguments", () => {
    const parsed = RealAgentSmokeRunner.parseArgs([
      "--cmd",
      "agent-binary",
      "--args",
      "--stdio --verbose",
      "--cwd",
      "./workspace",
      "--prompt",
      "hi",
      "--protocolVersion",
      "2"
    ]);

    expect(parsed).toEqual({
      cmd: "agent-binary",
      args: ["--stdio", "--verbose"],
      cwd: expect.stringMatching(/workspace$/u),
      prompt: "hi",
      protocolVersion: 2
    });
  });

  it("orchestrates initialize/session/prompt flow and logs session updates", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const mockClient = new MockSmokeClient();

    const runner = new RealAgentSmokeRunner({
      runtimeFactory: () => ({
        client: mockClient
      }),
      stdoutWriter: (line) => {
        stdout.push(line);
      },
      stderrWriter: (line) => {
        stderr.push(line);
      }
    });

    const options: RealAgentSmokeOptions = {
      cmd: "fake-agent",
      args: ["--stdio"],
      cwd: "/repo",
      prompt: "Hello smoke agent",
      protocolVersion: 1
    };

    await runner.run(options);

    expect(mockClient.calls).toEqual([
      "connect",
      "initialize",
      "createSession",
      "prompt",
      "disconnect"
    ]);

    expect(mockClient.initializeParams).toMatchObject({
      protocolVersion: 1
    });

    expect(mockClient.createSessionParams).toEqual({
      cwd: "/repo",
      mcpServers: []
    });

    expect(mockClient.promptParams).toEqual({
      sessionId: "session-smoke-1",
      prompt: [
        {
          type: "text",
          text: "Hello smoke agent"
        }
      ]
    });

    expect(
      stdout.some((line) =>
        line.includes("initialize.agentCapabilities")
      )
    ).toBe(true);
    expect(stdout).toContain("[smoke] sessionId session-smoke-1");
    expect(stdout.some((line) => line.includes("session/update"))).toBe(true);
    expect(stdout).toContain("[smoke] prompt.stopReason completed");
    expect(stderr).toEqual([]);
  });
});
