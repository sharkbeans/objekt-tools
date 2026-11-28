"use client";

import { ArrowLeftRightIcon } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ShowcaseCard } from "@/lib/home/showcase";
import { cn } from "@/lib/utils";
import styles from "./home.module.css";
import { TableCard } from "./table-card";

// A 9 x 3 patch of table: your twelve cards fill columns 0-3, theirs fill
// 5-8, and column 4 stays empty as the lane between them, with the swap
// mark in its middle cell.
const COLS = 9;
const ROWS = 3;
const SIDE_COLS = 4;
const THEIR_FIRST_COL = 5;
const LANE_CELL = COLS + SIDE_COLS;

/**
 * Where a side's k-th card sits: four across, three down. Their side is a
 * mirror of yours, so both sides' k-th cards face each other across the
 * lane; both are dealt from the same layout, so they're the same class.
 */
function cellOf(k: number, side: "mine" | "theirs") {
  const row = Math.floor(k / SIDE_COLS);
  const col = k % SIDE_COLS;
  return side === "mine"
    ? row * COLS + col
    : row * COLS + THEIR_FIRST_COL + (SIDE_COLS - 1 - col);
}

// The order the facing pairs trade in: every row and every distance from
// the lane, mixed, so no two trades in a row look alike. It opens on the
// middle and bottom rows; the top row runs off the panel's edge.
const TRADE_ORDER = [5, 10, 3, 4, 11, 1, 6, 8, 2, 7, 9, 0];

// Turned only a little, so your side reads as left and theirs as right.
const CAMERA = "rotateX(50deg) rotateZ(-9deg)";

const FIRST_TRADE_MS = 1600;
const TRADE_MS = 2800;
const PAUSE_MS = 700;
const HIDDEN_RETRY_MS = 1000;

/**
 * Your cards on the left, theirs on the right. One trade after another, a
 * card of yours and the card facing it on their side, always of the same
 * class, swap places across the lane with a small lift.
 */
export function MatchShowcase({
  mine,
  theirs,
  reduce,
}: {
  mine: ShowcaseCard[];
  theirs: ShowcaseCard[];
  reduce: boolean;
}) {
  // Which card sits on each cell; the trade swaps two entries.
  const [lit, setLit] = useState(() => {
    const map = new Map<number, ShowcaseCard>();
    mine.slice(0, SIDE_COLS * ROWS).forEach((card, k) => {
      map.set(cellOf(k, "mine"), card);
    });
    theirs.slice(0, SIDE_COLS * ROWS).forEach((card, k) => {
      map.set(cellOf(k, "theirs"), card);
    });
    return map;
  });
  // The cell pairs that may trade: facing cards of the same class. A trade
  // swaps two cards of one class, so each cell keeps its class for good.
  const pairs = useMemo(
    () =>
      TRADE_ORDER.filter(
        (k) => mine[k] && theirs[k] && mine[k].class === theirs[k].class,
      ).map((k): [number, number] => [cellOf(k, "mine"), cellOf(k, "theirs")]),
    [mine, theirs],
  );
  const cardRefs = useRef(new Map<number, HTMLSpanElement>());
  const settled = useRef<Animation[]>([]);

  // After a trade lands, the pictures have swapped places in state; drop
  // the held animation in the same frame so nothing visibly jumps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs whenever a trade commits.
  useLayoutEffect(() => {
    for (const animation of settled.current) animation.cancel();
    settled.current = [];
  }, [lit]);

  useEffect(() => {
    if (reduce || pairs.length === 0) return;
    let turn = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (ms: number) => {
      if (!stopped) timer = setTimeout(trade, ms);
    };
    function trade() {
      // A hidden tab waits instead of trading unseen.
      if (document.hidden) return later(HIDDEN_RETRY_MS);
      const [a, b] = pairs[turn++ % pairs.length];
      const cardA = cardRefs.current.get(a);
      const cardB = cardRefs.current.get(b);
      const plane = cardA?.parentElement?.parentElement;
      if (!cardA || !cardB || !plane || typeof cardA.animate !== "function") {
        return later(PAUSE_MS);
      }
      // Distances in the table's own (untransformed) layout.
      const gap = Number.parseFloat(getComputedStyle(plane).columnGap) || 0;
      const dx = ((b % COLS) - (a % COLS)) * (cardA.offsetWidth + gap);
      const rise = cardA.offsetHeight * 0.18;
      const options: KeyframeAnimationOptions = {
        duration: TRADE_MS,
        easing: "cubic-bezier(0.45, 0.05, 0.35, 1)",
        fill: "forwards",
      };
      // They pass each other with a little room, one above and one below,
      // lifted clear of the cards they cross.
      const move = (el: HTMLElement, x: number, y: number) =>
        el.animate(
          [
            { transform: "translate3d(0, 0, 0)" },
            {
              transform: `translate3d(${x / 2}px, ${y}px, 24px)`,
              offset: 0.5,
            },
            { transform: `translate3d(${x}px, 0, 0)` },
          ],
          options,
        );
      const there = move(cardA, dx, -rise);
      const back = move(cardB, -dx, rise);
      Promise.all([there.finished, back.finished])
        .then(() => {
          settled.current = [there, back];
          setLit((prev) => {
            const next = new Map(prev);
            const cardAtA = prev.get(a);
            const cardAtB = prev.get(b);
            if (cardAtA && cardAtB) {
              next.set(a, cardAtB);
              next.set(b, cardAtA);
            }
            return next;
          });
        })
        .catch(() => {})
        .finally(() => {
          later(PAUSE_MS);
        });
    }
    later(FIRST_TRADE_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [reduce, pairs]);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const card = lit.get(i);
    cells.push(
      <div key={`cell-${i}`} className={styles.cell}>
        {i === LANE_CELL && (
          <span className={styles.laneMark}>
            <ArrowLeftRightIcon />
          </span>
        )}
        {card && (
          <TableCard
            card={card}
            lit
            ref={(el) => {
              if (el) cardRefs.current.set(i, el);
              else cardRefs.current.delete(i);
            }}
          />
        )}
      </div>,
    );
  }

  // Like the grid board, the table is placed against the step's text: its
  // bottom row runs behind the heading, under the fade.
  return (
    <div className={styles.handsStage}>
      <div
        className={cn(styles.plane, styles.handsPlane)}
        style={{ "--cols": COLS, "--cam": CAMERA } as React.CSSProperties}
      >
        {cells}
      </div>
    </div>
  );
}
