import { describe, expect, it } from "vitest";
import {
  formatToolPresentation,
  toToolActionLabel,
} from "../../src/mainview/chat/toolPresentation.ts";

describe("formatToolPresentation", () => {
  it("formats active file additions without diff totals", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "file_change",
        state: "input-available",
        input: JSON.stringify([
          {
            path: "/workspace/project/test.txt",
            kind: { type: "add" },
            diff: "hello world\n",
          },
        ]),
      }),
    ).toMatchObject({
      title: "Creating test.txt",
      shimmerPrefix: "Creating",
      fileChange: {
        verb: "Creating",
        target: "test.txt",
        additions: 1,
        deletions: 0,
      },
    });
  });

  it("formats completed file additions with diff totals", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "file_change",
        state: "output-available",
        output: {
          type: "fileChange",
          changes: [
            {
              path: "/workspace/project/test.txt",
              kind: { type: "add" },
              diff: "hello world\n",
            },
          ],
          status: "completed",
        },
      }),
    ).toMatchObject({
      title: "Created test.txt +1 -0",
      fileChange: {
        verb: "Created",
        target: "test.txt",
        additions: 1,
        deletions: 0,
        diffText:
          "diff --git a/test.txt b/test.txt\nnew file mode 100644\n--- /dev/null\n+++ b/test.txt\n@@ -0,0 +1,1 @@\n+hello world",
      },
    });
  });

  it("formats completed file edits and deletes with diff totals", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "file_change",
        state: "output-available",
        output: {
          changes: [
            {
              path: "/workspace/project/App.tsx",
              kind: { type: "update" },
              diff: "@@ -1,2 +1,3 @@\n const value = 1;\n-old\n+new\n+next\n",
            },
          ],
        },
      }),
    ).toMatchObject({
      title: "Edited App.tsx +2 -1",
      fileChange: {
        verb: "Edited",
        target: "App.tsx",
        additions: 2,
        deletions: 1,
      },
    });

    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "file_change",
        state: "output-available",
        output: {
          changes: [
            {
              path: "/workspace/project/test.txt",
              kind: { type: "delete" },
              diff: "hello world\n",
            },
          ],
        },
      }),
    ).toMatchObject({
      title: "Deleted test.txt +0 -1",
      fileChange: {
        verb: "Deleted",
        target: "test.txt",
        additions: 0,
        deletions: 1,
      },
    });
  });

  it("keeps zero diff totals visible for completed file changes", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "file_change",
        state: "output-available",
        output: {
          changes: [
            {
              path: "/workspace/project/empty.txt",
              kind: { type: "add" },
              diff: "",
            },
          ],
        },
      }),
    ).toMatchObject({
      title: "Created empty.txt +0 -0",
      fileChange: {
        additions: 0,
        deletions: 0,
      },
    });
  });

  it("summarizes multi-file file changes", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "file_change",
        state: "output-available",
        output: {
          changes: [
            {
              path: "/workspace/project/one.txt",
              kind: { type: "add" },
              diff: "one\n",
            },
            {
              path: "/workspace/project/two.txt",
              kind: { type: "add" },
              diff: "two\n",
            },
          ],
        },
      }),
    ).toMatchObject({
      title: "Created 2 files +2 -0",
      fileChange: {
        verb: "Created",
        target: "2 files",
        additions: 2,
        deletions: 0,
      },
    });
  });

  it("summarizes Codex turn diffs as file changes", () => {
    expect(
      formatToolPresentation({
        toolCallId: "turn-diff:turn-1",
        toolKind: "file_change",
        state: "output-available",
        output: {
          type: "turnDiff",
          diff: [
            "diff --git a/src/old.ts b/src/old.ts",
            "deleted file mode 100644",
            "--- a/src/old.ts",
            "+++ /dev/null",
            "@@ -1 +0,0 @@",
            "-old",
            "diff --git a/src/new.ts b/src/new.ts",
            "new file mode 100644",
            "--- /dev/null",
            "+++ b/src/new.ts",
            "@@ -0,0 +1 @@",
            "+new",
          ].join("\n"),
        },
      }),
    ).toMatchObject({
      title: "Changed 2 files +1 -1",
      fileChange: {
        verb: "Changed",
        target: "2 files",
        additions: 1,
        deletions: 1,
      },
    });
  });

  it("formats Qwen file diff outputs as file changes", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-qwen-edit",
        toolKind: "edit",
        state: "output-available",
        input: {
          file_path: "/workspace/project/package.json",
          old_string: '"description": "old"',
          new_string: '"description": "new"',
        },
        output: {
          fileName: "package.json",
          originalContent: '"description": "old"\n',
          newContent: '"description": "new"\n',
          fileDiff: [
            "Index: package.json",
            "===================================================================",
            "--- package.json\tCurrent",
            "+++ package.json\tProposed",
            "@@ -1 +1 @@",
            '-"description": "old"',
            '+"description": "new"',
          ].join("\n"),
        },
      }),
    ).toMatchObject({
      title: "Edited package.json +1 -1",
      fileChange: {
        verb: "Edited",
        target: "package.json",
        additions: 1,
        deletions: 1,
        diffText: expect.stringContaining("diff --git a/package.json b/package.json"),
      },
    });
  });

  it("uses Qwen edit and write inputs for active file-change labels", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-qwen-active-edit",
        toolKind: "edit",
        state: "input-available",
        input: {
          file_path: "/workspace/project/package.json",
          old_string: "old",
          new_string: "new",
        },
      }),
    ).toMatchObject({
      title: "Editing package.json",
      shimmerPrefix: "Editing",
    });

    expect(
      formatToolPresentation({
        toolCallId: "tool-qwen-active-write",
        toolKind: "edit",
        toolTitle: "WriteFile: Writing to src/lib/utils.ts",
        state: "input-available",
        input: {
          file_path: "/workspace/project/src/lib/utils.ts",
          content: "export const value = 1;\n",
        },
      }),
    ).toMatchObject({
      title: "Creating utils.ts",
      shimmerPrefix: "Creating",
      fileChange: {
        additions: 1,
        deletions: 0,
      },
    });
  });

  it("labels Qwen shell rm output as a deletion when no diff is available", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-qwen-rm",
        toolKind: "run_shell_command",
        state: "output-available",
        output:
          "Command: rm /workspace/project/scripts/benchmark-baseline.ts\nDirectory: (root)\nOutput: (empty)\nExit Code: 0",
      }),
    ).toMatchObject({
      title: "Deleted benchmark-baseline.ts +0 -0",
      fileChange: {
        verb: "Deleted",
        target: "benchmark-baseline.ts",
        additions: 0,
        deletions: 0,
        diffText: "",
      },
    });
  });

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
