/**
 * Where the floating panel sits, and how to keep that sane.
 *
 * Split from the panel itself so it can be tested without a browser: geometry
 * restored from storage is the part most likely to be wrong, because it was
 * saved on a window that no longer exists.
 */
const MIN_WIDTH = 300;
const MIN_HEIGHT = 260;
/** Collapsed height, which is the titlebar and nothing else. */
export const BAR_HEIGHT = 34;
const DEFAULT_WIDTH = 384;
const DEFAULT_HEIGHT = 640;
/** Above Discord's modals, below nothing that matters. */
export const LAYER = 2147483000;
const MARGIN = 12;

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
}

export interface PanelState extends Geometry {
  /** Whether the panel was showing when the tab was last used. */
  open: boolean;
}

export const UNPLACED: PanelState = {
  x: -1,
  y: -1,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  collapsed: false,
  open: false,
};

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Read stored geometry, tolerating anything at all in storage. */
export function readPanelState(value: unknown): PanelState {
  if (!value || typeof value !== "object") return { ...UNPLACED };
  const stored = value as Record<string, unknown>;
  return {
    x: number(stored.x, UNPLACED.x),
    y: number(stored.y, UNPLACED.y),
    width: number(stored.width, UNPLACED.width),
    height: number(stored.height, UNPLACED.height),
    collapsed: stored.collapsed === true,
    open: stored.open === true,
  };
}

/**
 * Put the panel somewhere it can actually be seen and grabbed.
 *
 * Geometry outlives the window it was saved in — a panel dragged to the right
 * of a wide monitor is off-screen on a laptop, and one whose titlebar is above
 * the top edge cannot be dragged back. Negative coordinates mean "never placed",
 * which parks it in the top right where Discord has nothing important.
 */
export function clampGeometry(
  state: Geometry,
  viewport: { width: number; height: number },
): Geometry {
  const width = Math.min(
    Math.max(MIN_WIDTH, state.width),
    Math.max(MIN_WIDTH, viewport.width - MARGIN * 2),
  );
  const visible = state.collapsed ? BAR_HEIGHT : state.height;
  const height = Math.min(
    Math.max(MIN_HEIGHT, state.height),
    Math.max(MIN_HEIGHT, viewport.height - MARGIN * 2),
  );
  const unplaced = state.x < 0 || state.y < 0;
  const x = unplaced ? viewport.width - width - MARGIN : state.x;
  const y = unplaced ? MARGIN : state.y;
  return {
    ...state,
    width,
    height,
    // The titlebar must stay reachable: fully on screen horizontally, and never
    // scrolled off the top or bottom.
    x: Math.min(Math.max(MARGIN - width + 80, x), viewport.width - 80),
    y: Math.min(Math.max(0, y), Math.max(0, viewport.height - visible)),
  };
}
