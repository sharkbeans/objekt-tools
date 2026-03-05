import { ofetch } from "ofetch";
import { db } from "@/lib/db";
import { cosmoToken } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import type {
  CosmoSearchResult,
  CosmoUserProfile,
  ValidArtist,
} from "./types";

const COSMO_API = "https://api.cosmo.fans";

const cosmoFetch = ofetch.create({
  baseURL: COSMO_API,
  retry: 0,
  timeout: 10000,
  headers: {
    "User-Agent": "objekt-trade",
  },
});

async function getLatestToken() {
  const latest = await db
    .select()
    .from(cosmoToken)
    .orderBy(desc(cosmoToken.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!latest) {
    throw new Error("No Cosmo token found in database. Seed one first.");
  }

  return latest;
}

async function refreshAccessToken(tokenRow: {
  id: number;
  refreshToken: string;
}) {
  const result = await ofetch<{
    credentials: { accessToken: string; refreshToken: string };
  }>(`${COSMO_API}/auth/v1/refresh`, {
    method: "POST",
    body: { refreshToken: tokenRow.refreshToken },
  });

  const { accessToken, refreshToken: newRefreshToken } = result.credentials;

  await db
    .update(cosmoToken)
    .set({ accessToken, refreshToken: newRefreshToken })
    .where(eq(cosmoToken.id, tokenRow.id));

  return accessToken;
}

async function cosmoFetchWithRefresh<T>(
  url: string,
  opts?: Record<string, unknown>
): Promise<T> {
  const token = await getLatestToken();

  try {
    return await cosmoFetch<T>(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : undefined;

    if (status === 401 || status === 403) {
      const newAccessToken = await refreshAccessToken(token);
      return await cosmoFetch<T>(url, {
        ...opts,
        headers: { Authorization: `Bearer ${newAccessToken}` },
      });
    }

    throw error;
  }
}

export async function searchUsers(
  query: string
): Promise<CosmoSearchResult> {
  return cosmoFetchWithRefresh("/bff/v3/users/search", {
    params: { nickname: query, skip: 0, take: 100 },
  });
}

export async function fetchUserProfile(
  cosmoId: number,
  artistId: ValidArtist
): Promise<CosmoUserProfile> {
  return cosmoFetchWithRefresh(`/bff/v3/users/${cosmoId}`, {
    params: { artistId },
  });
}
