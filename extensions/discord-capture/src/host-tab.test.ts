import assert from "node:assert/strict";
import { test } from "node:test";
import { NoDiscordTab, pickTab, resolveTab, type TabLike } from "./host-tab";

const source = (tabs: TabLike[]) => ({
  get: async (id: number) => tabs.find((tab) => tab.id === id),
  query: async () => tabs,
});

test("prefers the most recently used Discord tab", async () => {
  const tabs: TabLike[] = [
    { id: 1, url: "https://discord.com/channels/1/2", lastAccessed: 100 },
    { id: 2, url: "https://discord.com/channels/1/3", lastAccessed: 900 },
    { id: 3, url: "https://example.com", lastAccessed: 5000, active: true },
  ];
  assert.equal(pickTab(tabs)?.id, 2);
  assert.equal((await resolveTab(source(tabs), null)).id, 2);
});

test("falls back to the active tab when access times are missing", () => {
  assert.equal(
    pickTab([
      { id: 1, url: "https://discord.com/channels/1/2" },
      { id: 2, url: "https://ptb.discord.com/channels/1/3", active: true },
    ])?.id,
    2,
  );
});

test("an embedded panel acts on its own tab, not the most recent one", async () => {
  const tabs: TabLike[] = [
    { id: 1, url: "https://discord.com/channels/1/2", lastAccessed: 1 },
    { id: 2, url: "https://discord.com/channels/1/3", lastAccessed: 999 },
  ];
  assert.equal((await resolveTab(source(tabs), 1)).id, 1);
});

test("a pinned tab that closed or navigated away falls back rather than failing", async () => {
  const tabs: TabLike[] = [
    { id: 2, url: "https://discord.com/channels/1/3", lastAccessed: 5 },
  ];
  assert.equal((await resolveTab(source(tabs), 404)).id, 2);
  assert.equal(
    (await resolveTab(source([...tabs, { id: 9, url: "https://x.test" }]), 9))
      .id,
    2,
  );
});

test("says so when no Discord tab is open at all", async () => {
  await assert.rejects(
    resolveTab(source([{ id: 1, url: "https://example.com" }]), 1),
    NoDiscordTab,
  );
});

test("a lookup that throws does not take the fallback down with it", async () => {
  const failing = {
    get: async () => {
      throw new Error("No tab with id 7");
    },
    query: async () => [
      { id: 3, url: "https://canary.discord.com/channels/1/2" },
    ],
  };
  assert.equal((await resolveTab(failing, 7)).id, 3);
});
