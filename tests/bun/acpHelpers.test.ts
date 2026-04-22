import { describe, expect, it } from "vitest";
import { extractToolErrorText, summarizeSessionUpdate } from "../../src/bun/acpHelpers.ts";

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
