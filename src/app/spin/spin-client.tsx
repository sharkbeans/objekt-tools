"use client";

import {
  ChevronLeftIcon,
  CircleHelpIcon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./spin.module.css";

type SpinClass = "First" | "Basic" | "Special" | "Premier";
type PageState = "spin" | "select" | "run";
type RunStage = "loading" | "carousel" | "grid" | "reveal" | "done";

interface SpinCollection {
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  frontImage: string;
  thumbnailImage: string;
}

interface SpinResult {
  kind: "objekt" | "fail";
  className?: SpinClass;
  objekt?: SpinCollection;
}

const seasonOrder = [
  "Atom",
  "Binary",
  "Cream",
  "Divine",
  "Ever",
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
];
const carouselCards = Array.from(
  { length: 8 },
  (_, index) => `carousel-${index}`,
);
const mysteryCards = Array.from(
  { length: 16 },
  (_, index) => `mystery-${index}`,
);
const shardPieces = Array.from({ length: 18 }, (_, index) => `shard-${index}`);

const classMap: Record<string, SpinClass | undefined> = {
  First: "First",
  "First Class": "First",
  Basic: "Basic",
  "Basic Class": "Basic",
  Special: "Special",
  "Special Class": "Special",
  Premier: "Premier",
  "Premier Class": "Premier",
};

function isIdntt(artist: string) {
  return artist.toLowerCase() === "idntt";
}

function isPrimarySpinClass(artist: string, className: SpinClass) {
  return isIdntt(artist) ? className === "Basic" : className === "First";
}

function parseSeason(season: string) {
  const match = season.match(/^([A-Za-z]+?)(\d+)$/);
  if (!match) return { name: season, cycle: 999, rank: 999 };
  const [, name, number] = match;
  const rank = seasonOrder.indexOf(name);
  return {
    name,
    cycle: Number.parseInt(number, 10),
    rank: rank === -1 ? 500 : rank,
  };
}

function compareSpinChoices(a: SpinCollection, b: SpinCollection) {
  const artistCompare = a.artist.localeCompare(b.artist);
  if (artistCompare !== 0) return artistCompare;

  const left = parseSeason(a.season);
  const right = parseSeason(b.season);
  if (left.cycle !== right.cycle) return left.cycle - right.cycle;
  if (left.rank !== right.rank) return left.rank - right.rank;
  return a.season.localeCompare(b.season);
}

function getEra(season: string) {
  const parsed = parseSeason(season);
  if (season === "Binary01" || season === "Ever01" || season === "Atom02") {
    return "mid";
  }
  if (parsed.cycle > 2 || (parsed.cycle === 2 && season !== "Atom02")) {
    return "modern";
  }
  return "early";
}

function spinKey(collection: Pick<SpinCollection, "artist" | "season">) {
  return `${collection.artist}::${collection.season}`;
}

function rollWeighted(
  weights: Array<{ outcome: SpinClass | "Fail"; chance: number }>,
) {
  const total = weights.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * total;

  for (const item of weights) {
    roll -= item.chance;
    if (roll <= 0) return item.outcome;
  }

  return weights.at(-1)?.outcome ?? "Fail";
}

function rollClass(artist: string, season: string): SpinClass | "Fail" {
  const normalizedArtist = artist.toLowerCase();

  if (normalizedArtist === "idntt") {
    return rollWeighted([
      { outcome: "Basic", chance: 87.5 },
      { outcome: "Special", chance: 3.13 },
      { outcome: "Fail", chance: 9.38 },
    ]);
  }

  if (normalizedArtist === "artms") {
    return rollWeighted([
      { outcome: "First", chance: 87.5 },
      { outcome: "Fail", chance: 9.38 },
      { outcome: "Special", chance: 3.13 },
      { outcome: "Premier", chance: 0.06 },
    ]);
  }

  const era = getEra(season);

  if (era === "early") {
    return rollWeighted([
      { outcome: "First", chance: 87.5 },
      { outcome: "Special", chance: 3.13 },
      { outcome: "Fail", chance: 9.38 },
    ]);
  }

  if (era === "mid") {
    return rollWeighted([
      { outcome: "First", chance: 87.5 },
      { outcome: "Special", chance: 3.13 },
      { outcome: "Premier", chance: 0.06 },
      { outcome: "Fail", chance: 9.31 },
    ]);
  }

  return rollWeighted([
    { outcome: "First", chance: 90.63 },
    { outcome: "Premier", chance: 0.06 },
    { outcome: "Fail", chance: 9.31 },
  ]);
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function buildResult(
  selected: SpinCollection,
  poolsByArtistSeason: Map<string, Record<SpinClass, SpinCollection[]>>,
): SpinResult {
  const rolled = rollClass(selected.artist, selected.season);
  if (rolled === "Fail") return { kind: "fail" };

  const pool = poolsByArtistSeason.get(spinKey(selected))?.[rolled] ?? [];
  const objekt = pickRandom(pool);

  if (!objekt) return { kind: "fail" };
  return { kind: "objekt", className: rolled, objekt };
}

function ObjektCard({
  objekt,
  className,
  muted,
}: {
  objekt: SpinCollection;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(styles.objektCard, muted && styles.objektMuted, className)}
    >
      {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
      <img src={objekt.frontImage || objekt.thumbnailImage} alt="" />
    </div>
  );
}

function EmptyObjekt({ className }: { className?: string }) {
  return (
    <div className={cn(styles.emptyObjekt, className)}>
      <XIcon className="size-16" />
      <span>Broken</span>
    </div>
  );
}

function PurpleCard({
  className,
  onClick,
  disabled,
}: {
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(styles.cardBack, className)}
      onClick={onClick}
      disabled={disabled}
      aria-label="Pick card"
    >
      <span className={styles.cardLogo} />
    </button>
  );
}

function ObjektMark() {
  return (
    <div className={styles.objektMark} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function BackFace() {
  return (
    <div className={styles.resultBack}>
      <span className={styles.cardLogo} />
    </div>
  );
}

function ResultTile({
  result,
  selected,
  index,
}: {
  result: SpinResult;
  selected: boolean;
  index: number;
}) {
  const style = { "--delay": `${index * 42}ms` } as CSSProperties;

  return (
    <div
      className={cn(
        styles.resultTile,
        selected && styles.resultTileSelected,
        result.className === "Premier" && styles.resultTilePremier,
      )}
      style={style}
    >
      {result.kind === "objekt" && result.objekt ? (
        <ObjektCard objekt={result.objekt} />
      ) : (
        <EmptyObjekt />
      )}
    </div>
  );
}

export function SpinClient() {
  const [collections, setCollections] = useState<SpinCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState<PageState>("spin");
  const [stage, setStage] = useState<RunStage>("loading");
  const [selected, setSelected] = useState<SpinCollection | null>(null);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [gridResults, setGridResults] = useState<SpinResult[]>([]);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [revealedGridOpen, setRevealedGridOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCollections() {
      try {
        const response = await fetch("/api/spin/collections");
        if (!response.ok) throw new Error("Failed to load collections");
        const data = (await response.json()) as { results: SpinCollection[] };
        if (!cancelled) setCollections(data.results);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoadingCollections(false);
      }
    }

    loadCollections();
    return () => {
      cancelled = true;
    };
  }, []);

  const { spinChoices, poolsByArtistSeason } = useMemo(() => {
    const choices = new Map<string, SpinCollection>();
    const pools = new Map<string, Record<SpinClass, SpinCollection[]>>();

    for (const collection of collections) {
      const normalizedClass = classMap[collection.class];
      if (!normalizedClass) continue;
      const key = spinKey(collection);

      if (!pools.has(key)) {
        pools.set(key, {
          First: [],
          Basic: [],
          Special: [],
          Premier: [],
        });
      }

      pools.get(key)?.[normalizedClass].push(collection);

      if (
        isPrimarySpinClass(collection.artist, normalizedClass) &&
        !choices.has(key)
      ) {
        choices.set(key, collection);
      }
    }

    return {
      spinChoices: [...choices.values()].sort(compareSpinChoices),
      poolsByArtistSeason: pools,
    };
  }, [collections]);

  function startSpin() {
    if (!selected) return;
    setPage("run");
    setStage("loading");
    setResult(null);
    setGridResults([]);
    setPickedIndex(null);
    setRevealedGridOpen(false);

    window.setTimeout(() => setStage("carousel"), 200);
    window.setTimeout(() => setStage("grid"), 1900);
  }

  function pickMysteryCard(index: number) {
    if (!selected) return;
    setStage("loading");
    setPickedIndex(index);
    setRevealedGridOpen(false);

    window.setTimeout(() => {
      const chosenResult = buildResult(selected, poolsByArtistSeason);
      const allResults = mysteryCards.map((_, cardIndex) =>
        cardIndex === index
          ? chosenResult
          : buildResult(selected, poolsByArtistSeason),
      );

      setResult(chosenResult);
      setGridResults(allResults);
      setStage("reveal");
    }, 200);

    window.setTimeout(() => setStage("done"), 5000);
  }

  function resetSpin() {
    setPage("spin");
    setStage("loading");
    setResult(null);
    setGridResults([]);
    setPickedIndex(null);
    setRevealedGridOpen(false);
  }

  const resultCard =
    result?.kind === "objekt" && result.objekt ? (
      <ObjektCard objekt={result.objekt} className={styles.revealedCard} />
    ) : (
      <EmptyObjekt className={styles.revealedCard} />
    );

  return (
    <div className={styles.shell}>
      <div className={styles.phone}>
        {page === "spin" && (
          <section className={styles.spinPage}>
            <header className={styles.header}>
              <div>
                <p>Spin Ticket</p>
                <span>23:54:39</span>
              </div>
              <button type="button" className={styles.pointsButton}>
                Tap to Charge Points
              </button>
            </header>

            <div className={styles.sideCards} aria-hidden="true">
              <PurpleCard disabled />
              <PurpleCard disabled />
            </div>

            <button
              type="button"
              className={styles.centerSlot}
              onClick={() => setPage("select")}
              aria-label="Select objekt"
            >
              {selected ? (
                <ObjektCard objekt={selected} />
              ) : (
                <div className={styles.placeholder}>
                  <PlusIcon className="size-8" />
                </div>
              )}
            </button>

            {selected && (
              <div className={styles.selectedCaption}>
                <span>
                  {selected.artist} {selected.season}
                </span>
                <p>
                  Spin with the {selected.artist} {selected.season} season
                  Objekt
                </p>
              </div>
            )}

            {!selected && (
              <div className={styles.selectedCaption}>
                <p>Choose a season Objekt to Spin</p>
              </div>
            )}

            <footer className={styles.footer}>
              <p>Today, 70 people received Special Objekt!</p>
              <Button
                type="button"
                className={styles.primaryButton}
                onClick={startSpin}
                disabled={!selected}
              >
                Spin
              </Button>
            </footer>
          </section>
        )}

        {page === "select" && (
          <section className={styles.selectPage}>
            <header className={styles.selectHeader}>
              <button
                type="button"
                onClick={() => setPage("spin")}
                aria-label="Back"
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <h1>Choose a season</h1>
              <span />
            </header>

            {loadingCollections && (
              <div className={styles.selectMessage}>Loading objekts</div>
            )}

            {loadError && (
              <div className={styles.selectMessage}>
                Could not load indexer objekts.
              </div>
            )}

            {!loadingCollections && !loadError && (
              <div className={styles.seasonGrid}>
                {spinChoices.map((objekt) => (
                  <button
                    type="button"
                    key={spinKey(objekt)}
                    className={cn(
                      styles.seasonChoice,
                      selected &&
                        spinKey(selected) === spinKey(objekt) &&
                        styles.seasonChoiceSelected,
                    )}
                    onClick={() => {
                      setSelected(objekt);
                      setPage("spin");
                    }}
                  >
                    <ObjektCard objekt={objekt} />
                    <span>
                      {objekt.artist} {objekt.season}
                    </span>
                    <small>{objekt.member}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {page === "run" && (
          <section className={styles.runStage}>
            {stage === "loading" && (
              <div className={styles.stageLoader}>
                <ObjektMark />
              </div>
            )}

            {stage === "carousel" && (
              <div className={styles.carouselTrack}>
                {carouselCards.map((card) => (
                  <PurpleCard
                    key={card}
                    className={styles.carouselCard}
                    disabled
                  />
                ))}
              </div>
            )}

            {stage === "grid" && (
              <div className={styles.mysteryGridWrap}>
                <p>Pick a mystery card</p>
                <div className={styles.mysteryGrid}>
                  {mysteryCards.map((card, index) => (
                    <PurpleCard
                      key={card}
                      onClick={() => pickMysteryCard(index)}
                    />
                  ))}
                </div>
              </div>
            )}

            {stage === "reveal" && result && (
              <div className={styles.revealStage}>
                <div className={styles.flare} />
                <div className={styles.shards} aria-hidden="true">
                  {shardPieces.map((shard) => (
                    <span key={shard} />
                  ))}
                </div>
                <div className={styles.revealFlip}>
                  <div className={styles.revealInner}>
                    <PurpleCard className={styles.revealBack} disabled />
                    <BackFace />
                    {resultCard}
                  </div>
                </div>
              </div>
            )}

            {stage === "done" &&
              result &&
              gridResults.length === 16 &&
              !revealedGridOpen && (
                <div className={styles.doneStage}>
                  <div className={styles.successTitle}>
                    {result.kind === "fail" ? (
                      <>
                        <CircleHelpIcon className="size-4" />
                        <span>Spin was broken</span>
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="size-4" />
                        <span>Spin was successful!</span>
                      </>
                    )}
                  </div>
                  <p className={styles.resultSummary}>
                    {result.kind === "objekt" && result.objekt
                      ? `Received ${result.objekt.artist} ${result.objekt.season} ${result.objekt.member} ${result.objekt.collectionNo} Objekt`
                      : "The selected card was Broken"}
                  </p>
                  <div className={styles.doneCard}>{resultCard}</div>
                  <button
                    type="button"
                    className={styles.revealAllButton}
                    onClick={() => setRevealedGridOpen(true)}
                  >
                    Reveal unchosen Objekts
                  </button>
                  <Button
                    type="button"
                    className={styles.primaryButton}
                    onClick={resetSpin}
                  >
                    Done
                  </Button>
                </div>
              )}

            {stage === "done" &&
              result &&
              gridResults.length === 16 &&
              revealedGridOpen && (
                <div className={styles.doneStage}>
                  <div className={styles.gridHeader}>
                    <button
                      type="button"
                      onClick={() => setRevealedGridOpen(false)}
                      aria-label="Back to result"
                    >
                      <ChevronLeftIcon className="size-5" />
                    </button>
                    <span>Spin Result</span>
                    <span />
                  </div>
                  <div className={styles.revealedGrid}>
                    {gridResults.map((gridResult, index) => (
                      <ResultTile
                        key={`${mysteryCards[index]}-${gridResult.kind}-${gridResult.objekt?.collectionId ?? "broken"}`}
                        result={gridResult}
                        selected={index === pickedIndex}
                        index={index}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    className={styles.primaryButton}
                    onClick={resetSpin}
                  >
                    <RotateCcwIcon className="size-4" />
                    Try again
                  </Button>
                </div>
              )}
          </section>
        )}
      </div>
    </div>
  );
}
