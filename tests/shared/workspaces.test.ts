import { describe, expect, it } from "vitest";
import {
  createWorkspaceSlug,
  normalizeWorkspaceSettings,
  WORKSPACE_SCHEMA_VERSION,
} from "../../src/shared/workspaces.ts";

describe("workspace shared helpers", () => {
  it("normalizes user-facing names into stable slugs", () => {
    expect(createWorkspaceSlug("bknd")).toBe("bknd");
    expect(createWorkspaceSlug("Backend API")).toBe("backend-api");
    expect(createWorkspaceSlug("  Client + Web  ")).toBe("client-web");
    expect(createWorkspaceSlug("!!!")).toBe("");
  });

  it("normalizes valid settings with defaults", () => {
    expect(
      normalizeWorkspaceSettings(
        {
          id: "bknd",
          name: "Backend",
          rootPath: "/Users/tester/Projects/bknd",
        },
        { createdAt: "2026-05-07T00:00:00.000Z" },
      ),
    ).toEqual({
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      id: "bknd",
      name: "Backend",
      rootPath: "/Users/tester/Projects/bknd",
      defaultProvider: "codex",
      defaultSessionMode: "build",
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    });
  });

  it("rejects incomplete settings", () => {
    expect(normalizeWorkspaceSettings({ id: "bknd", name: "Backend" })).toBeUndefined();
    expect(normalizeWorkspaceSettings(undefined)).toBeUndefined();
  });
});
