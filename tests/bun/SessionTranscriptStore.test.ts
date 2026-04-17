import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  sanitizeSessionId,
  SessionTranscriptStore
} from "../../src/bun/SessionTranscriptStore.ts";

const tempDirectories: string[] = [];

describe("SessionTranscriptStore", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      })
    );
  });

  it("writes append-only json lines under .acp/sessions/[sessionid]", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "acp-session-log-"));
    tempDirectories.push(cwd);
    const store = new SessionTranscriptStore();

    await Promise.all([
      store.appendRecord({
        cwd,
        sessionId: "session/1",
        record: {
          timestamp: "2026-04-17T00:00:00.000Z",
          type: "user_message",
          payload: {
            text: "Hello"
          }
        }
      }),
      store.appendRecord({
        cwd,
        sessionId: "session/1",
        record: {
          timestamp: "2026-04-17T00:00:01.000Z",
          type: "assistant_message",
          payload: {
            text: "Hi"
          }
        }
      })
    ]);

    const filePath = store.getSessionLogPath(cwd, "session/1");
    const contents = await readFile(filePath, "utf8");

    expect(filePath).toBe(
      path.join(cwd, ".acp", "sessions", sanitizeSessionId("session/1"), "messages.jsonl")
    );
    expect(contents.trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      {
        timestamp: "2026-04-17T00:00:00.000Z",
        type: "user_message",
        payload: {
          text: "Hello"
        }
      },
      {
        timestamp: "2026-04-17T00:00:01.000Z",
        type: "assistant_message",
        payload: {
          text: "Hi"
        }
      }
    ]);
  });
});
