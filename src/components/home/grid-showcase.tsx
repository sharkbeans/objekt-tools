"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { FULL_GRID_SLOTS } from "@/lib/grid-progress";
import type { Showcase } from "@/lib/home/showcase";
import { cn } from "@/lib/utils";
import styles from "./home.module.css";
import { TableCard } from "./table-card";

// Tilted steeply, so a board big enough to fill the panel stays short.
const CAMERA = "rotateX(57deg) rotateZ(-24deg)";

// The board starts part-done, as a real collection would be: these four
// FCOs (101, 102, 105, 107) are already in, and the other four slots show
// as empty frames until they fill, in this order.
const OWNED_SLOTS = [0, 1, 4, 6];
const FILL_ORDER = [2, 3, 5, 7];

// The board's timeline, in ms from when the cards arrive. It plays once and
// then stays on the finished board.
const START = 1100;
const FILL_EVERY = 380;
const GRID_AFTER = 700;

/** How many of FILL_ORDER are in, and whether it has gridded. */
type Step = { filled: number; gridded: boolean };
const START_STEP: Step = { filled: 0, gridded: false };
const DONE: Step = { filled: FILL_ORDER.length, gridded: true };

function isPlaced(slot: number, step: Step) {
  if (OWNED_SLOTS.includes(slot)) return true;
  const turn = FILL_ORDER.indexOf(slot);
  return turn >= 0 && turn < step.filled;
}

/**
 * Finishing a grid, once: the board starts with four FCOs in, the missing
 * four settle into their slots one by one, then the board grids. The FCOs
 * dim as spent and the reward SCO rises in the middle, and the board stays
 * like that.
 */
function useGridFinish(reduce: boolean) {
  const [step, setStep] = useState<Step>(reduce ? DONE : START_STEP);

  useEffect(() => {
    if (reduce) {
      setStep(DONE);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    FILL_ORDER.forEach((_, i) => {
      at(START + i * FILL_EVERY, () =>
        setStep({ filled: i + 1, gridded: false }),
      );
    });
    at(START + (FILL_ORDER.length - 1) * FILL_EVERY + GRID_AFTER, () =>
      setStep(DONE),
    );
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  return step;
}

/** The 3 x 3 grid board: eight FCOs around the reward SCO. */
export function GridShowcase({
  grid,
  reduce,
}: {
  grid: Showcase["grid"];
  reduce: boolean;
}) {
  const step = useGridFinish(reduce);
  const reward = grid.rewards[0];

  // Slot order follows the collection page's grid board; the middle cell
  // (row 2, column 2) holds the reward.
  const cells: React.ReactNode[] = Array.from({ length: 9 });
  FULL_GRID_SLOTS.forEach(([r, c], slot) => {
    const card = grid.firsts[slot];
    // Each card drifts in from a slightly different spot.
    const offset = {
      "--dx": `${((slot * 7) % 9) - 4}%`,
      "--dy": `${-(6 + ((slot * 5) % 5))}%`,
      "--rot": `${((slot * 5) % 5) - 2}deg`,
    } as React.CSSProperties;
    cells[(r - 1) * 3 + (c - 1)] = (
      <div
        key={`slot-${card.id}`}
        className={cn(styles.cell, styles.slot)}
        data-placed={isPlaced(slot, step) || undefined}
        data-spent={step.gridded || undefined}
        style={offset}
      >
        <span className={styles.slotFrame} />
        <TableCard card={card} lit />
      </div>
    );
  });
  cells[4] = (
    <div
      key="reward"
      className={cn(styles.cell, styles.reward)}
      data-placed={step.gridded || undefined}
    >
      <span className={styles.slotFrame} />
      <TableCard key={reward.id} card={reward} lit />
    </div>
  );

  // The stage is the space above the step's text; the board is centred in
  // it, so the reward always lands in view, and sized from it, so it fills
  // the panel and runs behind the text under the fade.
  return (
    <div className={styles.stage}>
      <div
        className={cn(styles.plane, styles.boardPlane)}
        style={{ "--cols": 3, "--cam": CAMERA } as React.CSSProperties}
      >
        {cells}
      </div>
    </div>
  );
}
