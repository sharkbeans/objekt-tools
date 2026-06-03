import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { poster } from "@/lib/db/schema";
import { CreatePosterPageWrapper } from "@/app/post/page";

export default async function EditPosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/sign-in`);
  }

  const row = await db.query.poster.findFirst({
    where: eq(poster.id, id),
    columns: { userId: true },
  });

  if (!row || row.userId !== session.user.id) {
    redirect(`/list/${id}?error=not-owner`);
  }

  return <CreatePosterPageWrapper editId={id} />;
}
