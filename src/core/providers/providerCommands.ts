import type { AvailableCommand } from "../../shared/AppRPC.ts";
import type { SmokeProvider } from "../../shared/providerModels.ts";

export function parseAvailableCommands(raw: unknown): AvailableCommand[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const commands: AvailableCommand[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : undefined;
    if (!name) continue;
    const description =
      typeof record.description === "string" ? record.description : undefined;
    let inputHint: string | undefined;
    const input = record.input;
    if (
      input &&
      typeof input === "object" &&
      typeof (input as Record<string, unknown>).hint === "string"
    ) {
      inputHint = (input as { hint: string }).hint;
    }
    commands.push({ name, description, inputHint });
  }
  return commands;
}

export function resolveProviderAvailableCommands(
  provider: SmokeProvider,
  agentReportedCommands: AvailableCommand[],
): AvailableCommand[] {
  switch (provider) {
    case "codex":
    case "claude":
    case "qwen":
    case "opencode":
      return agentReportedCommands;
  }
}
