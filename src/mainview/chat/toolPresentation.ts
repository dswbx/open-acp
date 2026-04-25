import type { ApprovalLocation, ChatToolCallState } from "../../shared/AppRPC.ts";
import {
  formatFileChangePresentation,
  formatFileChangeTitle,
  type FileChangePresentation,
} from "./fileChangePresentation.ts";

const COMMAND_PREVIEW_MAX_LENGTH = 72;

export interface ToolPresentationInput {
  toolCallId: string;
  toolTitle?: string;
  toolKind?: string;
  state?: ChatToolCallState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  locations?: readonly ApprovalLocation[];
}

export interface ToolPresentation {
  title: string;
  subtitle?: string;
  shimmerPrefix?: string;
  fileChange?: FileChangePresentation;
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
const READ_TOOL_KINDS = new Set(["read", "read_file"]);
const SEARCH_TOOL_KINDS = new Set(["search", "grep"]);
const WRITE_TOOL_KINDS = new Set(["write", "write_file", "create", "create_file"]);
const EDIT_VERBS = new Set([
  "Add",
  "Create",
  "Delete",
  "Edit",
  "Move",
  "Rename",
  "Update",
  "Write",
]);

type ToolAction = "command" | "edit" | "fallback" | "read" | "search" | "write";

type ToolTense = "active" | "complete" | "error" | "imperative";

interface ParsedCommand {
  type?: string;
  cmd?: string;
  name?: string;
  path?: string | null;
  query?: string;
}

interface ToolSummary {
  action: ToolAction;
  target?: string;
  count?: number;
}

const VERBS: Record<ToolAction, Record<ToolTense, string>> = {
  command: {
    active: "Running",
    complete: "Ran",
    error: "Failed",
    imperative: "Run",
  },
  edit: {
    active: "Editing",
    complete: "Edited",
    error: "Failed editing",
    imperative: "Edit",
  },
  fallback: {
    active: "Running",
    complete: "Used",
    error: "Failed",
    imperative: "Use",
  },
  read: {
    active: "Reading",
    complete: "Read",
    error: "Failed reading",
    imperative: "Read",
  },
  search: {
    active: "Searching",
    complete: "Searched",
    error: "Failed searching",
    imperative: "Search",
  },
  write: {
    active: "Writing",
    complete: "Wrote",
    error: "Failed writing",
    imperative: "Write",
  },
};

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

function stripBackticks(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
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

function isPathLike(value: string): boolean {
  return /(^\/|^\.\.?(?:\/|$)|^[A-Za-z]:\\|\/|\\)/u.test(value);
}

function displayTarget(value: string): string {
  return isPathLike(value) ? getBaseName(value) : stripBackticks(value);
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

function getStringProperty(input: unknown, property: string): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const value = input[property];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getInputPath(input: unknown): string | undefined {
  return (
    getStringProperty(input, "file_path") ??
    getStringProperty(input, "path") ??
    getStringProperty(input, "filename")
  );
}

function getParsedCommands(input: unknown): ParsedCommand[] {
  if (!isRecord(input) || !Array.isArray(input.parsed_cmd)) {
    return [];
  }

  return input.parsed_cmd.filter(isRecord).map((command) => ({
    type: typeof command.type === "string" ? command.type : undefined,
    cmd: typeof command.cmd === "string" ? command.cmd : undefined,
    name: typeof command.name === "string" ? command.name : undefined,
    path: typeof command.path === "string" || command.path === null ? command.path : undefined,
    query: typeof command.query === "string" ? command.query : undefined,
  }));
}

function getPrimaryParsedCommand(input: unknown): ParsedCommand | undefined {
  return getParsedCommands(input).find((command) => command.type !== "list_files");
}

function getLocationPaths(locations?: readonly ApprovalLocation[]): string[] {
  if (!locations) {
    return [];
  }
  return locations
    .map((location) => location.path.trim())
    .filter((location) => location.length > 0);
}

function getTense(state?: ChatToolCallState, errorText?: string): ToolTense {
  if (errorText || state === "output-error" || state === "output-denied") {
    return "error";
  }
  if (state === "output-available" || state === "approval-responded") {
    return "complete";
  }
  if (
    state === "input-available" ||
    state === "input-streaming" ||
    state === "approval-requested"
  ) {
    return "active";
  }
  return "imperative";
}

function buildPresentation(summary: ToolSummary, tense: ToolTense): ToolPresentation {
  const verb = VERBS[summary.action][tense];
  const target =
    summary.count && summary.count > 1 ? `${summary.count} files` : summary.target?.trim();
  return {
    title: target ? `${verb} ${target}` : verb,
    shimmerPrefix: tense === "active" ? verb : undefined,
  };
}

function formatEditSummary(paths: readonly string[]): ToolSummary | undefined {
  if (paths.length === 0) {
    return undefined;
  }

  const [firstPath] = paths;
  return {
    action: "edit",
    count: paths.length > 1 ? paths.length : undefined,
    target: paths.length > 1 ? undefined : getBaseName(firstPath),
  };
}

function formatPathHeavyTitle(title: string): ToolSummary | undefined {
  const trimmed = title.trim();
  const readFileMatch = trimmed.match(/^ReadFile:\s*(.+)$/u);
  if (readFileMatch) {
    return { action: "read", target: displayTarget(readFileMatch[1]) };
  }

  const grepMatch = trimmed.match(/^(?:find|grep|search)\b(?:\s+(.+))?$/iu);
  if (grepMatch) {
    return {
      action: "search",
      target: grepMatch[1] ? trimCommandPreview(grepMatch[1]) : undefined,
    };
  }

  const match = trimmed.match(/^([A-Za-z][A-Za-z ]*)\s+(.+)$/u);
  if (!match) {
    return undefined;
  }

  const [, rawVerb, rawTarget] = match;
  const verb = rawVerb.trim();
  const target = displayTarget(rawTarget);
  if (/^read(?: file)?$/iu.test(verb)) {
    return { action: "read", target };
  }
  if (/^(?:find|grep|search)$/iu.test(verb)) {
    return { action: "search", target };
  }
  if (/^write$/iu.test(verb)) {
    return { action: "write", target };
  }
  if (!EDIT_VERBS.has(verb)) {
    return undefined;
  }

  return {
    action: verb === "Write" || verb === "Create" ? "write" : "edit",
    target,
  };
}

function humanizeToolKind(toolKind?: string): string | undefined {
  if (!toolKind) {
    return undefined;
  }

  if (FRIENDLY_TOOL_LABELS[toolKind]) {
    return FRIENDLY_TOOL_LABELS[toolKind];
  }

  const normalized = toolKind.includes(".") ? (toolKind.split(".").at(-1) ?? toolKind) : toolKind;
  const humanized = normalized
    .replaceAll(/[_-]+/gu, " ")
    .replaceAll(/\bmcp\b/giu, "MCP")
    .trim();
  if (!humanized) {
    return undefined;
  }
  return `${humanized.charAt(0).toUpperCase()}${humanized.slice(1)}`;
}

function getSummaryFromParsedCommand(input: unknown): ToolSummary | undefined {
  const command = getPrimaryParsedCommand(input);
  if (!command) {
    return undefined;
  }

  if (command.type === "read") {
    return {
      action: "read",
      target: command.name ?? (command.path ? getBaseName(command.path) : undefined),
    };
  }
  if (command.type === "search") {
    const query = command.query ? `"${command.query}"` : undefined;
    const path = command.path ? ` in ${displayTarget(command.path)}` : "";
    return { action: "search", target: query ? `${query}${path}` : (command.name ?? undefined) };
  }
  if (command.type === "write") {
    return {
      action: "write",
      target: command.name ?? (command.path ? getBaseName(command.path) : undefined),
    };
  }
  if (command.type === "edit") {
    return {
      action: "edit",
      target: command.name ?? (command.path ? getBaseName(command.path) : undefined),
    };
  }
  if (command.cmd) {
    return { action: "command", target: trimCommandPreview(command.cmd) };
  }
  return undefined;
}

function buildFallbackSummary(input: ToolPresentationInput): ToolSummary {
  const toolKindTitle = humanizeToolKind(input.toolKind);
  if (toolKindTitle) {
    return { action: "fallback", target: toolKindTitle };
  }
  return { action: "fallback", target: `Tool ${input.toolCallId.slice(0, 8)}` };
}

export function formatToolPresentation(input: ToolPresentationInput): ToolPresentation {
  const tense = getTense(input.state, input.errorText);

  const fileChange = formatFileChangePresentation(input);
  if (fileChange) {
    const isActive =
      fileChange.verb === "Creating" ||
      fileChange.verb === "Editing" ||
      fileChange.verb === "Deleting" ||
      fileChange.verb === "Changing";
    return {
      title: formatFileChangeTitle(fileChange),
      shimmerPrefix: isActive ? fileChange.verb : undefined,
      fileChange,
    };
  }

  if (input.toolKind === "functions.apply_patch") {
    const patchPresentation = formatEditSummary(getPatchPaths(input.input));
    if (patchPresentation) {
      return buildPresentation(patchPresentation, tense);
    }
  }

  const parsedCommandSummary = getSummaryFromParsedCommand(input.input);
  if (parsedCommandSummary) {
    return buildPresentation(parsedCommandSummary, tense);
  }

  const inputPath = getInputPath(input.input);
  if (inputPath && READ_TOOL_KINDS.has(input.toolKind ?? "")) {
    return buildPresentation({ action: "read", target: getBaseName(inputPath) }, tense);
  }
  if (inputPath && WRITE_TOOL_KINDS.has(input.toolKind ?? "")) {
    return buildPresentation({ action: "write", target: getBaseName(inputPath) }, tense);
  }

  if (COMMAND_TOOL_KINDS.has(input.toolKind ?? "")) {
    const command = getCommandFromInput(input.input);
    if (command) {
      return buildPresentation({ action: "command", target: trimCommandPreview(command) }, tense);
    }
  }

  if (typeof input.toolTitle === "string" && input.toolTitle.trim().length > 0) {
    const pathHeavyTitle = formatPathHeavyTitle(input.toolTitle);
    if (pathHeavyTitle) {
      return buildPresentation(pathHeavyTitle, tense);
    }
    const action = SEARCH_TOOL_KINDS.has(input.toolKind ?? "") ? "search" : "fallback";
    return buildPresentation({ action, target: input.toolTitle.trim() }, tense);
  }

  if (EDIT_TOOL_KINDS.has(input.toolKind ?? "")) {
    const locationPresentation = formatEditSummary(getLocationPaths(input.locations));
    if (locationPresentation) {
      return buildPresentation(locationPresentation, tense);
    }
  }

  return buildPresentation(buildFallbackSummary(input), tense);
}

export function toToolActionLabel(title: string): string {
  if (title.length === 0) {
    return title;
  }
  return `${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}
