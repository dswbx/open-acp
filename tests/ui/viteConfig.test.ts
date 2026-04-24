import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";

describe("vite config", () => {
  it("uses a relative asset base for packaged desktop builds", () => {
    expect(viteConfig.base).toBe("./");
  });

  it("registers local dev endpoints for recorded sessions and tool calls", () => {
    const pluginNames = Array.isArray(viteConfig.plugins)
      ? viteConfig.plugins
          .flat()
          .map((plugin) => (plugin && "name" in plugin ? plugin.name : undefined))
      : [];

    expect(pluginNames).toContain("open-acp-session-recording");
    expect(pluginNames).toContain("open-acp-tool-call-gallery");
  });
});
