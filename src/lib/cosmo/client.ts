import { createCipheriv, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { ofetch } from "ofetch";
import { db } from "@/lib/db";
import { cosmoToken } from "@/lib/db/schema";
import type {
  CosmoArtistDetail,
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

function encryptPayload(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

async function refreshAccessToken(tokenRow: {
  id: number;
  refreshToken: string;
}) {
  const key = process.env.COSMO_KEY;
  if (!key) throw new Error("COSMO_KEY env var is not set");

  const body = encryptPayload(JSON.stringify({ refreshToken: tokenRow.refreshToken }), key);

  const result = await ofetch<{
    credentials: { accessToken: string; refreshToken: string };
  }>(`${COSMO_API}/bff/v3/users/refresh-access-token`, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "text/plain",
      "x-cosmo-encrypted": "1",
    },
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
  opts?: Record<string, unknown>,
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

export async function searchUsers(query: string): Promise<CosmoSearchResult> {
  return cosmoFetchWithRefresh("/bff/v3/users/search", {
    params: { nickname: query, skip: 0, take: 100 },
  });
}

export async function fetchUserByNickname(
  nickname: string,
): Promise<{ nickname: string; address: string } | null> {
  try {
    return await cosmoFetchWithRefresh<{ nickname: string; address: string }>(
      `/bff/v3/users/by-nickname/${encodeURIComponent(nickname)}`,
    );
  } catch {
    return null;
  }
}

export async function fetchArtistDetail(
  artistId: ValidArtist,
): Promise<CosmoArtistDetail | null> {
  try {
    return await cosmoFetchWithRefresh<CosmoArtistDetail>(
      `/bff/v3/artists/${artistId}`,
    );
  } catch {
    return null;
  }
}

export async function fetchUserProfile(
  cosmoId: number,
  artistId: ValidArtist,
): Promise<CosmoUserProfile> {
  return cosmoFetchWithRefresh(`/bff/v3/users/${cosmoId}`, {
    params: { artistId },
  });
}
