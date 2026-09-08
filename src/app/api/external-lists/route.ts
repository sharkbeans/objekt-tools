import { NextResponse } from "next/server";
import {
  ExternalListImportError,
  importExternalList,
} from "@/lib/external-list.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fetches a validated public Objekt.top/Apollo list for the match dialog. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || url.length > 2048) {
    return NextResponse.json(
      { error: "Missing or invalid list URL" },
      { status: 400 },
    );
  }

  try {
    const imported = await importExternalList(url);
    return NextResponse.json(imported, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message =
      error instanceof ExternalListImportError
        ? error.message
        : "Could not import that public list.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
