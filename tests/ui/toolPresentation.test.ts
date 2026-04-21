import { describe, expect, it } from "vitest";
import {
  formatToolPresentation,
  toToolActionLabel,
} from "../../src/mainview/chat/toolPresentation.ts";

describe("formatToolPresentation", () => {
  it("collapses full-path edit titles to the basename", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolTitle: "Edit /Users/tester/project/src/mainview/App.tsx",
      }),
    ).toEqual({
      title: "Edit App.tsx",
    });
  });

  it("summarizes multi-file apply_patch input with completed tense", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "functions.apply_patch",
        state: "output-available",
        input: `*** Begin Patch
*** Update File: src/mainview/App.tsx
@@
-old
+new
*** Update File: src/mainview/components/ChatSurface.tsx
@@
-old
+new
*** Add File: src/mainview/chat/toolPresentation.ts
+new
*** End Patch`,
      }),
    ).toEqual({
      title: "Edited 3 files",
    });
  });

  it("uses the command preview for exec_command in imperative approval copy", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "functions.exec_command",
        input: {
          cmd: "rg --files src\nsed -n '1,20p' src/mainview/App.tsx",
        },
      }),
    ).toEqual({
      title: "Run rg --files src",
    });
  });

  it("uses active shimmer prefixes for reads", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "read",
        state: "input-available",
        input: {
          file_path: "/Users/tester/project/package.json",
        },
      }),
    ).toEqual({
      title: "Reading package.json",
      shimmerPrefix: "Reading",
    });
  });

  it("uses completed tense for reads from parsed commands", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "read",
        state: "output-available",
        input: {
          parsed_cmd: [
            {
              type: "read",
              name: "ChatSurface.tsx",
              path: "src/mainview/components/ChatSurface.tsx",
            },
          ],
        },
      }),
    ).toEqual({
      title: "Read ChatSurface.tsx",
    });
  });

  it("uses completed tense for writes", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "write",
        state: "output-available",
        input: {
          file_path: "/Users/tester/project/src/config.ts",
        },
      }),
    ).toEqual({
      title: "Wrote config.ts",
    });
  });

  it("summarizes searches from structured command data", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "search",
        state: "output-available",
        input: {
          parsed_cmd: [
            {
              type: "search",
              query: "newestLogsFirst",
              path: "src/mainview/App.tsx",
            },
          ],
        },
      }),
    ).toEqual({
      title: 'Searched "newestLogsFirst" in App.tsx',
    });
  });

  it("keeps generic search titles minimal while active", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "search",
        toolTitle: "Find",
        state: "input-streaming",
      }),
    ).toEqual({
      title: "Searching",
      shimmerPrefix: "Searching",
    });
  });

  it("uses active and completed tense for command calls", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "functions.exec_command",
        state: "input-available",
        input: {
          cmd: "git status --short",
        },
      }),
    ).toEqual({
      title: "Running git status --short",
      shimmerPrefix: "Running",
    });

    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "functions.exec_command",
        state: "output-available",
        input: {
          cmd: "git status --short",
        },
      }),
    ).toEqual({
      title: "Ran git status --short",
    });
  });

  it("falls back to a humanized known tool kind", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "list_mcp_resources",
        state: "input-available",
      }),
    ).toEqual({
      title: "Running List MCP resources",
      shimmerPrefix: "Running",
    });
  });

  it("falls back to the call id only as a last resort", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
      }),
    ).toEqual({
      title: "Use Tool tool-123",
    });
  });

  it("builds action labels from presentation titles", () => {
    expect(toToolActionLabel("Run npm test")).toBe("run npm test");
  });
});
