import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { cn } from "@/lib/utils";
import {
  DEFAULT_LEFT_PANEL_SIZE,
  DEFAULT_RIGHT_PANEL_SIZE,
  LEFT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
} from "../../shared/uiLayoutState.ts";
import { useUIStore } from "../state/uiStore";

const CENTER_PANEL_MIN_WIDTH = 250;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface ResizablePanelWidthState {
  left: number;
  right: number;
}

export function clampResizablePanelWidths({
  containerWidth,
  isRightSidebarOpen,
  leftWidth,
  rightWidth,
}: {
  containerWidth: number | null;
  isRightSidebarOpen: boolean;
  leftWidth: number;
  rightWidth: number;
}): ResizablePanelWidthState {
  if (containerWidth === null || containerWidth <= 0) {
    return {
      left: leftWidth,
      right: rightWidth,
    };
  }

  const maxLeftWidth = Math.max(
    LEFT_PANEL_MIN_WIDTH,
    containerWidth - CENTER_PANEL_MIN_WIDTH - (isRightSidebarOpen ? rightWidth : 0),
  );
  const nextLeftWidth = clamp(leftWidth, LEFT_PANEL_MIN_WIDTH, maxLeftWidth);
  const maxRightWidth = Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    containerWidth - nextLeftWidth - CENTER_PANEL_MIN_WIDTH,
  );

  return {
    left: nextLeftWidth,
    right: clamp(rightWidth, RIGHT_PANEL_MIN_WIDTH, maxRightWidth),
  };
}

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
  const storedLeftWidth = useUIStore((state) => state.leftPanelSize);
  const storedRightWidth = useUIStore((state) => state.rightPanelSize);
  const setPanelSizes = useUIStore((state) => state.setPanelSizes);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [panelWidths, setPanelWidths] = useState<ResizablePanelWidthState>({
    left: storedLeftWidth > 0 ? storedLeftWidth : DEFAULT_LEFT_PANEL_SIZE,
    right: storedRightWidth > 0 ? storedRightWidth : DEFAULT_RIGHT_PANEL_SIZE,
  });
  const leftWidth = panelWidths.left;
  const rightWidth = panelWidths.right;
  const hasMeasuredContainer = containerWidth !== null && containerWidth > 0;

  const maxLeftWidth = hasMeasuredContainer
    ? Math.max(
        LEFT_PANEL_MIN_WIDTH,
        containerWidth - CENTER_PANEL_MIN_WIDTH - (isRightSidebarOpen ? rightWidth : 0),
      )
    : Number.POSITIVE_INFINITY;
  const maxRightWidth = hasMeasuredContainer
    ? Math.max(RIGHT_PANEL_MIN_WIDTH, containerWidth - leftWidth - CENTER_PANEL_MIN_WIDTH)
    : Number.POSITIVE_INFINITY;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });

    resizeObserver.observe(container);
    setContainerWidth(container.getBoundingClientRect().width);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    setPanelWidths((current) => {
      const next = clampResizablePanelWidths({
        containerWidth,
        isRightSidebarOpen,
        leftWidth: storedLeftWidth > 0 ? storedLeftWidth : DEFAULT_LEFT_PANEL_SIZE,
        rightWidth: storedRightWidth > 0 ? storedRightWidth : DEFAULT_RIGHT_PANEL_SIZE,
      });
      return current.left === next.left && current.right === next.right ? current : next;
    });
  }, [containerWidth, isRightSidebarOpen, storedLeftWidth, storedRightWidth]);

  useEffect(() => {
    setPanelWidths((current) => {
      const next = clampResizablePanelWidths({
        containerWidth,
        isRightSidebarOpen,
        leftWidth: current.left,
        rightWidth: current.right,
      });
      return current.left === next.left && current.right === next.right ? current : next;
    });
  }, [containerWidth, isRightSidebarOpen]);

  useEffect(() => {
    setPanelSizes({ left: leftWidth, right: rightWidth });
  }, [leftWidth, rightWidth, setPanelSizes]);

  const startLeftDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = leftWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(
        startWidth + (moveEvent.clientX - startX),
        LEFT_PANEL_MIN_WIDTH,
        maxLeftWidth,
      );
      setPanelWidths((current) => ({ ...current, left: nextWidth }));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  const startRightDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = rightWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(
        startWidth - (moveEvent.clientX - startX),
        RIGHT_PANEL_MIN_WIDTH,
        maxRightWidth,
      );
      setPanelWidths((current) => ({ ...current, right: nextWidth }));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  return (
    <div ref={containerRef} className="min-h-0 flex-1">
      <div className="flex h-full min-h-0 min-w-0">
        <aside className="relative min-h-0 shrink-0 overflow-hidden" style={{ width: leftWidth }}>
          {left}
          <div
            aria-label="Resize left sidebar"
            className={cn(
              "absolute top-0 right-0 h-full w-2 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-border",
              handlerClassName,
            )}
            onPointerDown={startLeftDrag}
            role="separator"
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          {header}

          <div className="flex min-h-0 min-w-0 flex-1">
            <section className="min-h-0 min-w-0 flex-1">{center}</section>

            {isRightSidebarOpen ? (
              <aside
                className="relative min-h-0 shrink-0 overflow-hidden"
                style={{ width: rightWidth }}
              >
                <div
                  aria-label="Resize right sidebar"
                  className="absolute top-0 left-0 z-10 h-full w-px -translate-x-1/2 cursor-col-resize bg-border hover:bg-primary/20"
                  onPointerDown={startRightDrag}
                  role="separator"
                />
                {right}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
