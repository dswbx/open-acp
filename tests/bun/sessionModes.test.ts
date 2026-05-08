import { describe, expect, it } from "vitest";
import {
  createSessionModeChangeInstruction,
  resolvePlanReviewOutcome,
  resolveSessionModeState,
} from "../../src/bun/sessionModes.ts";

describe("sessionModes", () => {
  it("prefers configOptions over modes when both are advertised", () => {
    const state = resolveSessionModeState({
      provider: "claude",
      sessionId: "session-claude",
      cwd: "/workspace/claude",
      configOptions: [
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: "plan",
          options: [
            { value: "default", name: "Default" },
            { value: "plan", name: "Plan" },
          ],
        },
      ],
      modes: {
        currentModeId: "default",
        availableModes: [
          { id: "default", name: "Default" },
          { id: "plan", name: "Plan" },
        ],
      },
    });

    expect(state.publicState.normalizedMode).toBe("plan");
    expect(state.publicState.syncSource).toBe("config_option");
    expect(state.publicState.currentProviderModeId).toBe("plan");
    expect(state.targets.build).toEqual({
      kind: "config_option",
      configId: "mode",
      value: "default",
    });
    expect(state.targets.plan).toEqual({
      kind: "config_option",
      configId: "mode",
      value: "plan",
    });
  });

  it("falls back to Codex collaboration config options when no ACP mode option exists", () => {
    const state = resolveSessionModeState({
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      configOptions: [
        {
          id: "collaboration_mode",
          name: "Collaboration mode",
          type: "select",
          currentValue: "default",
          options: [
            { value: "default", name: "Default" },
            { value: "plan", name: "Plan" },
          ],
        },
      ],
    });

    expect(state.publicState.syncSource).toBe("provider_private");
    expect(state.publicState.supportsPlanMode).toBe(true);
    expect(state.publicState.preferredConfigId).toBe("collaboration_mode");
    expect(state.targets.plan).toEqual({
      kind: "config_option",
      configId: "collaboration_mode",
      value: "plan",
    });
  });

  it("uses a Codex provider-private default/plan fallback when ACP surfaces are missing", () => {
    const state = resolveSessionModeState({
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
    });

    expect(state.publicState.syncSource).toBe("provider_private");
    expect(state.publicState.supportsPlanMode).toBe(true);
    expect(state.targets.build).toEqual({
      kind: "session_mode",
      modeId: "default",
    });
    expect(state.targets.plan).toEqual({
      kind: "session_mode",
      modeId: "plan",
    });
  });

  it("maps Codex approval preset mode surfaces onto normalized build and plan", () => {
    const state = resolveSessionModeState({
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      configOptions: [
        {
          id: "mode",
          name: "Approval Preset",
          category: "mode",
          type: "select",
          currentValue: "auto",
          options: [
            { value: "read-only", name: "Read Only" },
            { value: "auto", name: "Default" },
            { value: "full-access", name: "Full Access" },
          ],
        },
      ],
      modes: {
        currentModeId: "auto",
        availableModes: [
          { id: "read-only", name: "Read Only" },
          { id: "auto", name: "Default" },
          { id: "full-access", name: "Full Access" },
        ],
      },
    });

    expect(state.publicState.normalizedMode).toBe("build");
    expect(state.publicState.syncSource).toBe("config_option");
    expect(state.publicState.supportsPlanMode).toBe(true);
    expect(state.publicState.preferredConfigId).toBe("mode");
    expect(state.targets.build).toEqual({
      kind: "config_option",
      configId: "mode",
      value: "auto",
    });
    expect(state.targets.plan).toEqual({
      kind: "config_option",
      configId: "mode",
      value: "read-only",
    });
  });

  it("uses session/set_mode when only ACP modes are available", () => {
    const state = resolveSessionModeState({
      provider: "qwen",
      sessionId: "session-qwen",
      cwd: "/workspace/qwen",
      modes: {
        currentModeId: "default",
        availableModes: [
          { id: "default", name: "Default" },
          { id: "plan", name: "Plan" },
        ],
      },
    });

    const instruction = createSessionModeChangeInstruction(state, "plan");
    expect(instruction).toEqual({
      kind: "set_mode",
      state,
      modeId: "plan",
    });
  });

  it("uses OpenCode ACP mode config options for build and plan switching", () => {
    const buildState = resolveSessionModeState({
      provider: "opencode",
      sessionId: "session-opencode",
      cwd: "/workspace/opencode",
      configOptions: [
        {
          id: "mode",
          name: "Session Mode",
          category: "mode",
          type: "select",
          currentValue: "build",
          options: [
            {
              value: "build",
              name: "build",
              description: "The default agent. Executes tools based on configured permissions.",
            },
            {
              value: "plan",
              name: "plan",
              description: "Plan mode. Disallows all edit tools.",
            },
          ],
        },
      ],
    });

    expect(buildState.publicState.normalizedMode).toBe("build");
    expect(createSessionModeChangeInstruction(buildState, "plan")).toEqual({
      kind: "set_config_option",
      state: buildState,
      configId: "mode",
      value: "plan",
    });

    const planState = resolveSessionModeState({
      provider: "opencode",
      sessionId: "session-opencode",
      cwd: "/workspace/opencode",
      configOptions: [
        {
          id: "mode",
          name: "Session Mode",
          category: "mode",
          type: "select",
          currentValue: "plan",
          options: [
            {
              value: "build",
              name: "build",
              description: "The default agent. Executes tools based on configured permissions.",
            },
            {
              value: "plan",
              name: "plan",
              description: "Plan mode. Disallows all edit tools.",
            },
          ],
        },
      ],
    });

    expect(planState.publicState.normalizedMode).toBe("plan");
    expect(createSessionModeChangeInstruction(planState, "build")).toEqual({
      kind: "set_config_option",
      state: planState,
      configId: "mode",
      value: "build",
    });
  });

  it("uses Codex approval preset config switching for build and plan", () => {
    const state = resolveSessionModeState({
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      configOptions: [
        {
          id: "mode",
          name: "Approval Preset",
          category: "mode",
          type: "select",
          currentValue: "read-only",
          options: [
            { value: "read-only", name: "Read Only" },
            { value: "auto", name: "Default" },
            { value: "full-access", name: "Full Access" },
          ],
        },
      ],
    });

    expect(createSessionModeChangeInstruction(state, "build")).toEqual({
      kind: "set_config_option",
      state,
      configId: "mode",
      value: "auto",
    });
    expect(createSessionModeChangeInstruction(state, "plan")).toEqual({
      kind: "noop",
      state,
    });
  });

  it("maps plan-review decisions onto ACP permission outcomes", () => {
    const options = [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
      { optionId: "reject-once", name: "Reject once", kind: "reject_once" },
      { optionId: "reject-always", name: "Reject always", kind: "reject_always" },
    ];

    expect(resolvePlanReviewOutcome("start_build", options)).toEqual({
      outcome: "selected",
      optionId: "allow-once",
    });
    expect(resolvePlanReviewOutcome("revise", options)).toEqual({
      outcome: "selected",
      optionId: "reject-once",
    });
    expect(resolvePlanReviewOutcome("cancel", options)).toEqual({
      outcome: "cancelled",
    });
  });
});
