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
      })
    ).toEqual({
      title: "Edit App.tsx",
      subtitle: "…/src/mainview/App.tsx",
    });
  });

  it("summarizes multi-file apply_patch input", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "functions.apply_patch",
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
      })
    ).toEqual({
      title: "Edit App.tsx +2 more",
      subtitle: "…/src/mainview/App.tsx",
    });
  });

  it("uses the command preview for exec_command", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "functions.exec_command",
        input: {
          cmd: "rg --files src\nsed -n '1,20p' src/mainview/App.tsx",
        },
      })
    ).toEqual({
      title: "Run rg --files src",
    });
  });

  it("falls back to a humanized known tool kind", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
        toolKind: "list_mcp_resources",
      })
    ).toEqual({
      title: "List MCP resources",
    });
  });

  it("falls back to the call id only as a last resort", () => {
    expect(
      formatToolPresentation({
        toolCallId: "tool-12345678",
      })
    ).toEqual({
      title: "Tool tool-123",
    });
  });

  it("builds action labels from presentation titles", () => {
    expect(toToolActionLabel("Run npm test")).toBe("run npm test");
  });
});
