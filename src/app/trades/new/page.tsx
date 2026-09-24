import { redirect } from "next/navigation";
import { sectionHref } from "@/lib/sections";

// /trades/new is retired — trades are frozen ahead of retirement (plan 039),
// so send people to Match. Redirect rather than 404 since this URL was
// linked from Discord, bookmarks, etc.
export default function NewTradePage() {
  redirect(sectionHref("/match", { currentSection: "trade" }));
}
