"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ListLinkField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Link copied!");
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      toast.error("Failed to copy link");
    }
  }, [value]);

  return (
    <div className={cn("w-full space-y-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <div
        className={cn(
          "flex min-w-0 gap-1.5 rounded-md border border-border bg-card/80 p-1 shadow-xs",
        )}
      >
        <Input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 border-0 bg-transparent px-2 text-xs text-foreground shadow-none focus-visible:ring-0"
          aria-label={label}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={handleCopy}
          aria-label={`Copy ${label.toLowerCase()}`}
          title={`Copy ${label}`}
          className={cn(
            "h-8 w-8 shrink-0 border-0 transition-colors",
            copied &&
              "bg-emerald-700 text-white hover:bg-emerald-700 hover:text-white",
          )}
        >
          {copied ? (
            <CheckIcon className="h-4 w-4" />
          ) : (
            <CopyIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
