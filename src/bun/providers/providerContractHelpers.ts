import type {
  ACPAuthMethod,
  ACPInitializeResult,
  ACPSessionConfigOption,
  ACPSessionLoadResult,
  ACPSessionModeState,
  ACPSessionNewResult,
} from "../../core/acp/ACPTypes.ts";
import {
  normalizeProviderModelOptions,
  normalizeProviderModelOptionsFromSessionSetup,
  type SmokeProvider,
} from "../../shared/providerModels.ts";
import type {
  ProviderCapabilities,
  ProviderConfigOption,
  ProviderConfigState,
  ProviderModeKind,
  ProviderModeOption,
  ProviderModeState,
  ProviderSessionHandle,
  ProviderTransportKind,
} from "./providerContract.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function classifyModeKind(rawModeId: string): ProviderModeKind {
  const normalized = rawModeId.trim().toLowerCase();
  if (normalized.includes("plan")) {
    return "plan";
  }
  if (normalized.includes("ask")) {
    return "ask";
  }
  if (normalized.includes("exec") || normalized.includes("build") || normalized === "default") {
    return "execute";
  }
  return "custom";
}

function humanizeModeLabel(rawModeId: string): string {
  return rawModeId
    .trim()
    .replaceAll(/[_-]+/gu, " ")
    .replace(/\b\w/gu, (match) => match.toUpperCase());
}

export function normalizeProviderConfigOptions(
  configOptions: ACPSessionConfigOption[] | null | undefined,
): ProviderConfigOption[] {
  if (!configOptions) {
    return [];
  }

  return configOptions.map((option) => ({
    id: option.id,
    name: option.name,
    description: option.description,
    category: option.category,
    type: option.type,
    currentValue: option.currentValue,
    options: option.options?.map((entry) => ({
      value: entry.value,
      name: entry.name,
      description: entry.description,
    })),
    _meta: option._meta ?? undefined,
  }));
}

function normalizeModeOptionsFromConfigOptions(
  configOptions: ProviderConfigOption[],
): ProviderModeState | undefined {
  const modeOption = configOptions.find(
    (option) =>
      option.type === "select" &&
      (option.category === "mode" || option.id.toLowerCase() === "mode"),
  );
  if (!modeOption?.options || modeOption.options.length === 0) {
    return undefined;
  }

  const availableModes: ProviderModeOption[] = modeOption.options.map((option) => ({
    id: option.value,
    kind: classifyModeKind(option.value),
    label: option.name || humanizeModeLabel(option.value),
    rawModeId: option.value,
    source: "config_option",
    description: option.description,
  }));

  return {
    currentModeId:
      typeof modeOption.currentValue === "string" ? modeOption.currentValue : undefined,
    availableModes,
    configOptionId: modeOption.id,
    source: "config_option",
  };
}

function normalizeModeOptionsFromLegacyModes(
  modes: ACPSessionModeState | null | undefined,
): ProviderModeState | undefined {
  if (!modes?.availableModes || modes.availableModes.length === 0) {
    return undefined;
  }

  return {
    currentModeId: modes.currentModeId,
    availableModes: modes.availableModes.map((mode) => ({
      id: mode.id,
      kind: classifyModeKind(mode.id),
      label: mode.name || humanizeModeLabel(mode.id),
      rawModeId: mode.id,
      source: "legacy_modes",
      description: mode.description,
    })),
    source: "legacy_modes",
  };
}

export function normalizeProviderModeState(
  configOptions: ProviderConfigOption[],
  modes: ACPSessionModeState | null | undefined,
  meta: Record<string, unknown> | null | undefined,
): ProviderModeState {
  const fromConfig = normalizeModeOptionsFromConfigOptions(configOptions);
  if (fromConfig) {
    return fromConfig;
  }

  const fromLegacy = normalizeModeOptionsFromLegacyModes(modes);
  if (fromLegacy) {
    return fromLegacy;
  }

  const currentModeId =
    typeof meta?.currentModeId === "string" && meta.currentModeId.trim().length > 0
      ? meta.currentModeId
      : undefined;

  return {
    currentModeId,
    availableModes: currentModeId
      ? [
          {
            id: currentModeId,
            kind: classifyModeKind(currentModeId),
            label: humanizeModeLabel(currentModeId),
            rawModeId: currentModeId,
            source: "provider",
          },
        ]
      : [],
    source: currentModeId ? "provider" : undefined,
  };
}

function readOpenACPExtensions(meta: Record<string, unknown> | null | undefined): {
  userInput: boolean;
} {
  const openAcpMeta =
    isRecord(meta?._openacp) && isRecord((meta?._openacp as Record<string, unknown>).capabilities)
      ? ((meta?._openacp as Record<string, unknown>).capabilities as Record<string, unknown>)
      : isRecord(meta) && isRecord(meta["_openacp/capabilities"])
        ? (meta["_openacp/capabilities"] as Record<string, unknown>)
        : undefined;

  return {
    userInput: Boolean(openAcpMeta?.userInput),
  };
}

export function getACPAuthMethodId(method: ACPAuthMethod): string | undefined {
  if (typeof method.id === "string" && method.id.trim().length > 0) {
    return method.id;
  }
  if (typeof method.type === "string" && method.type.trim().length > 0) {
    return method.type;
  }
  return undefined;
}

export function normalizeProviderCapabilitiesFromACP(
  result: ACPInitializeResult,
): ProviderCapabilities {
  const sessionCapabilities = result.agentCapabilities.sessionCapabilities;
  const extensions = readOpenACPExtensions(result._meta ?? null);

  return {
    loadSession: Boolean(result.agentCapabilities.loadSession),
    authMethods: (result.authMethods ?? [])
      .map((method) => getACPAuthMethodId(method))
      .filter((methodId): methodId is string => Boolean(methodId)),
    supportsTerminalAuth: (result.authMethods ?? []).some((method) => method.type === "terminal"),
    session: {
      list: Boolean(sessionCapabilities?.list),
      fork: Boolean(sessionCapabilities?.fork),
      resume: Boolean(sessionCapabilities?.resume),
      close: Boolean(sessionCapabilities?.close),
    },
    config: {
      setConfigOption: true,
      setMode: true,
    },
    extensions,
    models: normalizeProviderModelOptions(result._meta?.models),
    _meta: result._meta ?? undefined,
  };
}

export function createProviderSessionHandleFromACP(
  provider: SmokeProvider,
  cwd: string,
  transport: ProviderTransportKind,
  setup: ACPSessionNewResult | ACPSessionLoadResult,
  sessionId: string,
): ProviderSessionHandle {
  const options = normalizeProviderConfigOptions(setup.configOptions);
  const mode = normalizeProviderModeState(options, setup.modes, setup._meta ?? null);

  return {
    sessionId,
    cwd,
    provider,
    models: normalizeProviderModelOptionsFromSessionSetup(setup),
    config: {
      options,
      mode,
    },
    replay: {
      transport,
      providerSessionId:
        typeof setup._meta?.providerSessionId === "string"
          ? setup._meta.providerSessionId
          : undefined,
      currentModeId: mode.currentModeId,
      _meta: setup._meta ?? undefined,
    },
    _meta: setup._meta ?? undefined,
  };
}

export function cloneProviderConfigState(config: ProviderConfigState): ProviderConfigState {
  return {
    mode: {
      currentModeId: config.mode.currentModeId,
      availableModes: [...config.mode.availableModes],
      configOptionId: config.mode.configOptionId,
      source: config.mode.source,
    },
    options: config.options.map((option) => ({
      ...option,
      options: option.options ? [...option.options] : undefined,
      _meta: option._meta ? { ...option._meta } : undefined,
    })),
  };
}

export function updateProviderConfigOptionValue(
  config: ProviderConfigState,
  optionId: string,
  value: string | boolean,
): ProviderConfigState {
  const next = cloneProviderConfigState(config);
  next.options = next.options.map((option) =>
    option.id === optionId
      ? {
          ...option,
          currentValue: value,
        }
      : option,
  );

  next.mode = normalizeProviderModeState(next.options, null, {
    currentModeId:
      next.mode.configOptionId === optionId && typeof value === "string"
        ? value
        : next.mode.currentModeId,
  });

  return next;
}
