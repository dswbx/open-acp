import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sanitizeSessionId, SessionTranscriptStore } from "../../src/bun/SessionTranscriptStore.ts";

const tempDirectories: string[] = [];

describe("SessionTranscriptStore", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it("writes append-only json lines under .open-acp/sessions/[sessionid]", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "acp-session-log-"));
    tempDirectories.push(cwd);
    const homeRoot = path.join(cwd, ".open-acp");
    const store = new SessionTranscriptStore({ homeRoot });

    await Promise.all([
      store.appendRecord({
        cwd,
        sessionId: "session/1",
        record: {
          timestamp: "2026-04-17T00:00:00.000Z",
          type: "user_message",
          payload: {
            text: "Hello",
          },
        },
      }),
      store.appendRecord({
        cwd,
        sessionId: "session/1",
        record: {
          timestamp: "2026-04-17T00:00:01.000Z",
          type: "assistant_message",
          payload: {
            text: "Hi",
          },
        },
      }),
    ]);

    const filePath = store.getSessionLogPath(cwd, "session/1");
    const contents = await readFile(filePath, "utf8");

    expect(filePath).toBe(
      path.join(homeRoot, "sessions", sanitizeSessionId("session/1"), "messages.jsonl"),
    );
    expect(
      contents
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      {
        timestamp: "2026-04-17T00:00:00.000Z",
        type: "user_message",
        payload: {
          text: "Hello",
        },
      },
      {
        timestamp: "2026-04-17T00:00:01.000Z",
        type: "assistant_message",
        payload: {
          text: "Hi",
        },
      },
    ]);
  });

  it("writes replay metadata and event logs alongside messages", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "acp-session-log-"));
    tempDirectories.push(cwd);
    const store = new SessionTranscriptStore({ homeRoot: path.join(cwd, ".open-acp") });

    await store.writeMetadata({
      cwd,
      sessionId: "session/2",
      metadata: {
        fixtureName: "raw-recording",
        provider: "codex",
      },
    });
    await store.appendEvent({
      cwd,
      sessionId: "session/2",
      event: {
        type: "chatStreamEvent",
        payload: {
          kind: "session_ready",
          requestId: "request-1",
          provider: "codex",
          sessionId: "session/2",
          cwd: "/workspace/project",
          timestamp: "2026-04-17T00:00:00.000Z",
        },
      },
    });

    const metadataPath = store.getSessionMetadataPath(cwd, "session/2");
    const eventPath = store.getSessionEventLogPath(cwd, "session/2");

    await expect(readFile(metadataPath, "utf8")).resolves.toContain('"provider": "codex"');
    await expect(readFile(eventPath, "utf8")).resolves.toContain('"type":"chatStreamEvent"');
  });

  it("reads a recorded session from metadata, messages, and events", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "acp-session-log-"));
    tempDirectories.push(cwd);
    const store = new SessionTranscriptStore({ homeRoot: path.join(cwd, ".open-acp") });

    await store.writeMetadata({
      cwd,
      sessionId: "session/3",
      metadata: {
        schemaVersion: 1,
        provider: "codex",
        cwd: "/workspace/project",
        sessionId: "session/3",
      },
    });
    await store.appendRecord({
      cwd,
      sessionId: "session/3",
      record: {
        timestamp: "2026-04-17T00:00:01.000Z",
        type: "user_message",
        payload: {
          requestId: "request-1",
          provider: "codex",
          text: "Hello",
        },
      },
    });
    await store.appendEvent({
      cwd,
      sessionId: "session/3",
      event: {
        type: "agentTranscriptEvent",
        payload: {
          entryId: "entry-1",
          provider: "codex",
          sessionId: "session/3",
          direction: "outgoing",
          kind: "request",
          method: "session/prompt",
          requestId: 1,
          summary: "session/prompt",
          json: "{}",
          timestamp: "2026-04-17T00:00:02.000Z",
        },
      },
    });

    const recording = await store.readRecording(cwd, "session/3");

    expect(recording.metadata).toMatchObject({
      provider: "codex",
      cwd: "/workspace/project",
      sessionId: "session/3",
    });
    expect(recording.messages).toHaveLength(1);
    expect(recording.messages[0]?.payload.text).toBe("Hello");
    expect(recording.events).toHaveLength(1);
    expect(recording.events[0]?.type).toBe("agentTranscriptEvent");
  });

  it("lists valid stored sessions sorted newest first", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "acp-session-list-"));
    tempDirectories.push(cwd);
    const homeRoot = path.join(cwd, ".open-acp");
    const store = new SessionTranscriptStore({ homeRoot });

    await writeStoredMetadata(homeRoot, "session-old", {
      provider: "codex",
      cwd: "/workspace/old",
      sessionId: "session-old",
      model: "gpt-5.1-codex",
      mode: "build",
      recordedAt: "2026-04-17T00:00:00.000Z",
    });
    await writeStoredMetadata(homeRoot, "session-new", {
      provider: "claude",
      cwd: "/workspace/new",
      sessionId: "session-new",
      mode: "plan",
      recordedAt: "2026-04-18T00:00:00.000Z",
    });

    await expect(store.listStoredSessions()).resolves.toEqual({
      sessions: [
        {
          sessionId: "session-new",
          provider: "claude",
          cwd: "/workspace/new",
          mode: "plan",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
        {
          sessionId: "session-old",
          provider: "codex",
          cwd: "/workspace/old",
          model: "gpt-5.1-codex",
          mode: "build",
          updatedAt: "2026-04-17T00:00:00.000Z",
        },
      ],
    });
  });

  it("skips malformed and incomplete stored session metadata", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "acp-session-list-"));
    tempDirectories.push(cwd);
    const homeRoot = path.join(cwd, ".open-acp");
    const store = new SessionTranscriptStore({ homeRoot });

    await writeStoredMetadata(homeRoot, "valid-session", {
      provider: "opencode",
      cwd: "/workspace/project",
      sessionId: "valid-session",
      recordedAt: "2026-04-18T00:00:00.000Z",
    });
    await writeStoredMetadata(homeRoot, "missing-provider", {
      cwd: "/workspace/project",
      sessionId: "missing-provider",
      recordedAt: "2026-04-18T00:00:01.000Z",
    });
    await writeStoredMetadata(homeRoot, "unknown-provider", {
      provider: "provider-x",
      cwd: "/workspace/project",
      sessionId: "unknown-provider",
      recordedAt: "2026-04-18T00:00:02.000Z",
    });
    await writeStoredMetadataText(homeRoot, "malformed", "{not-json");

    await expect(store.listStoredSessions()).resolves.toEqual({
      sessions: [
        {
          sessionId: "valid-session",
          provider: "opencode",
          cwd: "/workspace/project",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
      ],
    });
  });

  it("returns an empty list when the home sessions directory is absent", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "acp-session-list-empty-"));
    tempDirectories.push(cwd);
    const store = new SessionTranscriptStore({ homeRoot: path.join(cwd, ".open-acp") });

    await expect(store.listStoredSessions()).resolves.toEqual({ sessions: [] });
  });
});

async function writeStoredMetadata(
  homeRoot: string,
  sessionId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await writeStoredMetadataText(homeRoot, sessionId, JSON.stringify(metadata));
}

async function writeStoredMetadataText(
  homeRoot: string,
  sessionId: string,
  text: string,
): Promise<void> {
  const sessionDirectory = path.join(homeRoot, "sessions", sanitizeSessionId(sessionId));
  await mkdir(sessionDirectory, { recursive: true });
  await writeFile(path.join(sessionDirectory, "metadata.json"), text, "utf8");
}
