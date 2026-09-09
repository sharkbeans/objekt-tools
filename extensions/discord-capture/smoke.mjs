import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const profile = await mkdtemp(path.join(os.tmpdir(), "objekt-extension-"));
const extension = new URL("./dist", import.meta.url).pathname;
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  // Every Discord navigation is fulfilled locally: this test never contacts Discord.
  await context.route("https://discord.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><body><ol id="messages"></ol></body></html>',
    }),
  );
  await worker.evaluate(() =>
    chrome.storage.local.set({
      channels: ["123"],
      owned: [{ member: "YooYeon", season: "Cream", collectionNo: "109" }],
    }),
  );
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("https://discord.com/channels/111/123");
  const render = async () =>
    page.evaluate(() => {
      document.getElementById("messages").innerHTML =
        '<li id="chat-messages-123-456" aria-labelledby="message-username-456"><span id="message-username-456">Trader</span><time datetime="2026-09-09T03:41:00.000Z"></time><div id="message-content-456">HAVE<br>YooYeon CC101-108<br>WANT<br>YooYeon CC109</div></li>';
    });
  await render();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("1 distinct"),
  );
  // Use the actual typed-haves surface so collection key syntax stays shared.
  await popup.locator("#haves").fill("YooYeon CC109");
  await popup.locator("#save-haves").click();
  await page.locator("objekt-match-badge").waitFor();
  await render();
  await page.locator("objekt-match-badge").waitFor();
  await popup.reload();
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("1 distinct"),
  );
  const downloadEvent = popup.waitForEvent("download");
  await popup.locator("#export").click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "objekt-discord-transcript.txt");
  // Pausing removes annotations, and changing channel does not capture.
  await worker.evaluate(() => chrome.storage.local.set({ channels: [] }));
  await page.waitForFunction(
    () => !document.querySelector("objekt-match-badge"),
  );
  await page.evaluate(() => {
    document.getElementById("message-content-456").textContent =
      "HAVE YooYeon CC110";
  });
  await popup.reload();
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("1 distinct"),
  );
  assert.deepEqual(failures, []);
  console.log(
    "PASS: MV3 capture, dedupe after virtualized re-render, saved-haves annotation, export download, pause.",
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
