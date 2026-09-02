import { describe, expect, it } from "vitest";
import {
  extractToolErrorText,
  normalizeLogMessage,
  summarizeSessionUpdate,
} from "../../src/bun/acpHelpers.ts";

describe("summarizeSessionUpdate", () => {
  it("hides config option sync updates from the chat thought process", () => {
    expect(
      summarizeSessionUpdate({
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            currentValue: "gpt-5.4",
            options: [{ value: "gpt-5.4", name: "GPT-5.4" }],
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("hides session metadata updates from the chat thought process", () => {
    expect(
      summarizeSessionUpdate({
        sessionUpdate: "session_info_update",
        title: "Yo Chat",
      }),
    ).toBeUndefined();
  });
});

describe("extractToolErrorText", () => {
  it("does not treat plain string output as an error", () => {
    expect(extractToolErrorText('package.json:8:  "scripts": {')).toBeUndefined();
  });

  it("returns explicit error fields from structured tool output", () => {
    expect(
      extractToolErrorText({
        stderr: "rg: yarn.lock: No such file or directory",
      }),
    ).toBe("rg: yarn.lock: No such file or directory");
  });
});

describe("normalizeLogMessage", () => {
  it("strips ANSI noise and formats apply_patch verification failures", () => {
    expect(
      normalizeLogMessage(
        '\u001b[2m2026-04-24T12:53:57.639617Z\u001b[0m \u001b[31mERROR\u001b[0m \u001b[2mcodex_core::tools::router\u001b[0m\u001b[2m:\u001b[0m \u001b[3merror\u001b[0m\u001b[2m=\u001b[0mapply_patch verification failed: Failed to find expected lines in /repo/src/test.ts: version: "0.0.1",',
      ),
    ).toBe('Patch failed: expected line not found in /repo/src/test.ts: version: "0.0.1",');
  });

  it("formats closed stdin terminal interaction failures", () => {
    expect(
      normalizeLogMessage(
        "2026-04-24T13:49:59.835188Z ERROR codex_core::tools::router: error=write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open",
      ),
    ).toBe(
      "Terminal input failed: this command was not started with an interactive terminal. Rerun it with tty=true to keep stdin open.",
    );
  });
});
