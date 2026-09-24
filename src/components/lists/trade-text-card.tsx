"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  /** Shown on screen — usually the text without the trailing link line. */
  previewText: string;
  /** Put on the clipboard — usually the text *with* the link line. */
  copyText: string;
  className?: string;
}

/** The copy-paste block shared by the trade post page and the list page. */
export function TradeTextCard({ previewText, copyText, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      toast.success("Copied trade text");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy trade text");
    }
  }

  return (
    <div
      className={`rounded-md border border-border bg-muted/30 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Trade text
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="h-8 gap-2 bg-background/70"
        >
          {copied ? (
            <CheckIcon className="h-4 w-4" />
          ) : (
            <CopyIcon className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-sm leading-6 text-foreground">
        {previewText}
      </pre>
    </div>
  );
}
