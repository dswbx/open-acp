import { useEffect, useRef } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DEFAULT_LEFT_PANEL_SIZE, DEFAULT_RIGHT_PANEL_SIZE, useUIStore } from "../state/uiStore";
import { cn } from "@/lib/utils";

interface ResizableMainLayoutProps {
  left: React.ReactNode;
  header: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  isRightSidebarOpen: boolean;
  handlerClassName?: string;
}

export function ResizableMainLayout({
  left,
  header,
  center,
  right,
  isRightSidebarOpen,
  handlerClassName,
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
        const [nextLeft] = sizes;
        if (typeof nextLeft !== "number") {
          return;
        }
        setPanelSizes({ left: nextLeft, right: rightPanelSize });
      }}
    >
      <ResizablePanel defaultSize={leftDefault} minSize={12} maxSize={40} className="min-h-0">
        {left}
      </ResizablePanel>
      <ResizableHandle className={cn("mx-1 bg-transparent hover:bg-border", handlerClassName)} />
      <ResizablePanel minSize={30} className="min-h-0">
        <div className="flex h-full min-h-0 flex-col">
          {header}
          <ResizablePanelGroup
            direction="horizontal"
            className="min-h-0 flex-1 gap-0"
            onLayout={(sizes) => {
              const [, nextRight] = sizes;
              if (typeof nextRight !== "number" || nextRight <= 0) {
                return;
              }
              setPanelSizes({ left: leftPanelSize, right: nextRight });
            }}
          >
            <ResizablePanel minSize={30} className="min-h-0">
              {center}
            </ResizablePanel>
            <ResizableHandle className="ml-2 bg-border hover:bg-primary/20" />
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
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
