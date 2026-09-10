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
      body: `<!doctype html><html lang="en"><body>
        <div role="combobox" contenteditable="true" aria-label="Search"></div>
        <ol id="messages"></ol>
        <div id="search-results"></div>
        <script>
          // Stands in for Discord answering a search: Enter in the search box
          // renders one result row for whatever was typed. Everything else —
          // the typing, the focus, the events — is the real browser.
          const box = document.querySelector('[role="combobox"]');
          const results = document.getElementById("search-results");
          let n = 900;
          box.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            const query = box.textContent.trim();
            if (!query) return;
            const id = ++n;
            results.innerHTML =
              '<li><a href="/channels/111/123">#trade</a>' +
              '<span id="message-username-' + id + '">Seller</span>' +
              '<time datetime="2026-09-09T05:00:00.000Z"></time>' +
              '<div id="message-content-' + id + '">HAVE YooYeon ' + query + '</div></li>';
          });
        </script>
      </body></html>`,
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
  await (await panelFrame()).locator("#consent").waitFor();

  // An update injects a newer content script into tabs that are already open.
  // The old copy has to stand down, or the page ends up with two observers and
  // two panels — and the panel that survives must be the new one.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://discord.com/*" });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  });
  await page.waitForFunction(
    () => document.querySelectorAll("objekt-capture-panel").length === 1,
    undefined,
    { timeout: 10_000 },
  );
  // Everything after this acts on the panel the new copy drew, not the one the
  // old copy left behind — which is exactly the property under test.
  const embedded = await panelFrame();
  await embedded.locator("#consent").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll("objekt-capture-panel").length,
    ),
    1,
    "one panel after a newer content script takes over",
  );
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
  // A whole search run, end to end and in a real browser: the consent for it,
  // the typing (real execCommand into a real contenteditable), Discord's reply,
  // and the results reaching the index scoped to this run.
  assert.equal(await popup.locator("#search-section").isVisible(), false);
  await popup.locator("#accept-automation").click();
  await popup.locator("#search-section").waitFor();
  await popup.locator("#wants").fill("SeoYeon CC101");
  await popup.locator("#pages").fill("1");
  await popup.locator("#run-search").click();
  await popup.waitForFunction(() =>
    document.getElementById("search-status").textContent.startsWith("Finished"),
  );
  assert.match(
    await page.evaluate(
      () => document.querySelector('[role="combobox"]').textContent,
    ),
    /^CC101$/,
    "the collection code alone reaches Discord's search box",
  );
  await popup.waitForFunction(() =>
    document
      .getElementById("status")
      .textContent.includes("1 post from this search"),
  );
  // The Search button hands itself back once the run is over.
  assert.equal(await popup.locator("#run-search").isDisabled(), false);
  assert.equal(await popup.locator("#stop-search").isVisible(), false);

  // A run in progress, stated directly rather than raced against: Stop exists
  // only while there is something to stop, and Search refuses a second run.
  await worker.evaluate(() =>
    chrome.storage.local.set({
      searchProgress: {
        running: true,
        done: 1,
        total: 4,
        query: "CC101",
        at: Date.now(),
      },
    }),
  );
  await popup.locator("#stop-search").waitFor();
  assert.equal(await popup.locator("#run-search").isDisabled(), true);
  assert.equal(await popup.locator("#search-progress").isVisible(), true);
  // And a run whose reports stopped arriving is over, whatever the flag says:
  // it went away with the tab it was running in.
  await worker.evaluate(() =>
    chrome.storage.local.set({
      searchProgress: {
        running: true,
        done: 1,
        total: 4,
        at: Date.now() - 300_000,
      },
    }),
  );
  await popup.waitForFunction(() =>
    document
      .getElementById("search-status")
      .textContent.includes("Stopped reporting"),
  );
  assert.equal(await popup.locator("#run-search").isDisabled(), false);
  assert.equal(await popup.locator("#stop-search").isVisible(), false);

  // Capture has to keep working while Discord is not the tab in front: that is
  // where a search run spends most of its life.
  // Headless Chromium reports every page as visible, so this checks the part
  // that is checkable here — capture continuing while Discord is not the tab in
  // front — and the throttled-timer rule it depends on is covered by
  // wait.test.ts instead.
  await popup.bringToFront();
  await page.evaluate(() => {
    document
      .getElementById("messages")
      .insertAdjacentHTML(
        "beforeend",
        '<li id="chat-messages-123-555" aria-labelledby="message-username-555"><span id="message-username-555">Backgrounded</span><time datetime="2026-09-09T03:55:00.000Z"></time><div id="message-content-555">HAVE YooYeon CC109</div></li>',
      );
  });
  // Counted against the index rather than the run, because a search has now
  // happened and the status reports both.
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("3 in the index"),
  );

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
  // Counted against the index rather than the run, because a search has now
  // happened and the status reports both.
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("3 in the index"),
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
  // Counted against the index rather than the run, because a search has now
  // happened and the status reports both.
  await popup.waitForFunction(() =>
    document.getElementById("status").textContent.includes("3 in the index"),
  );
  assert.deepEqual(failures, []);
  console.log(
    "PASS: floating panel (drag, clamp, restore, closed shadow root, live sync), content-script takeover, consent gates, a whole search run end to end, run state and interruption, MV3 capture, background-tab capture, dedupe after virtualized re-render, saved-haves annotation, export download, pause, withdrawal.",
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
