// Moved to /api/list-matches/[id]/check-availability (plan 039). Thin
// re-export so open tabs / the /trades/[id] page keep working until the
// trade pages are deleted.
export const dynamic = "force-dynamic";

export { POST } from "@/app/api/list-matches/[id]/check-availability/route";
