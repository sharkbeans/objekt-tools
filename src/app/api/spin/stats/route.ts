import { NextResponse } from "next/server";
import { indexerPool } from "@/lib/db/indexer";

const COSMO_SPIN_ADDRESS = "0xd3d5f29881ad87bb10c1100e2c709c9596de345f";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const spinRewardLines = [
  { artistKey: "triples", artist: "tripleS", className: "First" },
  { artistKey: "triples", artist: "tripleS", className: "Special" },
  { artistKey: "triples", artist: "tripleS", className: "Premier" },
  { artistKey: "artms", artist: "ARTMS", className: "First" },
  { artistKey: "artms", artist: "ARTMS", className: "Special" },
  { artistKey: "artms", artist: "ARTMS", className: "Premier" },
  { artistKey: "idntt", artist: "idntt", className: "Basic" },
  { artistKey: "idntt", artist: "idntt", className: "Special" },
];

type SpinRewardRow = {
  artist: string;
  class_name: string;
  recipient: string;
  received_at: Date;
};

type SpinSendRow = {
  sender: string;
  sent_at: Date;
};

export async function GET() {
  try {
    const sendResult = await indexerPool.query<SpinSendRow>(
      `
        with day_start as (
          select (
            date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur')
            at time zone 'Asia/Kuala_Lumpur'
          ) as start_at
        )
        select
          lower(t.from) as sender,
          t.timestamp as sent_at
        from transfer t, day_start
        where t.to = $1
          and t.timestamp >= day_start.start_at
      `,
      [COSMO_SPIN_ADDRESS],
    );

    const rewardResult = await indexerPool.query<SpinRewardRow>(
      `
        with day_start as (
          select (
            date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur')
            at time zone 'Asia/Kuala_Lumpur'
          ) as start_at
        )
        select
          c.artist,
          c.class as class_name,
          lower(t.to) as recipient,
          t.timestamp as received_at
        from transfer t
        join collection c on c.id = t.collection_id,
        day_start
        where t.from = $1
          and t.timestamp >= day_start.start_at
          and (
            (c.artist = 'triples' and c.class in ('First', 'Special', 'Premier'))
            or (c.artist = 'artms' and c.class in ('First', 'Special', 'Premier'))
            or (c.artist = 'idntt' and c.class in ('Basic', 'Special'))
          )
      `,
      [ZERO_ADDRESS],
    );

    const sendsBySender = new Map<string, number[]>();
    for (const send of sendResult.rows) {
      const sentAt = send.sent_at.getTime();
      const senderSends = sendsBySender.get(send.sender) ?? [];
      senderSends.push(sentAt);
      sendsBySender.set(send.sender, senderSends);
    }

    const recipientsByLine = new Map<string, Set<string>>();
    for (const reward of rewardResult.rows) {
      const senderSends = sendsBySender.get(reward.recipient);
      if (!senderSends) continue;

      const receivedAt = reward.received_at.getTime();
      const matchedSpinSend = senderSends.some(
        (sentAt) => receivedAt >= sentAt && receivedAt <= sentAt + 10 * 60_000,
      );
      if (!matchedSpinSend) continue;

      const key = `${reward.artist}:${reward.class_name}`;
      const recipients = recipientsByLine.get(key) ?? new Set<string>();
      recipients.add(reward.recipient);
      recipientsByLine.set(key, recipients);
    }

    const results = spinRewardLines.map((line) => ({
      artist: line.artist,
      className: line.className,
      recipients:
        recipientsByLine.get(`${line.artistKey}:${line.className}`)?.size ?? 0,
    }));

    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load spin stats", error);
    return NextResponse.json(
      { error: "Failed to load spin stats", results: [] },
      { status: 500 },
    );
  }
}
