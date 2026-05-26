import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getOpenAcpWorkspaceSessionsRoot } from "../../src/bun/openAcpHome.ts";
import { createWorkspaceStore } from "../../src/bun/workspaceStore.ts";

const tempDirectories: string[] = [];

describe("workspaceStore", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("creates and lists workspace settings under .open-acp/workspaces", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-workspaces-"));
    tempDirectories.push(root);
    const homeRoot = path.join(root, ".open-acp");
    const store = createWorkspaceStore({ homeRoot });

    const { workspace } = await store.createWorkspace({
      name: "Backend API",
      rootPath: "/Users/tester/Projects/bknd",
    });

    expect(workspace).toMatchObject({
      id: "backend-api",
      name: "Backend API",
      rootPath: "/Users/tester/Projects/bknd",
      settingsPath: path.join(homeRoot, "workspaces", "backend-api", "settings.json"),
      sessionsPath: path.join(homeRoot, "workspaces", "backend-api", "sessions"),
    });
    await expect(readFile(workspace.settingsPath, "utf8")).resolves.toContain(
      '"rootPath": "/Users/tester/Projects/bknd"',
    );
    await expect(readFile(workspace.settingsPath, "utf8")).resolves.toContain(
      '"defaultProvider": "codex"',
    );
    await expect(
      readFile(path.join(workspace.sessionsPath, ".keep"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(store.listWorkspaces()).resolves.toMatchObject({
      workspaces: [expect.objectContaining({ id: "backend-api" })],
    });
  });

  it("rejects duplicate workspace slugs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-workspaces-"));
    tempDirectories.push(root);
    const store = createWorkspaceStore({ homeRoot: path.join(root, ".open-acp") });

    await store.createWorkspace({ name: "Backend API", rootPath: "/one" });
    await expect(store.createWorkspace({ name: "backend-api", rootPath: "/two" })).rejects.toThrow(
      'Workspace "backend-api" already exists.',
    );
  });

  it("updates identity settings without changing the stable id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-workspaces-"));
    tempDirectories.push(root);
    const homeRoot = path.join(root, ".open-acp");
    const store = createWorkspaceStore({ homeRoot });
    await store.createWorkspace({ name: "Backend", rootPath: "/one" });

    const { workspace } = await store.updateWorkspaceSettings({
      workspaceId: "backend",
      name: "Backend Renamed",
      rootPath: "/two",
      defaultProvider: "claude",
      defaultSessionMode: "plan",
    });

    expect(workspace).toMatchObject({
      id: "backend",
      name: "Backend Renamed",
      rootPath: "/two",
      defaultProvider: "claude",
      defaultSessionMode: "plan",
      sessionsPath: getOpenAcpWorkspaceSessionsRoot("backend", homeRoot),
    });
  });

  it("ignores malformed workspace settings when listing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-workspaces-"));
    tempDirectories.push(root);
    const homeRoot = path.join(root, ".open-acp");
    await mkdir(path.join(homeRoot, "workspaces", "broken"), { recursive: true });

    await expect(createWorkspaceStore({ homeRoot }).listWorkspaces()).resolves.toEqual({
      workspaces: [],
    });
  });
});
