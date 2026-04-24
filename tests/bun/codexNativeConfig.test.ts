import { describe, expect, it } from "vitest";
import {
  buildCodexNativeConfigOptions,
  defaultCodexNativeConfigState,
  resolveCodexTurnConfig,
} from "../../src/bun/providers/codexNative/config.ts";

describe("codex native config", () => {
  it("advertises model and mode as configOptions", () => {
    const configOptions = buildCodexNativeConfigOptions(defaultCodexNativeConfigState(), "plan");

    expect(configOptions.map((option) => option.id)).toEqual(["model", "mode"]);
    expect(configOptions[1]).toMatchObject({
      id: "mode",
      category: "mode",
      currentValue: "plan",
    });
  });

  it("preserves selected reasoning effort when resolving encoded model ids", () => {
    const resolved = resolveCodexTurnConfig("gpt-5.4/medium", defaultCodexNativeConfigState());

    expect(resolved).toMatchObject({
      encodedModelId: "gpt-5.4/medium",
      model: "gpt-5.4",
      effort: "medium",
    });
  });
});
