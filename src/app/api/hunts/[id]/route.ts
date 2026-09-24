import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { deleteHunt } from "@/lib/hunts/saved-hunts";

export const dynamic = "force-dynamic";

// DELETE /api/hunts/[id] — remove one of my saved hunts.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await deleteHunt(session.user.id, id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
