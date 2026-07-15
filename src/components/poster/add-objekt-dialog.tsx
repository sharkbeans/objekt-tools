"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface AddCustomWantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (label: string) => void;
}

export function AddCustomWantDialog({
  open,
  onOpenChange,
  onConfirm,
}: AddCustomWantDialogProps) {
  const [text, setText] = useState("");

  function handleOpen(next: boolean) {
    if (next) setText("");
    onOpenChange(next);
  }

  function handleConfirm() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Custom Want</DialogTitle>
          <DialogDescription>e.g. "Any Atom02 FCO"</DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Type here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!text.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
