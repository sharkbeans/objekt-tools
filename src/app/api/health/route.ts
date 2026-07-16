import { NextResponse } from "next/server";
import {
  getMirrorHealthSnapshot,
  isMirrorEnabled,
} from "@/lib/db/indexer-mirror";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isMirrorEnabled()) {
    return NextResponse.json({ ok: true });
  }

  try {
    return NextResponse.json({
      ok: true,
      mirror: await getMirrorHealthSnapshot(),
    });
  } catch (error) {
    console.error("Mirror health check failed:", error);
    return NextResponse.json({ ok: true, mirror: "error" });
  }
}
