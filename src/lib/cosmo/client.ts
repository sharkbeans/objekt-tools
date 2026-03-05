import { ofetch } from "ofetch";
import { db } from "@/lib/db";
import { cosmoToken } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import type {
  CosmoSearchResult,
  CosmoUserProfile,
  ValidArtist,
} from "./types";

const COSMO_API = "https://api.cosmo.fans";

const cosmoFetch = ofetch.create({
  baseURL: COSMO_API,
  retry: 2,
  retryDelay: 500,
  timeout: 10000,
  headers: {
    "User-Agent": "objekt-trade",
  },
});

async function getUserSession(): Promise<string> {
  const latest = await db
    .select()
    .from(cosmoToken)
    .orderBy(desc(cosmoToken.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!latest) {
    throw new Error("No Cosmo session found in database. Seed one first.");
  }

  return latest.userSession;
}

async function getAuthHeaders() {
  const session = await getUserSession();
  return { Cookie: `user-session=${session}` };
}

export async function searchUsers(
  query: string
): Promise<CosmoSearchResult> {
  return cosmoFetch("/bff/v3/users/search", {
    params: { nickname: query, skip: 0, take: 100 },
    headers: await getAuthHeaders(),
  });
}

export async function fetchUserProfile(
  cosmoId: number,
  artistId: ValidArtist
): Promise<CosmoUserProfile> {
  return cosmoFetch(`/bff/v3/users/${cosmoId}`, {
    params: { artistId },
    headers: await getAuthHeaders(),
  });
}

export async function fetchUserObjekts(
  _address: string,
  page = 1,
  size = 30
): Promise<any> {
  // Fetch from all three artists in parallel and merge results
  const artists = ["tripleS", "artms", "idntt"];
  const headers = await getAuthHeaders();

  const results = await Promise.allSettled(
    artists.map((artistId) =>
      cosmoFetch("/bff/v3/objekt-summaries", {
        params: {
          artistId,
          page: String(page),
          size: String(size),
          order: "newest",
        },
        headers,
      })
    )
  );

  const collections: any[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.collections) {
      collections.push(...result.value.collections);
    }
  }

  return {
    objekts: collections,
    hasNext: false,
    total: collections.length,
  };
}
