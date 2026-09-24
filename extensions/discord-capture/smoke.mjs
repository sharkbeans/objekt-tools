import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const profile = await mkdtemp(path.join(os.tmpdir(), "objekt-extension-"));
const extension = new URL("./dist", import.meta.url).pathname;

// This mocks objekt.my by hostname, so the build under test has to actually
// target https://objekt.my regardless of what the ambient shell has set —
// `npm run extension:smoke` clears `NEXT_PUBLIC_APP_URL` for the build step
// for exactly that reason (see `src/app-origin.ts`), and sets
// `EXTENSION_MATCH_URL` so /match, which a normal build sends to localhost
// until it ships, is delivered to the mock too. A build pointed elsewhere
// would sail straight past every mock below.

/**
 * A real TLS server standing in for objekt.my and imagedelivery.net.
 *
 * `context.route` cannot be trusted for these: a tab the extension opens
 * itself with `chrome.tabs.create` (rather than one Playwright navigates)
 * sends its first request — the document itself — before Playwright's CDP
 * session has attached to the new target, so exactly the one request this
 * test most needs to control slips through to the real internet. Every
 * request after that first one *is* caught, which is what made this look
 * like a hang rather than a wrong response: the mocked reply from a plain
 * `context.route` never had a chance to apply to the navigation, and the
 * real page's own script never speaks this test's handoff protocol.
 *
 * `--host-resolver-rules` sends both hostnames to this server at the
 * network layer, before Chromium's request pipeline exists at all, so it
 * has no such race. The certificate is regenerated per run and never
 * touches the repo; `--ignore-certificate-errors` is what lets Chromium
 * accept it without a real CA.
 */
const certDir = await mkdtemp(path.join(os.tmpdir(), "objekt-cert-"));
execFileSync("openssl", [
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  path.join(certDir, "key.pem"),
  "-out",
  path.join(certDir, "cert.pem"),
  "-days",
  "1",
  "-subj",
  "/CN=objekt.my",
  "-addext",
  "subjectAltName=DNS:objekt.my,DNS:imagedelivery.net",
]);
const ART = "https://imagedelivery.net/smoke/seoyeon-101/thumbnail";
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);
const fakeObjekt = https
  .createServer(
    {
      key: readFileSync(path.join(certDir, "key.pem")),
      cert: readFileSync(path.join(certDir, "cert.pem")),
    },
    (req, res) => {
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      const url = new URL(req.url ?? "/", `https://${host}`);
      if (host === "imagedelivery.net") {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PIXEL);
        return;
      }
      if (url.pathname === "/api/objekts/search") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            results: [
              {
                member: "SeoYeon",
                season: url.searchParams.get("season"),
                collectionNo: "101Z",
                thumbnailImage: ART,
              },
            ],
          }),
        );
        return;
      }
      // Stands in for /match: the same handoff protocol the real page speaks
      // (`readExtensionMessage`/`readPageMessage` in `extension-handoff.ts`),
      // hydrating late the way a real client-rendered page does.
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body><script>
        window.received = [];
        const handled = new Set();
        const post = (message) => postMessage(message, location.origin);
        addEventListener("message", (event) => {
          if (event.source !== window || event.origin !== location.origin) return;
          const m = event.data;
          if (!m || m.source !== "objekt-capture") return;
          if (m.type === "hello") return post({ source: "objekt-match", type: "ready" });
          if (m.type !== "import") return;
          if (!handled.has(m.id)) { handled.add(m.id); window.received.push(m); }
          post({ source: "objekt-match", type: "received", id: m.id, posts: 1 });
        });
        setTimeout(() => post({ source: "objekt-match", type: "ready" }), 400);
      </script></body></html>`);
    },
  )
  .listen(0, "127.0.0.1");
await new Promise((resolve, reject) =>
  fakeObjekt.once("listening", resolve).once("error", reject),
);
const objektPort = fakeObjekt.address().port;

const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    `--host-resolver-rules=MAP objekt.my 127.0.0.1:${objektPort},MAP imagedelivery.net 127.0.0.1:${objektPort}`,
    "--ignore-certificate-errors",
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
      body: `<!doctype html><html lang="en"><head><title>Discord | #trade | Smoke Server</title></head><body>
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
    // No channel is switched on here: capture is on by default, and the first
    // post being kept after consent is what proves it.
    chrome.storage.local.set({
      owned: [{ member: "YooYeon", season: "Cream02", collectionNo: "109" }],
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
  const indexHolds = (text) =>
    popup.waitForFunction(
      (expected) =>
        document.getElementById("index-count").textContent.includes(expected),
      text,
    );
  await indexHolds("0 posts in the index");
  assert.equal(await popup.locator("#consent").isVisible(), true);
  assert.equal(await popup.locator("#main").isVisible(), false);
  assert.equal(await page.locator("objekt-match-badge").count(), 0);
  assert.equal(await popup.locator("#accept-capture").isDisabled(), true);
  await popup.locator("#accept-capture-risk").check();
  assert.equal(await popup.locator("#accept-capture").isDisabled(), false);
  await popup.locator("#accept-capture").click();
  // Agreeing attaches the observer, which sweeps what is already rendered —
  // the page is deliberately not re-rendered here.
  await indexHolds("1 post in the index");
  assert.equal(await popup.locator("#consent").isVisible(), false);
  // Every copy of the panel reflects the same agreement, without a reload.
  await embedded.locator("#main").waitFor();
  // The chip names where capture is happening, from Discord's tab title.
  await popup.waitForFunction(
    () =>
      document.getElementById("channel-name")?.textContent ===
      "#trade - Smoke Server",
  );
  assert.equal(
    await popup.locator("#channel-state").textContent(),
    "Capturing",
  );
  // Capture consent alone must not unlock search automation.
  assert.equal(await popup.locator("#automation-gate").isVisible(), true);
  assert.equal(await popup.locator("#actions").isVisible(), false);
  // The saved inventory marks the post that wants one of its objekts, and the
  // mark survives Discord re-rendering the row.
  await page.locator("objekt-match-badge").waitFor();
  await render();
  await page.locator("objekt-match-badge").waitFor();
  await popup.reload();
  await indexHolds("1 post in the index");
  // The file export still exists, one level down in Settings.
  await popup.locator("#open-settings").click();
  await popup.locator("#step-trouble > summary").click();
  const downloadEvent = popup.waitForEvent("download");
  await popup.locator("#export").click();
  const download = await downloadEvent;
  // Named for what is in it, so a second export is not "(1)".
  assert.match(
    download.suggestedFilename(),
    /^objekt-trade-\d{4}-\d{2}-\d{2}-1-posts\.txt$/,
  );
  // A whole search run, end to end and in a real browser: the consent for it,
  // the typing (real execCommand into a real contenteditable), Discord's reply,
  // and the results reaching the index scoped to this run.
  await popup.locator("#pages").fill("1");
  await popup.locator("#close-settings").click();
  assert.equal(await popup.locator("#actions").isVisible(), false);
  await popup.locator("#accept-automation").click();
  await popup.locator("#actions").waitFor();
  await popup.locator("#wants").fill("SeoYeon CC101");
  // The want list becomes a card, with its art from objekt.my.
  await popup.locator("#tiles .tile").waitFor();
  assert.equal(await popup.locator("#tiles .tile").count(), 1);
  await popup.waitForFunction(
    (art) => document.querySelector("#tiles img")?.getAttribute("src") === art,
    ART,
  );
  await popup.locator("#run-search").click();
  await popup.waitForFunction(() =>
    document.getElementById("run-detail").textContent.startsWith("Finished"),
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
      .getElementById("open-match")
      .textContent.includes("Open 1 in match"),
  );
  // The Search button hands itself back once the run is over.
  assert.equal(await popup.locator("#run-search").isDisabled(), false);
  assert.equal(await popup.locator("#stop-search").isVisible(), false);

  // Straight into /match: the run's posts, the want list with them, delivered
  // to a page that only starts listening after it has loaded.
  await popup.locator("#open-match").click();
  await popup.waitForFunction(() =>
    document
      .getElementById("status")
      .textContent.includes("Opened in objekt.my/match"),
  );
  const matchPages = () =>
    context
      .pages()
      .filter((candidate) =>
        candidate.url().startsWith("https://objekt.my/match"),
      );
  assert.equal(matchPages().length, 1);
  const delivered = await matchPages()[0].evaluate(() => window.received);
  assert.equal(delivered.length, 1);
  assert.match(delivered[0].transcript, /HAVE YooYeon CC101/);
  assert.equal(delivered[0].wants, "SeoYeon CC101");
  // A second delivery goes to the same desk, not a second tab.
  await popup.bringToFront();
  await popup.locator("#open-match").click();
  await matchPages()[0].waitForFunction(() => window.received.length === 2);
  assert.equal(matchPages().length, 1, "the open /match tab is reused");

  // The objekt.my bridge (declared content script): the page can tell the
  // extension is installed, and a hunt it sends becomes the panel's want list
  // live, with Undo putting the previous list back.
  const site = matchPages()[0];
  const ask = (message, reply) =>
    site.evaluate(
      ([message, reply]) =>
        new Promise((resolve) => {
          addEventListener("message", (event) => {
            if (
              event.data?.source === "objekt-capture" &&
              event.data.type === reply
            )
              resolve(event.data);
          });
          postMessage(message, location.origin);
        }),
      [message, reply],
    );
  const present = await ask(
    { source: "objekt-match", type: "ping" },
    "present",
  );
  assert.equal(
    present.version,
    JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url)))
      .version,
  );
  const saved = await ask(
    {
      source: "objekt-match",
      type: "hunt",
      id: "smoke-hunt",
      wants: "SeoYeon CC102\nSeoYeon CC103",
      nickname: "",
    },
    "hunt-saved",
  );
  assert.deepEqual(saved, {
    source: "objekt-capture",
    type: "hunt-saved",
    id: "smoke-hunt",
    count: 2,
  });
  await popup.waitForFunction(
    () =>
      document.getElementById("wants").value === "SeoYeon CC102\nSeoYeon CC103",
  );
  await popup.locator("#hunt-note").waitFor();
  assert.match(await popup.locator("#hunt-text").textContent(), /2 objekts/);
  await popup.locator("#undo-hunt").click();
  await popup.waitForFunction(
    () => document.getElementById("wants").value === "SeoYeon CC101",
  );
  assert.equal(await popup.locator("#hunt-note").isVisible(), false);
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("wants"))).wants,
    "SeoYeon CC101",
  );

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
    document.getElementById("status").textContent.includes("Stopped reporting"),
  );
  assert.equal(await popup.locator("#run-search").isDisabled(), false);
  assert.equal(await popup.locator("#stop-search").isVisible(), false);

  // What that dead run left behind is picked up by Continue, from the query it
  // died on, rather than by searching the whole list again. Another tab's id
  // and an age past the reload window: only Continue may take it.
  await worker.evaluate(() =>
    chrome.storage.local.set({
      pendingRun: {
        run: "smoke-crashed",
        queries: ["AA101", "CC101"],
        done: 1,
        pages: 1,
        delayMs: 0,
        planNote: "",
        tab: 999_999,
        tries: 0,
        at: Date.now() - 45 * 60_000,
        auto: true,
      },
    }),
  );
  await popup.waitForFunction(() => {
    const button = document.getElementById("continue-search");
    return !button.hidden && button.textContent === "Continue · 1 left";
  });
  await popup.locator("#continue-search").click();
  await popup.waitForFunction(() =>
    document
      .getElementById("run-detail")
      .textContent.startsWith("Finished 2/2"),
  );
  assert.deepEqual(
    await worker.evaluate(() =>
      chrome.storage.local
        .get(["pendingRun", "searchRunId"])
        .then(({ pendingRun, searchRunId }) => [
          pendingRun ?? null,
          searchRunId,
        ]),
    ),
    [null, "smoke-crashed"],
    "a continued run finishes under its own id and leaves nothing pending",
  );
  assert.equal(await popup.locator("#continue-search").isVisible(), false);
  // And the card names its member and code on a line each, so neither is cut.
  assert.deepEqual(await popup.locator("#tiles .name span").allTextContents(), [
    "SeoYeon",
    "CC101",
  ]);

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
  // happened and the status reports both. Four, not three: this fixture gives
  // every search answer a fresh message id, so the continued run's result is a
  // post of its own — real Discord reuses the id, and it would dedupe.
  await indexHolds("4 posts in the index");

  // Pausing removes annotations, and changing channel does not capture.
  await worker.evaluate(() =>
    chrome.storage.local.set({ pausedChannels: ["123"] }),
  );
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
  await indexHolds("4 posts in the index");
  await popup.waitForFunction(
    () => document.getElementById("channel-state")?.textContent === "Paused",
  );
  await worker.evaluate(() => chrome.storage.local.set({ pausedChannels: [] }));
  await popup.waitForFunction(
    () => document.getElementById("channel-state")?.textContent === "Capturing",
  );
  // A direct message is never captured, even with capture on and nothing
  // paused. Discord moves between a server and DMs by pushState, so the content
  // script stays put and sees the row arrive; the channel id is deliberately
  // one that is not paused, so only the missing guild can keep it out.
  await page.evaluate(() => {
    history.pushState(null, "", "/channels/@me/123");
    document
      .getElementById("messages")
      .insertAdjacentHTML(
        "beforeend",
        '<li id="chat-messages-123-1001" aria-labelledby="message-username-1001"><span id="message-username-1001">Friend</span><time datetime="2026-09-09T04:10:00.000Z"></time><div id="message-content-1001">HAVE YooYeon CC109</div></li>',
      );
  });
  await page.waitForTimeout(1500);
  await popup.reload();
  // Four still: a kept DM would have been a fifth post, under its own id.
  await indexHolds("4 posts in the index");
  await page.evaluate(() => {
    document.getElementById("chat-messages-123-1001")?.remove();
    history.pushState(null, "", "/channels/111/123");
  });
  // Withdrawing detaches the reader: the badge goes, and a fresh post is not
  // taken even with the channel capturing.
  await popup.locator("#open-settings").click();
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
  await indexHolds("4 posts in the index");
  assert.deepEqual(failures, []);
  console.log(
    "PASS: floating panel (drag, clamp, restore, closed shadow root, live sync), content-script takeover, consent gates, want cards with art, a whole search run end to end, delivery into /match and tab reuse, objekt.my bridge (presence, hunt → want list, undo), run state and interruption, MV3 capture, background-tab capture, dedupe after virtualized re-render, inventory annotation, export download, pause, withdrawal.",
  );
} finally {
  await context.close();
  await new Promise((resolve) => fakeObjekt.close(resolve));
  await rm(profile, { recursive: true, force: true });
  await rm(certDir, { recursive: true, force: true });
}
