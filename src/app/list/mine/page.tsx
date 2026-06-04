"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";

interface PosterSummary {
  id: string;
  username: string | null;
  notes: string | null;
  theme: string;
  createdAt: string;
  updatedAt: string;
  haves: { id: number; thumbnailUrl: string | null }[];
  wants: { id: number; thumbnailUrl: string | null }[];
}

const PREVIEW_VISIBLE_COUNT = 4;

function uniqueThumbnails(items: { thumbnailUrl: string | null }[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of items) {
    if (!item.thumbnailUrl || seen.has(item.thumbnailUrl)) continue;
    seen.add(item.thumbnailUrl);
    urls.push(item.thumbnailUrl);
  }
  return urls;
}

function ObjektThumb({ url }: { url: string }) {
  return (
    <div className="w-10 h-14 rounded overflow-hidden border border-border bg-muted shrink-0">
      <Image
        src={url}
        alt=""
        width={40}
        height={56}
        className="object-cover w-full h-full"
        unoptimized
      />
    </div>
  );
}

function MoreObjektsTile({ count }: { count: number }) {
  return (
    <div className="flex w-10 h-14 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/60 px-1 text-center text-[10px] font-medium leading-tight text-muted-foreground">
      +{count} more
    </div>
  );
}

function ObjektPreviewSide({ urls }: { urls: string[] }) {
  const visible = urls.slice(0, PREVIEW_VISIBLE_COUNT);
  const remaining = Math.max(urls.length - visible.length, 0);

  return (
    <div className="flex shrink-0 gap-1.5">
      {visible.map((url) => (
        <ObjektThumb key={url} url={url} />
      ))}
      {remaining > 0 && <MoreObjektsTile count={remaining} />}
    </div>
  );
}

function PosterCard({
  poster,
  onDelete,
}: {
  poster: PosterSummary;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const haveThumbs = uniqueThumbnails(poster.haves);
  const wantThumbs = uniqueThumbnails(poster.wants);
  const hasPreview = haveThumbs.length > 0 || wantThumbs.length > 0;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/list/${poster.id}`,
      );
      setCopied(true);
      toast.success("Link copied!");
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate text-sm">
            {poster.username ? `@${poster.username}'s list` : "Trade list"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {poster.haves.length} have · {poster.wants.length} want ·{" "}
            {new Date(poster.updatedAt).toLocaleDateString("en-GB")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              copied &&
                "bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white",
            )}
            onClick={handleCopyLink}
            aria-label="Copy link"
            title="Copy link"
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <Link href={`/list/${poster.id}/edit`} aria-label="Edit">
              <PencilIcon className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(poster.id)}
            aria-label="Delete"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {hasPreview && (
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max items-center gap-2">
            <ObjektPreviewSide urls={haveThumbs} />
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <ObjektPreviewSide urls={wantThumbs} />
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full" asChild>
        <Link href={`/list/${poster.id}`}>View list</Link>
      </Button>
    </div>
  );
}

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

  if (!session) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Lists</h1>
          <p className="text-muted-foreground">Manage your trade lists</p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/list">
            <PlusIcon className="h-4 w-4" />
            New List
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : posters.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {posters.map((p) => (
              <PosterCard key={p.id} poster={p} onDelete={setDeleteId} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You haven&apos;t created any lists yet.{" "}
            <Link href="/list" className="text-primary hover:underline">
              Create your first list
            </Link>
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
    </div>
  );
}
