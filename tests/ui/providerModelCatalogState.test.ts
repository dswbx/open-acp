import { describe, expect, it } from "vitest";
import {
  createInitialProviderModelCatalogs,
  getProviderModelHelperText,
  getProviderModelOptions,
  getSelectedModelValue
} from "../../src/mainview/providerModelCatalogState.ts";

describe("providerModelCatalogState", () => {
  it("starts every provider with an empty catalog", () => {
    const catalogs = createInitialProviderModelCatalogs();
    expect(catalogs.codex.models).toEqual([]);
    expect(catalogs.claude.models).toEqual([]);
    expect(catalogs.opencode.models).toEqual([]);
  });

  it("falls back to the default select value when a selected model disappears", () => {
    expect(
      getSelectedModelValue("missing-model", {
        provider: "codex",
        models: [{ id: "gpt-5-mini", contextWindowTokens: null }],
        hasAttemptedDiscovery: true,
        source: "discovered"
      })
    ).toBe("");
  });

  it("returns discovered model ids in select order", () => {
    expect(
      getProviderModelOptions({
        provider: "codex",
        models: [
          { id: "gpt-5-mini", contextWindowTokens: null },
          { id: "gpt-5.2", contextWindowTokens: 200000 }
        ],
        hasAttemptedDiscovery: true,
        source: "discovered"
      }).map((model) => model.id)
    ).toEqual(["gpt-5-mini", "gpt-5.2"]);
  });

  it("explains attempted discovery when ACP returns no models", () => {
    expect(
      getProviderModelHelperText({
        provider: "claude",
        models: [],
        hasAttemptedDiscovery: true,
        source: "empty"
      })
    ).toBe("Provider did not report models via ACP.");
  });

  it("stays quiet before discovery has been attempted", () => {
    expect(
      getProviderModelHelperText({
        provider: "claude",
        models: [],
        hasAttemptedDiscovery: false,
        source: "empty"
      })
    ).toBeUndefined();
  });
});
