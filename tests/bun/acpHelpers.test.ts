import { describe, expect, it } from "vitest";
import { summarizeSessionUpdate } from "../../src/bun/acpHelpers.ts";

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
