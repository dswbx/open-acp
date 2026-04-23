import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEFT_PANEL_SIZE,
  DEFAULT_RIGHT_PANEL_SIZE,
  LEFT_PANEL_MIN_WIDTH,
  normalizeUILayoutState,
  RIGHT_PANEL_MIN_WIDTH,
} from "../../src/shared/uiLayoutState.ts";

describe("uiLayoutState", () => {
  it("falls back to defaults and clamps invalid persisted sizes", () => {
    expect(
      normalizeUILayoutState({
        isRightSidebarOpen: "yes",
        leftPanelSize: 10,
        rightPanelSize: 120,
      }),
    ).toEqual({
      isRightSidebarOpen: true,
      leftPanelSize: LEFT_PANEL_MIN_WIDTH,
      rightPanelSize: RIGHT_PANEL_MIN_WIDTH,
    });
  });

  it("keeps valid persisted values", () => {
    expect(
      normalizeUILayoutState({
        isRightSidebarOpen: false,
        leftPanelSize: 320,
        rightPanelSize: 420,
      }),
    ).toEqual({
      isRightSidebarOpen: false,
      leftPanelSize: 320,
      rightPanelSize: 420,
    });
  });

  it("uses the documented defaults when state is absent", () => {
    expect(normalizeUILayoutState(undefined)).toEqual({
      isRightSidebarOpen: true,
      leftPanelSize: DEFAULT_LEFT_PANEL_SIZE,
      rightPanelSize: DEFAULT_RIGHT_PANEL_SIZE,
    });
  });
});
