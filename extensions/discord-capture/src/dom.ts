import { parseMessageTime } from "@/lib/discord/transcript";
export const MESSAGE_SELECTOR = '[id^="chat-messages-"]';
/** Fail closed: never borrow an author from an adjacent message or reply. */
export function readMessage(element: Element, channel: string) {
  const match = element.id.match(/^chat-messages-(\d+)-(\d+)$/);
  if (!match || match[1] !== channel) return null;
  const id = match[2];
  const body = element.querySelector(`[id="message-content-${id}"]`);
  const times = element.querySelectorAll("time[datetime]");
  if (times.length !== 1) return null;
  const time = times[0];
  const iso = time?.getAttribute("datetime");
  if (
    !body ||
    !iso ||
    !/^\d{4}-\d{2}-\d{2}T/.test(iso) ||
    !Number.isFinite(Date.parse(iso))
  )
    return null;
  // Grouped posts reference the original author through aria-labelledby.
  const ownAuthor = element.querySelector(`[id="message-username-${id}"]`);
  const refs = (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter((ref) => /^message-username-\d+$/.test(ref));
  const authorNode =
    ownAuthor ??
    (refs.length === 1 ? element.ownerDocument.getElementById(refs[0]) : null);
  const author = authorNode?.textContent?.trim();
  if (!author || /[\r\n]/.test(author)) return null;
  const text = readText(body).trim();
  if (!text) return null;
  return {
    author,
    body: text,
    time: parseMessageTime(new Date(iso).toISOString()),
  };
}
function readText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  if (el.tagName === "BR") return "\n";
  if (el.tagName === "IMG") return el.getAttribute("alt") ?? "";
  const text = Array.from(el.childNodes, readText).join("");
  if (el.tagName === "A") {
    const href = el.getAttribute("href");
    return href?.startsWith("https://") && !text.includes(href)
      ? `${text} ${href}`
      : text;
  }
  return /^(DIV|P|LI|PRE|BLOCKQUOTE)$/.test(el.tagName) ? `\n${text}\n` : text;
}
