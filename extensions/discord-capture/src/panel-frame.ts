/**
 * The floating panel, injected into the Discord page.
 *
 * A toolbar popup closes the moment it loses focus, which is the wrong shape
 * for this extension: a search run takes minutes, and every glance at Discord
 * to see whether it is working closes the thing reporting on it. So the UI
 * lives in the page instead — draggable, resizable, and still there when you
 * click away.
 *
 * The UI itself is an extension page in an iframe rather than markup built
 * here. That keeps one implementation for the panel, the pop-out window and
 * anything else that hosts it, and it keeps the privileged calls (permission
 * prompts, downloads) in an extension document where they are allowed. This
 * file owns only the window chrome around it: the titlebar, the drag, the
 * resize and where it all sits.
 */
import { extensionApi } from "./browser";
import {
  BAR_HEIGHT,
  clampGeometry,
  type Geometry,
  LAYER,
  type PanelState,
  readPanelState,
  UNPLACED,
} from "./panel-geometry";

const HOST_TAG = "objekt-capture-panel";
const STYLE = `
:host { all: initial; }
.frame {
  position: fixed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #3f3f46;
  border-radius: 10px;
  background: #18181b;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .55);
  font: 13px system-ui, sans-serif;
  color: #eee;
  color-scheme: dark;
}
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: ${BAR_HEIGHT}px;
  padding: 0 6px 0 10px;
  background: #27272a;
  border-bottom: 1px solid #3f3f46;
  cursor: grab;
  user-select: none;
  flex: none;
}
.bar:focus-visible { outline: 2px solid #818cf8; outline-offset: -2px; }
.bar.dragging { cursor: grabbing; }
.title { flex: 1; font-size: 12px; font-weight: 600; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #6366f1; flex: none; }
.dot.busy { background: #22c55e; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }
button {
  all: unset;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  text-align: center;
  line-height: 22px;
  font-size: 13px;
  color: #a1a1aa;
  cursor: pointer;
  flex: none;
}
button:hover { background: #3f3f46; color: #fff; }
button:focus-visible { outline: 2px solid #818cf8; }
.body { flex: 1; min-height: 0; position: relative; background: #18181b; }
iframe { width: 100%; height: 100%; border: 0; display: block; }
.fallback { position: absolute; inset: 0; padding: 16px; font-size: 12px; color: #d4d4d8; }
.fallback a { color: #a5b4fc; }
.grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, #52525b 50%, #52525b 62%, transparent 62%, transparent 74%, #52525b 74%, #52525b 86%, transparent 86%);
}
.collapsed .body, .collapsed .grip { display: none; }
`;

interface Panel {
  host: HTMLElement;
  frame: HTMLIFrameElement;
  root: HTMLElement;
  bar: HTMLElement;
  dot: HTMLElement;
  notice: HTMLElement;
}

let panel: Panel | null = null;
let geometry: Geometry = { ...UNPLACED };
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function apply() {
  if (!panel) return;
  const { root } = panel;
  root.style.left = `${geometry.x}px`;
  root.style.top = `${geometry.y}px`;
  root.style.width = `${geometry.width}px`;
  root.style.height = geometry.collapsed
    ? `${BAR_HEIGHT}px`
    : `${geometry.height}px`;
  root.classList.toggle("collapsed", geometry.collapsed);
}

/**
 * Persist where the panel is, coalesced.
 *
 * A drag produces a position per frame; writing each one would spend the
 * storage write quota on intermediate states nobody will ever see.
 */
function save(open: boolean) {
  clearTimeout(saveTimer);
  const state: PanelState = { ...geometry, open };
  saveTimer = setTimeout(() => {
    void extensionApi.storage.local.set({ panel: state });
  }, 250);
}

export function panelIsOpen(): boolean {
  return panel !== null;
}

export function closePanel(): void {
  if (!panel) return;
  panel.host.remove();
  panel = null;
  save(false);
}

/**
 * Take the panel off the page without recording that it was closed.
 *
 * For a content script standing down in favour of a newer one: the panel is
 * being replaced, not dismissed, and writing "closed" would mean the
 * replacement declined to reopen it.
 */
export function discardPanel(): void {
  clearTimeout(saveTimer);
  panel?.host.remove();
  panel = null;
}

/**
 * Replace the panel's contents with a message.
 *
 * For the one thing the panel cannot say for itself: when the extension is
 * reloaded or updated, every frame belonging to the old copy is destroyed, so
 * the UI in it is already gone. Saying so where the panel was beats leaving a
 * blank rectangle over Discord.
 */
export function showPanelNotice(message: string): void {
  if (!panel) return;
  panel.frame.hidden = true;
  panel.notice.textContent = message;
  panel.notice.hidden = false;
  panel.dot.classList.remove("busy");
}

/** Turn the titlebar dot green while a run is going, so a covered panel still says so. */
export function markPanelBusy(busy: boolean): void {
  panel?.dot.classList.toggle("busy", busy);
}

function drag(bar: HTMLElement, frame: HTMLIFrameElement) {
  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (
      event.target instanceof HTMLElement &&
      event.target.tagName === "BUTTON"
    )
      return;
    const startX = event.clientX - geometry.x;
    const startY = event.clientY - geometry.y;
    bar.setPointerCapture(event.pointerId);
    bar.classList.add("dragging");
    // The iframe is a separate document and would otherwise swallow the moves
    // the moment the pointer crosses into it.
    frame.style.pointerEvents = "none";
    const move = (moved: PointerEvent) => {
      geometry = clampGeometry(
        { ...geometry, x: moved.clientX - startX, y: moved.clientY - startY },
        viewport(),
      );
      apply();
    };
    const end = () => {
      bar.removeEventListener("pointermove", move);
      bar.classList.remove("dragging");
      frame.style.pointerEvents = "";
      save(true);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", end, { once: true });
    bar.addEventListener("pointercancel", end, { once: true });
    event.preventDefault();
  });
  // Moving a window should not require a mouse.
  bar.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 40 : 8;
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = nudge[event.key];
    if (!delta) return;
    geometry = clampGeometry(
      { ...geometry, x: geometry.x + delta[0], y: geometry.y + delta[1] },
      viewport(),
    );
    apply();
    save(true);
    event.preventDefault();
  });
}

function resize(grip: HTMLElement, frame: HTMLIFrameElement) {
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const { width, height } = geometry;
    grip.setPointerCapture(event.pointerId);
    frame.style.pointerEvents = "none";
    const move = (moved: PointerEvent) => {
      geometry = clampGeometry(
        {
          ...geometry,
          width: width + (moved.clientX - startX),
          height: height + (moved.clientY - startY),
        },
        viewport(),
      );
      apply();
    };
    const end = () => {
      grip.removeEventListener("pointermove", move);
      frame.style.pointerEvents = "";
      save(true);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end, { once: true });
    grip.addEventListener("pointercancel", end, { once: true });
    event.preventDefault();
  });
}

function collapse(on: boolean) {
  geometry = clampGeometry({ ...geometry, collapsed: on }, viewport());
  apply();
  save(true);
}

/**
 * Show the panel, restoring where it was last left.
 *
 * `tabId` is baked into the iframe URL so the UI acts on the tab it is sitting
 * in rather than on whichever tab happens to be active — the two are the same
 * thing right up until the user clicks another tab mid-run.
 */
export async function openPanel(tabId: number | null): Promise<void> {
  if (panel) {
    panel.frame.focus();
    return;
  }
  const stored = await extensionApi.storage.local
    .get("panel")
    .then((settings) => readPanelState(settings.panel))
    .catch(() => ({ ...UNPLACED }));
  geometry = clampGeometry(stored, viewport());
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = document.createElement("div");
  root.className = "frame";
  root.style.zIndex = String(LAYER);
  const bar = document.createElement("header");
  bar.className = "bar";
  bar.tabIndex = 0;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute(
    "aria-label",
    "objekt.my capture panel — drag, or use the arrow keys, to move",
  );
  const dot = document.createElement("span");
  dot.className = "dot";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = "objekt.my capture";
  bar.append(dot, title);
  const body = document.createElement("div");
  body.className = "body";
  const frame = document.createElement("iframe");
  const url = new URL(extensionApi.runtime.getURL("panel.html"));
  url.searchParams.set("embedded", "1");
  if (tabId !== null) url.searchParams.set("tab", String(tabId));
  frame.src = url.toString();
  frame.setAttribute("title", "objekt.my capture");
  const fallback = document.createElement("div");
  fallback.className = "fallback";
  fallback.hidden = true;
  fallback.textContent =
    "This page will not let the panel load inside it. Use the toolbar button's pop-out window instead.";
  body.append(frame, fallback);
  const grip = document.createElement("div");
  grip.className = "grip";

  const button = (label: string, hint: string, run: () => void) => {
    const element = document.createElement("button");
    element.textContent = label;
    element.title = hint;
    element.setAttribute("aria-label", hint);
    element.addEventListener("click", run);
    return element;
  };
  bar.append(
    button("⤢", "Open in a separate window", () => {
      void extensionApi.runtime.sendMessage({ type: "open-window" });
    }),
    button("—", "Collapse to the titlebar", () =>
      collapse(!geometry.collapsed),
    ),
    button("✕", "Close the panel", () => closePanel()),
  );
  bar.addEventListener("dblclick", (event) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.tagName === "BUTTON"
    )
      return;
    collapse(!geometry.collapsed);
  });

  root.append(bar, body, grip);
  shadow.append(style, root);
  panel = { host, frame, root, bar, dot, notice: fallback };
  apply();
  // documentElement, not body: Discord owns everything under its own root and
  // reconciles it, and a panel removed by a re-render is a panel that vanishes
  // mid-run.
  document.documentElement.append(host);
  drag(bar, frame);
  resize(grip, frame);
  // A page CSP that refuses the frame leaves it blank rather than raising, so
  // the check is "did it ever load", not "did it error".
  let loaded = false;
  frame.addEventListener("load", () => {
    loaded = true;
  });
  setTimeout(() => {
    if (!loaded && panel) fallback.hidden = false;
  }, 4000);
  save(true);
}

export function togglePanel(tabId: number | null): void {
  if (panel) closePanel();
  else void openPanel(tabId);
}

/**
 * Keep the panel on screen when the window changes size, and put it back if
 * anything removes it.
 */
export function watchPanelPlacement(): void {
  window.addEventListener("resize", () => {
    if (!panel) return;
    geometry = clampGeometry(geometry, viewport());
    apply();
    save(true);
  });
  const keep = new MutationObserver(() => {
    if (panel && !panel.host.isConnected)
      document.documentElement.append(panel.host);
  });
  keep.observe(document.documentElement, { childList: true });
}
