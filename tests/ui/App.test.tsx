import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/mainview/App.tsx";

describe("App UI shell", () => {
  it("renders orchestrator header and sections", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Agent Orchestrator");
    expect(html).toContain("Sessions");
    expect(html).toContain("Chat");
    expect(html).toContain("Default model");
    expect(html).toContain("Session inspector");
    expect(html).toContain("Runtime events");
  });
});
