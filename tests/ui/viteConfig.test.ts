import { afterEach, describe, expect, it, vi } from "vitest";

async function loadViteConfig(devServerPort?: string) {
  if (devServerPort === undefined) {
    delete process.env.OPENACP_DEV_SERVER_PORT;
  } else {
    process.env.OPENACP_DEV_SERVER_PORT = devServerPort;
  }
  vi.resetModules();
  const module = await import("../../vite.config.ts");
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
