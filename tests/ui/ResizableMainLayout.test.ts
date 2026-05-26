import { describe, expect, it } from "vitest";
import { clampResizablePanelWidths } from "../../src/mainview/components/ResizableMainLayout.tsx";
import { LEFT_PANEL_MIN_WIDTH, RIGHT_PANEL_MIN_WIDTH } from "../../src/shared/uiLayoutState.ts";

describe("ResizableMainLayout", () => {
  it("does not clamp persisted sidebar widths before the container has been measured", () => {
    expect(
      clampResizablePanelWidths({
        containerWidth: null,
        isRightSidebarOpen: true,
        leftWidth: 520,
        rightWidth: 460,
      }),
    ).toEqual({
      left: 520,
      right: 460,
    });
  });

  it("clamps sidebar widths after the container is measured", () => {
    expect(
      clampResizablePanelWidths({
        containerWidth: 700,
        isRightSidebarOpen: true,
        leftWidth: 520,
        rightWidth: 460,
      }),
    ).toEqual({
      left: LEFT_PANEL_MIN_WIDTH,
      right: RIGHT_PANEL_MIN_WIDTH,
    });
  });
});
