import type { SmokeProvider } from "./providerModels.ts";

export interface ProviderThinkingLevelConfig {
  id: string;
  title: string;
  promptPrefix?: string;
}

export type ProviderThinkingStrategy =
  | { kind: "inline" }
  | { kind: "virtual"; levels: ProviderThinkingLevelConfig[] };

export const PROVIDER_THINKING_STRATEGIES: Record<SmokeProvider, ProviderThinkingStrategy> = {
  codex: { kind: "inline" },
  cursor: { kind: "inline" },
  qwen: { kind: "inline" },
  opencode: { kind: "inline" },
  claude: {
    kind: "virtual",
    levels: [
      { id: "auto", title: "Auto" },
      { id: "think", title: "Think", promptPrefix: "think" },
      { id: "think-hard", title: "Think hard", promptPrefix: "think hard" },
      { id: "ultrathink", title: "Ultrathink", promptPrefix: "ultrathink" },
    ],
  },
};

const ENCODED_SEPARATOR = "/";

export function encodeProviderModelId(baseModelId: string, thinkingLevelId: string): string {
  const base = baseModelId.trim();
  const level = thinkingLevelId.trim();
  if (base.length === 0) {
    return "";
  }
  if (level.length === 0) {
    return base;
  }
  return `${base}${ENCODED_SEPARATOR}${level}`;
}

export interface SplitProviderModelId {
  baseModelId: string;
  thinkingLevelId?: string;
  thinkingLevel?: ProviderThinkingLevelConfig;
}

export function splitProviderModelId(
  provider: SmokeProvider,
  encodedModelId: string | undefined | null,
): SplitProviderModelId {
  const value = (encodedModelId ?? "").trim();
  if (value.length === 0) {
    return { baseModelId: "" };
  }

  const strategy = PROVIDER_THINKING_STRATEGIES[provider];
  if (strategy.kind !== "virtual") {
    return { baseModelId: value };
  }

  const separatorIndex = value.lastIndexOf(ENCODED_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
    return { baseModelId: value };
  }

  const candidateLevel = value.slice(separatorIndex + 1);
  const level = strategy.levels.find((entry) => entry.id === candidateLevel);
  if (!level) {
    return { baseModelId: value };
  }

  return {
    baseModelId: value.slice(0, separatorIndex),
    thinkingLevelId: level.id,
    thinkingLevel: level,
  };
}

export function applyThinkingLevelPromptPrefix(
  level: ProviderThinkingLevelConfig | undefined,
  message: string,
): string {
  const prefix = level?.promptPrefix?.trim();
  if (!prefix) {
    return message;
  }
  return `${prefix} ${message}`;
}
