import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";

export async function POST() {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.delete(cosmoAccount).where(eq(cosmoAccount.userId, session.user.id));

  return NextResponse.json({ success: true });
}
