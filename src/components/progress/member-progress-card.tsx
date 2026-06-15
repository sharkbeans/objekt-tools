"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProgressRollup } from "@/lib/progress/types";

interface Props {
  nickname: string;
  rollups: ProgressRollup[];
  member: string;
  imageUrl?: string;
}

export function MemberProgressCard({
  nickname,
  rollups,
  member,
  imageUrl,
}: Props) {
  const owned = rollups.reduce((s, r) => s + r.owned, 0);
  const total = rollups.reduce((s, r) => s + r.total, 0);
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;

  return (
    <Link href={`/progress/${nickname}/${member}`}>
      <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5 hover:border-white/40 transition-colors">
        <div className="flex items-center gap-3">
          <div className="shrink-0 self-stretch flex items-center">
            {imageUrl ? (
              <div className="relative h-13 w-13 rounded-full overflow-hidden">
                <Image
                  src={imageUrl}
                  alt={member}
                  fill
                  className="object-cover object-top"
                  sizes="104px"
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
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">{pct}%</p>
        </div>
      </div>
    </Link>
  );
}
