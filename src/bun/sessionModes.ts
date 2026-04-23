import type {
  ACPPermissionOption,
  ACPSessionConfigOption,
  ACPSessionModeState,
} from "../core/acp/ACPTypes.ts";
import type {
  ModeSyncSource,
  NormalizedSessionMode,
  PlanReviewDecision,
  ProviderAdvertisedMode,
  ProviderAdvertisedModeConfigOption,
  ProviderSessionModeConfig,
  SmokeProvider,
} from "../shared/AppRPC.ts";
import { createDefaultProviderSessionModeConfig } from "../shared/sessionModes.ts";

interface ModeConfigCandidate {
  option: ACPSessionConfigOption;
  syncSource: Extract<ModeSyncSource, "config_option" | "provider_private">;
}

interface ModeTargetConfigOption {
  kind: "config_option";
  configId: string;
  value: string;
}

interface ModeTargetSessionMode {
  kind: "session_mode";
  modeId: string;
}

export type ModeTarget = ModeTargetConfigOption | ModeTargetSessionMode;

export interface ResolvedSessionModeState {
  publicState: ProviderSessionModeConfig;
  rawConfigOptions: ACPSessionConfigOption[];
  rawModes?: ACPSessionModeState;
  targets: Partial<Record<NormalizedSessionMode, ModeTarget>>;
}

export type SessionModeChangeInstruction =
  | {
      kind: "noop";
      state: ResolvedSessionModeState;
    }
  | {
      kind: "set_config_option";
      state: ResolvedSessionModeState;
      configId: string;
      value: string;
    }
  | {
      kind: "set_mode";
      state: ResolvedSessionModeState;
      modeId: string;
    }
  | {
      kind: "unsupported";
      state: ResolvedSessionModeState;
      reason: string;
    };

function normalizeSearchText(...values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim()
    .toLowerCase();
}

function isPlanLike(text: string): boolean {
  return /\bplan\b/.test(text);
}

function isCodexApprovalPresetValue(value: string): boolean {
  return /^(read-only|auto|full-access)$/.test(value.trim().toLowerCase());
}

function isCodexApprovalPresetConfigOption(option: ACPSessionConfigOption): boolean {
  const optionIds = option.options?.map((entry) => entry.value) ?? [];
  return optionIds.length > 0 && optionIds.every((value) => isCodexApprovalPresetValue(value));
}

function isCodexApprovalPresetModes(modes: ACPSessionModeState | undefined): boolean {
  const modeIds = modes?.availableModes?.map((mode) => mode.id) ?? [];
  return modeIds.length > 0 && modeIds.every((value) => isCodexApprovalPresetValue(value));
}

function normalizeCandidateMode(
  provider: SmokeProvider,
  id: string,
  name?: string,
  description?: string,
): NormalizedSessionMode | undefined {
  const searchText = normalizeSearchText(id, name, description);
  if (searchText.length === 0) {
    return undefined;
  }
  if (isPlanLike(searchText)) {
    return "plan";
  }

  switch (provider) {
    case "claude":
    case "qwen":
      return "build";
    case "codex":
      if (
        searchText.includes("read-only") ||
        searchText.includes("readonly") ||
        searchText.includes("read only")
      ) {
        return "plan";
      }
      if (/\b(default|build|code|coding|pair|pair_programming|execute)\b/.test(searchText)) {
        return "build";
      }
      return "build";
    default:
      return undefined;
  }
}

function scoreModeTarget(
  targetMode: NormalizedSessionMode,
  id: string,
  name?: string,
  description?: string,
): number {
  const searchText = normalizeSearchText(id, name, description);
  if (targetMode === "plan") {
    return /\bplan\b/.test(searchText) ? 100 : 0;
  }

  if (/\bdefault\b/.test(searchText)) return 100;
  if (/\bbuild\b/.test(searchText)) return 90;
  if (/\bcode\b/.test(searchText)) return 80;
  if (/\baccept\b/.test(searchText)) return 70;
  if (/\bauto\b/.test(searchText) || /\byolo\b/.test(searchText)) return 60;
  return 10;
}

function compareConfigCandidates(left: ModeConfigCandidate, right: ModeConfigCandidate): number {
  if (left.syncSource === right.syncSource) {
    return left.option.id.localeCompare(right.option.id);
  }
  return left.syncSource === "config_option" ? -1 : 1;
}

function findModeConfigCandidates(
  provider: SmokeProvider,
  configOptions: readonly ACPSessionConfigOption[],
): ModeConfigCandidate[] {
  const candidates: ModeConfigCandidate[] = [];

  for (const option of configOptions) {
    const normalizedId = option.id.trim().toLowerCase();
    const normalizedCategory = option.category?.trim().toLowerCase();
    const normalizedName = option.name.trim().toLowerCase();

    if (normalizedCategory === "mode" || normalizedId === "mode") {
      candidates.push({ option, syncSource: "config_option" });
      continue;
    }

    if (
      provider === "codex" &&
      (normalizedId.includes("collaboration") || normalizedName.includes("collaboration"))
    ) {
      candidates.push({ option, syncSource: "provider_private" });
    }
  }

  return candidates.sort(compareConfigCandidates);
}

function buildAdvertisedModeConfigOption(
  provider: SmokeProvider,
  option: ACPSessionConfigOption,
): ProviderAdvertisedModeConfigOption {
  return {
    id: option.id,
    name: option.name,
    description: option.description,
    category: option.category,
    currentValue: option.currentValue,
    options: (option.options ?? []).map((entry) => ({
      value: entry.value,
      name: entry.name,
      description: entry.description,
      normalizedMode: normalizeCandidateMode(provider, entry.value, entry.name, entry.description),
    })),
  };
}

function buildAdvertisedModes(
  provider: SmokeProvider,
  modes: ACPSessionModeState | undefined,
): ProviderAdvertisedMode[] {
  return (modes?.availableModes ?? []).map((mode) => ({
    id: mode.id,
    name: mode.name,
    description: mode.description,
    normalizedMode: normalizeCandidateMode(provider, mode.id, mode.name, mode.description),
  }));
}

function selectBestTarget<T extends { id: string; name?: string; description?: string }>(
  targetMode: NormalizedSessionMode,
  candidates: readonly T[],
): T | undefined {
  let best: T | undefined;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreModeTarget(targetMode, candidate.id, candidate.name, candidate.description);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : undefined;
}

function resolveTargetsFromConfigOption(
  provider: SmokeProvider,
  option: ACPSessionConfigOption | undefined,
): Partial<Record<NormalizedSessionMode, ModeTargetConfigOption>> {
  if (!option?.options || option.options.length === 0) {
    return {};
  }

  if (provider === "codex" && isCodexApprovalPresetConfigOption(option)) {
    const readOnlyOption = option.options.find(
      (entry) =>
        isCodexApprovalPresetValue(entry.value) && entry.value.trim().toLowerCase() === "read-only",
    );
    const currentBuildOption = option.options.find((entry) => {
      const normalizedValue = entry.value.trim().toLowerCase();
      return (
        typeof option.currentValue === "string" &&
        option.currentValue.trim().toLowerCase() === normalizedValue &&
        normalizedValue !== "read-only"
      );
    });
    const autoOption =
      currentBuildOption ??
      option.options.find((entry) => entry.value.trim().toLowerCase() === "auto") ??
      option.options.find((entry) => entry.value.trim().toLowerCase() === "full-access");

    return {
      ...(autoOption
        ? {
            build: {
              kind: "config_option" as const,
              configId: option.id,
              value: autoOption.value,
            },
          }
        : {}),
      ...(readOnlyOption
        ? {
            plan: {
              kind: "config_option" as const,
              configId: option.id,
              value: readOnlyOption.value,
            },
          }
        : {}),
    };
  }

  const normalizedOptions = option.options
    .map((entry) => ({
      id: entry.value,
      name: entry.name,
      description: entry.description,
      normalizedMode: normalizeCandidateMode(provider, entry.value, entry.name, entry.description),
    }))
    .filter((entry) => entry.normalizedMode !== undefined);

  const buildTarget = selectBestTarget(
    "build",
    normalizedOptions.filter(
      (entry): entry is typeof entry & { normalizedMode: "build" } =>
        entry.normalizedMode === "build",
    ),
  );
  const planTarget = selectBestTarget(
    "plan",
    normalizedOptions.filter(
      (entry): entry is typeof entry & { normalizedMode: "plan" } =>
        entry.normalizedMode === "plan",
    ),
  );

  return {
    ...(buildTarget
      ? { build: { kind: "config_option", configId: option.id, value: buildTarget.id } }
      : {}),
    ...(planTarget
      ? { plan: { kind: "config_option", configId: option.id, value: planTarget.id } }
      : {}),
  };
}

function resolveTargetsFromModes(
  provider: SmokeProvider,
  modes: ACPSessionModeState | undefined,
): Partial<Record<NormalizedSessionMode, ModeTargetSessionMode>> {
  if (provider === "codex" && isCodexApprovalPresetModes(modes)) {
    const readOnlyMode = modes?.availableModes?.find(
      (mode) => mode.id.trim().toLowerCase() === "read-only",
    );
    const currentBuildMode = modes?.availableModes?.find((mode) => {
      const normalizedId = mode.id.trim().toLowerCase();
      return (
        modes.currentModeId?.trim().toLowerCase() === normalizedId && normalizedId !== "read-only"
      );
    });
    const autoMode =
      currentBuildMode ??
      modes?.availableModes?.find((mode) => mode.id.trim().toLowerCase() === "auto") ??
      modes?.availableModes?.find((mode) => mode.id.trim().toLowerCase() === "full-access");

    return {
      ...(autoMode
        ? {
            build: {
              kind: "session_mode" as const,
              modeId: autoMode.id,
            },
          }
        : {}),
      ...(readOnlyMode
        ? {
            plan: {
              kind: "session_mode" as const,
              modeId: readOnlyMode.id,
            },
          }
        : {}),
    };
  }

  const availableModes = (modes?.availableModes ?? [])
    .map((mode) => ({
      id: mode.id,
      name: mode.name,
      description: mode.description,
      normalizedMode: normalizeCandidateMode(provider, mode.id, mode.name, mode.description),
    }))
    .filter((mode) => mode.normalizedMode !== undefined);

  const buildTarget = selectBestTarget(
    "build",
    availableModes.filter(
      (entry): entry is typeof entry & { normalizedMode: "build" } =>
        entry.normalizedMode === "build",
    ),
  );
  const planTarget = selectBestTarget(
    "plan",
    availableModes.filter(
      (entry): entry is typeof entry & { normalizedMode: "plan" } =>
        entry.normalizedMode === "plan",
    ),
  );

  return {
    ...(buildTarget ? { build: { kind: "session_mode", modeId: buildTarget.id } } : {}),
    ...(planTarget ? { plan: { kind: "session_mode", modeId: planTarget.id } } : {}),
  };
}

function resolveProviderPrivateFallbackTargets(
  provider: SmokeProvider,
  existingTargets: Partial<Record<NormalizedSessionMode, ModeTarget>>,
): Partial<Record<NormalizedSessionMode, ModeTarget>> {
  if (provider !== "codex" || existingTargets.plan) {
    return {};
  }

  return {
    ...(existingTargets.build
      ? {}
      : {
          build: {
            kind: "session_mode" as const,
            modeId: "default",
          },
        }),
    plan: {
      kind: "session_mode",
      modeId: "plan",
    },
  };
}

function findCurrentProviderModeName(
  currentProviderModeId: string | undefined,
  preferredConfigOption: ACPSessionConfigOption | undefined,
  rawModes: ACPSessionModeState | undefined,
): string | undefined {
  if (!currentProviderModeId) {
    return undefined;
  }

  const configMatch = preferredConfigOption?.options?.find(
    (option) => option.value === currentProviderModeId,
  );
  if (configMatch?.name) {
    return configMatch.name;
  }

  return rawModes?.availableModes.find((mode) => mode.id === currentProviderModeId)?.name;
}

export function resolveSessionModeState(params: {
  provider: SmokeProvider;
  sessionId: string;
  cwd: string;
  configOptions?: ACPSessionConfigOption[] | null;
  modes?: ACPSessionModeState | null;
  previous?: ResolvedSessionModeState;
}): ResolvedSessionModeState {
  const rawConfigOptions = [...(params.configOptions ?? params.previous?.rawConfigOptions ?? [])];
  const rawModes = params.modes ?? params.previous?.rawModes;
  const modeConfigCandidates = findModeConfigCandidates(params.provider, rawConfigOptions);
  const preferredConfigOption = modeConfigCandidates[0]?.option;

  const configTargets = resolveTargetsFromConfigOption(params.provider, preferredConfigOption);
  const modeTargets = resolveTargetsFromModes(params.provider, rawModes);
  const discoveredTargets: Partial<Record<NormalizedSessionMode, ModeTarget>> = {
    build: configTargets.build ?? modeTargets.build,
    plan: configTargets.plan ?? modeTargets.plan,
  };
  const providerPrivateTargets = resolveProviderPrivateFallbackTargets(
    params.provider,
    discoveredTargets,
  );
  const targets: Partial<Record<NormalizedSessionMode, ModeTarget>> = {
    build: discoveredTargets.build ?? providerPrivateTargets.build,
    plan: discoveredTargets.plan ?? providerPrivateTargets.plan,
  };

  const currentProviderModeId =
    (typeof preferredConfigOption?.currentValue === "string"
      ? preferredConfigOption.currentValue
      : undefined) ?? rawModes?.currentModeId;
  const normalizedMode =
    (currentProviderModeId
      ? normalizeCandidateMode(
          params.provider,
          currentProviderModeId,
          findCurrentProviderModeName(currentProviderModeId, preferredConfigOption, rawModes),
        )
      : undefined) ??
    params.previous?.publicState.normalizedMode ??
    "build";

  const fallbackState = createDefaultProviderSessionModeConfig(
    params.provider,
    params.sessionId,
    params.cwd,
    normalizedMode,
  );
  const publicState: ProviderSessionModeConfig = {
    ...fallbackState,
    normalizedMode,
    supportsPlanMode: Boolean(targets.plan) || normalizedMode === "plan",
    supportsModeSwitching: Boolean(targets.build) || Boolean(targets.plan),
    syncSource: providerPrivateTargets.plan
      ? "provider_private"
      : (modeConfigCandidates[0]?.syncSource ?? (rawModes ? "session_mode" : "default")),
    currentProviderModeId,
    currentProviderModeName: findCurrentProviderModeName(
      currentProviderModeId,
      preferredConfigOption,
      rawModes,
    ),
    preferredConfigId: preferredConfigOption?.id,
    providerModes: buildAdvertisedModes(params.provider, rawModes),
    modeConfigOptions: modeConfigCandidates.map((candidate) =>
      buildAdvertisedModeConfigOption(params.provider, candidate.option),
    ),
  };

  return {
    publicState,
    rawConfigOptions,
    ...(rawModes ? { rawModes } : {}),
    targets,
  };
}

export function createSessionModeChangeInstruction(
  state: ResolvedSessionModeState,
  targetMode: NormalizedSessionMode,
): SessionModeChangeInstruction {
  if (state.publicState.normalizedMode === targetMode) {
    return {
      kind: "noop",
      state,
    };
  }

  const target = state.targets[targetMode];
  if (!target) {
    return {
      kind: "unsupported",
      state,
      reason: `No ${targetMode} mode target is available for ${state.publicState.provider}.`,
    };
  }

  if (target.kind === "config_option") {
    return {
      kind: "set_config_option",
      state,
      configId: target.configId,
      value: target.value,
    };
  }

  return {
    kind: "set_mode",
    state,
    modeId: target.modeId,
  };
}

export function resolvePlanReviewOutcome(
  decision: PlanReviewDecision,
  options: readonly ACPPermissionOption[],
):
  | {
      outcome: "cancelled";
    }
  | {
      outcome: "selected";
      optionId: string;
    } {
  if (decision === "cancel") {
    return { outcome: "cancelled" };
  }

  const preferredKinds =
    decision === "start_build" ? ["allow_once", "allow_always"] : ["reject_once", "reject_always"];
  const selectedOption =
    options.find((option) => preferredKinds.includes(option.kind)) ??
    (decision === "start_build" ? options[0] : undefined);

  if (!selectedOption) {
    return { outcome: "cancelled" };
  }

  return {
    outcome: "selected",
    optionId: selectedOption.optionId,
  };
}
