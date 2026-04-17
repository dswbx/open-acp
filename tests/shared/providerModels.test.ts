import { describe, expect, it } from "vitest";
import {
  createEmptyProviderModelCatalog,
  normalizeProviderModelOptions,
  type ProviderModelCatalog,
  type SmokeProvider
} from "../../src/shared/providerModels.ts";

describe("providerModels", () => {
  it("creates an empty provider catalog with discovery unset", () => {
    const provider: SmokeProvider = "codex";
    const catalog: ProviderModelCatalog = createEmptyProviderModelCatalog(provider);

    expect(catalog).toEqual({
      provider: "codex",
      models: [],
      hasAttemptedDiscovery: false,
      source: "empty"
    });
  });

  it("normalizes ACP model metadata into stable model options", () => {
    expect(
      normalizeProviderModelOptions([
        { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
        { title: "Missing ID", contextWindowTokens: "big" },
        "skip-me"
      ])
    ).toEqual([
      { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
      { id: "unknown-model", title: "Missing ID", contextWindowTokens: null }
    ]);
  });
});
