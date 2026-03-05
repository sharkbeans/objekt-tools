import { ofetch } from "ofetch";
import { db } from "@/lib/db";
import { cosmoToken } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import type {
  CosmoSearchResult,
  CosmoUserProfile,
  ObjektEntry,
  ObjektListResponse,
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

export async function fetchObjektCatalog(
  page = 1,
  size = 30
): Promise<ObjektListResponse> {
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

  const objekts: ObjektEntry[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.collections) {
      for (const item of result.value.collections) {
        const col = item.collection;
        objekts.push({
          collectionId: col.collectionId,
          artist: col.artistName,
          member: col.member,
          collectionNo: col.collectionNo,
          season: col.season,
          class: col.class,
        });
      }
    }
  }

  return {
    objekts,
    hasNext: false,
    total: objekts.length,
  };
}
