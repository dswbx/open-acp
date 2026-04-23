import type { ACPSessionConfigOption, ACPSessionModelState } from "../core/acp/ACPTypes.ts";
import {
  normalizeProviderModelOptionsFromSessionSetup,
  type ProviderModelOption,
} from "../shared/providerModels.ts";
import type { ProviderSessionHandle } from "./providers/providerContract.ts";

export interface ACPProviderSessionSetup {
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
}

export function normalizeDiscoveredProviderModels(
  sessionSetup: ACPProviderSessionSetup | ProviderSessionHandle | null | undefined,
): ProviderModelOption[] {
  if (!sessionSetup) {
    return [];
  }

  if ("config" in sessionSetup && "models" in sessionSetup) {
    return sessionSetup.models;
  }

  return normalizeProviderModelOptionsFromSessionSetup(sessionSetup);
}
