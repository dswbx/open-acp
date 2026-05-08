import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createWorkspaceSlug,
  normalizeWorkspaceSettings,
  WORKSPACE_SCHEMA_VERSION,
  type CreateWorkspaceParams,
  type UpdateWorkspaceSettingsParams,
  type WorkspaceSettings,
  type WorkspaceSummary,
} from "../shared/workspaces.ts";
import {
  getOpenAcpWorkspaceRoot,
  getOpenAcpWorkspacesRoot,
  getOpenAcpWorkspaceSessionsRoot,
  getOpenAcpWorkspaceSettingsPath,
} from "./openAcpHome.ts";

export interface WorkspaceStoreOptions {
  homeRoot?: string;
}

export function createWorkspaceStore(options: WorkspaceStoreOptions = {}) {
  const homeRoot = options.homeRoot;

  async function readWorkspaceSettings(
    workspaceId: string,
  ): Promise<WorkspaceSettings | undefined> {
    const settingsPath = getOpenAcpWorkspaceSettingsPath(workspaceId, homeRoot);
    const contents = await readFile(settingsPath, "utf8").catch((error: unknown) => {
      if (isFileNotFoundError(error)) return undefined;
      throw error;
    });
    if (!contents) return undefined;
    try {
      return normalizeWorkspaceSettings(JSON.parse(contents), { id: workspaceId });
    } catch {
      return undefined;
    }
  }

  function toSummary(settings: WorkspaceSettings): WorkspaceSummary {
    return {
      id: settings.id,
      name: settings.name,
      rootPath: settings.rootPath,
      settingsPath: getOpenAcpWorkspaceSettingsPath(settings.id, homeRoot),
      sessionsPath: getOpenAcpWorkspaceSessionsRoot(settings.id, homeRoot),
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  async function writeSettings(settings: WorkspaceSettings): Promise<WorkspaceSummary> {
    const settingsPath = getOpenAcpWorkspaceSettingsPath(settings.id, homeRoot);
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    return toSummary(settings);
  }

  return {
    async listWorkspaces(): Promise<{ workspaces: WorkspaceSummary[] }> {
      const root = getOpenAcpWorkspacesRoot(homeRoot);
      const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
        if (isFileNotFoundError(error)) return [];
        throw error;
      });

      const workspaces: WorkspaceSummary[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const settings = await readWorkspaceSettings(decodeURIComponent(entry.name));
        if (settings) workspaces.push(toSummary(settings));
      }

      workspaces.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return { workspaces };
    },

    async getWorkspace(workspaceId: string): Promise<WorkspaceSummary | undefined> {
      const settings = await readWorkspaceSettings(workspaceId);
      return settings ? toSummary(settings) : undefined;
    },

    async requireWorkspace(workspaceId: string): Promise<WorkspaceSummary> {
      const workspace = await this.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error(`Unknown workspace: ${workspaceId}`);
      }
      return workspace;
    },

    async createWorkspace(params: CreateWorkspaceParams): Promise<{ workspace: WorkspaceSummary }> {
      const name = params.name.trim();
      const rootPath = params.rootPath.trim();
      const id = createWorkspaceSlug(name);
      if (!id) {
        throw new Error("Workspace name must include at least one letter or number.");
      }
      if (!rootPath) {
        throw new Error("Workspace folder is required.");
      }
      const existing = await readWorkspaceSettings(id);
      if (existing) {
        throw new Error(`Workspace "${id}" already exists.`);
      }

      const timestamp = new Date().toISOString();
      const workspace = await writeSettings({
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        id,
        name,
        rootPath,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await mkdir(getOpenAcpWorkspaceSessionsRoot(id, homeRoot), { recursive: true });
      return { workspace };
    },

    async updateWorkspaceSettings(
      params: UpdateWorkspaceSettingsParams,
    ): Promise<{ workspace: WorkspaceSummary }> {
      const current = await readWorkspaceSettings(params.workspaceId);
      if (!current) {
        throw new Error(`Unknown workspace: ${params.workspaceId}`);
      }
      const name = params.name.trim();
      const rootPath = params.rootPath.trim();
      if (!name || !rootPath) {
        throw new Error("Workspace name and folder are required.");
      }
      return {
        workspace: await writeSettings({
          ...current,
          name,
          rootPath,
          updatedAt: new Date().toISOString(),
        }),
      };
    },

    getWorkspaceDirectory(workspaceId: string): string {
      return getOpenAcpWorkspaceRoot(workspaceId, homeRoot);
    },
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
