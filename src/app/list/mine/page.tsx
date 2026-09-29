"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  LoadingState,
  PageContainer,
  PageHeader,
  PagePagination,
} from "@/components/page-shell";
import {
  PosterCard,
  type PosterSummary,
} from "@/components/poster/poster-summary-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { sectionHref } from "@/lib/sections";

export default function MyListsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && session === null) router.push("/sign-in");
  }, [session, isPending, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-lists", page],
    queryFn: async () => {
      const res = await fetch(`/api/posters/mine?page=${page}`);
      return res.json();
    },
    enabled: !!session,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/posters/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete");
      }
    },
    onSuccess: () => {
      toast.success("List deleted");
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const posters: PosterSummary[] = data?.posters ?? [];
  const total: number = data?.total ?? 0;
  const limit: number = data?.limit ?? 12;
  const totalPages = Math.ceil(total / limit);
  const matchCounts: Record<string, number> = data?.matchCounts ?? {};
  const totalMatches = Object.values(matchCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const displayPosters = [...posters].sort((a, b) => {
    const matchDelta = (matchCounts[b.id] ?? 0) - (matchCounts[a.id] ?? 0);
    if (matchDelta !== 0) return matchDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  if (!session) return null;

  return (
    <PageContainer width="full">
      <PageHeader
        eyebrow="Lists"
        title="My Lists"
        description="Review matching trades and keep your list posters ready."
        actions={
          <>
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
              {total} {total === 1 ? "list" : "lists"}
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
              {totalMatches} {totalMatches === 1 ? "match" : "matches"}
            </span>
            <Button asChild size="sm" className="gap-1.5">
              <Link href={sectionHref("/list", { currentSection: "list" })}>
                <PlusIcon className="h-4 w-4" />
                New List
              </Link>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : posters.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayPosters.map((p) => (
              <PosterCard
                key={p.id}
                poster={p}
                onDelete={setDeleteId}
                matchCount={matchCounts[p.id] ?? 0}
              />
            ))}
          </div>
          <PagePagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      ) : (
        <Card>
          <CardContent>
            <EmptyState description="You haven't created any lists yet.">
              <Button asChild size="sm">
                <Link href={sectionHref("/list", { currentSection: "list" })}>
                  Create your first list
                </Link>
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the list and its shareable link. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  deleteMutation.mutate(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
