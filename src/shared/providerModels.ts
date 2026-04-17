export type SmokeProvider = "codex" | "claude" | "opencode";

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

export function createEmptyProviderModelCatalog(
  provider: SmokeProvider
): ProviderModelCatalog {
  return {
    provider,
    models: [],
    hasAttemptedDiscovery: false,
    source: "empty"
  };
}

export function normalizeProviderModelOptions(
  modelsMeta: unknown
): ProviderModelOption[] {
  if (!Array.isArray(modelsMeta)) {
    return [];
  }

  return modelsMeta
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object"
    )
    .map((entry, index) => ({
      id:
        typeof entry.id === "string" && entry.id.length > 0
          ? entry.id
          : `unknown-model-${index}`,
      title: typeof entry.title === "string" ? entry.title : undefined,
      contextWindowTokens:
        typeof entry.contextWindowTokens === "number"
          ? entry.contextWindowTokens
          : null
    }));
}
