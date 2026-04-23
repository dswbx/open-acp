export const DEFAULT_LEFT_PANEL_SIZE = 280;
export const DEFAULT_RIGHT_PANEL_SIZE = 320;

export const LEFT_PANEL_MIN_WIDTH = 250;
export const RIGHT_PANEL_MIN_WIDTH = 300;

export interface PersistedUILayoutState {
  isRightSidebarOpen: boolean;
  leftPanelSize: number;
  rightPanelSize: number;
}

function clampPanelSize(value: unknown, minimum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(value, minimum) : fallback;
}

export function normalizeUILayoutState(state: unknown): PersistedUILayoutState {
  const candidate =
    state && typeof state === "object" ? (state as Partial<PersistedUILayoutState>) : undefined;

  return {
    isRightSidebarOpen:
      typeof candidate?.isRightSidebarOpen === "boolean" ? candidate.isRightSidebarOpen : true,
    leftPanelSize: clampPanelSize(
      candidate?.leftPanelSize,
      LEFT_PANEL_MIN_WIDTH,
      DEFAULT_LEFT_PANEL_SIZE,
    ),
    rightPanelSize: clampPanelSize(
      candidate?.rightPanelSize,
      RIGHT_PANEL_MIN_WIDTH,
      DEFAULT_RIGHT_PANEL_SIZE,
    ),
  };
}
