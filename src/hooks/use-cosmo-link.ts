"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";

export interface CosmoLinkStatus {
  address: string;
  nickname: string | null;
}

export function useCosmoLink() {
  const { data: session } = useSession();
  const { data, refetch, isLoading } = useQuery<CosmoLinkStatus | null>({
    queryKey: ["cosmo-link-status"],
    queryFn: async () => {
      const res = await fetch("/api/cosmo/status");
      if (res.status === 404 || res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session,
  });

  const profileHref = !session
    ? "/sign-in"
    : !data
      ? "/link"
      : `/@${data.nickname ?? data.address}`;

  return { profileHref, isLinked: !!data, isLoading, refetch };
}
