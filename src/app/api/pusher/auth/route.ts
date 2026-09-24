import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getPusherServer } from "@/lib/realtime";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channelName = params.get("channel_name");

  if (!socketId || !channelName) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  // Only per-user channels remain (the private-trade-* channels went with
  // the trades retirement — plan 039).
  if (channelName.startsWith("private-user-")) {
    const channelUserId = channelName.replace("private-user-", "");
    if (channelUserId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Unknown channel" }, { status: 403 });
  }

  const pusher = getPusherServer();
  if (!pusher) {
    return NextResponse.json(
      { error: "Pusher not configured" },
      { status: 503 },
    );
  }

  const authResponse = pusher.authorizeChannel(socketId, channelName);
  return NextResponse.json(authResponse);
}
