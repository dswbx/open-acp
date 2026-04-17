import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog,
  type ProviderModelOption,
  type SmokeProvider
} from "../shared/providerModels.ts";

export interface ProviderThinkingLevelOption {
  id: string;
  title: string;
  modelId: string;
}

export interface ProviderModelSelectOption extends ProviderModelOption {
  thinkingLevels?: ProviderThinkingLevelOption[];
}

export interface ProviderModelSelection {
  modelValue: string;
  resolvedModelId: string;
  selectedThinkingLevelValue: string;
  thinkingLevelOptions: ProviderThinkingLevelOption[];
}

interface InlineThinkingVariant {
  raw: ProviderModelOption;
  baseModelId: string;
  baseModelTitle: string;
  thinkingLevelId: string;
  thinkingLevelTitle: string;
}

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
): ProviderModelSelectOption[] {
  return buildProviderModelSelectOptions(catalog);
}

export function getProviderModelSelection(
  selectedModel: string,
  catalog: ProviderModelCatalog
): ProviderModelSelection {
  const resolvedModelId = getSelectedModelValue(selectedModel, catalog);
  if (resolvedModelId.length === 0) {
    return {
      modelValue: "",
      resolvedModelId: "",
      selectedThinkingLevelValue: "",
      thinkingLevelOptions: []
    };
  }

  const modelOptions = buildProviderModelSelectOptions(catalog);
  const matchingGroup = modelOptions.find((option) =>
    option.thinkingLevels?.some((level) => level.modelId === resolvedModelId)
  );
  if (!matchingGroup?.thinkingLevels) {
    return {
      modelValue: resolvedModelId,
      resolvedModelId,
      selectedThinkingLevelValue: "",
      thinkingLevelOptions: []
    };
  }

  const selectedThinkingLevel =
    matchingGroup.thinkingLevels.find((level) => level.modelId === resolvedModelId) ??
    matchingGroup.thinkingLevels[0];

  return {
    modelValue: matchingGroup.id,
    resolvedModelId,
    selectedThinkingLevelValue: selectedThinkingLevel?.id ?? "",
    thinkingLevelOptions: matchingGroup.thinkingLevels
  };
}

export function resolveProviderModelSelection(
  modelValue: string,
  thinkingLevelValue: string,
  catalog: ProviderModelCatalog
): string {
  const normalizedModelValue = modelValue.trim();
  if (normalizedModelValue.length === 0) {
    return "";
  }

  const modelOptions = buildProviderModelSelectOptions(catalog);
  const selectedOption = modelOptions.find((option) => option.id === normalizedModelValue);
  if (!selectedOption) {
    return "";
  }

  if (!selectedOption.thinkingLevels || selectedOption.thinkingLevels.length === 0) {
    return selectedOption.id;
  }

  const normalizedThinkingLevel = thinkingLevelValue.trim();
  const selectedThinkingLevel =
    selectedOption.thinkingLevels.find(
      (level) => level.id === normalizedThinkingLevel
    ) ?? selectedOption.thinkingLevels[0];

  return selectedThinkingLevel?.modelId ?? "";
}

export function getProviderModelHelperText(
  catalog: ProviderModelCatalog
): string | undefined {
  if (catalog.hasAttemptedDiscovery && catalog.models.length === 0) {
    return "Provider did not report models during ACP session setup.";
  }

  return undefined;
}

function buildProviderModelSelectOptions(
  catalog: ProviderModelCatalog
): ProviderModelSelectOption[] {
  const variantsByBaseModel = new Map<string, InlineThinkingVariant[]>();
  const variantByModelId = new Map<string, InlineThinkingVariant>();

  for (const model of catalog.models) {
    const variant = parseInlineThinkingVariant(model);
    if (!variant) {
      continue;
    }
    variantByModelId.set(model.id, variant);
    const existing = variantsByBaseModel.get(variant.baseModelId);
    if (existing) {
      existing.push(variant);
      continue;
    }
    variantsByBaseModel.set(variant.baseModelId, [variant]);
  }

  const groupedBaseModelIds = new Set(
    [...variantsByBaseModel.entries()]
      .filter(([, variants]) => variants.length > 1)
      .map(([baseModelId]) => baseModelId)
  );
  const emittedBaseModelIds = new Set<string>();

  return catalog.models.flatMap((model) => {
    const variant = variantByModelId.get(model.id);
    if (!variant || !groupedBaseModelIds.has(variant.baseModelId)) {
      return [model];
    }

    if (emittedBaseModelIds.has(variant.baseModelId)) {
      return [];
    }
    emittedBaseModelIds.add(variant.baseModelId);

    const variants = variantsByBaseModel.get(variant.baseModelId) ?? [];
    return [
      {
        id: variant.baseModelId,
        title: variant.baseModelTitle,
        contextWindowTokens: getSharedContextWindowTokens(variants),
        thinkingLevels: variants.map((entry) => ({
          id: entry.thinkingLevelId,
          title: entry.thinkingLevelTitle,
          modelId: entry.raw.id
        }))
      }
    ];
  });
}

function parseInlineThinkingVariant(
  model: ProviderModelOption
): InlineThinkingVariant | undefined {
  const slashIndex = model.id.lastIndexOf("/");
  if (slashIndex <= 0 || slashIndex >= model.id.length - 1) {
    return undefined;
  }

  const baseModelId = model.id.slice(0, slashIndex).trim();
  const thinkingLevelId = model.id.slice(slashIndex + 1).trim();
  if (baseModelId.length === 0 || thinkingLevelId.length === 0) {
    return undefined;
  }

  const titleMatch = model.title?.match(/^(.*)\s+\(([^()]+)\)$/u);
  return {
    raw: model,
    baseModelId,
    baseModelTitle: titleMatch?.[1].trim() || baseModelId,
    thinkingLevelId,
    thinkingLevelTitle: titleMatch?.[2].trim() || thinkingLevelId
  };
}

function getSharedContextWindowTokens(
  variants: readonly InlineThinkingVariant[]
): number | null {
  const tokens = variants
    .map((variant) => variant.raw.contextWindowTokens)
    .filter((value): value is number => typeof value === "number");

  if (tokens.length === 0) {
    return null;
  }

  return Math.max(...tokens);
}
