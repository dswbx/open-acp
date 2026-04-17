import type {
  ACPSessionConfigOption,
  ACPSessionModelState
} from "../core/acp/ACPTypes.ts";
import {
  normalizeProviderModelOptionsFromSessionSetup,
  type ProviderModelOption
} from "../shared/providerModels.ts";

export interface ACPProviderSessionSetup {
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
}

export function normalizeDiscoveredProviderModels(
  sessionSetup: ACPProviderSessionSetup | null | undefined
): ProviderModelOption[] {
  if (!sessionSetup) {
    return [];
  }

  return normalizeProviderModelOptionsFromSessionSetup(sessionSetup);
}
