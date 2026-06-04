import { asc, count, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { poster, posterHave, posterWant } from "@/lib/db/schema";

// GET /api/posters/mine — authenticated user's posters
export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = 12;
  const offset = (page - 1) * limit;

  const [posters, [totalRow]] = await Promise.all([
    db.query.poster.findMany({
      where: eq(poster.userId, session.user.id),
      orderBy: desc(poster.updatedAt),
      limit,
      offset,
      with: {
        haves: {
          columns: { id: true, thumbnailUrl: true, quantity: true },
          orderBy: asc(posterHave.position),
        },
        wants: {
          columns: { id: true, thumbnailUrl: true, quantity: true },
          orderBy: asc(posterWant.position),
        },
      },
    }),
    db
      .select({ n: count() })
      .from(poster)
      .where(eq(poster.userId, session.user.id)),
  ]);

  return NextResponse.json({ posters, total: totalRow?.n ?? 0, limit });
}
