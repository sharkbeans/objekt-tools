"use client";

import Link from "next/link";
import type { ProgressRollup } from "@/lib/progress/types";

interface Props {
  nickname: string;
  rollups: ProgressRollup[];
  member: string;
}

export function MemberProgressCard({ nickname, rollups, member }: Props) {
  const owned = rollups.reduce((s, r) => s + r.owned, 0);
  const total = rollups.reduce((s, r) => s + r.total, 0);
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;

  return (
    <Link href={`/progress/${nickname}/${member}`}>
      <div className="rounded-lg border border-border bg-card p-3 hover:border-white/40 transition-colors space-y-2">
        <p className="font-semibold text-sm truncate">{member}</p>
        <p className="text-xs text-muted-foreground">
          {owned}/{total}
        </p>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground text-right">{pct}%</p>
      </div>
    </Link>
  );
}
