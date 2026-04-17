import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog,
  type ProviderModelOption,
  type SmokeProvider
} from "../shared/providerModels.ts";

export function createProviderModelCatalogStore() {
  const catalogs = new Map<SmokeProvider, ProviderModelCatalog>();

  const ensure = (provider: SmokeProvider): ProviderModelCatalog => {
    const existing = catalogs.get(provider);
    if (existing) {
      return existing;
    }

    const empty = createEmptyProviderModelCatalog(provider);
    catalogs.set(provider, empty);
    return empty;
  };

  return {
    get(provider: SmokeProvider): ProviderModelCatalog {
      return ensure(provider);
    },
    recordDiscovery(
      provider: SmokeProvider,
      models: ProviderModelOption[],
      timestamp: string
    ): ProviderModelCatalog {
      const existing = ensure(provider);
      if (models.length === 0 && existing.models.length > 0) {
        const next = {
          ...existing,
          hasAttemptedDiscovery: true
        };
        catalogs.set(provider, next);
        return next;
      }

      const next: ProviderModelCatalog = {
        provider,
        models,
        hasAttemptedDiscovery: true,
        lastUpdatedAt: models.length > 0 ? timestamp : existing.lastUpdatedAt,
        source: models.length > 0 ? "discovered" : "empty"
      };
      catalogs.set(provider, next);
      return next;
    }
  };
}
