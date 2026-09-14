import { deskLabel, deskLabelLines } from "@/lib/discord/trade-desk";
import type { ParsedItem } from "@/lib/paste-parser";

/** Keeps an empty second line one line tall. */
const EMPTY_LINE = " ";

/**
 * A card's name, member over code, a line each.
 *
 * Every card gets both lines, so a row of cards is one height whatever the
 * names are. A line too long for the card is clipped rather than wrapped, and
 * clipped without an ellipsis: at eight cards a row the ellipsis costs the
 * letters that tell "SeoYe" from "SeoAh". The full name is the hover title.
 */
export function DeskCardName({
  item,
  className = "",
}: {
  item: ParsedItem;
  className?: string;
}) {
  const [member, code] = deskLabelLines(item);
  return (
    <span
      className={`block min-w-0 leading-tight ${className}`}
      title={deskLabel(item)}
    >
      <span className="block overflow-hidden whitespace-nowrap">{member}</span>
      <span className="block overflow-hidden whitespace-nowrap">
        {code || EMPTY_LINE}
      </span>
    </span>
  );
}
