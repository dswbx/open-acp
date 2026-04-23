import { describe, expect, it } from "vitest";
import { applyPlanModePromptPrefix } from "../../src/shared/sessionModes.ts";

describe("sessionModes", () => {
  it("prepends planning instructions for plan mode prompts", () => {
    const result = applyPlanModePromptPrefix("Implement ACP-first plan review");

    expect(result).toContain("You are in plan mode.");
    expect(result).toContain("<proposed_plan>");
    expect(result).toContain("Implement ACP-first plan review");
  });
});
