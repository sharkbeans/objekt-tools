import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });

  if (!linked) {
    return NextResponse.json({ error: "Not linked" }, { status: 404 });
  }

  return NextResponse.json({
    address: linked.address,
    nickname: linked.nickname ?? null,
    linkedAt: linked.linkedAt,
  });
}
