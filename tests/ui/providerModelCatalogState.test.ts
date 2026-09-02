import { describe, expect, it } from "vitest";
import {
  createInitialProviderModelCatalogs,
  getProviderModelHelperText,
  getProviderModelSelection,
  getProviderModelOptions,
  getSelectedModelValue,
  resolveProviderModelSelection,
} from "../../src/mainview/providerModelCatalogState.ts";

describe("providerModelCatalogState", () => {
  it("starts every provider with an empty catalog", () => {
    const catalogs = createInitialProviderModelCatalogs();
    expect(catalogs.codex.models).toEqual([]);
    expect(catalogs.cursor.models).toEqual([]);
    expect(catalogs.claude.models).toEqual([]);
    expect(catalogs.opencode.models).toEqual([]);
  });

  it("falls back to the default select value when a selected model disappears", () => {
    expect(
      getSelectedModelValue("missing-model", {
        provider: "codex",
        models: [{ id: "gpt-5-mini", contextWindowTokens: null }],
        hasAttemptedDiscovery: true,
        source: "discovered",
      }),
    ).toBe("");
  });

  it("returns discovered model ids in select order", () => {
    expect(
      getProviderModelOptions({
        provider: "codex",
        models: [
          { id: "gpt-5-mini", contextWindowTokens: null },
          { id: "gpt-5.2", contextWindowTokens: 200000 },
        ],
        hasAttemptedDiscovery: true,
        source: "discovered",
      }).map((model) => model.id),
    ).toEqual(["gpt-5-mini", "gpt-5.2"]);
  });

  it("groups inline thinking variants into one model option", () => {
    const options = getProviderModelOptions({
      provider: "codex",
      models: [
        { id: "gpt-5.4/medium", title: "GPT-5.4 (medium)", contextWindowTokens: null },
        { id: "gpt-5.4/high", title: "GPT-5.4 (high)", contextWindowTokens: null },
        { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: null },
      ],
      hasAttemptedDiscovery: true,
      source: "discovered",
    });

    expect(options.map((option) => option.id)).toEqual(["gpt-5.4", "gpt-5-mini"]);
    expect(options[0]?.thinkingLevels?.map((level) => level.id)).toEqual(["medium", "high"]);
  });

  it("derives model and thinking selection from the stored raw model id", () => {
    expect(
      getProviderModelSelection("gpt-5.4/high", {
        provider: "codex",
        models: [
          { id: "gpt-5.4/medium", title: "GPT-5.4 (medium)", contextWindowTokens: null },
          { id: "gpt-5.4/high", title: "GPT-5.4 (high)", contextWindowTokens: null },
        ],
        hasAttemptedDiscovery: true,
        source: "discovered",
      }),
    ).toEqual({
      modelValue: "gpt-5.4",
      resolvedModelId: "gpt-5.4/high",
      selectedThinkingLevelValue: "high",
      thinkingLevelOptions: [
        { id: "medium", title: "medium", modelId: "gpt-5.4/medium" },
        { id: "high", title: "high", modelId: "gpt-5.4/high" },
      ],
      selectedParameterValues: {},
      parameterGroups: [],
    });
  });

  it("recombines a model and thinking-level selection into the raw provider model id", () => {
    expect(
      resolveProviderModelSelection("gpt-5.4", "high", {
        provider: "codex",
        models: [
          { id: "gpt-5.4/medium", title: "GPT-5.4 (medium)", contextWindowTokens: null },
          { id: "gpt-5.4/high", title: "GPT-5.4 (high)", contextWindowTokens: null },
        ],
        hasAttemptedDiscovery: true,
        source: "discovered",
      }),
    ).toBe("gpt-5.4/high");
  });

  it("explains attempted discovery when setup returns no models", () => {
    expect(
      getProviderModelHelperText({
        provider: "claude",
        models: [],
        hasAttemptedDiscovery: true,
        source: "empty",
      }),
    ).toBe("Provider did not report models during session setup.");
  });

  it("splits Cursor bracketed model variants into parameter groups", () => {
    const options = getProviderModelOptions({
      provider: "cursor",
      models: [
        {
          id: "gpt-5.5[context=200k,reasoning=medium,fast=false]",
          contextWindowTokens: 200000,
        },
        {
          id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
          contextWindowTokens: 272000,
        },
        {
          id: "gpt-5.5[context=272k,reasoning=high,fast=false]",
          contextWindowTokens: 272000,
        },
        {
          id: "gpt-5.5[context=272k,reasoning=medium,fast=true]",
          contextWindowTokens: 272000,
        },
        {
          id: "composer-2.5[fast=true]",
          contextWindowTokens: null,
        },
      ],
      hasAttemptedDiscovery: true,
      source: "discovered",
    });

    expect(options.map((option) => option.id)).toEqual(["gpt-5.5", "composer-2.5"]);
    expect(options[0]?.parameterGroups?.map((group) => group.id)).toEqual([
      "context",
      "reasoning",
      "fast",
    ]);
    expect(options[0]?.parameterGroups?.[2]?.options).toEqual([
      { id: "false", title: "Standard" },
      { id: "true", title: "Fast" },
    ]);
    expect(options[1]?.parameterGroups).toEqual([]);
  });

  it("round-trips Cursor model parameter selections through raw model ids", () => {
    const catalog = {
      provider: "cursor" as const,
      models: [
        {
          id: "gpt-5.5[context=200k,reasoning=medium,fast=false]",
          contextWindowTokens: 200000,
        },
        {
          id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
          contextWindowTokens: 272000,
        },
        {
          id: "gpt-5.5[context=272k,reasoning=high,fast=false]",
          contextWindowTokens: 272000,
        },
        {
          id: "gpt-5.5[context=272k,reasoning=medium,fast=true]",
          contextWindowTokens: 272000,
        },
      ],
      hasAttemptedDiscovery: true,
      source: "discovered" as const,
    };

    const selection = getProviderModelSelection(
      "gpt-5.5[context=272k,reasoning=medium,fast=false]",
      catalog,
    );

    expect(selection).toMatchObject({
      modelValue: "gpt-5.5",
      resolvedModelId: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
      selectedParameterValues: {
        context: "272k",
        reasoning: "medium",
        fast: "false",
      },
    });
    expect(
      resolveProviderModelSelection("gpt-5.5", "", catalog, {
        context: "272k",
        reasoning: "high",
        fast: "false",
      }),
    ).toBe("gpt-5.5[context=272k,reasoning=high,fast=false]");
  });

  it("hides single Cursor parameter bundles because they are not selectable choices", () => {
    const options = getProviderModelOptions({
      provider: "cursor",
      models: [
        {
          id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
          title: "gpt-5.5",
          contextWindowTokens: null,
        },
        {
          id: "composer-2.5[fast=true]",
          title: "composer-2.5",
          contextWindowTokens: null,
        },
      ],
      hasAttemptedDiscovery: true,
      source: "discovered",
    });

    expect(options[0]?.parameterGroups).toEqual([]);
    expect(options[1]?.parameterGroups).toEqual([]);
  });

  it("attaches virtual thinking levels to every Claude model", () => {
    const options = getProviderModelOptions({
      provider: "claude",
      models: [
        { id: "claude-sonnet-4-5", title: "Sonnet 4.5", contextWindowTokens: null },
        { id: "claude-opus-4", title: "Opus 4", contextWindowTokens: null },
      ],
      hasAttemptedDiscovery: true,
      source: "discovered",
    });

    expect(options.map((option) => option.id)).toEqual(["claude-sonnet-4-5", "claude-opus-4"]);
    expect(options[0]?.thinkingLevels?.map((level) => level.id)).toEqual([
      "auto",
      "think",
      "think-hard",
      "ultrathink",
    ]);
    expect(options[0]?.thinkingLevels?.[1]?.modelId).toBe("claude-sonnet-4-5/think");
  });

  it("round-trips a Claude model + thinking level through encoded ids", () => {
    const catalog = {
      provider: "claude" as const,
      models: [{ id: "claude-sonnet-4-5", title: "Sonnet 4.5", contextWindowTokens: null }],
      hasAttemptedDiscovery: true,
      source: "discovered" as const,
    };

    const encoded = resolveProviderModelSelection("claude-sonnet-4-5", "ultrathink", catalog);
    expect(encoded).toBe("claude-sonnet-4-5/ultrathink");

    const selection = getProviderModelSelection(encoded, catalog);
    expect(selection.modelValue).toBe("claude-sonnet-4-5");
    expect(selection.selectedThinkingLevelValue).toBe("ultrathink");
    expect(selection.resolvedModelId).toBe("claude-sonnet-4-5/ultrathink");
  });

  it("stays quiet before discovery has been attempted", () => {
    expect(
      getProviderModelHelperText({
        provider: "claude",
        models: [],
        hasAttemptedDiscovery: false,
        source: "empty",
      }),
    ).toBeUndefined();
  });
});
