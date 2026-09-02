import { describe, expect, it } from "vitest";
import { getContextUsagePercent } from "../../src/components/ai-elements/context.tsx";

describe("context usage display", () => {
  it("clamps context usage percentage to the visible progress range", () => {
    expect(getContextUsagePercent(270949, 258400)).toBe(1);
    expect(getContextUsagePercent(-10, 258400)).toBe(0);
    expect(getContextUsagePercent(27975, 258400)).toBeCloseTo(0.1083, 4);
  });

  it("treats invalid context windows as empty usage", () => {
    expect(getContextUsagePercent(100, 0)).toBe(0);
    expect(getContextUsagePercent(Number.NaN, 258400)).toBe(0);
    expect(getContextUsagePercent(100, Number.NaN)).toBe(0);
  });
});
