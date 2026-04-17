import { describe, expect, it } from "vitest";
import { createProviderModelCatalogStore } from "../../src/bun/providerModelCatalogStore.ts";

describe("providerModelCatalogStore", () => {
  it("stores the first non-empty discovery result", () => {
    const store = createProviderModelCatalogStore();

    store.recordDiscovery(
      "claude",
      [{ id: "claude-sonnet-4.5", contextWindowTokens: null }],
      "2026-04-17T09:00:00.000Z"
    );

    expect(store.get("claude")).toEqual({
      provider: "claude",
      models: [{ id: "claude-sonnet-4.5", contextWindowTokens: null }],
      hasAttemptedDiscovery: true,
      lastUpdatedAt: "2026-04-17T09:00:00.000Z",
      source: "discovered"
    });
  });

  it("keeps the last successful catalog when a later discovery is empty", () => {
    const store = createProviderModelCatalogStore();

    store.recordDiscovery(
      "claude",
      [{ id: "claude-sonnet-4.5", contextWindowTokens: null }],
      "2026-04-17T09:00:00.000Z"
    );
    store.recordDiscovery("claude", [], "2026-04-17T09:05:00.000Z");

    expect(store.get("claude").models).toEqual([
      { id: "claude-sonnet-4.5", contextWindowTokens: null }
    ]);
    expect(store.get("claude").lastUpdatedAt).toBe("2026-04-17T09:00:00.000Z");
  });
});
