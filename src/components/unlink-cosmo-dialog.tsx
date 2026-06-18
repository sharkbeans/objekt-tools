"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function UnlinkCosmoDialog({ open, onOpenChange, onSuccess }: Props) {
  const [unlinking, setUnlinking] = useState(false);

  async function handleUnlink() {
    setUnlinking(true);
    try {
      const res = await fetch("/api/cosmo/unlink", { method: "POST" });
      if (!res.ok) throw new Error("Failed to unlink");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // Intentionally swallowed — keep dialog open so user can retry
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unlink Cosmo account?</AlertDialogTitle>
          <AlertDialogDescription>
            Your Cosmo account will be unlinked. You can re-link it at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={unlinking}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleUnlink}
            disabled={unlinking}
          >
            {unlinking ? "Unlinking..." : "Unlink"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
