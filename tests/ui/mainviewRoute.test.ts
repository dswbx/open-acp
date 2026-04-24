import { describe, expect, it } from "vitest";
import { getMainviewRoute } from "../../src/mainview/app/mainviewRoute.ts";

describe("getMainviewRoute", () => {
  it("selects the tool-call gallery only for the explicit query view", () => {
    expect(getMainviewRoute(new URL("http://localhost:5173/?view=tool-calls"))).toBe("tool-calls");
    expect(getMainviewRoute(new URL("http://localhost:5173/?view=app"))).toBe("app");
    expect(getMainviewRoute(new URL("http://localhost:5173/"))).toBe("app");
  });
});
