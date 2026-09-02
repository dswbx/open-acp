import { afterEach, describe, expect, it, vi } from "vitest";

let importCounter = 0;

async function loadViteConfig(devServerPort?: string) {
  if (devServerPort === undefined) {
    delete process.env.OPENACP_DEV_SERVER_PORT;
  } else {
    process.env.OPENACP_DEV_SERVER_PORT = devServerPort;
  }
  importCounter += 1;
  if (process.env.OPENACP_BUN_TEST !== "1") {
    vi.resetModules();
    const module = await import("../../vite.config.ts");
    return module.default;
  }

  const module =
    importCounter === 1
      ? await import("../../vite.config.ts?bun-test=1")
      : importCounter === 2
        ? await import("../../vite.config.ts?bun-test=2")
        : await import("../../vite.config.ts?bun-test=3");
  return module.default;
}

describe("vite config", () => {
  afterEach(() => {
    delete process.env.OPENACP_DEV_SERVER_PORT;
    vi.resetModules();
  });

  it("uses a relative asset base for packaged desktop builds", async () => {
    const viteConfig = await loadViteConfig();

    expect(viteConfig.base).toBe("./");
  });

  it("registers local dev endpoints for recorded sessions and tool calls", async () => {
    const viteConfig = await loadViteConfig();
    const pluginNames = Array.isArray(viteConfig.plugins)
      ? viteConfig.plugins
          .flat()
          .map((plugin) => (plugin && "name" in plugin ? plugin.name : undefined))
      : [];

    expect(pluginNames).toContain("open-acp-session-recording");
    expect(pluginNames).toContain("open-acp-tool-call-gallery");
  });

  it("honors the configured dev server port", async () => {
    const viteConfig = await loadViteConfig("54321");

    expect(viteConfig.server?.port).toBe(54321);
    expect(viteConfig.server?.strictPort).toBe(true);
  });
});
