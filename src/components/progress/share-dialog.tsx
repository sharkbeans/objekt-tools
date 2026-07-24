"use client";

import { ImageIcon, Link2Icon, Loader2Icon, ShareIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  onShareLink: () => void | Promise<void>;
  onGenerateImage: () => void | Promise<void>;
  generatingImage?: boolean;
  disabled?: boolean;
  className?: string;
}

// Unified "Share" entry point for both the Collection and Grid tabs — each
// page has its own og:image already (see [member]/og and [member]/og/grid),
// so both a live "Share link" and a downloadable "Generate image" make sense
// in either place. Mirrors the choice-card dialog pattern from the poster
// flow's "How do you want to save this list?" (src/app/list/page.tsx).
export function ShareButton({
  onShareLink,
  onGenerateImage,
  generatingImage,
  disabled,
  className,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn("gap-2", className)}
      >
        <ShareIcon className="h-4 w-4" />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How do you want to share this?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void onShareLink();
              }}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <Link2Icon className="size-5 text-primary" />
              <span className="font-medium">Share link</span>
              <span className="text-sm text-muted-foreground">
                Copy a live link with a preview image others can open.
              </span>
            </button>
            <button
              type="button"
              disabled={generatingImage}
              onClick={async () => {
                await onGenerateImage();
                setOpen(false);
              }}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {generatingImage ? (
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <ImageIcon className="size-5 text-muted-foreground" />
              )}
              <span className="font-medium">
                {generatingImage ? "Generating..." : "Generate image"}
              </span>
              <span className="text-sm text-muted-foreground">
                Save or share a PNG snapshot.
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
