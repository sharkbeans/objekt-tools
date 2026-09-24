import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { sectionHref } from "@/lib/sections";

/**
 * "Hunting: N grids" on the owner's own collection page — a way back to the
 * hunts they saved, which live on /match. /match is root-only, so from the
 * collect host this is an absolute link to the root.
 */
export function HuntingChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Link
      href={sectionHref("/match", { currentSection: "collect" })}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <SearchIcon className="size-3.5" />
      Hunting: {count} grid{count === 1 ? "" : "s"}
    </Link>
  );
}
