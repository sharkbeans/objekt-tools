"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { darken, lighten } from "@/lib/color-utils";
import { getMemberColor } from "@/lib/member-colors";
import type { ProgressRollup } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

interface Props {
  nickname: string;
  rollups: ProgressRollup[];
  member: string;
  artist: string;
  imageUrl?: string;
}

function progressPercent(owned: number, total: number) {
  if (total <= 0) return { width: 0, label: "0%" };
  if (owned >= total) return { width: 100, label: "100%" };

  const raw = (owned / total) * 100;
  const capped = Math.min(raw, 99.9);
  return {
    width: capped,
    label: `${capped.toFixed(1)}%`,
  };
}

export function MemberProgressCard({
  nickname,
  rollups,
  member,
  artist,
  imageUrl,
}: Props) {
  const owned = rollups.reduce((s, r) => s + r.owned, 0);
  const total = rollups.reduce((s, r) => s + r.total, 0);
  const complete = total > 0 && owned >= total;
  const pct = progressPercent(owned, total);
  const memberColor = getMemberColor(artist, member);
  const completeStyle: CSSProperties | undefined = memberColor
    ? ({
        "--progress-complete-c1": memberColor,
        "--progress-complete-c2": lighten(memberColor, 0.55),
        "--progress-complete-c3": darken(memberColor, 0.35),
      } as CSSProperties)
    : undefined;

  return (
    <Link
      href={sectionHref(`/collection/${nickname}/${member}`, {
        currentSection: "collect",
      })}
    >
      <div className="t-progress-card flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5 hover:border-white/40 transition-colors">
        <div className="flex items-center gap-3">
          <div className="shrink-0 self-stretch flex items-center">
            {imageUrl ? (
              <div className="relative h-13 w-13 rounded-full overflow-hidden">
                {/* biome-ignore lint/performance/noImgElement: Member portrait sources are already small remote assets. */}
                <img
                  src={imageUrl}
                  alt={member}
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
              </div>
            ) : (
              <div className="h-13 w-13 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground select-none">
                {member.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{member}</p>
            <p className="text-xs text-muted-foreground">
              {owned}/{total}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                complete
                  ? "t-progress-complete"
                  : cn(
                      "t-progress-hover-shimmer",
                      !memberColor && "bg-primary",
                    ),
              )}
              style={{
                width: `${pct.width}%`,
                backgroundColor: complete ? undefined : memberColor,
                ...(complete ? completeStyle : undefined),
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {pct.label}
          </p>
        </div>
      </div>
    </Link>
  );
}
