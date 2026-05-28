import type { ACPSessionConfigOption, ACPSessionModelState } from "../core/acp/ACPTypes.ts";

export const SMOKE_PROVIDERS = ["codex", "cursor", "claude", "qwen", "opencode"] as const;

export type SmokeProvider = (typeof SMOKE_PROVIDERS)[number];

export function getSmokeProviderLabel(provider: SmokeProvider): string {
  switch (provider) {
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "claude":
      return "Claude";
    case "qwen":
      return "Qwen Code";
    case "opencode":
      return "OpenCode";
  }
}

export interface ProviderModelOption {
  id: string;
  title?: string;
  contextWindowTokens: number | null;
}

export interface ProviderModelCatalog {
  provider: SmokeProvider;
  models: ProviderModelOption[];
  hasAttemptedDiscovery: boolean;
  lastUpdatedAt?: string;
  source: "discovered" | "empty";
}

export function createEmptyProviderModelCatalog(provider: SmokeProvider): ProviderModelCatalog {
  return {
    provider,
    models: [],
    hasAttemptedDiscovery: false,
    source: "empty",
  };
}

export function normalizeProviderModelOptions(modelsMeta: unknown): ProviderModelOption[] {
  if (!Array.isArray(modelsMeta)) {
    return [];
  }

  return modelsMeta
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry, index) => ({
      id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `unknown-model-${index}`,
      title: typeof entry.title === "string" ? entry.title : undefined,
      contextWindowTokens:
        typeof entry.contextWindowTokens === "number" ? entry.contextWindowTokens : null,
    }));
}

export function normalizeProviderModelOptionsFromSessionModels(
  models: ACPSessionModelState | null | undefined,
): ProviderModelOption[] {
  if (!models) {
    return [];
  }

  return models.availableModels.map((model) => ({
    id: model.modelId,
    title: model.name,
    contextWindowTokens: null,
  }));
}

export function normalizeProviderModelOptionsFromSessionConfigOptions(
  configOptions: ACPSessionConfigOption[] | null | undefined,
): ProviderModelOption[] {
  if (!configOptions) {
    return [];
  }

  const modelOption = configOptions.find(
    (option) => option.id === "model" && option.type === "select",
  );
  if (!modelOption?.options) {
    return [];
  }

  return modelOption.options.map((option) => ({
    id: option.value,
    title: option.name,
    contextWindowTokens: null,
  }));
}

export function normalizeProviderModelOptionsFromSessionSetup(input: {
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
}): ProviderModelOption[] {
  const fromModels = normalizeProviderModelOptionsFromSessionModels(input.models);
  if (fromModels.length > 0) {
    return fromModels;
  }

  return normalizeProviderModelOptionsFromSessionConfigOptions(input.configOptions);
}
