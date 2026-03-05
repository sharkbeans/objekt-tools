import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { fetchObjektCatalog } from "@/lib/cosmo/client";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const size = Number(request.nextUrl.searchParams.get("size") ?? "30");

  // Get user's linked Cosmo account
  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });

  if (!linked) {
    return NextResponse.json(
      { error: "No Cosmo account linked" },
      { status: 404 }
    );
  }

  try {
    const result = await fetchObjektCatalog(page, size);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Failed to fetch inventory:", error?.data ?? error?.message ?? error);
    console.error("Status:", error?.status ?? error?.statusCode);
    return NextResponse.json(
      { error: "Failed to fetch inventory from Cosmo", details: error?.data ?? error?.message },
      { status: 502 }
    );
  }
}
