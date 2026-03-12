/**
 * Local development seed script.
 *
 * Creates a test user + linked fake Cosmo account so you can use the app
 * without going through the real Cosmo verification flow.
 *
 * Usage:
 *   npx tsx scripts/seed-local.ts
 */

import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

loadEnvConfig(process.cwd());

// ============================================================
// Cosmo token — fill these in to enable Cosmo API features.
// Leave blank to skip (search and objekt lookup won't work).
// ============================================================
const COSMO_ACCESS_TOKEN = "";
const COSMO_REFRESH_TOKEN = "";
// ============================================================

const db = drizzle(process.env.DATABASE_URL!, { schema });

// Test user credentials — only works in local dev
const TEST_EMAIL = "seoyeon@local.wav";
const TEST_PASSWORD = "yooyeon5";
const TEST_NAME = "Test User";

// Fake Cosmo identity — no real wallet needed
const FAKE_COSMO_NICKNAME = "seoyeon";
const FAKE_COSMO_ADDRESS = "0x000000000000000000000000000000000000nien";
const FAKE_COSMO_ID = 999999;

async function main() {
  console.log("Seeding local development data...\n");

  // ── 1. Check if test user already exists ──────────────────────────────────
  const existing = await db.query.user.findFirst({
    where: eq(schema.user.email, TEST_EMAIL),
  });

  let userId: string;

  if (existing) {
    console.log(`Test user already exists (id: ${existing.id}), skipping user creation.`);
    userId = existing.id;
  } else {
    // ── 2. Call the Better Auth sign-up API to create the user properly ──────
    // This ensures the password hash is stored in the format Better Auth expects.
    console.log("Creating test user via Better Auth sign-up API...");
    console.log("(Make sure `npm run dev` is running on http://localhost:3000)\n");

    const res = await fetch("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: TEST_NAME,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sign-up API failed (${res.status}): ${body}`);
    }

    const created = await db.query.user.findFirst({
      where: eq(schema.user.email, TEST_EMAIL),
    });

    if (!created) {
      throw new Error("User was not found in DB after sign-up. Check API response.");
    }

    userId = created.id;
    console.log(`Created user: ${TEST_EMAIL} (id: ${userId})`);
  }

  // ── 3. Link a fake Cosmo account ──────────────────────────────────────────
  const existingCosmo = await db.query.cosmoAccount.findFirst({
    where: eq(schema.cosmoAccount.userId, userId),
  });

  if (existingCosmo) {
    console.log(`Cosmo account already linked (${existingCosmo.nickname}), skipping.`);
  } else {
    await db.insert(schema.cosmoAccount).values({
      userId,
      address: FAKE_COSMO_ADDRESS,
      nickname: FAKE_COSMO_NICKNAME,
      cosmoId: FAKE_COSMO_ID,
    });
    console.log(`Linked fake Cosmo account: ${FAKE_COSMO_NICKNAME} (${FAKE_COSMO_ADDRESS})`);
  }

  // ── 4. Insert cosmo_token ─────────────────────────────────────────────────
  const existingToken = await db.query.cosmoToken.findFirst();

  if (existingToken) {
    console.log("cosmo_token row already exists, skipping.");
  } else if (COSMO_ACCESS_TOKEN && COSMO_REFRESH_TOKEN) {
    await db.insert(schema.cosmoToken).values({
      accessToken: COSMO_ACCESS_TOKEN,
      refreshToken: COSMO_REFRESH_TOKEN,
    });
    console.log("Inserted cosmo_token.");
  } else {
    console.log("No Cosmo token provided — skipping. Cosmo search/objekt lookup won't work.");
  }

  console.log(`
Done! Local test account ready:
  Email:    ${TEST_EMAIL}
  Password: ${TEST_PASSWORD}
  Cosmo:    ${FAKE_COSMO_NICKNAME}
`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
