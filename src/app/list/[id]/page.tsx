import { cache } from "react";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { poster } from "@/lib/db/schema";
import ListDetailClient from "./list-detail-client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://objekt.my";

// Deduped per request — generateMetadata and the page component share one DB fetch
const getPosterMeta = cache(async (id: string) => {
  return db.query.poster.findFirst({
    where: eq(poster.id, id),
    columns: { id: true, userId: true, username: true, version: true },
  });
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
    ? `@${row.username}'s list | objekt.my`
    : `Trade list | objekt.my`;

  const ogUrl = `${APP_URL}/list/${id}/og?v=${row.version}`;

  return {
    title,
    description: "",
    openGraph: {
      title,
      description: "",
      images: [ogUrl],
    },
    twitter: {
      card: "summary_large_image",
      title,
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

  return <ListDetailClient params={params} isOwner={isOwner} />;
}
