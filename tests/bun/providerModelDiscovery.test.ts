import { describe, expect, it } from "vitest";
import { normalizeDiscoveredProviderModels } from "../../src/bun/providerModelDiscovery.ts";

describe("providerModelDiscovery", () => {
  it("uses ACP session models when available", () => {
    expect(
      normalizeDiscoveredProviderModels({
        models: {
          currentModelId: "gpt-5.4/medium",
          availableModels: [
            {
              modelId: "gpt-5.4/medium",
              name: "gpt-5.4 (medium)",
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "gpt-5.4/medium",
        title: "gpt-5.4 (medium)",
        contextWindowTokens: null,
      },
    ]);
  });

  it("falls back to ACP config options when session models are absent", () => {
    expect(
      normalizeDiscoveredProviderModels({
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            options: [{ value: "haiku", name: "Haiku" }],
          },
        ],
      }),
    ).toEqual([{ id: "haiku", title: "Haiku", contextWindowTokens: null }]);
  });

  it("returns an empty discovery result when session setup omits model data", () => {
    expect(normalizeDiscoveredProviderModels({})).toEqual([]);
  });
});
