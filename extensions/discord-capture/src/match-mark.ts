/**
 * How a post with something for you is marked in Discord: the whole message
 * tinted, and a pill under it saying why.
 *
 * The pill alone was easy to scroll past in a busy channel, where most rows are
 * long lists that look the same. Discord already teaches a way to say "this
 * message is for you", the tinted row with a bar down its left edge on a
 * mention, so a match borrows that shape. It keeps away from the two colours
 * that shape already means something in — yellow for a mention, blurple for a
 * reply to you — so a match cannot be read as either.
 *
 * Kept apart from `content.ts`, which starts up the moment it is imported, so
 * the rules can be tested against a plain document.
 */

/** Which way a post helps, strongest first. */
export type MatchTone = "mutual" | "have" | "want";

export interface MatchMark {
  tone: MatchTone;
  text: string;
}

/** Set on the message row. The stylesheet below keys off its value. */
export const MARK_ATTRIBUTE = "data-objekt-match";
const BADGE_TAG = "objekt-match-badge";
const ROW_STYLE_ID = "objekt-match-rows";

/** What to mark a post with, or null when it has nothing for you. */
export function matchMark(
  match:
    | {
        isMutual: boolean;
        theyWantYouHave: readonly unknown[];
        theyHaveYouWant: readonly unknown[];
      }
    | undefined,
): MatchMark | null {
  const wantCount = match?.theyWantYouHave.length ?? 0;
  const giveCount = match?.theyHaveYouWant.length ?? 0;
  if (!wantCount && !giveCount) return null;
  if (match?.isMutual)
    return {
      tone: "mutual",
      text: `objekt.my · mutual: wants ${wantCount}, has ${giveCount} you want`,
    };
  return wantCount
    ? { tone: "want", text: `objekt.my · wants ${wantCount} of yours` }
    : { tone: "have", text: `objekt.my · has ${giveCount} you want` };
}

/**
 * The row's tint and bar. In the page rather than the badge's shadow root
 * because the row is Discord's own element, and an attribute plus a stylesheet
 * survives React re-rendering that element where an inline style might not.
 *
 * Painted on an overlay above the row, not as the row's own background, so it
 * shows whatever Discord puts inside: a search result is a card with a surface
 * of its own, which would cover anything behind it. The overlay lets clicks
 * through, and Discord's message toolbar sits above it on its own z-index.
 *
 * Nothing here changes the row's size, because Discord's virtualised list
 * measures its rows.
 */
const ROW_STYLE = `
[${MARK_ATTRIBUTE}]{position:relative}
[${MARK_ATTRIBUTE}]::after{content:"";position:absolute;inset:0;border-radius:4px;pointer-events:none}
[${MARK_ATTRIBUTE}]>${BADGE_TAG}{position:relative;z-index:1}
[${MARK_ATTRIBUTE}="have"]::after{background-color:rgb(34 197 94 / 13%);box-shadow:inset 3px 0 0 #22c55e}
[${MARK_ATTRIBUTE}="mutual"]::after{background-color:rgb(34 197 94 / 20%);box-shadow:inset 4px 0 0 #22c55e,inset 0 0 0 1px rgb(34 197 94 / 45%)}
[${MARK_ATTRIBUTE}="want"]::after{background-color:rgb(56 189 248 / 8%);box-shadow:inset 3px 0 0 #38bdf8}
`;

/**
 * The pill, in the palette of the Discord theme it sits on. The two that are
 * about getting a card you want are filled, so they read from across the
 * channel; a post that only wants yours stays the quiet neutral pill.
 */
const BADGE_STYLE = `
.badge{display:inline-flex;align-items:center;gap:7px;margin:4px 0;padding:4px 11px 4px 9px;border-radius:999px;
  border:1px solid rgb(255 255 255 / 12%);background:#0a0a0a;color:#fafafa;
  font:500 13.5px/1.45 "Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
:host([data-theme="light"]) .badge{border-color:#e5e5e5;background:#fff;color:#0a0a0a}
.badge svg{width:14px;height:14px;flex:none}
.have,.mutual{border-color:transparent;background:#22c55e;color:#052e16;font-weight:600}
:host([data-theme="light"]) .have,:host([data-theme="light"]) .mutual{border-color:transparent;background:#15803d;color:#fff}
.mutual::after{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;margin-left:2px}
`;

function badgeMark(doc: Document): SVGElement {
  const SVG = "http://www.w3.org/2000/svg";
  const node = (name: string, attributes: Record<string, string>) => {
    const created = doc.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes))
      created.setAttribute(key, value);
    return created;
  };
  const svg = node("svg", { viewBox: "18 16 64 66", "aria-hidden": "true" });
  const mask = node("mask", { id: "cut" });
  mask.append(
    node("rect", { width: "100", height: "100", fill: "#fff" }),
    node("polygon", {
      points: "29.46,44.5 55.5,44.5 55.5,69.92 49.92,75.5 24.5,75.5 24.5,49.46",
      fill: "#000",
    }),
  );
  const shapes = node("g", { mask: "url(#cut)", fill: "currentColor" });
  shapes.append(
    node("polygon", {
      points: "43.04,18 80,18 80,54.96 72.96,62 36,62 36,25.04",
    }),
    node("polygon", { points: "26.4,40 60,40 60,72.8 52.8,80 20,80 20,46.4" }),
  );
  svg.append(mask, shapes);
  return svg as SVGElement;
}

/** The row stylesheet, added once however many rows and script copies there are. */
function ensureRowStyle(doc: Document) {
  if (doc.getElementById(ROW_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = ROW_STYLE_ID;
  style.textContent = ROW_STYLE;
  (doc.head ?? doc.documentElement).append(style);
}

/** Take the mark off one row: both halves, so a recycled row keeps neither. */
export function clearMark(row: Element) {
  row.removeAttribute(MARK_ATTRIBUTE);
  row.querySelector(`:scope > ${BADGE_TAG}`)?.remove();
}

/** Take every mark off the page. */
export function clearAllMarks(doc: Document) {
  for (const row of doc.querySelectorAll(`[${MARK_ATTRIBUTE}]`))
    row.removeAttribute(MARK_ATTRIBUTE);
  for (const badge of doc.querySelectorAll(BADGE_TAG)) badge.remove();
}

/** Mark a row, replacing whatever mark it had. */
export function applyMark(row: Element, mark: MatchMark | null) {
  clearMark(row);
  if (!mark) return;
  const doc = row.ownerDocument;
  ensureRowStyle(doc);
  row.setAttribute(MARK_ATTRIBUTE, mark.tone);
  const host = doc.createElement(BADGE_TAG);
  const shadow = host.attachShadow({ mode: "closed" });
  const badge = doc.createElement("span");
  badge.className = `badge ${mark.tone}`;
  const text = doc.createElement("span");
  text.textContent = mark.text;
  badge.append(badgeMark(doc), text);
  const style = doc.createElement("style");
  style.textContent = BADGE_STYLE;
  shadow.append(style, badge);
  if (doc.documentElement.classList.contains("theme-light"))
    host.dataset.theme = "light";
  row.append(host);
}

/** Follow Discord's theme onto every pill already on the page. */
export function setMarkTheme(doc: Document, theme: "light" | "dark") {
  for (const badge of doc.querySelectorAll(BADGE_TAG))
    (badge as HTMLElement).dataset.theme = theme;
}
