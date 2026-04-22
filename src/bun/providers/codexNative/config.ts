import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ACPSessionConfigOption, ACPSessionModelState } from "../../../core/acp/ACPTypes.ts";
import type { ProviderModelOption } from "../../../shared/providerModels.ts";

const DEFAULT_CODEX_MODEL_ID = "gpt-5.3-codex";
const DEFAULT_CODEX_REASONING_EFFORT = "high";

const BUILT_IN_CODEX_MODELS: ReadonlyArray<{ id: string; title: string }> = [
  { id: "gpt-5.4", title: "GPT-5.4" },
  { id: "gpt-5.4-mini", title: "GPT-5.4 Mini" },
  { id: "gpt-5.3-codex", title: "GPT-5.3 Codex" },
  { id: "gpt-5.3-codex-spark", title: "GPT-5.3 Codex Spark" },
  { id: "gpt-5.2-codex", title: "GPT-5.2 Codex" },
  { id: "gpt-5.2", title: "GPT-5.2" },
];

export const CODEX_REASONING_EFFORTS = ["xhigh", "high", "medium", "low", "minimal"] as const;

export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

export interface CodexNativeConfigState {
  currentModelId: string;
  reasoningEffort: CodexReasoningEffort;
  fastMode: boolean;
}

interface ParsedConfig {
  model?: string;
  model_reasoning_effort?: string;
  service_tier?: string;
}

export interface ResolvedCodexTurnConfig {
  encodedModelId: string;
  model: string;
  effort: CodexReasoningEffort;
  serviceTier?: string;
}

export async function loadCodexNativeConfigState(cwd: string): Promise<CodexNativeConfigState> {
  const state = defaultCodexNativeConfigState();
  const globalConfigPath = path.join(homedir(), ".codex", "config.toml");
  const projectConfigPath = path.join(cwd, ".codex", "config.toml");

  mergeConfig(state, await readConfigFile(globalConfigPath));
  mergeConfig(state, await readConfigFile(projectConfigPath));

  return state;
}

export function defaultCodexNativeConfigState(): CodexNativeConfigState {
  return {
    currentModelId: DEFAULT_CODEX_MODEL_ID,
    reasoningEffort: DEFAULT_CODEX_REASONING_EFFORT,
    fastMode: false,
  };
}

export function resolveCodexTurnConfig(
  selectedModelId: string | undefined,
  state: CodexNativeConfigState,
): ResolvedCodexTurnConfig {
  const normalized = selectedModelId?.trim() ?? "";
  if (normalized.length === 0) {
    return {
      encodedModelId: encodeCodexModelId(state.currentModelId, state.reasoningEffort),
      model: state.currentModelId,
      effort: state.reasoningEffort,
      serviceTier: state.fastMode ? "fast" : undefined,
    };
  }

  const parsed = parseEncodedCodexModelId(normalized);
  return {
    encodedModelId: normalized,
    model: parsed.model,
    effort: parsed.effort ?? state.reasoningEffort,
    serviceTier: state.fastMode ? "fast" : undefined,
  };
}

export function buildCodexNativeSessionModelState(
  state: CodexNativeConfigState,
): ACPSessionModelState {
  const availableModels = buildCodexNativeProviderModelOptions(state).map((model) => ({
    modelId: model.id,
    name: model.title ?? model.id,
  }));

  return {
    currentModelId: encodeCodexModelId(state.currentModelId, state.reasoningEffort),
    availableModels,
  };
}

export function buildCodexNativeProviderModelOptions(
  state: CodexNativeConfigState,
): ProviderModelOption[] {
  const baseModels = [...BUILT_IN_CODEX_MODELS];
  if (!baseModels.some((model) => model.id === state.currentModelId)) {
    baseModels.unshift({
      id: state.currentModelId,
      title: state.currentModelId,
    });
  }

  return baseModels.flatMap((model) =>
    CODEX_REASONING_EFFORTS.map((effort) => ({
      id: encodeCodexModelId(model.id, effort),
      title: `${model.title} (${effort})`,
      contextWindowTokens: null,
    })),
  );
}

export function buildCodexNativeConfigOptions(
  state: CodexNativeConfigState,
): ACPSessionConfigOption[] {
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: encodeCodexModelId(state.currentModelId, state.reasoningEffort),
      options: buildCodexNativeProviderModelOptions(state).map((model) => ({
        value: model.id,
        name: model.title ?? model.id,
      })),
    },
  ];
}

export function encodeCodexModelId(model: string, effort: CodexReasoningEffort): string {
  return `${model}/${effort}`;
}

export function parseEncodedCodexModelId(value: string): {
  model: string;
  effort?: CodexReasoningEffort;
} {
  const trimmed = value.trim();
  const slashIndex = trimmed.lastIndexOf("/");
  if (slashIndex <= 0 || slashIndex >= trimmed.length - 1) {
    return { model: trimmed || DEFAULT_CODEX_MODEL_ID };
  }

  const model = trimmed.slice(0, slashIndex).trim();
  const effort = normalizeReasoningEffort(trimmed.slice(slashIndex + 1));
  return {
    model: model || DEFAULT_CODEX_MODEL_ID,
    effort,
  };
}

async function readConfigFile(filePath: string): Promise<ParsedConfig | undefined> {
  try {
    const contents = await readFile(filePath, "utf8");
    return parseTomlLikeConfig(contents);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

function parseTomlLikeConfig(contents: string): ParsedConfig {
  const parsed: ParsedConfig = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (line.length === 0 || line.startsWith("[")) {
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"$/);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (key === "model" || key === "model_reasoning_effort" || key === "service_tier") {
      parsed[key] = value;
    }
  }

  return parsed;
}

function mergeConfig(state: CodexNativeConfigState, parsed: ParsedConfig | undefined): void {
  if (!parsed) {
    return;
  }

  if (typeof parsed.model === "string" && parsed.model.trim().length > 0) {
    state.currentModelId = parsed.model.trim();
  }

  const normalizedEffort = normalizeReasoningEffort(parsed.model_reasoning_effort);
  if (normalizedEffort) {
    state.reasoningEffort = normalizedEffort;
  }

  if (typeof parsed.service_tier === "string") {
    state.fastMode = parsed.service_tier.trim().toLowerCase() === "fast";
  }
}

function normalizeReasoningEffort(value: string | undefined): CodexReasoningEffort | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return CODEX_REASONING_EFFORTS.find((candidate) => candidate === normalized);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
