import { describe, expect, it } from "vitest";
import {
  createEmptyProviderModelCatalog,
  getSmokeProviderLabel,
  normalizeProviderModelOptions,
  normalizeProviderModelOptionsFromSessionConfigOptions,
  normalizeProviderModelOptionsFromSessionModels,
  normalizeProviderModelOptionsFromSessionSetup,
  type ProviderModelCatalog,
  type SmokeProvider,
} from "../../src/shared/providerModels.ts";

describe("providerModels", () => {
  it("creates an empty provider catalog with discovery unset", () => {
    const provider: SmokeProvider = "cursor";
    const catalog: ProviderModelCatalog = createEmptyProviderModelCatalog(provider);

    expect(catalog).toEqual({
      provider: "cursor",
      models: [],
      hasAttemptedDiscovery: false,
      source: "empty",
    });
  });

  it("labels Cursor as a provider", () => {
    expect(getSmokeProviderLabel("cursor")).toBe("Cursor");
  });

  it("normalizes ACP model metadata into stable model options", () => {
    expect(
      normalizeProviderModelOptions([
        { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
        { title: "Missing ID", contextWindowTokens: "big" },
        "skip-me",
      ]),
    ).toEqual([
      { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
      { id: "unknown-model-1", title: "Missing ID", contextWindowTokens: null },
    ]);
  });

  it("normalizes ACP session model state into provider model options", () => {
    expect(
      normalizeProviderModelOptionsFromSessionModels({
        currentModelId: "gpt-5.4/medium",
        availableModels: [
          {
            modelId: "gpt-5.4/medium",
            name: "gpt-5.4 (medium)",
            description: "Balanced reasoning",
          },
          {
            modelId: "gpt-5.4/high",
            name: "gpt-5.4 (high)",
          },
        ],
      }),
    ).toEqual([
      {
        id: "gpt-5.4/medium",
        title: "gpt-5.4 (medium)",
        contextWindowTokens: null,
      },
      {
        id: "gpt-5.4/high",
        title: "gpt-5.4 (high)",
        contextWindowTokens: null,
      },
    ]);
  });

  it("falls back to the ACP model config option when session models are absent", () => {
    expect(
      normalizeProviderModelOptionsFromSessionConfigOptions([
        {
          id: "mode",
          name: "Mode",
          type: "select",
          options: [{ value: "default", name: "Default" }],
        },
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "haiku",
          options: [
            { value: "default", name: "Default (recommended)" },
            { value: "haiku", name: "Haiku" },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "default",
        title: "Default (recommended)",
        contextWindowTokens: null,
      },
      { id: "haiku", title: "Haiku", contextWindowTokens: null },
    ]);
  });

  it("prefers session models over config option fallback when both are present", () => {
    expect(
      normalizeProviderModelOptionsFromSessionSetup({
        models: {
          currentModelId: "sonnet[1m]",
          availableModels: [
            {
              modelId: "sonnet[1m]",
              name: "Sonnet (1M context)",
            },
          ],
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            options: [{ value: "default", name: "Default (recommended)" }],
          },
        ],
      }),
    ).toEqual([
      {
        id: "sonnet[1m]",
        title: "Sonnet (1M context)",
        contextWindowTokens: null,
      },
    ]);
  });
});
