"use client";

import {
  ArrowLeftRightIcon,
  BookmarkIcon,
  Check,
  Loader2Icon,
  SearchIcon,
  ShoppingBagIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CopyAndOpenDiscord,
  ExtensionIntro,
  introDismissed,
} from "@/components/extension/extension-intro";
import type { PosterData } from "@/components/poster/poster-canvas";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useExtensionPresence } from "@/hooks/use-extension-presence";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { EDITION_LABELS, type Edition } from "@/lib/edition";
import { extensionStoreForBrowser } from "@/lib/extension-links";
import {
  computeHuntRows,
  computeOfferableDupes,
  formatSlotSerial,
  getGridSlots,
} from "@/lib/grid-progress";
import {
  encodeGridTradeStash,
  GRID_TRADE_HASH_PARAM,
} from "@/lib/grid-trade-stash";
import {
  buildHuntHref,
  type HuntMode,
  type HuntParams,
  huntLabel,
} from "@/lib/match/hunt-url";
import { sendHuntToExtension } from "@/lib/match/send-hunt";
import {
  makePosterItem,
  resolvedItemToApiInput,
} from "@/lib/poster/poster-item";
import type { ProgressCollection } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edition: Edition;
  firsts: ProgressCollection[];
  gridded: number;
  nickname: string;
  seasonCollections: ProgressCollection[];
}

const HUNT_MODES = [
  { id: "wtb", label: "Buy", icon: ShoppingBagIcon },
  { id: "wtt", label: "Trade", icon: ArrowLeftRightIcon },
] as const;

function toEntry(c: ProgressCollection): ObjektEntry {
  return {
    collectionId: c.collectionId,
    artist: c.artist ?? "",
    member: c.member ?? "",
    collectionNo: c.collectionNo,
    season: c.season,
    class: c.class,
    thumbnailImage: c.thumbnailImage,
  };
}

export function GridTradeDialog({
  open,
  onOpenChange,
  edition,
  firsts,
  gridded,
  nickname,
  seasonCollections,
}: Props) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  // Buy by default: grid rank chasers never give up dupes (dupes are future
  // grids), so haves are strictly opt-in — Trade mode, one tick at a time.
  const [huntMode, setHuntMode] = useState<HuntMode>("wtb");
  const [offerIds, setOfferIds] = useState<Set<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The one-time extension intro, shown in place of the picker.
  const [intro, setIntro] = useState<{ storeUrl: string } | null>(null);
  const { installed: extensionInstalled } = useExtensionPresence();
  // Only the profile's own owner can offer its dupes or auto-create a
  // matchable trade list from it — a visitor viewing someone else's grid
  // can't give away that person's objekts, so visitors always hunt in Buy.
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const mode: HuntMode = isOwnProfile ? huntMode : "wtb";

  useEffect(() => {
    if (!session) {
      setIsOwnProfile(false);
      return;
    }
    let cancelled = false;
    fetch("/api/cosmo/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { nickname?: string | null } | null) => {
        if (!cancelled) setIsOwnProfile(data?.nickname === nickname);
      })
      .catch(() => {
        if (!cancelled) setIsOwnProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, nickname]);

  // Target the *next* grid past however many are already griddable now —
  // the same rows a saved hunt recomputes server-side (grid-progress.ts).
  const slots = getGridSlots(edition);
  const rows = useMemo(
    () => computeHuntRows(firsts, gridded),
    [firsts, gridded],
  );

  const defaultSelection = useMemo(
    () =>
      new Set(
        rows.filter((r) => r.needed > 0).map((r) => r.collection.collectionId),
      ),
    [rows],
  );

  const [selected, setSelected] = useState<Set<string>>(defaultSelection);
  const [touched, setTouched] = useState(false);

  // This dialog mounts with the grid board, which happens as soon as the
  // grid-mint query resolves — potentially *before* the ownership query. At
  // that point every FCO reads ownedCount 0, so the default selection would
  // be all 8 slots and, seeded once via useState, would stay that way even
  // after the real counts arrive. Re-seed from the live rows until the user
  // makes a choice of their own.
  useEffect(() => {
    if (touched) return;
    setSelected((prev) =>
      prev.size === defaultSelection.size &&
      [...defaultSelection].every((id) => prev.has(id))
        ? prev
        : defaultSelection,
    );
  }, [defaultSelection, touched]);

  // Closing discards the manual picks, so the next open starts from a default
  // computed against whatever ownership data has landed by then — and from
  // Buy with nothing offered.
  useEffect(() => {
    if (open) return;
    setTouched(false);
    setHuntMode("wtb");
    setOfferIds(new Set());
    setIntro(null);
  }, [open]);

  // Spare copies across the *whole season*, not just this board's edition —
  // trading away extra 1st-edition FCOs to complete a 2nd-edition grid is the
  // normal case. Each edition's reserve is computed against its own grid
  // inside computeOfferableDupes, with this board's edition protected.
  const offerableDupes = useMemo(
    () => computeOfferableDupes(seasonCollections, edition),
    [seasonCollections, edition],
  );

  // Never offer what this same list is asking for.
  const dupes = useMemo(
    () =>
      offerableDupes.filter((d) => !selected.has(d.collection.collectionId)),
    [offerableDupes, selected],
  );

  // Only what the user ticked, and only in Trade mode.
  const offered = useMemo(
    () =>
      mode === "wtt"
        ? dupes.filter((d) => offerIds.has(d.collection.collectionId))
        : [],
    [mode, dupes, offerIds],
  );

  const toggle = (id: string) => {
    setTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOffer = (id: string) => {
    setOfferIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function buildPosterData(): PosterData {
    const wants = rows
      .filter((r) => selected.has(r.collection.collectionId))
      .map((r) => makePosterItem(toEntry(r.collection)));

    // One entry per offerable duplicate copy (not a single pre-aggregated
    // quantity) so the poster's "Combine Duplicates" toggle can actually
    // merge/split them, same as any other multi-copy have.
    const haves = offered.flatMap(({ collection, offerable }) =>
      Array.from({ length: offerable }, () =>
        makePosterItem(toEntry(collection)),
      ),
    );

    return {
      username: nickname,
      cosmoId: nickname,
      haves,
      wants,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      haveTitle: "Have",
      wantTitle: "Want",
    };
  }

  // The hunt as picked. A visitor's hunt carries no nickname — /match or the
  // extension would otherwise load the wrong inventory.
  function currentHunt(): HuntParams {
    return {
      mode,
      wants: rows
        .filter((r) => selected.has(r.collection.collectionId))
        .map((r) => huntLabel(r.collection)),
      offers: offered.map((d) => huntLabel(d.collection)),
      nickname: isOwnProfile ? nickname : "",
    };
  }

  // Hand the missing FCOs to /match as a hunt, where the user's Discord trade
  // posts show who has them. /match is root-only, so from the collect host
  // sectionHref yields the absolute root URL.
  const handleFindOnDiscord = () => {
    const hunt = currentHunt();
    track("grid_hunt_find", {
      mode,
      wants: hunt.wants.length,
      offers: hunt.offers.length,
      own: isOwnProfile,
    });
    onOpenChange(false);
    router.push(
      sectionHref(buildHuntHref(hunt), { currentSection: "collect" }),
    );
  };

  // With the extension installed, the hunt becomes its want list directly, so
  // the next scroll of a Discord trade channel is already looking for it.
  // Only ever on this click: it replaces the list the user has there.
  const handleSendToExtension = async () => {
    setSending(true);
    const ok = await sendHuntToExtension(currentHunt(), { source: "grid" });
    setSending(false);
    // The extension brings the user's Discord tab forward itself, with the
    // list waiting in its panel — nothing more to say here.
    if (ok) {
      onOpenChange(false);
    } else {
      toast.error(
        "Objekt Match didn’t answer. Reload this page and try again, or open the list in Match.",
      );
    }
  };

  // The one primary action. With the extension, the list goes straight to it.
  // Without it, a Chrome desktop user who hasn't said "Not now" before gets a
  // one-time intro first; everyone else goes to /match, where pasting works.
  const handleFind = () => {
    if (extensionInstalled) {
      void handleSendToExtension();
      return;
    }
    const store = extensionStoreForBrowser();
    if (store && !introDismissed()) {
      setIntro({ storeUrl: store.url });
      track("extension_intro_shown", { source: "grid" });
      return;
    }
    handleFindOnDiscord();
  };

  // Save the hunt to the account. Only the user's own choices are kept —
  // Buy/Trade, the missing slots they deselected, the dupes they ticked — and
  // the server recomputes the wants from live ownership on every read.
  const member = firsts[0]?.member ?? "";
  const season = firsts[0]?.season ?? "";
  const handleSaveHunt = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/hunts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          member,
          season,
          edition,
          mode,
          skipped: rows
            .filter(
              (r) => r.needed > 0 && !selected.has(r.collection.collectionId),
            )
            .map((r) => r.collection.collectionId),
          offers: offered.map((d) => d.collection.collectionId),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Couldn’t save this grid.");
      }
      track("hunt_saved", { mode, wants: selected.size });
      toast.success("Saved — find it under Saved grids on Match");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t save this grid.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Sign-in lives on the root host; the internal grid path it returns to is
  // redirected onto the collect host when subdomains are on.
  const signInHref = sectionHref(
    `/sign-in?returnTo=${encodeURIComponent(
      `/collection/${encodeURIComponent(nickname)}/${encodeURIComponent(member)}?view=grid&season=${encodeURIComponent(season)}`,
    )}`,
    { currentSection: "collect" },
  );

  // Stash the draft and open the full poster editor so the user can
  // customize before saving.
  const handleCustomize = () => {
    const stash = encodeGridTradeStash(buildPosterData());
    onOpenChange(false);
    router.push(
      `${sectionHref("/list?prefill=grid", { currentSection: "collect" })}#${GRID_TRADE_HASH_PARAM}=${stash}`,
    );
  };

  // Secondary path (own profile only): create a public trade list right away
  // and land on its Matches view. Haves are the ticked dupes only.
  const handleFindTrades = async () => {
    const posterData = buildPosterData();
    setCreating(true);
    try {
      const res = await fetch("/api/posters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: posterData.username,
          cosmoId: posterData.cosmoId,
          haves: posterData.haves.map((item, i) =>
            resolvedItemToApiInput(item, i),
          ),
          wants: posterData.wants.map((item, i) =>
            resolvedItemToApiInput(item, i),
          ),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed");
      }
      const { id } = (await res.json()) as { id: string };
      onOpenChange(false);
      // This dialog renders on the collect host — passing "collect" makes
      // sectionHref emit an absolute URL onto the list host instead of a
      // relative path that would 404 on collect.<root>.
      router.push(sectionHref(`/list/${id}`, { currentSection: "collect" }));
    } catch {
      toast.error(
        "Couldn't create your trade list automatically — try customizing it instead.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Find missing {firsts[0]?.member} {firsts[0]?.season}{" "}
            {EDITION_LABELS[edition]}
          </DialogTitle>
          <DialogDescription>
            {intro
              ? "Find who has these on Discord."
              : "Pick the ones you still need, then see who on Discord has them."}
          </DialogDescription>
        </DialogHeader>

        {intro ? (
          <>
            <ExtensionIntro
              storeUrl={intro.storeUrl}
              installed={extensionInstalled === true}
              count={selected.size}
              wants={currentHunt().wants}
              currentSection="collect"
              onSkip={handleFindOnDiscord}
              onSend={() => void handleSendToExtension()}
              sending={sending}
            />
            <button
              type="button"
              onClick={() => setIntro(null)}
              className="mx-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to picking
            </button>
          </>
        ) : (
          <>
            {isOwnProfile && (
              <fieldset
                className="mx-auto inline-flex rounded-xl border bg-muted/50 p-1"
                aria-label="Buy or trade"
              >
                {HUNT_MODES.map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={mode === id ? "default" : "ghost"}
                    aria-pressed={mode === id}
                    onClick={() => setHuntMode(id)}
                    className="min-w-24 rounded-lg"
                  >
                    <Icon className="size-4" />
                    {label}
                  </Button>
                ))}
              </fieldset>
            )}

            <div className="mx-auto grid w-[85%] grid-cols-3 grid-rows-3 gap-2.5">
              {rows
                .slice(0, slots.length)
                .map(({ collection: c, usable }, i) => {
                  const isSelected = selected.has(c.collectionId);
                  const [row, col] = slots[i];
                  return (
                    <div
                      key={c.collectionId}
                      style={{ gridRow: row, gridColumn: col }}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(c.collectionId)}
                        className={cn(
                          "relative w-full rounded-sm overflow-hidden focus:outline-none ring-2 ring-inset ring-transparent transition-colors",
                          isSelected && "ring-green-500",
                        )}
                      >
                        {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
                        <img
                          src={c.thumbnailImage}
                          alt={c.collectionNo}
                          loading="lazy"
                          className="w-full aspect-photocard object-cover"
                        />
                        {usable <= 0 && (
                          <div className="absolute inset-0 bg-black/71.5" />
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                          <p className="text-[10px] text-white font-medium leading-tight">
                            {formatSlotSerial(c.collectionNo)}
                          </p>
                        </div>
                        {isSelected && (
                          <>
                            <div className="absolute inset-0 bg-black/25" />
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow">
                              <Check
                                className="w-3.5 h-3.5 text-white"
                                strokeWidth={3}
                              />
                            </div>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>

            {mode === "wtt" && (
              <div className="space-y-2 rounded border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Offer duplicates</p>
                  <p className="text-xs text-muted-foreground">
                    Pick dupes you’re willing to trade away. Grid rank chasers:
                    leave these empty.
                  </p>
                </div>
                {dupes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No duplicate FCOs available to offer this season.
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {dupes.map(({ collection: c, offerable }) => (
                      <li key={c.collectionId}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={offerIds.has(c.collectionId)}
                            onChange={() => toggleOffer(c.collectionId)}
                          />
                          {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
                          <img
                            src={c.thumbnailImage}
                            alt=""
                            loading="lazy"
                            className="h-8 aspect-photocard rounded-sm object-cover"
                          />
                          <span className="flex-1">{huntLabel(c)}</span>
                          <span className="text-xs text-muted-foreground">
                            {offerable} spare
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isOwnProfile ? (
              <div className="flex items-center gap-3 rounded border border-border px-3 py-2">
                <p className="flex-1 text-xs text-muted-foreground">
                  Save this grid to your account and pick it up from Match on
                  any device.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveHunt}
                  disabled={saving || !member || !season}
                  className="gap-1.5"
                >
                  {saving ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkIcon className="h-4 w-4" />
                  )}
                  Save grid
                </Button>
              </div>
            ) : (
              !session &&
              !sessionPending && (
                <p className="text-center text-xs text-muted-foreground">
                  <Link
                    href={signInHref}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Sign in to save this grid and pick it up on desktop
                  </Link>
                </p>
              )
            )}

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {isOwnProfile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={selected.size === 0 || creating}
                  className="gap-1.5 sm:mr-auto"
                >
                  {creating && <Loader2Icon className="h-4 w-4 animate-spin" />}
                  Make a trade list
                </Button>
              )}
              {extensionInstalled && (
                <Button
                  variant="outline"
                  onClick={handleFindOnDiscord}
                  disabled={selected.size === 0}
                >
                  Open in Match
                </Button>
              )}
              <Button
                onClick={handleFind}
                disabled={selected.size === 0 || sending}
                className="gap-1.5"
              >
                {sending ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SearchIcon className="h-4 w-4" />
                )}
                Find on Discord
              </Button>
            </DialogFooter>
            {extensionInstalled === false && (
              <CopyAndOpenDiscord wants={currentHunt().wants} />
            )}
            {extensionInstalled && (
              <p className="text-center text-xs text-muted-foreground">
                Adds these to Objekt Match and takes you to Discord, where it
                flags who has them as you scroll.
              </p>
            )}
          </>
        )}
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a trade list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a public trade list with these items as your
              wants
              {offered.length > 0 ? " and your ticked dupes as haves" : ""}, so
              other traders can find and match with it. You can customize it
              first, or create it now as-is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmOpen(false);
                handleCustomize();
              }}
            >
              Customize first
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                handleFindTrades();
              }}
            >
              Create List
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
