import type { DefaultSessionModeSetting } from "./appSettings.ts";
import { SMOKE_PROVIDERS, type SmokeProvider } from "./providerModels.ts";

export const WORKSPACE_SETTINGS_FILE_NAME = "settings.json";
export const WORKSPACE_SCHEMA_VERSION = 1;
export const DEFAULT_WORKSPACE_PROVIDER: SmokeProvider = "codex";
export const DEFAULT_WORKSPACE_SESSION_MODE: DefaultSessionModeSetting = "build";

export interface WorkspaceSettings {
  schemaVersion: number;
  id: string;
  name: string;
  rootPath: string;
  defaultProvider: SmokeProvider;
  defaultSessionMode: DefaultSessionModeSetting;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  rootPath: string;
  defaultProvider: SmokeProvider;
  defaultSessionMode: DefaultSessionModeSetting;
  settingsPath: string;
  sessionsPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListWorkspacesResult {
  workspaces: WorkspaceSummary[];
}

export interface CreateWorkspaceParams {
  name: string;
  rootPath: string;
  defaultProvider?: SmokeProvider;
  defaultSessionMode?: DefaultSessionModeSetting;
}

export interface CreateWorkspaceResult {
  workspace: WorkspaceSummary;
}

export interface UpdateWorkspaceSettingsParams {
  workspaceId: string;
  name: string;
  rootPath: string;
  defaultProvider?: SmokeProvider;
  defaultSessionMode?: DefaultSessionModeSetting;
}

export interface UpdateWorkspaceSettingsResult {
  workspace: WorkspaceSummary;
}

export function createWorkspaceSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeWorkspaceSettings(
  input: unknown,
  fallback?: Partial<WorkspaceSettings>,
): WorkspaceSettings | undefined {
  const candidate =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const id = readNonEmptyString(candidate.id) ?? readNonEmptyString(fallback?.id);
  const name = readNonEmptyString(candidate.name) ?? readNonEmptyString(fallback?.name);
  const rootPath = readNonEmptyString(candidate.rootPath) ?? readNonEmptyString(fallback?.rootPath);
  const defaultProvider = readProvider(candidate.defaultProvider) ?? fallback?.defaultProvider;
  const defaultSessionMode =
    readDefaultSessionMode(candidate.defaultSessionMode) ?? fallback?.defaultSessionMode;
  const createdAt =
    readNonEmptyString(candidate.createdAt) ??
    readNonEmptyString(fallback?.createdAt) ??
    new Date(0).toISOString();
  const updatedAt =
    readNonEmptyString(candidate.updatedAt) ?? readNonEmptyString(fallback?.updatedAt) ?? createdAt;

  if (!id || !name || !rootPath) {
    return undefined;
  }

  return {
    schemaVersion:
      typeof candidate.schemaVersion === "number" && Number.isFinite(candidate.schemaVersion)
        ? candidate.schemaVersion
        : (fallback?.schemaVersion ?? WORKSPACE_SCHEMA_VERSION),
    id,
    name,
    rootPath,
    defaultProvider: defaultProvider ?? DEFAULT_WORKSPACE_PROVIDER,
    defaultSessionMode: defaultSessionMode ?? DEFAULT_WORKSPACE_SESSION_MODE,
    createdAt,
    updatedAt,
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readProvider(value: unknown): SmokeProvider | undefined {
  return typeof value === "string" && (SMOKE_PROVIDERS as readonly string[]).includes(value)
    ? (value as SmokeProvider)
    : undefined;
}

function readDefaultSessionMode(value: unknown): DefaultSessionModeSetting | undefined {
  return value === "build" || value === "plan" ? value : undefined;
}
