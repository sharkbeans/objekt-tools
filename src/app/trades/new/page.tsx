import { redirect } from "next/navigation";
import { sectionHref } from "@/lib/sections";

// /trades/new is retired — the List builder is now the single authoring
// flow for have/want posts. Redirect rather than 404 since this URL was
// linked from Discord, bookmarks, etc.
export default function NewTradePage() {
  redirect(sectionHref("/list", { currentSection: "trade" }));
}
