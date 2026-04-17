import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/mainview/App.tsx";
import { createEmptyProviderModelCatalog } from "../../src/shared/providerModels.ts";
import type { SmokeBridge } from "../../src/mainview/bridge/SmokeBridge.ts";

class RecordingSmokeBridge implements SmokeBridge {
  readonly modelCatalogRequests: string[] = [];

  isAvailable(): boolean {
    return true;
  }

  async startSmokeTest() {
    throw new Error("not used");
  }

  async sendChatMessage() {
    throw new Error("not used");
  }

  async createChatSession() {
    throw new Error("not used");
  }

  async getProviderModelCatalog(provider: "codex" | "claude" | "opencode") {
    this.modelCatalogRequests.push(provider);
    return {
      provider,
      catalog: createEmptyProviderModelCatalog(provider)
    };
  }

  subscribe(): () => void {
    return () => {};
  }
}

describe("App UI shell", () => {
  it("renders orchestrator header, chat, and theme controls", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Agent Orchestrator");
    expect(html).toContain("Sessions");
    expect(html).toContain("Chat");
    expect(html).toContain("Default model");
    expect(html).not.toContain("gpt-5.3-codex");
    expect(html).toContain("Session inspector");
    expect(html).toContain("Runtime events");
    expect(html).toContain("Theme");
    expect(html).toContain("System");
    expect(html).toContain("bg-card");
    expect(html).toContain("border-border");
    expect(html).toContain("text-muted-foreground");
  });

  it("does not fetch provider models on initial mount", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        matchMedia: () => ({
          matches: false,
          addEventListener() {},
          removeEventListener() {}
        })
      }
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          classList: {
            toggle() {}
          }
        }
      }
    });

    try {
      app.setState = (() => undefined) as typeof app.setState;
      app.componentDidMount();
      expect(bridge.modelCatalogRequests).toEqual([]);
      app.componentWillUnmount();
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument
      });
    }
  });

  it("does not fetch provider models when switching providers before a session exists", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    app.handleSelectProvider("claude");

    expect(app.state.selectedProvider).toBe("claude");
    expect(bridge.modelCatalogRequests).toEqual([]);
  });
});
