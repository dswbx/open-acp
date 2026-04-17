import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog,
  type ProviderModelOption,
  type SmokeProvider
} from "../shared/providerModels.ts";

export function createInitialProviderModelCatalogs(): Record<
  SmokeProvider,
  ProviderModelCatalog
> {
  return {
    codex: createEmptyProviderModelCatalog("codex"),
    claude: createEmptyProviderModelCatalog("claude"),
    opencode: createEmptyProviderModelCatalog("opencode")
  };
}

export function getSelectedModelValue(
  selectedModel: string,
  catalog: ProviderModelCatalog
): string {
  const normalizedModel = selectedModel.trim();
  if (normalizedModel.length === 0) {
    return "";
  }

  return catalog.models.some((model) => model.id === normalizedModel)
    ? normalizedModel
    : "";
}

export function getProviderModelOptions(
  catalog: ProviderModelCatalog
): ProviderModelOption[] {
  return catalog.models;
}

export function getProviderModelHelperText(
  catalog: ProviderModelCatalog
): string | undefined {
  if (catalog.hasAttemptedDiscovery && catalog.models.length === 0) {
    return "Provider did not report models during ACP session setup.";
  }

  return undefined;
}
