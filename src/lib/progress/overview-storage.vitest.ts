import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgressOverviewResponse } from "@/lib/progress/types";

// The module keeps an in-memory memo of parsed entries, so each test gets a
// fresh copy alongside a cleared sessionStorage.
async function freshModule() {
  vi.resetModules();
  sessionStorage.clear();
  return import("@/lib/progress/overview-storage");
}

// A reload: same sessionStorage, brand new module instance (empty memo).
async function reloadModule() {
  vi.resetModules();
  return import("@/lib/progress/overview-storage");
}

function overview(address: string): ProgressOverviewResponse {
  return {
    nickname: "sharkbeans",
    address,
    rollups: [
      {
        artist: "tripleS",
        member: "SoHyun",
        class: "First",
        season: "Binary01",
        onOffline: "online",
        owned: 3,
        total: 10,
      },
    ],
  };
}

const walletA = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const walletB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("overview session cache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips a response regardless of address casing", async () => {
    const { readStoredOverview, writeStoredOverview } = await freshModule();

    expect(readStoredOverview(walletA)).toBeNull();
    writeStoredOverview(walletA, overview(walletA));

    const entry = readStoredOverview(walletA.toLowerCase());
    expect(entry?.data.rollups).toHaveLength(1);
    expect(entry?.savedAt).toBeGreaterThan(0);
  });

  it("keeps wallets separate", async () => {
    const { readStoredOverview, writeStoredOverview } = await freshModule();

    writeStoredOverview(walletA, overview(walletA));
    expect(readStoredOverview(walletB)).toBeNull();
  });

  it("survives a reload (memo dropped, storage kept)", async () => {
    const first = await freshModule();
    first.writeStoredOverview(walletA, overview(walletA));

    const second = await reloadModule();
    expect(second.readStoredOverview(walletA)?.data.address).toBe(walletA);
  });

  it("discards entries older than the max age", async () => {
    const { writeStoredOverview } = await freshModule();

    writeStoredOverview(walletA, overview(walletA));
    const key = `collection-overview:address:${walletA.toLowerCase()}`;
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "{}");
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...stored, savedAt: Date.now() - 2 * 60 * 60_000 }),
    );

    const reloaded = await reloadModule();
    expect(reloaded.readStoredOverview(walletA)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("ignores corrupt entries", async () => {
    await freshModule();
    sessionStorage.setItem(
      `collection-overview:address:${walletA.toLowerCase()}`,
      "{not json",
    );
    const { readStoredOverview } = await reloadModule();
    expect(readStoredOverview(walletA)).toBeNull();
  });

  it("evicts the oldest wallets past the entry cap", async () => {
    const { readStoredOverview, writeStoredOverview } = await freshModule();

    const wallets = Array.from(
      { length: 7 },
      (_, i) => `0x${String(i).repeat(40)}`,
    );
    for (const wallet of wallets) {
      writeStoredOverview(wallet, overview(wallet));
    }

    const kept = Object.keys(sessionStorage).filter((k) =>
      k.startsWith("collection-overview:address:"),
    );
    expect(kept.length).toBeLessThanOrEqual(5);
    // The most recent write always survives.
    expect(readStoredOverview(wallets[wallets.length - 1])).not.toBeNull();
  });
});
