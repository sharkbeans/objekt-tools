import { eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { poster, posterHave, posterWant } from "@/lib/db/schema";
import ListDetailClient from "./list-detail-client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://objekt.my";

// Deduped per request — generateMetadata and the page component share one DB fetch
const getPosterMeta = cache(async (id: string) => {
  const [row, [haveCount], [wantCount]] = await Promise.all([
    db.query.poster.findFirst({
      where: eq(poster.id, id),
      columns: {
        id: true,
        userId: true,
        username: true,
        version: true,
        notes: true,
      },
    }),
    db
      .select({ n: sql<number>`coalesce(sum(${posterHave.quantity}), 0)::int` })
      .from(posterHave)
      .where(eq(posterHave.posterId, id)),
    db
      .select({ n: sql<number>`coalesce(sum(${posterWant.quantity}), 0)::int` })
      .from(posterWant)
      .where(eq(posterWant.posterId, id)),
  ]);
  if (!row) return null;
  return { ...row, haveCount: haveCount?.n ?? 0, wantCount: wantCount?.n ?? 0 };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await getPosterMeta(id);

  if (!row) {
    return { title: "List not found | objekt.my" };
  }

  const title = row.username
    ? `View @${row.username}'s List | objekt.my`
    : `View Trade List | objekt.my`;

  const rawNotes = row.notes?.trim();
  const description = rawNotes
    ? rawNotes.length > 200
      ? `${rawNotes.slice(0, 197)}…`
      : rawNotes
    : `${row.haveCount} Have · ${row.wantCount} Want`;

  const ogUrl = `${APP_URL}/list/${id}/og?v=${row.version}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [ogUrl],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, row] = await Promise.all([getSession(), getPosterMeta(id)]);

  // Server-side owner check for authed users
  const isOwner = !!(session && row?.userId && session.user.id === row.userId);

  return (
    <Suspense>
      <ListDetailClient params={params} isOwner={isOwner} />
    </Suspense>
  );
}
