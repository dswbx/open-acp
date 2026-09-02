# Tool Call Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-only mainview route that displays all recorded `.acp` tool calls without starting or prompting an agent.

**Architecture:** Add a thin Vite dev endpoint that delegates `.acp` scanning to a focused Bun-side reader, then render the returned records through a feature-owned mainview gallery. Keep the existing desktop app as the default route and reuse `formatToolPresentation` plus `CompactToolCall` so improvements apply to the real chat surface.

**Tech Stack:** Bun, Vite dev middleware, React 19, TypeScript, Vitest, shadcn components, existing mainview CSS/theme.

---

## File Structure

- Create: `src/shared/toolCallGallery.ts`
  - Shared request/response types used by Vite middleware and mainview UI.
- Create: `src/bun/toolCallGalleryStore.ts`
  - Filesystem reader for `.acp/sessions`, JSONL parsing, warning collection, and tool-call merge logic.
- Modify: `vite.config.ts`
  - Add `/__open-acp/tool-calls` middleware next to the existing session recording endpoint.
- Create: `src/mainview/app/mainviewRoute.ts`
  - Tiny pure route selector for `?view=tool-calls`.
- Modify: `src/mainview/main.tsx`
  - Render `ToolCallGalleryApp` for the route and keep `App` as default.
- Create: `src/mainview/features/tool-calls/toolCallGalleryModel.ts`
  - Client-side conversion to `ChatToolCall`, sorting, filter options, and filter application.
- Create: `src/mainview/features/tool-calls/ToolCallGallery.tsx`
  - Fetching container and presentational gallery view.
- Create: `src/mainview/features/tool-calls/index.ts`
  - Feature exports.
- Create: `tests/bun/toolCallGalleryStore.test.ts`
  - Reader and merge coverage.
- Create: `tests/ui/mainviewRoute.test.ts`
  - Query route coverage.
- Create: `tests/ui/toolCallGalleryModel.test.ts`
  - Filter and conversion coverage.
- Create: `tests/ui/ToolCallGallery.test.tsx`
  - Static render coverage for the gallery view.
- Modify: `tests/ui/viteConfig.test.ts`
  - Assert the dev plugin still exists and carries both local recording/gallery endpoints.

## Task 1: Shared Types And Recorded Tool-Call Reader

**Files:**

- Create: `src/shared/toolCallGallery.ts`
- Create: `src/bun/toolCallGalleryStore.ts`
- Test: `tests/bun/toolCallGalleryStore.test.ts`

- [ ] **Step 1: Write the failing reader test**

Create `tests/bun/toolCallGalleryStore.test.ts`:

```ts
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRecordedToolCalls } from "../../src/bun/toolCallGalleryStore.ts";

async function createSession(
  root: string,
  sessionId: string,
  params: {
    metadata?: Record<string, unknown>;
    eventLines: string[];
  },
): Promise<void> {
  const sessionDir = path.join(root, ".acp", "sessions", sessionId);
  await mkdir(sessionDir, { recursive: true });
  if (params.metadata) {
    await writeFile(
      path.join(sessionDir, "metadata.json"),
      JSON.stringify(params.metadata),
      "utf8",
    );
  }
  await writeFile(
    path.join(sessionDir, "events.jsonl"),
    `${params.eventLines.join("\n")}\n`,
    "utf8",
  );
}

describe("readRecordedToolCalls", () => {
  it("merges tool call updates while preserving input from the first event", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-"));
    await createSession(root, "session-a", {
      metadata: {
        provider: "codex",
        cwd: "/workspace/project",
        sessionId: "session-a",
      },
      eventLines: [
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "tool_call",
            requestId: "request-a",
            provider: "codex",
            sessionId: "session-a",
            cwd: "/workspace/project",
            toolCallId: "tool-1",
            toolTitle: "Read package.json",
            toolKind: "read",
            toolState: "input-available",
            input: { file_path: "/workspace/project/package.json" },
            timestamp: "2026-04-24T09:00:00.000Z",
          },
        }),
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "tool_call_update",
            requestId: "request-a",
            provider: "codex",
            sessionId: "session-a",
            cwd: "/workspace/project",
            toolCallId: "tool-1",
            toolState: "output-available",
            output: '{ "name": "open-acp" }',
            timestamp: "2026-04-24T09:00:02.000Z",
          },
        }),
      ],
    });

    const result = await readRecordedToolCalls(root);

    expect(result.sessions).toEqual([
      {
        sessionId: "session-a",
        provider: "codex",
        cwd: "/workspace/project",
        eventCount: 2,
        toolCallCount: 1,
      },
    ]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      sessionId: "session-a",
      requestId: "request-a",
      provider: "codex",
      cwd: "/workspace/project",
      toolCallId: "tool-1",
      toolTitle: "Read package.json",
      toolKind: "read",
      toolState: "output-available",
      input: { file_path: "/workspace/project/package.json" },
      output: '{ "name": "open-acp" }',
      firstTimestamp: "2026-04-24T09:00:00.000Z",
      timestamp: "2026-04-24T09:00:02.000Z",
      eventCount: 2,
      sourcePath: path.join(root, ".acp", "sessions", "session-a", "events.jsonl"),
    });
    expect(result.warnings).toEqual([]);
  });

  it("returns an empty result when .acp sessions are absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-empty-"));

    await expect(readRecordedToolCalls(root)).resolves.toEqual({
      generatedAt: expect.any(String),
      sessions: [],
      toolCalls: [],
      warnings: [],
    });
  });

  it("skips malformed JSON lines and keeps unknown provider data readable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-warning-"));
    await createSession(root, "session-b", {
      metadata: {
        provider: "provider-x",
        cwd: "/workspace/other",
      },
      eventLines: [
        "{not-json",
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "tool_call_update",
            sessionId: "session-b",
            toolCallId: "tool-2",
            toolState: "output-error",
            errorText: "failed",
            timestamp: "2026-04-24T09:01:00.000Z",
          },
        }),
      ],
    });

    const result = await readRecordedToolCalls(root);

    expect(result.toolCalls[0]).toMatchObject({
      sessionId: "session-b",
      provider: "provider-x",
      cwd: "/workspace/other",
      toolCallId: "tool-2",
      toolState: "output-error",
      errorText: "failed",
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        sessionId: "session-b",
        lineNumber: 1,
        message: expect.stringContaining("Invalid JSON"),
      }),
    ]);

    const eventText = await readFile(
      path.join(root, ".acp", "sessions", "session-b", "events.jsonl"),
      "utf8",
    );
    expect(eventText).toContain("tool_call_update");
  });
});
```

- [ ] **Step 2: Run the reader test and verify it fails**

Run:

```bash
bun run test -- tests/bun/toolCallGalleryStore.test.ts
```

Expected: FAIL because `src/bun/toolCallGalleryStore.ts` does not exist.

- [ ] **Step 3: Add shared response types**

Create `src/shared/toolCallGallery.ts`:

```ts
export interface ToolCallGalleryWarning {
  sessionId?: string;
  sourcePath?: string;
  lineNumber?: number;
  message: string;
}

export interface ToolCallGallerySession {
  sessionId: string;
  provider?: string;
  cwd?: string;
  eventCount: number;
  toolCallCount: number;
}

export interface RecordedToolCallGalleryItem {
  sessionId: string;
  requestId?: string;
  provider?: string;
  cwd?: string;
  toolCallId: string;
  toolTitle?: string;
  toolKind?: string;
  toolState?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  firstTimestamp?: string;
  timestamp: string;
  eventCount: number;
  sourcePath: string;
}

export interface ToolCallGalleryResponse {
  generatedAt: string;
  sessions: ToolCallGallerySession[];
  toolCalls: RecordedToolCallGalleryItem[];
  warnings: ToolCallGalleryWarning[];
}
```

- [ ] **Step 4: Implement the reader**

Create `src/bun/toolCallGalleryStore.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  RecordedToolCallGalleryItem,
  ToolCallGalleryResponse,
  ToolCallGallerySession,
  ToolCallGalleryWarning,
} from "../shared/toolCallGallery.ts";

type JsonRecord = Record<string, unknown>;

interface ParsedSessionMetadata {
  provider?: string;
  cwd?: string;
  sessionId?: string;
}

interface ToolCallPayload {
  requestId?: string;
  provider?: string;
  sessionId?: string;
  cwd?: string;
  toolCallId?: string;
  toolTitle?: string;
  toolKind?: string;
  toolState?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  timestamp?: string;
}

export async function readRecordedToolCalls(cwd: string): Promise<ToolCallGalleryResponse> {
  const sessionsRoot = path.join(cwd, ".acp", "sessions");
  const sessionNames = await readdir(sessionsRoot).catch((error: unknown) => {
    if (isFileNotFoundError(error)) return [];
    throw error;
  });

  const warnings: ToolCallGalleryWarning[] = [];
  const sessions: ToolCallGallerySession[] = [];
  const toolCalls: RecordedToolCallGalleryItem[] = [];

  for (const sessionDirectoryName of sessionNames.sort((left, right) =>
    left.localeCompare(right),
  )) {
    const sessionDirectory = path.join(sessionsRoot, sessionDirectoryName);
    const metadata = await readMetadata(sessionDirectory, sessionDirectoryName, warnings);
    const sourcePath = path.join(sessionDirectory, "events.jsonl");
    const eventsText = await readFile(sourcePath, "utf8").catch((error: unknown) => {
      if (isFileNotFoundError(error)) return "";
      throw error;
    });
    const merged = new Map<string, RecordedToolCallGalleryItem>();
    let eventCount = 0;

    eventsText.split(/\r?\n/u).forEach((line, index) => {
      if (line.trim().length === 0) return;
      const parsed = parseJsonLine(line, {
        sessionId: metadata.sessionId ?? sessionDirectoryName,
        sourcePath,
        lineNumber: index + 1,
        warnings,
      });
      if (!parsed) return;
      eventCount += 1;
      const payload = getToolCallPayload(parsed);
      if (!payload?.toolCallId) return;

      const sessionId = payload.sessionId ?? metadata.sessionId ?? sessionDirectoryName;
      const key = `${sessionId}:${payload.toolCallId}`;
      merged.set(
        key,
        mergeToolCall(merged.get(key), payload, {
          sessionId,
          provider: payload.provider ?? metadata.provider,
          cwd: payload.cwd ?? metadata.cwd,
          sourcePath,
        }),
      );
    });

    const sessionToolCalls = [...merged.values()].sort(compareToolCalls);
    toolCalls.push(...sessionToolCalls);
    sessions.push({
      sessionId: metadata.sessionId ?? sessionDirectoryName,
      provider: metadata.provider,
      cwd: metadata.cwd,
      eventCount,
      toolCallCount: sessionToolCalls.length,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sessions,
    toolCalls: toolCalls.sort(compareToolCalls),
    warnings,
  };
}

async function readMetadata(
  sessionDirectory: string,
  fallbackSessionId: string,
  warnings: ToolCallGalleryWarning[],
): Promise<ParsedSessionMetadata> {
  const sourcePath = path.join(sessionDirectory, "metadata.json");
  const text = await readFile(sourcePath, "utf8").catch((error: unknown) => {
    if (isFileNotFoundError(error)) return "";
    throw error;
  });
  if (text.length === 0) return { sessionId: fallbackSessionId };

  try {
    const parsed = JSON.parse(text) as JsonRecord;
    return {
      provider: getString(parsed.provider),
      cwd: getString(parsed.cwd),
      sessionId: getString(parsed.sessionId) ?? fallbackSessionId,
    };
  } catch (error) {
    warnings.push({
      sessionId: fallbackSessionId,
      sourcePath,
      message:
        error instanceof Error
          ? `Invalid metadata JSON: ${error.message}`
          : "Invalid metadata JSON.",
    });
    return { sessionId: fallbackSessionId };
  }
}

function parseJsonLine(
  line: string,
  params: {
    sessionId: string;
    sourcePath: string;
    lineNumber: number;
    warnings: ToolCallGalleryWarning[];
  },
): JsonRecord | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch (error) {
    params.warnings.push({
      sessionId: params.sessionId,
      sourcePath: params.sourcePath,
      lineNumber: params.lineNumber,
      message:
        error instanceof Error ? `Invalid JSON line: ${error.message}` : "Invalid JSON line.",
    });
    return undefined;
  }
}

function getToolCallPayload(event: JsonRecord): ToolCallPayload | undefined {
  if (event.type !== "chatStreamEvent" || !isRecord(event.payload)) return undefined;
  const payload = event.payload;
  if (payload.kind !== "tool_call" && payload.kind !== "tool_call_update") return undefined;
  return {
    requestId: getString(payload.requestId),
    provider: getString(payload.provider),
    sessionId: getString(payload.sessionId),
    cwd: getString(payload.cwd),
    toolCallId: getString(payload.toolCallId),
    toolTitle: getString(payload.toolTitle),
    toolKind: getString(payload.toolKind),
    toolState: getString(payload.toolState),
    input: payload.input,
    output: payload.output,
    errorText: getString(payload.errorText),
    timestamp: getString(payload.timestamp),
  };
}

function mergeToolCall(
  current: RecordedToolCallGalleryItem | undefined,
  payload: ToolCallPayload,
  fallback: {
    sessionId: string;
    provider?: string;
    cwd?: string;
    sourcePath: string;
  },
): RecordedToolCallGalleryItem {
  const timestamp = payload.timestamp ?? current?.timestamp ?? new Date(0).toISOString();
  return {
    sessionId: fallback.sessionId,
    requestId: payload.requestId ?? current?.requestId,
    provider: payload.provider ?? current?.provider ?? fallback.provider,
    cwd: payload.cwd ?? current?.cwd ?? fallback.cwd,
    toolCallId: payload.toolCallId ?? current?.toolCallId ?? "unknown-tool-call",
    toolTitle: payload.toolTitle ?? current?.toolTitle,
    toolKind: payload.toolKind ?? current?.toolKind,
    toolState: payload.toolState ?? current?.toolState,
    input: payload.input ?? current?.input,
    output: payload.output ?? current?.output,
    errorText: payload.errorText ?? current?.errorText,
    firstTimestamp: current?.firstTimestamp ?? payload.timestamp ?? timestamp,
    timestamp,
    eventCount: (current?.eventCount ?? 0) + 1,
    sourcePath: fallback.sourcePath,
  };
}

function compareToolCalls(
  left: RecordedToolCallGalleryItem,
  right: RecordedToolCallGalleryItem,
): number {
  return (
    right.timestamp.localeCompare(left.timestamp) || left.toolCallId.localeCompare(right.toolCallId)
  );
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
```

- [ ] **Step 5: Run the reader test and commit**

Run:

```bash
bun run test -- tests/bun/toolCallGalleryStore.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/shared/toolCallGallery.ts src/bun/toolCallGalleryStore.ts tests/bun/toolCallGalleryStore.test.ts
git commit -m "feat: read recorded tool calls"
```

## Task 2: Vite Dev Endpoint

**Files:**

- Modify: `vite.config.ts`
- Modify: `tests/ui/viteConfig.test.ts`

- [ ] **Step 1: Write the failing Vite config test**

Update `tests/ui/viteConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";

describe("vite config", () => {
  it("uses a relative asset base for packaged desktop builds", () => {
    expect(viteConfig.base).toBe("./");
  });

  it("registers local dev endpoints for recorded sessions and tool calls", () => {
    const pluginNames = Array.isArray(viteConfig.plugins)
      ? viteConfig.plugins
          .flat()
          .map((plugin) => (plugin && "name" in plugin ? plugin.name : undefined))
      : [];

    expect(pluginNames).toContain("open-acp-session-recording");
    expect(pluginNames).toContain("open-acp-tool-call-gallery");
  });
});
```

- [ ] **Step 2: Run the Vite config test and verify it fails**

Run:

```bash
bun run test -- tests/ui/viteConfig.test.ts
```

Expected: FAIL because `open-acp-tool-call-gallery` is not registered.

- [ ] **Step 3: Add the middleware plugin**

Modify `vite.config.ts`:

```ts
import { readRecordedToolCalls } from "./src/bun/toolCallGalleryStore.ts";
```

Add a second plugin object after `open-acp-session-recording`:

```ts
    {
      name: "open-acp-tool-call-gallery",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/__open-acp/tool-calls", async (_request, response) => {
          try {
            const toolCalls = await readRecordedToolCalls(process.cwd());
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify(toolCalls));
          } catch (error) {
            response.statusCode = 500;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(
              JSON.stringify({
                generatedAt: new Date().toISOString(),
                sessions: [],
                toolCalls: [],
                warnings: [
                  {
                    message:
                      error instanceof Error
                        ? error.message
                        : "Failed to read recorded tool calls.",
                  },
                ],
              }),
            );
          }
        });
      },
    },
```

- [ ] **Step 4: Run the endpoint-related tests and commit**

Run:

```bash
bun run test -- tests/ui/viteConfig.test.ts tests/bun/toolCallGalleryStore.test.ts
```

Expected: PASS.

Commit:

```bash
git add vite.config.ts tests/ui/viteConfig.test.ts
git commit -m "feat: expose recorded tool call endpoint"
```

## Task 3: Mainview Route Selection

**Files:**

- Create: `src/mainview/app/mainviewRoute.ts`
- Modify: `src/mainview/main.tsx`
- Test: `tests/ui/mainviewRoute.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `tests/ui/mainviewRoute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMainviewRoute } from "../../src/mainview/app/mainviewRoute.ts";

describe("getMainviewRoute", () => {
  it("selects the tool-call gallery only for the explicit query view", () => {
    expect(getMainviewRoute(new URL("http://localhost:5173/?view=tool-calls"))).toBe("tool-calls");
    expect(getMainviewRoute(new URL("http://localhost:5173/?view=app"))).toBe("app");
    expect(getMainviewRoute(new URL("http://localhost:5173/"))).toBe("app");
  });
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run:

```bash
bun run test -- tests/ui/mainviewRoute.test.ts
```

Expected: FAIL because `mainviewRoute.ts` does not exist.

- [ ] **Step 3: Add the route helper**

Create `src/mainview/app/mainviewRoute.ts`:

```ts
export type MainviewRoute = "app" | "tool-calls";

export function getMainviewRoute(location: Pick<Location, "search"> | URL): MainviewRoute {
  const params = new URLSearchParams(location.search);
  return params.get("view") === "tool-calls" ? "tool-calls" : "app";
}
```

- [ ] **Step 4: Wire `main.tsx` to the route**

Modify `src/mainview/main.tsx`:

```ts
import { getMainviewRoute } from "./app/mainviewRoute.ts";
import { ToolCallGalleryApp } from "./features/tool-calls/index.ts";
```

Inside the render call, select the component:

```tsx
const route = getMainviewRoute(window.location);
const appElement =
  route === "tool-calls" ? <ToolCallGalleryApp /> : <App smokeBridge={smokeBridge} />;

ReactDOM.createRoot(appRootElement).render(<React.StrictMode>{appElement}</React.StrictMode>);
```

This step intentionally references `ToolCallGalleryApp` before the feature exists. Task 4 adds it.

- [ ] **Step 5: Run the route test and note the expected partial state**

Run:

```bash
bun run test -- tests/ui/mainviewRoute.test.ts
```

Expected: PASS for the pure helper. Full typecheck will fail until Task 4 creates `ToolCallGalleryApp`.

Do not commit yet; commit after Task 4 when imports resolve.

## Task 4: Gallery Model And UI

**Files:**

- Create: `src/mainview/features/tool-calls/toolCallGalleryModel.ts`
- Create: `src/mainview/features/tool-calls/ToolCallGallery.tsx`
- Create: `src/mainview/features/tool-calls/index.ts`
- Test: `tests/ui/toolCallGalleryModel.test.ts`
- Test: `tests/ui/ToolCallGallery.test.tsx`
- Modify: `src/mainview/main.tsx`

- [ ] **Step 1: Write the failing model test**

Create `tests/ui/toolCallGalleryModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildToolCallGalleryFilters,
  filterToolCallGalleryItems,
  toChatToolCall,
} from "../../src/mainview/features/tool-calls/toolCallGalleryModel.ts";
import type { RecordedToolCallGalleryItem } from "../../src/shared/toolCallGallery.ts";

const items: RecordedToolCallGalleryItem[] = [
  {
    sessionId: "session-a",
    requestId: "request-a",
    provider: "codex",
    cwd: "/workspace/project",
    toolCallId: "tool-1",
    toolTitle: "Read package.json",
    toolKind: "read",
    toolState: "output-available",
    input: { file_path: "/workspace/project/package.json" },
    output: "ok",
    firstTimestamp: "2026-04-24T09:00:00.000Z",
    timestamp: "2026-04-24T09:00:02.000Z",
    eventCount: 2,
    sourcePath: "/workspace/project/.acp/sessions/session-a/events.jsonl",
  },
  {
    sessionId: "session-b",
    provider: "qwen",
    cwd: "/workspace/project",
    toolCallId: "tool-2",
    toolKind: "search",
    toolState: "input-streaming",
    timestamp: "2026-04-24T09:00:03.000Z",
    eventCount: 1,
    sourcePath: "/workspace/project/.acp/sessions/session-b/events.jsonl",
  },
];

describe("toolCallGalleryModel", () => {
  it("builds sorted filter options from recorded items", () => {
    expect(buildToolCallGalleryFilters(items)).toEqual({
      providers: ["codex", "qwen"],
      sessions: ["session-a", "session-b"],
      kinds: ["read", "search"],
      states: ["input-streaming", "output-available"],
    });
  });

  it("filters by provider, session, kind, state, and text query", () => {
    expect(
      filterToolCallGalleryItems(items, {
        provider: "codex",
        sessionId: "all",
        kind: "read",
        state: "output-available",
        query: "package",
      }).map((item) => item.toolCallId),
    ).toEqual(["tool-1"]);
  });

  it("converts recorded items into ChatToolCall values with presentation titles", () => {
    expect(toChatToolCall(items[0])).toMatchObject({
      toolCallId: "tool-1",
      title: "Read package.json",
      kind: "read",
      state: "output-available",
      input: { file_path: "/workspace/project/package.json" },
      output: "ok",
      timestamp: "2026-04-24T09:00:02.000Z",
    });
  });
});
```

- [ ] **Step 2: Write the failing gallery view test**

Create `tests/ui/ToolCallGallery.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolCallGalleryView } from "../../src/mainview/features/tool-calls/ToolCallGallery.tsx";
import type { ToolCallGalleryResponse } from "../../src/shared/toolCallGallery.ts";

const response: ToolCallGalleryResponse = {
  generatedAt: "2026-04-24T09:02:00.000Z",
  sessions: [
    {
      sessionId: "session-a",
      provider: "codex",
      cwd: "/workspace/project",
      eventCount: 2,
      toolCallCount: 1,
    },
  ],
  toolCalls: [
    {
      sessionId: "session-a",
      requestId: "request-a",
      provider: "codex",
      cwd: "/workspace/project",
      toolCallId: "tool-1",
      toolTitle: "Read package.json",
      toolKind: "read",
      toolState: "output-available",
      input: { file_path: "/workspace/project/package.json" },
      output: "ok",
      firstTimestamp: "2026-04-24T09:00:00.000Z",
      timestamp: "2026-04-24T09:00:02.000Z",
      eventCount: 2,
      sourcePath: "/workspace/project/.acp/sessions/session-a/events.jsonl",
    },
  ],
  warnings: [],
};

describe("ToolCallGalleryView", () => {
  it("renders recorded tool calls and summary metadata", () => {
    const html = renderToStaticMarkup(<ToolCallGalleryView data={response} />);

    expect(html).toContain("Tool calls");
    expect(html).toContain("1 call");
    expect(html).toContain("1 session");
    expect(html).toContain("Read package.json");
    expect(html).toContain("codex");
    expect(html).toContain("output-available");
  });

  it("renders an empty state when no calls are available", () => {
    const html = renderToStaticMarkup(
      <ToolCallGalleryView
        data={{ generatedAt: response.generatedAt, sessions: [], toolCalls: [], warnings: [] }}
      />,
    );

    expect(html).toContain("No recorded tool calls");
  });
});
```

- [ ] **Step 3: Run UI tests and verify they fail**

Run:

```bash
bun run test -- tests/ui/toolCallGalleryModel.test.ts tests/ui/ToolCallGallery.test.tsx
```

Expected: FAIL because the feature files do not exist.

- [ ] **Step 4: Implement the model**

Create `src/mainview/features/tool-calls/toolCallGalleryModel.ts`:

```ts
import type { ChatToolCall } from "../../chat/types.ts";
import { formatToolPresentation } from "../../chat/toolPresentation.ts";
import type { RecordedToolCallGalleryItem } from "../../../shared/toolCallGallery.ts";
import type { ChatToolCallState } from "../../../shared/AppRPC.ts";

export interface ToolCallGalleryFilters {
  provider: string;
  sessionId: string;
  kind: string;
  state: string;
  query: string;
}

export interface ToolCallGalleryFilterOptions {
  providers: string[];
  sessions: string[];
  kinds: string[];
  states: string[];
}

export const DEFAULT_TOOL_CALL_GALLERY_FILTERS: ToolCallGalleryFilters = {
  provider: "all",
  sessionId: "all",
  kind: "all",
  state: "all",
  query: "",
};

export function buildToolCallGalleryFilters(
  items: readonly RecordedToolCallGalleryItem[],
): ToolCallGalleryFilterOptions {
  return {
    providers: collectOptions(items.map((item) => item.provider)),
    sessions: collectOptions(items.map((item) => item.sessionId)),
    kinds: collectOptions(items.map((item) => item.toolKind)),
    states: collectOptions(items.map((item) => item.toolState)),
  };
}

export function filterToolCallGalleryItems(
  items: readonly RecordedToolCallGalleryItem[],
  filters: ToolCallGalleryFilters,
): RecordedToolCallGalleryItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.provider !== "all" && item.provider !== filters.provider) return false;
    if (filters.sessionId !== "all" && item.sessionId !== filters.sessionId) return false;
    if (filters.kind !== "all" && item.toolKind !== filters.kind) return false;
    if (filters.state !== "all" && item.toolState !== filters.state) return false;
    if (!query) return true;
    return searchableText(item).toLowerCase().includes(query);
  });
}

export function toChatToolCall(item: RecordedToolCallGalleryItem): ChatToolCall {
  const state = toChatToolCallState(item.toolState);
  const presentation = formatToolPresentation({
    toolCallId: item.toolCallId,
    toolTitle: item.toolTitle,
    toolKind: item.toolKind,
    state,
    input: item.input,
    output: item.output,
    errorText: item.errorText,
  });
  return {
    toolCallId: item.toolCallId,
    title: presentation.title,
    subtitle: presentation.subtitle,
    shimmerPrefix: presentation.shimmerPrefix,
    rawTitle: item.toolTitle,
    kind: item.toolKind,
    state,
    input: item.input,
    output: item.output,
    errorText: item.errorText,
    timestamp: item.timestamp,
  };
}

function collectOptions(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function toChatToolCallState(value: string | undefined): ChatToolCallState {
  if (
    value === "approval-requested" ||
    value === "approval-responded" ||
    value === "input-available" ||
    value === "input-streaming" ||
    value === "output-available" ||
    value === "output-denied" ||
    value === "output-error"
  ) {
    return value;
  }
  return "output-available";
}

function searchableText(item: RecordedToolCallGalleryItem): string {
  return [
    item.sessionId,
    item.requestId,
    item.provider,
    item.cwd,
    item.toolCallId,
    item.toolTitle,
    item.toolKind,
    item.toolState,
    item.errorText,
    item.sourcePath,
  ]
    .filter(Boolean)
    .join(" ");
}
```

- [ ] **Step 5: Implement the gallery component**

Create `src/mainview/features/tool-calls/ToolCallGallery.tsx`:

```tsx
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, RefreshCw } from "lucide-react";
import { CompactToolCall } from "../../components/CompactToolCall.tsx";
import type {
  RecordedToolCallGalleryItem,
  ToolCallGalleryResponse,
} from "../../../shared/toolCallGallery.ts";
import {
  DEFAULT_TOOL_CALL_GALLERY_FILTERS,
  buildToolCallGalleryFilters,
  filterToolCallGalleryItems,
  toChatToolCall,
  type ToolCallGalleryFilters,
} from "./toolCallGalleryModel.ts";

const TOOL_CALL_ENDPOINT = "/__open-acp/tool-calls";

export function ToolCallGalleryApp(): React.ReactElement {
  const [data, setData] = React.useState<ToolCallGalleryResponse | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await fetch(TOOL_CALL_ENDPOINT);
      if (!response.ok) {
        throw new Error(`Failed to load recorded tool calls: ${response.status}`);
      }
      setData((await response.json()) as ToolCallGalleryResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load recorded tool calls.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && !data) {
    return <ToolCallGalleryShell>Loading recorded tool calls...</ToolCallGalleryShell>;
  }

  if (error && !data) {
    return (
      <ToolCallGalleryShell>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="size-4" />
          <span>{error}</span>
        </div>
        <Button className="mt-4" onClick={() => void load()} type="button" variant="outline">
          <RefreshCw className="size-4" />
          Reload
        </Button>
      </ToolCallGalleryShell>
    );
  }

  return (
    <ToolCallGalleryView data={data ?? emptyResponse()} isRefreshing={isLoading} onRefresh={load} />
  );
}

export function ToolCallGalleryView({
  data,
  isRefreshing = false,
  onRefresh,
}: {
  data: ToolCallGalleryResponse;
  isRefreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
}): React.ReactElement {
  const [filters, setFilters] = React.useState<ToolCallGalleryFilters>(
    DEFAULT_TOOL_CALL_GALLERY_FILTERS,
  );
  const filterOptions = React.useMemo(
    () => buildToolCallGalleryFilters(data.toolCalls),
    [data.toolCalls],
  );
  const visibleItems = React.useMemo(
    () => filterToolCallGalleryItems(data.toolCalls, filters),
    [data.toolCalls, filters],
  );

  return (
    <ToolCallGalleryShell>
      <header className="flex flex-wrap items-start justify-between gap-4 border-border border-b px-6 py-5">
        <div>
          <h1 className="font-semibold text-2xl text-foreground">Tool calls</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {formatCount(data.toolCalls.length, "call")} across{" "}
            {formatCount(data.sessions.length, "session")}
          </p>
        </div>
        <Button
          disabled={!onRefresh || isRefreshing}
          onClick={() => void onRefresh?.()}
          type="button"
          variant="outline"
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4 border-border border-r p-4">
          <FilterSelect
            label="Provider"
            options={filterOptions.providers}
            value={filters.provider}
            onValueChange={(provider) => setFilters((current) => ({ ...current, provider }))}
          />
          <FilterSelect
            label="Session"
            options={filterOptions.sessions}
            value={filters.sessionId}
            onValueChange={(sessionId) => setFilters((current) => ({ ...current, sessionId }))}
          />
          <FilterSelect
            label="Kind"
            options={filterOptions.kinds}
            value={filters.kind}
            onValueChange={(kind) => setFilters((current) => ({ ...current, kind }))}
          />
          <FilterSelect
            label="State"
            options={filterOptions.states}
            value={filters.state}
            onValueChange={(state) => setFilters((current) => ({ ...current, state }))}
          />
          <label className="block space-y-2">
            <span className="font-medium text-muted-foreground text-xs uppercase">Search</span>
            <Input
              aria-label="Search recorded tool calls"
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
            />
          </label>
        </aside>
        <ScrollArea className="min-h-0">
          <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-6">
            {data.warnings.length > 0 ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground text-sm">
                {formatCount(data.warnings.length, "warning")} while reading recordings.
              </div>
            ) : null}
            {visibleItems.length === 0 ? (
              <div className="rounded-md border border-border p-8 text-center text-muted-foreground">
                No recorded tool calls match the current filters.
              </div>
            ) : (
              visibleItems.map((item) => (
                <ToolCallGalleryRow item={item} key={`${item.sessionId}:${item.toolCallId}`} />
              ))
            )}
          </section>
        </ScrollArea>
      </main>
    </ToolCallGalleryShell>
  );
}

function ToolCallGalleryShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">{children}</div>
  );
}

function ToolCallGalleryRow({ item }: { item: RecordedToolCallGalleryItem }): React.ReactElement {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <Badge variant="secondary">{item.provider ?? "unknown provider"}</Badge>
        <Badge variant="outline">{item.toolKind ?? "unknown kind"}</Badge>
        <Badge variant="outline">{item.toolState ?? "unknown state"}</Badge>
        <span>{item.sessionId}</span>
        <span>{formatDateTime(item.timestamp)}</span>
      </div>
      <CompactToolCall defaultOpen={false} tool={toChatToolCall(item)} />
    </article>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="block space-y-2">
      <span className="font-medium text-muted-foreground text-xs uppercase">{label}</span>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function emptyResponse(): ToolCallGalleryResponse {
  return {
    generatedAt: new Date().toISOString(),
    sessions: [],
    toolCalls: [],
    warnings: [],
  };
}

function formatCount(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}
```

- [ ] **Step 6: Add the feature export**

Create `src/mainview/features/tool-calls/index.ts`:

```ts
export { ToolCallGalleryApp, ToolCallGalleryView } from "./ToolCallGallery.tsx";
```

- [ ] **Step 7: Run the feature tests and typecheck**

Run:

```bash
bun run test -- tests/ui/mainviewRoute.test.ts tests/ui/toolCallGalleryModel.test.ts tests/ui/ToolCallGallery.test.tsx
bun run typecheck:ui
```

Expected: PASS.

- [ ] **Step 8: Commit the route and gallery**

Commit:

```bash
git add src/mainview/app/mainviewRoute.ts src/mainview/main.tsx src/mainview/features/tool-calls tests/ui/mainviewRoute.test.ts tests/ui/toolCallGalleryModel.test.ts tests/ui/ToolCallGallery.test.tsx
git commit -m "feat: add tool call gallery route"
```

## Task 5: End-To-End Local Verification And Task Log

**Files:**

- Create: `docs/tasks/2026-04-24-1127-tool-call-gallery.md`

- [ ] **Step 1: Run focused and full verification**

Run:

```bash
bun run test -- tests/bun/toolCallGalleryStore.test.ts tests/ui/viteConfig.test.ts tests/ui/mainviewRoute.test.ts tests/ui/toolCallGalleryModel.test.ts tests/ui/ToolCallGallery.test.tsx
bun run typecheck
bun run test
```

Expected: all commands PASS.

- [ ] **Step 2: Start the web UI for manual verification**

Run:

```bash
bun run dev:web
```

Open:

```text
http://localhost:5173/?view=tool-calls
```

Expected:

- The page title says `Tool calls`.
- The count reflects recorded calls from `.acp/sessions`.
- Filtering by provider, kind, state, and text changes the visible list.
- A row for a read or command tool opens to show parameters and result.
- Opening `http://localhost:5173/` still shows the normal app shell.

- [ ] **Step 3: Record the implementation notes**

Create `docs/tasks/2026-04-24-1127-tool-call-gallery.md`:

```md
# Tool Call Gallery

## What Was Done

- Added a Vite-only `/__open-acp/tool-calls` endpoint for recorded tool calls.
- Added a `.acp` reader that merges `tool_call` and `tool_call_update` events.
- Added the `?view=tool-calls` mainview route.
- Added a tool-call gallery UI that reuses `CompactToolCall`.

## Verification

- `bun run test -- tests/bun/toolCallGalleryStore.test.ts tests/ui/viteConfig.test.ts tests/ui/mainviewRoute.test.ts tests/ui/toolCallGalleryModel.test.ts tests/ui/ToolCallGallery.test.tsx`
- `bun run typecheck`
- `bun run test`
- Manual check: `http://localhost:5173/?view=tool-calls`

## Decisions

- Kept the gallery as an explicit query route so the packaged desktop app defaults to the normal shell.
- Kept parsing logic out of `vite.config.ts` so the endpoint remains thin.
- Reused `CompactToolCall` and `formatToolPresentation` so gallery improvements exercise the live chat rendering path.

## Follow-Ups

- Consider adding screenshot or browser-driven coverage after the first UI iteration stabilizes.
```

- [ ] **Step 4: Commit the task log**

Commit:

```bash
git add docs/tasks/2026-04-24-1127-tool-call-gallery.md
git commit -m "docs: record tool call gallery implementation"
```

## Self-Review Checklist

- [ ] Spec coverage: endpoint, `.acp` reading, query route, filters, reuse of compact renderer, loading/error/empty states, and tests are all assigned to tasks.
- [ ] Marker scan: no banned planning markers or vague generic test instructions remain.
- [ ] Type consistency: shared response names match between reader, endpoint, model, view, and tests.
- [ ] Scope check: no provider runtime, ACP protocol, or desktop navigation changes are included.
