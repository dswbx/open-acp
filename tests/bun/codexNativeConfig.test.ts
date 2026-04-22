import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCodexNativeProviderModelOptions,
  buildCodexNativeSessionModelState,
  defaultCodexNativeConfigState,
  loadCodexNativeConfigState,
  resolveCodexTurnConfig,
} from "../../src/bun/providers/codexNative/config.ts";

const tempDirectories: string[] = [];

describe("codexNative config", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it("keeps stable built-in inline model variants for the existing picker UX", () => {
    const models = buildCodexNativeProviderModelOptions(defaultCodexNativeConfigState());

    expect(models).toContainEqual({
      id: "gpt-5.4/high",
      title: "GPT-5.4 (high)",
      contextWindowTokens: null,
    });
    expect(models).toContainEqual({
      id: "gpt-5.3-codex/minimal",
      title: "GPT-5.3 Codex (minimal)",
      contextWindowTokens: null,
    });
  });

  it("prefers project Codex config over the global one", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "codex-native-config-"));
    tempDirectories.push(cwd);

    const homeDirectory = path.join(cwd, "home");
    const projectDirectory = path.join(cwd, "project");
    await mkdir(path.join(homeDirectory, ".codex"), { recursive: true });
    await mkdir(path.join(projectDirectory, ".codex"), { recursive: true });

    const previousHome = process.env.HOME;
    process.env.HOME = homeDirectory;

    try {
      await writeFile(
        path.join(homeDirectory, ".codex", "config.toml"),
        'model = "gpt-5.4"\nmodel_reasoning_effort = "low"\nservice_tier = "fast"\n',
        "utf8",
      );
      await writeFile(
        path.join(projectDirectory, ".codex", "config.toml"),
        'model = "gpt-oss-custom"\nmodel_reasoning_effort = "minimal"\nservice_tier = "flex"\n',
        "utf8",
      );

      const state = await loadCodexNativeConfigState(projectDirectory);

      expect(state).toEqual({
        currentModelId: "gpt-oss-custom",
        reasoningEffort: "minimal",
        fastMode: false,
      });
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("falls back to config defaults when no explicit model is selected", () => {
    const turnConfig = resolveCodexTurnConfig(undefined, {
      currentModelId: "gpt-5.4",
      reasoningEffort: "medium",
      fastMode: true,
    });

    expect(turnConfig).toEqual({
      encodedModelId: "gpt-5.4/medium",
      model: "gpt-5.4",
      effort: "medium",
      serviceTier: "fast",
    });
  });

  it("splits an encoded inline model into native model and effort fields", () => {
    const turnConfig = resolveCodexTurnConfig("gpt-5.2-codex/xhigh", {
      currentModelId: "gpt-5.4",
      reasoningEffort: "medium",
      fastMode: false,
    });

    expect(turnConfig).toEqual({
      encodedModelId: "gpt-5.2-codex/xhigh",
      model: "gpt-5.2-codex",
      effort: "xhigh",
      serviceTier: undefined,
    });
  });

  it("exposes the current configured model as the active session model id", () => {
    const state = buildCodexNativeSessionModelState({
      currentModelId: "gpt-oss-custom",
      reasoningEffort: "low",
      fastMode: false,
    });

    expect(state.currentModelId).toBe("gpt-oss-custom/low");
    expect(state.availableModels.some((model) => model.modelId === "gpt-oss-custom/low")).toBe(
      true,
    );
  });
});
