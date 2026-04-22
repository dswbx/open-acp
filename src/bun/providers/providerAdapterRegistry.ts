import type { SmokeProvider } from "../../shared/providerModels.ts";
import type { ProviderAdapter } from "./providerContract.ts";

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<SmokeProvider, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(`Adapter already registered for provider: ${adapter.provider}`);
    }
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: SmokeProvider): ProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unknown provider adapter: ${provider}`);
    }
    return adapter;
  }

  clear(): void {
    this.adapters.clear();
  }
}
