import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportReplayFixture } from "../../src/e2e/exportReplayFixture.ts";

const tempDirectories: string[] = [];

describe("exportReplayFixture", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("sanitizes a raw recorded session into a checked-in replay fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "replay-export-"));
    const inputDirectory = path.join(root, "input");
    const outputDirectory = path.join(root, "output");
    tempDirectories.push(root);

    await mkdir(inputDirectory, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });

    await writeFile(
      path.join(inputDirectory, "metadata.json"),
      JSON.stringify(
        {
          provider: "codex",
          cwd: `${os.homedir()}/Projects/demo`,
          sessionId: "session/real-1",
          model: "gpt-5.4/high"
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      path.join(inputDirectory, "events.jsonl"),
      [
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "session_ready",
            requestId: "request-real-1",
            provider: "codex",
            sessionId: "session/real-1",
            cwd: `${os.homedir()}/Projects/demo`,
            timestamp: "2026-04-17T00:00:00.000Z"
          }
        }),
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "agent_complete",
            requestId: "request-real-1",
            provider: "codex",
            sessionId: "session/real-1",
            cwd: `${os.homedir()}/Projects/demo`,
            stopReason: "end_turn",
            timestamp: "2026-04-17T00:00:00.300Z"
          }
        })
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(inputDirectory, "messages.jsonl"),
      JSON.stringify({
        timestamp: "2026-04-17T00:00:00.000Z",
        type: "user_message",
        payload: {
          text: "Summarize the workspace status."
        }
      }),
      "utf8"
    );

    const result = await exportReplayFixture({
      inputDirectory,
      outputDirectory,
      fixtureName: "exported-demo"
    });

    expect(result.metadata.fixtureName).toBe("exported-demo");
    expect(result.metadata.sessions[0]?.sessionId).toBe("session-1");
    expect(result.metadata.sessions[0]?.cwd).toBe("/workspace/project");
    expect(result.events[1]?.delayMs).toBe(300);

    const writtenMetadata = await readFile(
      path.join(outputDirectory, "metadata.json"),
      "utf8"
    );
    expect(writtenMetadata).toContain("\"fixtureName\": \"exported-demo\"");
    expect(writtenMetadata).toContain("\"cwd\": \"/workspace/project\"");
  });
});
