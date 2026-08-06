"use client";

import { useQuery } from "@tanstack/react-query";
import { progressOverviewQueryKey } from "@/lib/progress/identity-keys";
import {
  readStoredOverview,
  writeStoredOverview,
} from "@/lib/progress/overview-storage";
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
      const data: ProgressOverviewResponse = await res.json();
      writeStoredOverview(address, data);
      return data;
    },
    // Seed from the session cache so returning to a wallet already looked at
    // paints immediately and revalidates in the background, instead of
    // dropping back to the "Matching …" scan. `initialDataUpdatedAt` carries
    // the original fetch time, so staleTime still decides whether a refetch
    // is due — a fresh entry is reused as-is, an old one is refreshed under
    // the already-rendered content.
    initialData: () => readStoredOverview(address)?.data,
    initialDataUpdatedAt: () => readStoredOverview(address)?.savedAt,
    staleTime: 60_000,
    // The default 5min gcTime evicts this while the user is off browsing
    // another collection; the fetch is slow enough to be worth keeping.
    gcTime: 60 * 60_000,
    retry: false,
  });
}
