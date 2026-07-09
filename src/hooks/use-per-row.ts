"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export const PER_ROW_OPTIONS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10];

const MIN_PER_ROW = 3;
const MAX_PER_ROW = 10;
const DESKTOP_DEFAULT = 7;
const MOBILE_DEFAULT = 3;
const MOBILE_QUERY = "(max-width: 639px)";

function storageKey(isMobile: boolean): string {
  return isMobile ? "objekt-per-row:mobile" : "objekt-per-row:desktop";
}

function clamp(n: number): number {
  return Math.min(MAX_PER_ROW, Math.max(MIN_PER_ROW, n));
}

function readStored(isMobile: boolean): number | null {
  try {
    const raw = localStorage.getItem(storageKey(isMobile));
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? clamp(parsed) : null;
  } catch {
    return null;
  }
}

export function usePerRow(): {
  perRow: number;
  setPerRow: (n: number) => void;
  gridStyle: { gridTemplateColumns: string };
} {
  const [isMobile, setIsMobile] = useState(false);
  const [perRow, setPerRowState] = useState(DESKTOP_DEFAULT);

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    setIsMobile(mobile);
    const stored = readStored(mobile);
    setPerRowState(stored ?? (mobile ? MOBILE_DEFAULT : DESKTOP_DEFAULT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPerRow = useCallback(
    (n: number) => {
      const clamped = clamp(n);
      setPerRowState(clamped);
      try {
        localStorage.setItem(storageKey(isMobile), String(clamped));
      } catch {
        // ignore storage errors (private browsing, quota, etc.)
      }
    },
    [isMobile],
  );

  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }),
    [perRow],
  );

  return { perRow, setPerRow, gridStyle };
}
