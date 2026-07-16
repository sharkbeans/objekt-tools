"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { realMembersByArtist, type ValidArtist } from "@/lib/filters";
import type { ProgressOverviewResponse } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

interface MemberImagesResponse {
  images: Record<string, string>;
}

interface Props {
  nickname: string;
  artist: string;
  activeMember: string;
}

export function MemberAvatarCarousel({
  nickname,
  artist,
  activeMember,
}: Props) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "grid" ? "grid" : null;

  // Same query key/fn as ProgressOverviewContent so react-query dedupes the
  // request when both are mounted (or reuses the cached result on nav back).
  const { data } = useQuery<ProgressOverviewResponse>({
    queryKey: ["progress", nickname],
    queryFn: async () => {
      const res = await fetch(`/api/progress/${encodeURIComponent(nickname)}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });

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

  const roster = realMembersByArtist[artist as ValidArtist] ?? [];

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

  if (roster.length === 0) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-to-scroll container, links inside remain keyboard-navigable
    <div
      ref={scrollerRef}
      onMouseDown={onMouseDown}
      className="-mx-4 flex cursor-grab gap-4 overflow-x-auto px-4 py-2 select-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {roster.map((member) => {
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
            <div
              className={cn(
                "relative h-16 w-16 overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
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
                  sizes="64px"
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
