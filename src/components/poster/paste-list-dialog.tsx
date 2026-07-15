"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClipboardPasteIcon,
  Loader2Icon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parsePastedTrade } from "@/lib/paste-parser";
import {
  type ResolvedPosterItem,
  resolveForPoster,
} from "@/lib/poster-resolver";

type Stage = "input" | "resolving" | "preview";

function itemLabel(item: ResolvedPosterItem): string {
  if (item.entry) return `${item.entry.member} ${item.entry.collectionNo}`;
  return item.parsed.raw;
}

interface PasteListDialogProps {
  onImport: (
    haves: ResolvedPosterItem[],
    wants: ResolvedPosterItem[],
    notes?: string,
  ) => void;
}

export function PasteListDialog({ onImport }: PasteListDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [haves, setHaves] = useState<ResolvedPosterItem[]>([]);
  const [wants, setWants] = useState<ResolvedPosterItem[]>([]);
  const [notes, setNotes] = useState<string | undefined>(undefined);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const reset = useCallback(() => {
    setText("");
    setStage("input");
    setHaves([]);
    setWants([]);
    setNotes(undefined);
    setParseErrors([]);
  }, []);

  const handleParse = useCallback(async () => {
    const parsed = parsePastedTrade(text);
    if (
      parsed.errors.length > 0 &&
      parsed.haves.length === 0 &&
      parsed.wants.length === 0
    ) {
      setParseErrors(parsed.errors);
      return;
    }
    setParseErrors(parsed.errors);
    setNotes(parsed.notes);
    setStage("resolving");

    try {
      const [resolvedHaves, resolvedWants] = await Promise.all([
        resolveForPoster(parsed.haves),
        resolveForPoster(parsed.wants),
      ]);
      setHaves(resolvedHaves);
      setWants(resolvedWants);
      setStage("preview");
    } catch {
      toast.error("Failed to resolve objekts");
      setStage("input");
    }
  }, [text]);

  const validHaves = haves.filter((h) => !h.error);
  const validWants = wants.filter((w) => !w.error);
  const errorItems = [...haves, ...wants].filter((i) => i.error);

  const handleConfirm = useCallback(() => {
    if (validHaves.length === 0 && validWants.length === 0) {
      toast.error("No valid items to import");
      return;
    }
    onImport(validHaves, validWants, notes);
    toast.success(
      `Imported ${validHaves.length} have, ${validWants.length} want`,
    );
    setOpen(false);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validHaves, validWants, notes, onImport, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ClipboardPasteIcon className="h-4 w-4" />
          Paste Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paste Import</DialogTitle>
          <DialogDescription>
            Paste a HAVE / WANT list to add items to this list
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <div className="space-y-3">
            <Textarea
              placeholder={`**HAVE**\nsy AA201 #10\nHyeRin B205 x3\nKaede bb104, bb105\n\nWANT\nDaHyun BB345\nnaky bb343 bb344`}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParseErrors([]);
              }}
              rows={10}
              className="font-mono text-sm"
            />
            {parseErrors.length > 0 && (
              <div className="space-y-1">
                {parseErrors.map((err) => (
                  <p
                    key={err}
                    className="text-xs text-destructive flex items-start gap-1"
                  >
                    <AlertCircleIcon className="h-3 w-3 mt-0.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Use HAVE / WANT as section headers. Supports shortforms,
              quantities like (x3), and serials (#10).
            </p>
          </div>
        )}

        {stage === "resolving" && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Resolving objekts...
          </div>
        )}

        {stage === "preview" && (
          <div className="space-y-4">
            {(errorItems.length > 0 || parseErrors.length > 0) && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1.5">
                <p className="text-sm font-medium text-destructive">
                  Issues found
                </p>
                {parseErrors.map((err) => (
                  <p key={err} className="text-xs text-destructive">
                    {err}
                  </p>
                ))}
                {errorItems.map((item, i) => (
                  <p key={i} className="text-xs text-destructive">
                    {item.error}
                  </p>
                ))}
              </div>
            )}

            {validHaves.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  HAVE ({validHaves.length})
                </p>
                <div className="flex flex-col gap-1">
                  {validHaves.map((h, i) => (
                    <div
                      key={i}
                      className="text-sm px-2 py-1 rounded border border-border flex items-center justify-between"
                    >
                      <span>{itemLabel(h)}</span>
                      <CheckCircle2Icon className="h-3 w-3 text-green-500 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validWants.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  WANT ({validWants.length})
                </p>
                <div className="flex flex-col gap-1">
                  {validWants.map((w, i) => (
                    <div
                      key={i}
                      className="text-sm px-2 py-1 rounded border border-border flex items-center justify-between"
                    >
                      <span>{itemLabel(w)}</span>
                      <CheckCircle2Icon className="h-3 w-3 text-green-500 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  NOTE (auto-detected)
                </p>
                <p className="text-sm px-2 py-1.5 rounded border border-border text-muted-foreground whitespace-pre-wrap">
                  {notes}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === "input" && (
            <Button onClick={handleParse} disabled={!text.trim()}>
              Parse
            </Button>
          )}
          {stage === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStage("input")}>
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={validHaves.length === 0 && validWants.length === 0}
              >
                Import {validHaves.length > 0 && `${validHaves.length}H`}
                {validHaves.length > 0 && validWants.length > 0 && " / "}
                {validWants.length > 0 && `${validWants.length}W`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
