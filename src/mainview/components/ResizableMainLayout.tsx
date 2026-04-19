import { useEffect, useRef } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DEFAULT_LEFT_PANEL_SIZE, DEFAULT_RIGHT_PANEL_SIZE, useUIStore } from "../state/uiStore";

interface ResizableMainLayoutProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  isRightSidebarOpen: boolean;
}

export function ResizableMainLayout({
  left,
  center,
  right,
  isRightSidebarOpen,
}: ResizableMainLayoutProps): React.ReactElement {
  const leftPanelSize = useUIStore((state) => state.leftPanelSize);
  const rightPanelSize = useUIStore((state) => state.rightPanelSize);
  const setPanelSizes = useUIStore((state) => state.setPanelSizes);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) {
      return;
    }
    if (isRightSidebarOpen && panel.isCollapsed()) {
      panel.expand();
    } else if (!isRightSidebarOpen && !panel.isCollapsed()) {
      panel.collapse();
    }
  }, [isRightSidebarOpen]);

  const leftDefault =
    typeof leftPanelSize === "number" && leftPanelSize > 0
      ? leftPanelSize
      : DEFAULT_LEFT_PANEL_SIZE;
  const rightDefault =
    typeof rightPanelSize === "number" && rightPanelSize > 0
      ? rightPanelSize
      : DEFAULT_RIGHT_PANEL_SIZE;

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="min-h-0 flex-1 gap-0"
      onLayout={(sizes) => {
        const [nextLeft, , nextRight] = sizes;
        if (typeof nextLeft !== "number") {
          return;
        }
        const resolvedRight =
          typeof nextRight === "number" && nextRight > 0 ? nextRight : rightPanelSize;
        setPanelSizes({ left: nextLeft, right: resolvedRight });
      }}
    >
      <ResizablePanel defaultSize={leftDefault} minSize={12} maxSize={40} className="min-h-0">
        {left}
      </ResizablePanel>
      <ResizableHandle className="mx-1 bg-transparent hover:bg-border" />
      <ResizablePanel minSize={30} className="min-h-0">
        {center}
      </ResizablePanel>
      <ResizableHandle className="mx-1 bg-transparent hover:bg-border" />
      <ResizablePanel
        ref={rightPanelRef}
        defaultSize={isRightSidebarOpen ? rightDefault : 0}
        minSize={15}
        maxSize={50}
        collapsible
        collapsedSize={0}
        className="min-h-0"
      >
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
