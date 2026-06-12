"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClipboardPasteIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { type ParsedItem, parsePastedTrade } from "@/lib/paste-parser";

// Owned objekt from /api/objekts/owned
type OwnedEntry = ObjektEntry & { serial: number; objektId: string };

interface ResolvedHave {
  parsed: ParsedItem;
  match: OwnedEntry | null;
  candidates: OwnedEntry[]; // all matching owned objekts (for serial selection)
  error?: string;
}

interface ResolvedWant {
  parsed: ParsedItem;
  match: ObjektEntry | null;
  error?: string;
}

interface ResolveResult {
  haves: ResolvedHave[];
  wants: ResolvedWant[];
  errors: string[];
}

async function fetchOwned(): Promise<OwnedEntry[]> {
  const res = await fetch("/api/objekts/owned");
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

async function searchObjekts(params: URLSearchParams): Promise<ObjektEntry[]> {
  const res = await fetch(`/api/objekts/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

/**
 * Resolve parsed items against the inventory (haves) and collection DB (wants).
 */
async function resolveItems(
  haves: ParsedItem[],
  wants: ParsedItem[],
): Promise<ResolveResult> {
  const errors: string[] = [];

  // Fetch user inventory for have validation
  const owned = haves.length > 0 ? await fetchOwned() : [];

  // Resolve haves: match against user inventory
  const resolvedHaves: ResolvedHave[] = haves.map((item) => {
    // Find all owned objekts matching season + collectionNo + member
    const candidates = owned.filter((o) => {
      const collMatch =
        o.collectionNo.replace(/[azAZ]$/i, "").endsWith(item.collectionNo) &&
        o.season === item.season;
      if (!collMatch) return false;
      if (item.member) return o.member === item.member;
      return true;
    });

    if (candidates.length === 0) {
      return {
        parsed: item,
        match: null,
        candidates: [],
        error: `Not in your inventory: ${item.raw}`,
      };
    }

    // Pick the one with highest serial
    const sorted = [...candidates].sort((a, b) => b.serial - a.serial);
    return {
      parsed: item,
      match: sorted[0],
      candidates: sorted,
    };
  });

  // Resolve wants: search collection DB
  // Batch by unique season+collectionNo to avoid redundant API calls
  const wantKeys = new Map<string, ParsedItem[]>();
  for (const item of wants) {
    const key = `${item.season}|${item.collectionNo}|${item.member ?? ""}`;
    if (!wantKeys.has(key)) wantKeys.set(key, []);
    wantKeys.get(key)!.push(item);
  }

  const wantSearchResults = new Map<string, ObjektEntry[]>();
  await Promise.all(
    [...wantKeys.entries()].map(async ([key, items]) => {
      const first = items[0];
      const params = new URLSearchParams();
      params.append("season", first.season);
      params.append("q", first.collectionNo);
      if (first.member) params.append("member", first.member);
      const results = await searchObjekts(params);
      wantSearchResults.set(key, results);
    }),
  );

  const resolvedWants: ResolvedWant[] = wants.map((item) => {
    const key = `${item.season}|${item.collectionNo}|${item.member ?? ""}`;
    const results = wantSearchResults.get(key) ?? [];

    // Filter to exact collectionNo match
    const matches = results.filter((r) => {
      const digits = r.collectionNo.replace(/[azAZ]$/i, "");
      return digits === item.collectionNo;
    });

    if (matches.length === 0) {
      return { parsed: item, match: null, error: `Not found: ${item.raw}` };
    }

    // If member specified, filter further
    if (item.member) {
      const memberMatch = matches.find((m) => m.member === item.member);
      return memberMatch
        ? { parsed: item, match: memberMatch }
        : { parsed: item, match: null, error: `Not found: ${item.raw}` };
    }

    // No member specified — if multiple members have this collection, return first
    // (for wants this is fine, user just wants any of that collection)
    return { parsed: item, match: matches[0] };
  });

  return { haves: resolvedHaves, wants: resolvedWants, errors };
}

// ── Component ──

interface PasteImportDialogProps {
  onImport: (
    haves: ObjektEntry[],
    wants: ObjektEntry[],
    notes?: string,
  ) => void;
  existingHaveCount: number;
  existingWantCount: number;
}

type Stage = "input" | "resolving" | "preview";

export function PasteImportDialog({
  onImport,
  existingHaveCount: _existingHaveCount,
  existingWantCount: _existingWantCount,
}: PasteImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parsedNotes, setParsedNotes] = useState<string | undefined>(undefined);

  const reset = useCallback(() => {
    setText("");
    setStage("input");
    setResult(null);
    setParseErrors([]);
    setParsedNotes(undefined);
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
    setParsedNotes(parsed.notes);
    setStage("resolving");

    try {
      const resolved = await resolveItems(parsed.haves, parsed.wants);
      setResult(resolved);
      setStage("preview");
    } catch {
      toast.error("Failed to resolve objekts");
      setStage("input");
    }
  }, [text]);

  const handleConfirm = useCallback(() => {
    if (!result) return;

    const validHaves = result.haves.filter((h) => h.match).map((h) => h.match!);
    const validWants = result.wants.filter((w) => w.match).map((w) => w.match!);

    if (validHaves.length === 0 && validWants.length === 0) {
      toast.error("No valid items to import");
      return;
    }

    onImport(validHaves, validWants, parsedNotes);
    toast.success(
      `Imported ${validHaves.length} have, ${validWants.length} want`,
    );
    setOpen(false);
    reset();
  }, [result, parsedNotes, onImport, reset]);

  const haveErrors = result?.haves.filter((h) => h.error) ?? [];
  const wantErrors = result?.wants.filter((w) => w.error) ?? [];
  const validHaves = result?.haves.filter((h) => h.match) ?? [];
  const validWants = result?.wants.filter((w) => w.match) ?? [];
  const hasDuplicateSerials = validHaves.some((h) => h.candidates.length > 1);

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
            Paste your trade list to auto-populate haves and wants
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <div className="space-y-3">
            <Textarea
              placeholder={`HAVE\nSeoYeon AA201\nHyeRin B205\nKaede bb104, bb105\n\nWANT\nDaHyun BB345\nAny bb343 bb344`}
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
                {parseErrors.map((err, i) => (
                  <p
                    key={i}
                    className="text-xs text-destructive flex items-start gap-1"
                  >
                    <AlertCircleIcon className="h-3 w-3 mt-0.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Use HAVE / WANT as section headers. Supports shortforms like
              BB345, AA201, member aliases (SY, HR, DH).
            </p>
          </div>
        )}

        {stage === "resolving" && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Resolving objekts...
          </div>
        )}

        {stage === "preview" && result && (
          <div className="space-y-4">
            {/* Errors */}
            {(haveErrors.length > 0 ||
              wantErrors.length > 0 ||
              parseErrors.length > 0) && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1.5">
                <p className="text-sm font-medium text-destructive">
                  Issues found
                </p>
                {parseErrors.map((err, i) => (
                  <p key={`p-${i}`} className="text-xs text-destructive">
                    {err}
                  </p>
                ))}
                {haveErrors.map((h, i) => (
                  <p key={`h-${i}`} className="text-xs text-destructive">
                    {h.error}
                  </p>
                ))}
                {wantErrors.map((w, i) => (
                  <p key={`w-${i}`} className="text-xs text-destructive">
                    {w.error}
                  </p>
                ))}
              </div>
            )}

            {hasDuplicateSerials && (
              <div className="rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3">
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Some objekts have multiple copies in your inventory. The
                  highest serial will be used.
                </p>
              </div>
            )}

            {/* Valid haves */}
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
                      <span>
                        <span className="text-muted-foreground">
                          {h.match!.artist}
                        </span>{" "}
                        {h.match!.member}{" "}
                        <span className="font-mono">
                          {h.match!.collectionNo}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {h.match!.season} · {h.match!.class}
                        {h.match!.serial != null &&
                          ` · #${String(h.match!.serial).padStart(5, "0")}`}
                        {h.candidates.length > 1 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0"
                          >
                            {h.candidates.length} copies
                          </Badge>
                        )}
                        <CheckCircle2Icon className="h-3 w-3 text-green-500 shrink-0" />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Valid wants */}
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
                      <span>
                        <span className="text-muted-foreground">
                          {w.match!.artist}
                        </span>{" "}
                        {w.match!.member}{" "}
                        <span className="font-mono">
                          {w.match!.collectionNo}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {w.match!.season} · {w.match!.class}
                        <CheckCircle2Icon className="h-3 w-3 text-green-500 shrink-0" />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detected notes */}
            {parsedNotes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  NOTE (auto-detected)
                </p>
                <p className="text-sm px-2 py-1.5 rounded border border-border text-muted-foreground whitespace-pre-wrap">
                  {parsedNotes}
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
              <Button
                variant="outline"
                onClick={() => {
                  setStage("input");
                  setResult(null);
                }}
              >
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
