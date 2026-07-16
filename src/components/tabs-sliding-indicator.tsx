"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Current active tab value — any change re-measures and animates the pill. */
  value: string;
  /** Ref to the tab list container; children with data-state="active" are measured. */
  listRef: React.RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Sliding pill/underline for a Radix Tabs list — see
 * .claude/skills/transitions-dev/16-tabs-sliding.md. Radix already stamps
 * data-state="active" on the current TabsTrigger, so this only measures and
 * writes transform/width; the tween lives in the .t-tabs-pill CSS class.
 */
export function TabsSlidingIndicator({ value, listRef, className }: Props) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: value drives re-measurement on tab change even though the body reads DOM state instead of the prop.
  useEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;

    const moveTo = (animate: boolean) => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) return;
      if (!animate) {
        const prev = pill.style.transition;
        pill.style.transition = "none";
        pill.style.transform = `translateX(${active.offsetLeft}px)`;
        pill.style.width = `${active.offsetWidth}px`;
        void pill.offsetWidth;
        pill.style.transition = prev;
      } else {
        pill.style.transform = `translateX(${active.offsetLeft}px)`;
        pill.style.width = `${active.offsetWidth}px`;
      }
    };

    moveTo(mountedRef.current);
    mountedRef.current = true;

    const resizeObserver = new ResizeObserver(() => moveTo(false));
    resizeObserver.observe(list);
    return () => resizeObserver.disconnect();
  }, [value, listRef]);

  return <span ref={pillRef} aria-hidden="true" className={className} />;
}
