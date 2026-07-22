"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useProgressOverview } from "@/hooks/use-progress-overview";
import { realMembersByArtist, type ValidArtist } from "@/lib/filters";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

interface MemberImagesResponse {
  images: Record<string, string>;
}

interface Props {
  nickname: string;
  activeMember: string;
}

export function MemberAvatarCarousel({ nickname, activeMember }: Props) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "grid" ? "grid" : null;

  // Shares its query key with ProgressOverviewContent/MemberDexContent so
  // react-query dedupes the request across all three (or reuses the cache).
  // Deriving `artist` from this instead of taking it as a prop means this
  // component only needs `activeMember` to render — it doesn't depend on
  // the (heavier, per-member) dex fetch, so it stays mounted and correct
  // across member switches even though the page below it remounts.
  const { data } = useProgressOverview(nickname);
  const artist = data?.rollups.find((r) => r.member === activeMember)?.artist;

  const { data: imagesData } = useQuery<MemberImagesResponse>({
    queryKey: ["progress-member-images"],
    queryFn: async () => {
      const res = await fetch("/api/progress/member-images");
      if (!res.ok) return { images: {} };
      return res.json();
    },
    staleTime: 10 * 60_000,
  });
  const memberImages = imagesData?.images ?? {};

  const roster = artist
    ? (realMembersByArtist[artist as ValidArtist] ?? [])
    : [];

  const totalsByMember = useMemo(() => {
    const map = new Map<string, { owned: number; total: number }>();
    if (!data) return map;
    for (const r of data.rollups) {
      if (r.artist !== artist) continue;
      const agg = map.get(r.member) ?? { owned: 0, total: 0 };
      agg.owned += r.owned;
      agg.total += r.total;
      map.set(r.member, agg);
    }
    return map;
  }, [data, artist]);

  const avatarRefs = useRef<(HTMLDivElement | null)[]>([]);

  const setShifts = useCallback(
    (activeIdx: number | null, phase: "in" | "out") => {
      const cs = getComputedStyle(document.documentElement);
      const num = (name: string, fallback: number) => {
        const v = Number.parseFloat(cs.getPropertyValue(name));
        return Number.isFinite(v) ? v : fallback;
      };
      const ease = (name: string, fallback: string) =>
        cs.getPropertyValue(name).trim() || fallback;

      const lift = num("--avatar-lift", -4);
      const falloff = num("--avatar-falloff", 0.45);
      const scale = num("--avatar-scale", 1.05);
      const tf =
        phase === "out"
          ? ease("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)")
          : ease("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");

      for (const [i, el] of avatarRefs.current.entries()) {
        if (!el) continue;
        el.style.transitionTimingFunction = tf;
        if (activeIdx == null) {
          el.style.setProperty("--shift", "0px");
          el.style.setProperty("--scale-active", "1");
          continue;
        }
        const d = Math.abs(i - activeIdx);
        el.style.setProperty(
          "--shift",
          `${(lift * falloff ** d).toFixed(3)}px`,
        );
        el.style.setProperty(
          "--scale-active",
          i === activeIdx ? String(scale) : "1",
        );
      }
    },
    [],
  );

  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  }, []);

  // Mouse-drag-to-scroll (touch already pans natively). dragMovedRef tracks
  // whether the gesture moved enough to count as a drag rather than a click,
  // so we can suppress the Link navigation for drags only.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = e.pageX - dragStartRef.current.x;
      if (Math.abs(dx) > 3) dragMovedRef.current = true;
      el.scrollLeft = dragStartRef.current.scrollLeft - dx;
    };
    const onMouseUp = () => {
      draggingRef.current = false;
      el.classList.remove("cursor-grabbing");
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    const el = scrollerRef.current;
    if (!el) return;
    draggingRef.current = true;
    dragMovedRef.current = false;
    dragStartRef.current = { x: e.pageX, scrollLeft: el.scrollLeft };
    el.classList.add("cursor-grabbing");
  };

  const onLinkClick = (e: React.MouseEvent) => {
    if (dragMovedRef.current) e.preventDefault();
  };

  if (!artist || roster.length === 0) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-to-scroll container, links inside remain keyboard-navigable
    <div
      ref={scrollerRef}
      onMouseDown={onMouseDown}
      onMouseLeave={() => setShifts(null, "out")}
      className="-mx-4 flex cursor-grab gap-3 overflow-x-auto px-4 py-1 select-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4 sm:py-2"
    >
      {roster.map((member, i) => {
        const isActive = member === activeMember;
        const imageUrl = memberImages[`${artist}|${member}`];
        const totals = totalsByMember.get(member);

        return (
          <Link
            key={member}
            ref={isActive ? activeRef : undefined}
            href={sectionHref(
              `/collection/${nickname}/${member}${view ? "?view=grid" : ""}`,
              { currentSection: "collect" },
            )}
            onClick={onLinkClick}
            draggable={false}
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-lift is decorative; the enclosing Link carries the real interaction */}
            <div
              ref={(el) => {
                avatarRefs.current[i] = el;
              }}
              onMouseEnter={() => setShifts(i, "in")}
              className={cn(
                "t-avatar relative h-14 w-14 overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-background transition-colors sm:h-16 sm:w-16",
                isActive
                  ? "ring-primary"
                  : "ring-transparent opacity-70 hover:opacity-100",
              )}
            >
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={member}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 639px) 56px, 64px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-bold text-muted-foreground select-none">
                  {member.charAt(0)}
                </div>
              )}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {totals ? `${totals.owned}/${totals.total}` : "—"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
