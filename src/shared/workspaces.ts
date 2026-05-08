export const WORKSPACE_SETTINGS_FILE_NAME = "settings.json";
export const WORKSPACE_SCHEMA_VERSION = 1;

export interface WorkspaceSettings {
  schemaVersion: number;
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  rootPath: string;
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
}

export interface CreateWorkspaceResult {
  workspace: WorkspaceSummary;
}

export interface UpdateWorkspaceSettingsParams {
  workspaceId: string;
  name: string;
  rootPath: string;
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
    createdAt,
    updatedAt,
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
