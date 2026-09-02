import { describe, expect, it } from "vitest";
import {
  applyThinkingLevelPromptPrefix,
  encodeProviderModelId,
  splitProviderModelId,
} from "../../src/shared/providerThinkingLevels.ts";

describe("providerThinkingLevels", () => {
  it("passes inline-strategy ids through unchanged", () => {
    expect(splitProviderModelId("codex", "gpt-5.4/high")).toEqual({
      baseModelId: "gpt-5.4/high",
    });
    expect(splitProviderModelId("cursor", "auto")).toEqual({
      baseModelId: "auto",
    });
  });

  it("splits a virtual-strategy encoded id into base and level", () => {
    const result = splitProviderModelId("claude", "claude-sonnet-4-5/ultrathink");
    expect(result.baseModelId).toBe("claude-sonnet-4-5");
    expect(result.thinkingLevelId).toBe("ultrathink");
    expect(result.thinkingLevel?.promptPrefix).toBe("ultrathink");
  });

  it("treats unknown virtual suffixes as part of the base id", () => {
    expect(splitProviderModelId("claude", "claude-sonnet-4-5/bogus")).toEqual({
      baseModelId: "claude-sonnet-4-5/bogus",
    });
  });

  it("omits the prefix for the auto level", () => {
    const { thinkingLevel } = splitProviderModelId(
      "claude",
      encodeProviderModelId("claude-sonnet-4-5", "auto"),
    );
    expect(applyThinkingLevelPromptPrefix(thinkingLevel, "hello")).toBe("hello");
  });

  it("prepends the prompt prefix for levels that declare one", () => {
    const { thinkingLevel } = splitProviderModelId("claude", "claude-sonnet-4-5/think-hard");
    expect(applyThinkingLevelPromptPrefix(thinkingLevel, "refactor")).toBe("think hard refactor");
  });
});
