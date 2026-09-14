import { expect, test } from "@playwright/test";

// Two posts, in Discord's clipboard shape.
const SAMPLE = `traderA — 3:41 PM
HAVE
SeoYeon CC101
WANT
JiYeon CC102
traderB [TAG],  — 3:44 PM
HAVE
Mayu CC103
WANT
Xinyu CC101`;

/** What the store actually put in IndexedDB, read from the page itself. */
async function readStored(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("objekt-match", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value: unknown = await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const request = tx.objectStore("kv").get("match:blocks:v2");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (
      typeof value !== "object" ||
      value === null ||
      !("gz" in value) ||
      !("data" in value) ||
      !(value.data instanceof Blob)
    ) {
      return null;
    }
    return { gz: value.gz === true, size: value.data.size };
  });
}

const legacyRaw = (page: import("@playwright/test").Page) =>
  page.evaluate(() => localStorage.getItem("match:raw:v1"));

async function paste(page: import("@playwright/test").Page, text: string) {
  // "Paste Discord posts" on a first visit, "Add posts" once posts are loaded.
  await page
    .getByRole("button", { name: /Paste Discord posts|Add posts/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Discord posts" }).fill(text);
  await dialog.getByRole("button", { name: "Add posts" }).click();
  await expect(dialog).toBeHidden();
}

test("a paste survives a reload and is stored gzipped in IndexedDB", async ({
  page,
}) => {
  await page.goto("/match");
  await expect(
    page.getByRole("button", { name: "Paste Discord posts" }),
  ).toBeVisible();

  await paste(page, SAMPLE);
  // The header button flips once posts are loaded.
  await expect(
    page.getByRole("button", { name: "Add posts" }).first(),
  ).toBeVisible();

  const stored = await readStored(page);
  expect(stored).not.toBeNull();
  expect(stored?.gz).toBe(true);
  expect(stored?.size ?? 0).toBeGreaterThan(0);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add posts" }).first(),
  ).toBeVisible();
  // Nothing was left behind in the old localStorage key.
  expect(await legacyRaw(page)).toBeNull();
});

test("re-pasting the same posts does not grow the store", async ({ page }) => {
  await page.goto("/match");
  await paste(page, SAMPLE);
  await expect(
    page.getByRole("button", { name: "Add posts" }).first(),
  ).toBeVisible();
  const first = await readStored(page);

  await paste(page, SAMPLE);
  await page.waitForTimeout(500);

  expect((await readStored(page))?.size).toBe(first?.size);
});

test("a transcript left in localStorage migrates into IndexedDB", async ({
  page,
}) => {
  await page.goto("/match");
  await page.evaluate((text) => {
    localStorage.setItem("match:raw:v1", text);
  }, SAMPLE);

  await page.reload();

  await expect(
    page.getByRole("button", { name: "Add posts" }).first(),
  ).toBeVisible();
  expect(await legacyRaw(page)).toBeNull();
  expect(await readStored(page)).not.toBeNull();
});
