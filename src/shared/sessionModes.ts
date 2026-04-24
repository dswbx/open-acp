import type { NormalizedSessionMode, ProviderSessionModeConfig } from "./AppRPC.ts";
import type { SmokeProvider } from "./providerModels.ts";

export function providerSupportsPlanMode(provider: SmokeProvider): boolean {
  return provider === "codex" || provider === "claude" || provider === "qwen";
}

export function getNormalizedSessionModeLabel(mode: NormalizedSessionMode): string {
  return mode === "plan" ? "Plan" : "Build";
}

export function applyPlanModePromptPrefix(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return message;
  }

  return [
    "You are in plan mode.",
    "Do not modify files, run commands, or use editing tools.",
    "First investigate and think through the task, then present the plan inside <proposed_plan>...</proposed_plan>.",
    "After presenting the plan, stop and wait for feedback or approval to continue.",
    "",
    trimmed,
  ].join("\n");
}

export function createDefaultProviderSessionModeConfig(
  provider: SmokeProvider,
  sessionId: string,
  cwd: string,
  normalizedMode: NormalizedSessionMode = "build",
): ProviderSessionModeConfig {
  const supportsPlan = providerSupportsPlanMode(provider);

  return {
    provider,
    sessionId,
    cwd,
    normalizedMode,
    supportsPlanMode: supportsPlan,
    supportsModeSwitching: supportsPlan,
    syncSource: "default",
    providerModes: [],
    modeConfigOptions: [],
  };
}
