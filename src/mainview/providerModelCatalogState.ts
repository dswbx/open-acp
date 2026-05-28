import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog,
  type ProviderModelOption,
  type SmokeProvider,
} from "../shared/providerModels.ts";
import {
  PROVIDER_THINKING_STRATEGIES,
  encodeProviderModelId,
  type ProviderThinkingLevelConfig,
} from "../shared/providerThinkingLevels.ts";

export interface ProviderThinkingLevelOption {
  id: string;
  title: string;
  modelId: string;
}

export interface ProviderModelParameterOption {
  id: string;
  title: string;
}

export interface ProviderModelParameterGroup {
  id: string;
  title: string;
  options: ProviderModelParameterOption[];
}

export interface ProviderModelParameterVariant {
  modelId: string;
  values: Record<string, string>;
}

export interface ProviderModelSelectOption extends ProviderModelOption {
  thinkingLevels?: ProviderThinkingLevelOption[];
  parameterGroups?: ProviderModelParameterGroup[];
  parameterVariants?: ProviderModelParameterVariant[];
}

export interface ProviderModelSelection {
  modelValue: string;
  resolvedModelId: string;
  selectedThinkingLevelValue: string;
  thinkingLevelOptions: ProviderThinkingLevelOption[];
  selectedParameterValues: Record<string, string>;
  parameterGroups: ProviderModelParameterGroup[];
}

interface InlineThinkingVariant {
  raw: ProviderModelOption;
  baseModelId: string;
  baseModelTitle: string;
  thinkingLevelId: string;
  thinkingLevelTitle: string;
}

interface ParameterizedModelVariant {
  raw: ProviderModelOption;
  baseModelId: string;
  baseModelTitle: string;
  values: Record<string, string>;
}

export function createInitialProviderModelCatalogs(): Record<SmokeProvider, ProviderModelCatalog> {
  return {
    codex: createEmptyProviderModelCatalog("codex"),
    cursor: createEmptyProviderModelCatalog("cursor"),
    claude: createEmptyProviderModelCatalog("claude"),
    qwen: createEmptyProviderModelCatalog("qwen"),
    opencode: createEmptyProviderModelCatalog("opencode"),
  };
}

export function getSelectedModelValue(
  selectedModel: string,
  catalog: ProviderModelCatalog,
): string {
  const normalizedModel = selectedModel.trim();
  if (normalizedModel.length === 0) {
    return "";
  }

  const options = buildProviderModelSelectOptions(catalog);
  const directMatch = options.some((option) => {
    if (option.id === normalizedModel) {
      return true;
    }
    return (
      (option.thinkingLevels ?? []).some((level) => level.modelId === normalizedModel) ||
      (option.parameterVariants ?? []).some((variant) => variant.modelId === normalizedModel)
    );
  });
  if (directMatch) {
    return normalizedModel;
  }

  return catalog.models.some((model) => model.id === normalizedModel) ? normalizedModel : "";
}

export function getProviderModelOptions(
  catalog: ProviderModelCatalog,
): ProviderModelSelectOption[] {
  return buildProviderModelSelectOptions(catalog);
}

export function getProviderModelSelection(
  selectedModel: string,
  catalog: ProviderModelCatalog,
): ProviderModelSelection {
  const resolvedModelId = getSelectedModelValue(selectedModel, catalog);
  if (resolvedModelId.length === 0) {
    return {
      modelValue: "",
      resolvedModelId: "",
      selectedThinkingLevelValue: "",
      thinkingLevelOptions: [],
      selectedParameterValues: {},
      parameterGroups: [],
    };
  }

  const modelOptions = buildProviderModelSelectOptions(catalog);
  const matchingGroup =
    modelOptions.find((option) =>
      option.thinkingLevels?.some((level) => level.modelId === resolvedModelId),
    ) ??
    modelOptions.find((option) =>
      option.parameterVariants?.some((variant) => variant.modelId === resolvedModelId),
    ) ??
    modelOptions.find((option) => option.id === resolvedModelId);
  if (matchingGroup?.parameterVariants) {
    const selectedVariant =
      matchingGroup.parameterVariants.find((variant) => variant.modelId === resolvedModelId) ??
      matchingGroup.parameterVariants[0];
    return {
      modelValue: matchingGroup.id,
      resolvedModelId: selectedVariant?.modelId ?? resolvedModelId,
      selectedThinkingLevelValue: "",
      thinkingLevelOptions: [],
      selectedParameterValues: selectedVariant?.values ?? {},
      parameterGroups: matchingGroup.parameterGroups ?? [],
    };
  }

  if (!matchingGroup?.thinkingLevels) {
    return {
      modelValue: resolvedModelId,
      resolvedModelId,
      selectedThinkingLevelValue: "",
      thinkingLevelOptions: [],
      selectedParameterValues: {},
      parameterGroups: [],
    };
  }

  const selectedThinkingLevel =
    matchingGroup.thinkingLevels.find((level) => level.modelId === resolvedModelId) ??
    matchingGroup.thinkingLevels[0];

  return {
    modelValue: matchingGroup.id,
    resolvedModelId,
    selectedThinkingLevelValue: selectedThinkingLevel?.id ?? "",
    thinkingLevelOptions: matchingGroup.thinkingLevels,
    selectedParameterValues: {},
    parameterGroups: [],
  };
}

export function resolveProviderModelSelection(
  modelValue: string,
  thinkingLevelValue: string,
  catalog: ProviderModelCatalog,
  parameterValues: Record<string, string> = {},
): string {
  const normalizedModelValue = modelValue.trim();
  if (normalizedModelValue.length === 0) {
    return "";
  }

  const modelOptions = buildProviderModelSelectOptions(catalog);
  const selectedOption =
    modelOptions.find((option) => option.id === normalizedModelValue) ??
    modelOptions.find((option) =>
      option.thinkingLevels?.some((level) => level.modelId === normalizedModelValue),
    ) ??
    modelOptions.find((option) =>
      option.parameterVariants?.some((variant) => variant.modelId === normalizedModelValue),
    );
  if (!selectedOption) {
    return "";
  }

  if (selectedOption.parameterVariants && selectedOption.parameterVariants.length > 0) {
    return resolveParameterizedModelSelection(selectedOption, parameterValues);
  }

  if (!selectedOption.thinkingLevels || selectedOption.thinkingLevels.length === 0) {
    return selectedOption.id;
  }

  const normalizedThinkingLevel = thinkingLevelValue.trim();
  const selectedThinkingLevel =
    selectedOption.thinkingLevels.find((level) => level.id === normalizedThinkingLevel) ??
    selectedOption.thinkingLevels[0];

  return selectedThinkingLevel?.modelId ?? "";
}

export function getProviderModelHelperText(catalog: ProviderModelCatalog): string | undefined {
  if (catalog.hasAttemptedDiscovery && catalog.models.length === 0) {
    return "Provider did not report models during session setup.";
  }

  return undefined;
}

function buildProviderModelSelectOptions(
  catalog: ProviderModelCatalog,
): ProviderModelSelectOption[] {
  const strategy = PROVIDER_THINKING_STRATEGIES[catalog.provider];
  if (strategy.kind === "virtual") {
    return buildVirtualThinkingLevelOptions(catalog, strategy.levels);
  }
  if (catalog.provider === "cursor") {
    return buildCursorParameterizedOptions(catalog);
  }

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
      .map(([baseModelId]) => baseModelId),
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
          modelId: entry.raw.id,
        })),
      },
    ];
  });
}

function buildCursorParameterizedOptions(
  catalog: ProviderModelCatalog,
): ProviderModelSelectOption[] {
  const variantsByBaseModel = new Map<string, ParameterizedModelVariant[]>();
  const variantByModelId = new Map<string, ParameterizedModelVariant>();

  for (const model of catalog.models) {
    const variant = parseParameterizedModelVariant(model);
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

  const emittedBaseModelIds = new Set<string>();

  return catalog.models.flatMap((model) => {
    const variant = variantByModelId.get(model.id);
    if (!variant) {
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
        contextWindowTokens: getSharedParameterizedContextWindowTokens(variants),
        parameterGroups: buildParameterGroups(variants),
        parameterVariants: variants.map((entry) => ({
          modelId: entry.raw.id,
          values: entry.values,
        })),
      },
    ];
  });
}

function buildVirtualThinkingLevelOptions(
  catalog: ProviderModelCatalog,
  levels: readonly ProviderThinkingLevelConfig[],
): ProviderModelSelectOption[] {
  if (levels.length === 0) {
    return [...catalog.models];
  }

  return catalog.models.map((model) => ({
    id: model.id,
    title: model.title,
    contextWindowTokens: model.contextWindowTokens,
    thinkingLevels: levels.map((level) => ({
      id: level.id,
      title: level.title,
      modelId: encodeProviderModelId(model.id, level.id),
    })),
  }));
}

function parseInlineThinkingVariant(model: ProviderModelOption): InlineThinkingVariant | undefined {
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
    thinkingLevelTitle: titleMatch?.[2].trim() || thinkingLevelId,
  };
}

function parseParameterizedModelVariant(
  model: ProviderModelOption,
): ParameterizedModelVariant | undefined {
  const match = model.id.match(/^(.+)\[([^\]]+)\]$/u);
  if (!match) {
    return undefined;
  }

  const baseModelId = match[1]?.trim() ?? "";
  const paramsText = match[2]?.trim() ?? "";
  if (!baseModelId || !paramsText) {
    return undefined;
  }

  const values: Record<string, string> = {};
  for (const part of paramsText.split(",")) {
    const [rawKey, ...rawValueParts] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValueParts.join("=").trim();
    if (!key || !value) {
      return undefined;
    }
    values[key] = value;
  }

  return {
    raw: model,
    baseModelId,
    baseModelTitle: stripParameterSuffix(model.title) || baseModelId,
    values,
  };
}

function stripParameterSuffix(value: string | undefined): string | undefined {
  return value?.replace(/\[[^\]]+\]\s*$/u, "").trim() || undefined;
}

function buildParameterGroups(
  variants: readonly ParameterizedModelVariant[],
): ProviderModelParameterGroup[] {
  const keys = orderParameterKeys([
    ...new Set(variants.flatMap((variant) => Object.keys(variant.values))),
  ]);

  return keys
    .map((key) => {
      const values = uniqueValues(variants.map((variant) => variant.values[key]));
      return {
        id: key,
        title: getParameterGroupTitle(key),
        options: values.map((value) => ({
          id: value,
          title: getParameterValueTitle(key, value),
        })),
      };
    })
    .filter((group) => group.options.length > 1);
}

function orderParameterKeys(keys: string[]): string[] {
  const priority = ["context", "reasoning", "fast"];
  return keys.sort((left, right) => {
    const leftIndex = priority.indexOf(left);
    const rightIndex = priority.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (
        (leftIndex === -1 ? priority.length : leftIndex) -
        (rightIndex === -1 ? priority.length : rightIndex)
      );
    }
    return left.localeCompare(right);
  });
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return values.filter(
    (value, index): value is string => Boolean(value) && values.indexOf(value) === index,
  );
}

function getParameterGroupTitle(key: string): string {
  switch (key) {
    case "context":
      return "Context";
    case "reasoning":
      return "Reasoning";
    case "fast":
      return "Speed";
    default:
      return key.replaceAll(/[_-]+/gu, " ").replace(/\b\w/gu, (match) => match.toUpperCase());
  }
}

function getParameterValueTitle(key: string, value: string): string {
  if (key === "fast") {
    return value === "true" ? "Fast" : value === "false" ? "Standard" : value;
  }
  return value.replaceAll(/[_-]+/gu, " ").replace(/\b\w/gu, (match) => match.toUpperCase());
}

function resolveParameterizedModelSelection(
  selectedOption: ProviderModelSelectOption,
  parameterValues: Record<string, string>,
): string {
  const variants = selectedOption.parameterVariants ?? [];
  const groups = selectedOption.parameterGroups ?? [];
  const defaultValues = variants[0]?.values ?? {};
  const desiredValues = { ...defaultValues, ...parameterValues };
  const exactMatch = variants.find((variant) =>
    groups.every((group) => variant.values[group.id] === desiredValues[group.id]),
  );
  if (exactMatch) {
    return exactMatch.modelId;
  }

  const scored = variants
    .map((variant, index) => ({
      variant,
      index,
      score: groups.reduce(
        (score, group) => score + (variant.values[group.id] === desiredValues[group.id] ? 1 : 0),
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return scored[0]?.variant.modelId ?? selectedOption.id;
}

function getSharedContextWindowTokens(variants: readonly InlineThinkingVariant[]): number | null {
  const tokens = variants
    .map((variant) => variant.raw.contextWindowTokens)
    .filter((value): value is number => typeof value === "number");

  if (tokens.length === 0) {
    return null;
  }

  return Math.max(...tokens);
}

function getSharedParameterizedContextWindowTokens(
  variants: readonly ParameterizedModelVariant[],
): number | null {
  const tokens = variants
    .map((variant) => variant.raw.contextWindowTokens)
    .filter((value): value is number => typeof value === "number");

  if (tokens.length === 0) {
    return null;
  }

  return Math.max(...tokens);
}
