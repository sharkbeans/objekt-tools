"use client";

import { useQuery } from "@tanstack/react-query";
import { progressOverviewQueryKey } from "@/lib/progress/identity-keys";
import type { ProgressOverviewResponse } from "@/lib/progress/types";

export function useProgressOverview(nickname: string, address: string) {
  return useQuery<ProgressOverviewResponse>({
    queryKey: progressOverviewQueryKey(address),
    queryFn: async () => {
      const res = await fetch(`/api/progress/${encodeURIComponent(nickname)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? "Failed to load"), {
          status: res.status,
        });
      }
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
}
