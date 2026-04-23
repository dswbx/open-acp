import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";

describe("vite config", () => {
  it("uses a relative asset base for packaged desktop builds", () => {
    expect(viteConfig.base).toBe("./");
  });
});
