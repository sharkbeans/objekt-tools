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
  LAYOUT,
  type PanelState,
  readPanelState,
  UNPLACED,
} from "./panel-geometry";

const HOST_TAG = "objekt-capture-panel";
const STYLE = `
:host { all: initial; }
/* objekt.my's palette, in the theme Discord is showing (see \`frameTheme\`). */
.frame {
  --bg: #0a0a0a; --fg: #fafafa; --muted-fg: #a1a1a1; --accent: #262626;
  --border: rgb(255 255 255 / 12%); --ring: #737373; --good: #4ade80;
  position: fixed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  box-shadow: 0 24px 64px rgb(0 0 0 / 50%), 0 2px 8px rgb(0 0 0 / 30%);
  font: 14px "Helvetica Neue", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--fg);
  color-scheme: dark;
}
.frame.light {
  --bg: #ffffff; --fg: #0a0a0a; --muted-fg: #737373; --accent: #f5f5f5;
  --border: #e5e5e5; --ring: #a1a1a1; --good: #16a34a;
  box-shadow: 0 24px 64px rgb(0 0 0 / 16%), 0 2px 8px rgb(0 0 0 / 8%);
  color-scheme: light;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: ${BAR_HEIGHT}px;
  padding: 0 5px 0 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;
  flex: none;
}
.bar:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--ring); }
.bar.dragging { cursor: grabbing; }
.logo { width: 18px; height: 18px; flex: none; color: var(--fg); }
.title { font-size: 14px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { display: none; align-items: center; gap: 6px; font-size: 13px; color: var(--muted-fg); white-space: nowrap; }
.status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--good); animation: pulse 1.4s ease-in-out infinite; }
.busy .status { display: inline-flex; }
@keyframes pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .status::before { animation: none; } }
.spacer { flex: 1; }
button {
  all: unset;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: var(--muted-fg);
  cursor: pointer;
  flex: none;
  transition: background-color .15s, color .15s;
}
button:hover { background: var(--accent); color: var(--fg); }
button:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.body { flex: 1; min-height: 0; position: relative; background: var(--bg); }
iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--bg); color-scheme: normal; }
.fallback { position: absolute; inset: 0; padding: 20px; font-size: 15px; line-height: 1.5; color: var(--fg); }
.fallback a { color: inherit; }
.grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  opacity: .6;
  background: linear-gradient(135deg, transparent 55%, var(--muted-fg) 55%, var(--muted-fg) 62%, transparent 62%, transparent 74%, var(--muted-fg) 74%, var(--muted-fg) 81%, transparent 81%);
}
.grip:hover { opacity: 1; }
.collapsed .body, .collapsed .grip { display: none; }
.collapsed .bar { border-bottom: 0; }
`;

interface Panel {
  host: HTMLElement;
  frame: HTMLIFrameElement;
  root: HTMLElement;
  bar: HTMLElement;
  notice: HTMLElement;
}

const SVG = "http://www.w3.org/2000/svg";

/** An SVG element with attributes, built without markup parsing. */
function svgElement(
  name: string,
  attributes: Record<string, string>,
  children: Element[] = [],
): SVGElement {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  node.append(...children);
  return node;
}

/** A 24px line icon, from its path data. */
function lineIcon(paths: string[], extra: Element[] = []): SVGElement {
  return svgElement("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [
    ...paths.map((d) => svgElement("path", { d })),
    ...extra,
  ]);
}

/**
 * objekt.my's mark: two chamfered squares, the lower one hollow. The same
 * geometry as `src/components/objekt-logo.tsx`, as an SVG. The mask id only
 * has to be unique inside this shadow root.
 */
function logo(): SVGElement {
  const cut = svgElement("mask", { id: "objekt-logo-cut" }, [
    svgElement("rect", { width: "100", height: "100", fill: "#fff" }),
    svgElement("polygon", {
      points: "29.46,44.5 55.5,44.5 55.5,69.92 49.92,75.5 24.5,75.5 24.5,49.46",
      fill: "#000",
    }),
  ]);
  const shapes = svgElement(
    "g",
    { mask: "url(#objekt-logo-cut)", fill: "currentColor" },
    [
      svgElement("polygon", {
        points: "43.04,18 80,18 80,54.96 72.96,62 36,62 36,25.04",
      }),
      svgElement("polygon", {
        points: "26.4,40 60,40 60,72.8 52.8,80 20,80 20,46.4",
      }),
    ],
  );
  return svgElement(
    "svg",
    { class: "logo", viewBox: "18 16 64 66", "aria-hidden": "true" },
    [cut, shapes],
  );
}

/**
 * Follow Discord's own theme, like the panel inside the frame does: Discord
 * marks its root with \`theme-light\` / \`theme-dark\`.
 */
function frameTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("theme-light")
    ? "light"
    : "dark";
}

/** Repaint the window chrome after Discord switches theme. */
export function syncPanelTheme(): void {
  panel?.root.classList.toggle("light", frameTheme() === "light");
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
  const state: PanelState = { ...geometry, open, layout: LAYOUT };
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
  panel.root.classList.remove("busy");
}

/** Say "Searching" in the titlebar while a run is going, so a collapsed or covered panel still says so. */
export function markPanelBusy(busy: boolean): void {
  panel?.root.classList.toggle("busy", busy);
}

function drag(bar: HTMLElement, frame: HTMLIFrameElement) {
  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    // The target is often the icon inside a button, not the button.
    if (event.target instanceof Element && event.target.closest("button"))
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
  root.classList.toggle("light", frameTheme() === "light");
  root.style.zIndex = String(LAYER);
  const bar = document.createElement("header");
  bar.className = "bar";
  bar.tabIndex = 0;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute(
    "aria-label",
    "Objekt Match panel. Drag, or use the arrow keys, to move",
  );
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = "Objekt Match";
  const busy = document.createElement("span");
  busy.className = "status";
  busy.textContent = "Searching";
  const spacer = document.createElement("span");
  spacer.className = "spacer";
  bar.append(logo(), title, busy, spacer);
  const body = document.createElement("div");
  body.className = "body";
  const frame = document.createElement("iframe");
  const url = new URL(extensionApi.runtime.getURL("panel.html"));
  url.searchParams.set("embedded", "1");
  if (tabId !== null) url.searchParams.set("tab", String(tabId));
  frame.src = url.toString();
  frame.setAttribute("title", "Objekt Match");
  const fallback = document.createElement("div");
  fallback.className = "fallback";
  fallback.hidden = true;
  fallback.textContent =
    "This page will not let the panel load inside it. Use the toolbar button's pop-out window instead.";
  body.append(frame, fallback);
  const grip = document.createElement("div");
  grip.className = "grip";

  const button = (glyph: SVGElement, hint: string, run: () => void) => {
    const element = document.createElement("button");
    element.append(glyph);
    element.title = hint;
    element.setAttribute("aria-label", hint);
    element.addEventListener("click", run);
    return element;
  };
  bar.append(
    button(
      lineIcon(
        ["M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"],
        [
          svgElement("rect", {
            x: "12",
            y: "13",
            width: "10",
            height: "7",
            rx: "2",
          }),
        ],
      ),
      "Open in a separate window",
      () => {
        void extensionApi.runtime.sendMessage({ type: "open-window" });
      },
    ),
    button(lineIcon(["M5 12h14"]), "Collapse to the titlebar", () =>
      collapse(!geometry.collapsed),
    ),
    button(lineIcon(["M18 6 6 18", "m6 6 12 12"]), "Close the panel", () =>
      closePanel(),
    ),
  );
  bar.addEventListener("dblclick", (event) => {
    // The target is often the icon inside a button, not the button.
    if (event.target instanceof Element && event.target.closest("button"))
      return;
    collapse(!geometry.collapsed);
  });

  root.append(bar, body, grip);
  shadow.append(style, root);
  panel = { host, frame, root, bar, notice: fallback };
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
