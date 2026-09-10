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
  // The floating panel: opened the way the toolbar button opens it, dragged,
  // and checked for coming back where it was left.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://discord.com/*" });
    await chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" });
  });
  // The panel lives in a closed shadow root, so it is unreachable from the
  // page — which is the point — and has to be addressed as a frame.
  const panelFrame = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const frame = page
        .frames()
        .find((candidate) => candidate.url().includes("panel.html"));
      if (frame) return frame;
      await page.waitForTimeout(100);
    }
    throw new Error("the panel frame never appeared");
  };
  const frame = await panelFrame();
  await frame.locator("#consent").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.querySelector("objekt-capture-panel")?.shadowRoot ?? null,
    ),
    null,
    "the panel's shadow root is closed to the page",
  );
  const stored = () =>
    worker.evaluate(() =>
      chrome.storage.local.get("panel").then((settings) => settings.panel),
    );
  const settle = () => page.waitForTimeout(500);
  await settle();
  const before = await stored();
  assert.equal(before?.open, true, `panel state: ${JSON.stringify(before)}`);
  // Drag by the titlebar, which is the whole point of the panel.
  await page.mouse.move(before.x + 60, before.y + 16);
  await page.mouse.down();
  await page.mouse.move(before.x - 140, before.y + 200, { steps: 8 });
  await page.mouse.up();
  await settle();
  const moved = await stored();
  const height = await page.evaluate(() => window.innerHeight);
  assert.equal(moved.x, before.x - 200, "dragging the titlebar moves it");
  assert.ok(moved.y > before.y, "and downwards");
  // The drag asked for more than fits; the panel is held on screen instead.
  assert.ok(
    moved.y + moved.height <= height,
    `panel bottom ${moved.y + moved.height} past viewport ${height}`,
  );
  // A reload is not a reason to lose your window.
  await page.reload();
  const embedded = await panelFrame();
  await embedded.locator("#consent").waitFor();
  assert.deepEqual(await stored().then(({ x, y }) => ({ x, y })), {
    x: moved.x,
    y: moved.y,
  });
  await render();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/panel.html`);
  // Nothing may be read before the disclosure is agreed to, so the index is
  // empty however many posts are on screen, and the working UI is not shown.
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("Nothing captured"),
  );
  assert.equal(await popup.locator("#consent").isVisible(), true);
  assert.equal(await popup.locator("#step-wants").isVisible(), false);
  assert.equal(await page.locator("objekt-match-badge").count(), 0);
  await popup.locator("#accept-capture").click();
  // Agreeing attaches the observer, which sweeps what is already rendered —
  // the page is deliberately not re-rendered here.
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("1 post ready"),
  );
  assert.equal(await popup.locator("#consent").isVisible(), false);
  // Every copy of the panel reflects the same agreement, without a reload.
  await embedded.locator("#step-wants").waitFor();
  // Capture consent alone must not unlock search automation.
  assert.equal(await popup.locator("#automation-gate").isVisible(), true);
  assert.equal(await popup.locator("#search-section").isVisible(), false);
  // Use the actual typed-haves surface so collection key syntax stays shared.
  await popup.locator("#haves").fill("YooYeon CC109");
  await popup.locator("#save-haves").click();
  await page.locator("objekt-match-badge").waitFor();
  await render();
  await page.locator("objekt-match-badge").waitFor();
  await popup.reload();
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("1 post ready"),
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
    document.getElementById("status").textContent.includes("1 post ready"),
  );
  // Withdrawing detaches the reader: the badge goes, and a fresh post is not
  // taken even with the channel enabled.
  await worker.evaluate(() => chrome.storage.local.set({ channels: ["123"] }));
  await popup.locator("#step-trouble > summary").click();
  popup.once("dialog", (dialog) => dialog.accept());
  await popup.locator("#withdraw").click();
  await popup.waitForFunction(() =>
    document.getElementById("consent").checkVisibility(),
  );
  await page.waitForFunction(
    () => !document.querySelector("objekt-match-badge"),
  );
  await page.evaluate(() => {
    document
      .getElementById("messages")
      .insertAdjacentHTML(
        "beforeend",
        '<li id="chat-messages-123-789" aria-labelledby="message-username-789"><span id="message-username-789">Other</span><time datetime="2026-09-09T04:00:00.000Z"></time><div id="message-content-789">HAVE YooYeon CC109</div></li>',
      );
  });
  await popup.reload();
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("1 post ready"),
  );
  assert.deepEqual(failures, []);
  console.log(
    "PASS: floating panel (drag, clamp, restore, closed shadow root, live sync), consent gate, MV3 capture, dedupe after virtualized re-render, saved-haves annotation, export download, pause, withdrawal.",
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
