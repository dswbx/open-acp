import { describe, expect, it } from "vitest";
import {
  createProviderSessionHandleFromACP,
  normalizeProviderCapabilitiesFromACP,
  normalizeProviderModeState,
  updateProviderConfigOptionValue,
} from "../../src/bun/providers/providerContractHelpers.ts";

describe("providerContractHelpers", () => {
  it("prefers configOptions mode surfaces over legacy modes", () => {
    const modeState = normalizeProviderModeState(
      [
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: "plan",
          options: [
            { value: "build", name: "Build" },
            { value: "plan", name: "Plan" },
          ],
        },
      ],
      {
        currentModeId: "build",
        availableModes: [{ id: "build", name: "Build" }],
      },
      null,
    );

    expect(modeState).toMatchObject({
      currentModeId: "plan",
      configOptionId: "mode",
      source: "config_option",
      availableModes: [
        { rawModeId: "build", kind: "execute" },
        { rawModeId: "plan", kind: "plan" },
      ],
    });
  });

  it("falls back to provider metadata when no mode option exists", () => {
    const modeState = normalizeProviderModeState([], null, {
      currentModeId: "build",
    });

    expect(modeState).toEqual({
      currentModeId: "build",
      availableModes: [
        {
          id: "build",
          kind: "execute",
          label: "Build",
          rawModeId: "build",
          source: "provider",
        },
      ],
      source: "provider",
    });
  });

  it("creates a normalized provider session handle from ACP setup", () => {
    const handle = createProviderSessionHandleFromACP(
      "codex",
      "/workspace",
      "acp",
      {
        sessionId: "session-1",
        models: {
          currentModelId: "gpt-5.4",
          availableModels: [{ modelId: "gpt-5.4", name: "GPT-5.4" }],
        },
        configOptions: [
          {
            id: "mode",
            name: "Mode",
            category: "mode",
            type: "select",
            currentValue: "plan",
            options: [{ value: "plan", name: "Plan" }],
          },
        ],
        _meta: {
          providerSessionId: "provider-thread-1",
          currentModeId: "plan",
        },
      },
      "session-1",
    );

    expect(handle).toMatchObject({
      sessionId: "session-1",
      cwd: "/workspace",
      provider: "codex",
      models: [{ id: "gpt-5.4", title: "GPT-5.4" }],
      config: {
        mode: {
          currentModeId: "plan",
        },
      },
      replay: {
        transport: "acp",
        providerSessionId: "provider-thread-1",
        currentModeId: "plan",
      },
    });
  });

  it("updates mode state when a config option changes", () => {
    const next = updateProviderConfigOptionValue(
      {
        options: [
          {
            id: "mode",
            name: "Mode",
            category: "mode",
            type: "select",
            currentValue: "build",
            options: [
              { value: "build", name: "Build" },
              { value: "plan", name: "Plan" },
            ],
          },
        ],
        mode: {
          currentModeId: "build",
          availableModes: [
            {
              id: "build",
              rawModeId: "build",
              label: "Build",
              kind: "execute",
              source: "config_option",
            },
            {
              id: "plan",
              rawModeId: "plan",
              label: "Plan",
              kind: "plan",
              source: "config_option",
            },
          ],
          configOptionId: "mode",
          source: "config_option",
        },
      },
      "mode",
      "plan",
    );

    expect(next.mode.currentModeId).toBe("plan");
    expect(next.options[0]?.currentValue).toBe("plan");
  });

  it("normalizes OpenACP userInput capability advertisement", () => {
    const capabilities = normalizeProviderCapabilitiesFromACP({
      protocolVersion: 1,
      agentCapabilities: {},
      authMethods: [],
      _meta: {
        "_openacp/capabilities": {
          userInput: true,
        },
      },
    });

    expect(capabilities.extensions.userInput).toBe(true);
  });
});
