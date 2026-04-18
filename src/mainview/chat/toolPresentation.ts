import type { ApprovalLocation } from "../../shared/AppRPC.ts";

const COMMAND_PREVIEW_MAX_LENGTH = 72;
const PATH_SEGMENT_COUNT = 3;

export interface ToolPresentationInput {
  toolCallId: string;
  toolTitle?: string;
  toolKind?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  locations?: readonly ApprovalLocation[];
}

export interface ToolPresentation {
  title: string;
  subtitle?: string;
}

const FRIENDLY_TOOL_LABELS: Record<string, string> = {
  bash: "Run command",
  "functions.apply_patch": "Edit files",
  "functions.exec_command": "Run command",
  list_mcp_resource_templates: "List MCP resource templates",
  list_mcp_resources: "List MCP resources",
  read_mcp_resource: "Read MCP resource",
  read_thread_terminal: "Read terminal",
  write_stdin: "Send terminal input",
};

const COMMAND_TOOL_KINDS = new Set(["bash", "functions.exec_command"]);
const EDIT_TOOL_KINDS = new Set(["edit_file", "functions.apply_patch"]);
const EDIT_VERBS = new Set(["Add", "Delete", "Edit", "Move", "Rename", "Update"]);

function trimToSingleLine(value: string): string {
  return (
    value
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

function trimCommandPreview(command: string): string {
  const singleLine = trimToSingleLine(command);
  if (singleLine.length <= COMMAND_PREVIEW_MAX_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, COMMAND_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePathSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

function getBaseName(value: string): string {
  const normalized = normalizePathSeparators(value);
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function collapsePath(value: string): string {
  const normalized = normalizePathSeparators(value);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < PATH_SEGMENT_COUNT) {
    return normalized;
  }
  return `…/${segments.slice(-PATH_SEGMENT_COUNT).join("/")}`;
}

function isPathLike(value: string): boolean {
  return /(^\/|^\.\.?(?:\/|$)|^[A-Za-z]:\\|\/|\\)/u.test(value);
}

function getCommandFromInput(input: unknown): string | undefined {
  if (isRecord(input) && typeof input.cmd === "string") {
    return input.cmd;
  }
  if (typeof input !== "string") {
    return undefined;
  }

  const parsed = parseJsonString(input);
  if (isRecord(parsed) && typeof parsed.cmd === "string") {
    return parsed.cmd;
  }

  const singleLine = trimToSingleLine(input);
  return singleLine.length > 0 ? singleLine : undefined;
}

function getPatchText(input: unknown): string | undefined {
  if (typeof input === "string") {
    return input;
  }
  if (isRecord(input) && typeof input.patch === "string") {
    return input.patch;
  }
  return undefined;
}

function getPatchPaths(input: unknown): string[] {
  const patchText = getPatchText(input);
  if (!patchText) {
    return [];
  }

  const paths = new Set<string>();
  for (const line of patchText.split(/\r?\n/u)) {
    const match = line.match(/^\*\*\* (?:Add|Delete|Update) File: (.+)$/u);
    if (match) {
      paths.add(match[1].trim());
    }
  }
  return [...paths];
}

function getLocationPaths(locations?: readonly ApprovalLocation[]): string[] {
  if (!locations) {
    return [];
  }
  return locations
    .map((location) => location.path.trim())
    .filter((location) => location.length > 0);
}

function formatEditPresentation(paths: readonly string[]): ToolPresentation | undefined {
  if (paths.length === 0) {
    return undefined;
  }

  const [firstPath] = paths;
  const extraCount = paths.length - 1;
  return {
    title:
      extraCount > 0
        ? `Edit ${getBaseName(firstPath)} +${extraCount} more`
        : `Edit ${getBaseName(firstPath)}`,
    subtitle: collapsePath(firstPath),
  };
}

function formatPathHeavyTitle(title: string): ToolPresentation | undefined {
  const trimmed = title.trim();
  const match = trimmed.match(/^([A-Za-z][A-Za-z ]*)\s+(.+)$/u);
  if (!match) {
    return undefined;
  }

  const [, rawVerb, rawTarget] = match;
  const verb = rawVerb.trim();
  const target = rawTarget.trim();
  if (!EDIT_VERBS.has(verb) || !isPathLike(target)) {
    return undefined;
  }

  return {
    title: `${verb} ${getBaseName(target)}`,
    subtitle: collapsePath(target),
  };
}

function humanizeToolKind(toolKind?: string): string | undefined {
  if (!toolKind) {
    return undefined;
  }

  if (FRIENDLY_TOOL_LABELS[toolKind]) {
    return FRIENDLY_TOOL_LABELS[toolKind];
  }

  const normalized = toolKind.includes(".")
    ? (toolKind.split(".").at(-1) ?? toolKind)
    : toolKind;
  const humanized = normalized
    .replaceAll(/[_-]+/gu, " ")
    .replaceAll(/\bmcp\b/giu, "MCP")
    .trim();
  if (!humanized) {
    return undefined;
  }
  return `${humanized.charAt(0).toUpperCase()}${humanized.slice(1)}`;
}

function buildFallbackPresentation(input: ToolPresentationInput): ToolPresentation {
  const toolKindTitle = humanizeToolKind(input.toolKind);
  if (toolKindTitle) {
    return { title: toolKindTitle };
  }
  return { title: `Tool ${input.toolCallId.slice(0, 8)}` };
}

export function formatToolPresentation(input: ToolPresentationInput): ToolPresentation {
  if (input.toolKind === "functions.apply_patch") {
    const patchPresentation = formatEditPresentation(getPatchPaths(input.input));
    if (patchPresentation) {
      return patchPresentation;
    }
  }

  if (COMMAND_TOOL_KINDS.has(input.toolKind ?? "")) {
    const command = getCommandFromInput(input.input);
    if (command) {
      return { title: `Run ${trimCommandPreview(command)}` };
    }
  }

  if (typeof input.toolTitle === "string" && input.toolTitle.trim().length > 0) {
    const pathHeavyTitle = formatPathHeavyTitle(input.toolTitle);
    if (pathHeavyTitle) {
      return pathHeavyTitle;
    }
    return { title: input.toolTitle.trim() };
  }

  if (EDIT_TOOL_KINDS.has(input.toolKind ?? "")) {
    const locationPresentation = formatEditPresentation(
      getLocationPaths(input.locations),
    );
    if (locationPresentation) {
      return locationPresentation;
    }
  }

  return buildFallbackPresentation(input);
}

export function toToolActionLabel(title: string): string {
  if (title.length === 0) {
    return title;
  }
  return `${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}
