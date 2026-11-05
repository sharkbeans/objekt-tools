import { expect, type Page, test } from "@playwright/test";

const DAY = 24 * 60 * 60 * 1000;
// This year, so the coverage text carries no year whenever this runs.
const YEAR = new Date().getUTCFullYear();

// Dates are pinned by the transcript, and read back in this zone and format.
test.use({ locale: "en-GB", timezoneId: "UTC" });

const FIRST_SCAN = `alpha — ${YEAR}-11-01T10:30:00.000Z
HAVE
Mayu CC103
SeoYeon CC102
WANT
SeoYeon CC101
beta — ${YEAR}-11-01T18:30:00.000Z
HAVE
Xinyu CC104
SeoYeon CC102
WANT
SeoYeon CC101`;

// Shares beta's post with the scan above, so turning that one off keeps it.
const SECOND_SCAN = `beta — ${YEAR}-11-01T18:30:00.000Z
HAVE
Xinyu CC104
SeoYeon CC102
WANT
SeoYeon CC101
gamma — ${YEAR}-11-02T09:00:00.000Z
HAVE
Nien CC301
WANT
SeoYeon CC101`;

interface Delivery {
  id: string;
  transcript: string;
  wants?: string;
  capture?: { run: string; capturedAt: number; queries: string[] };
}

/** Hand the page a delivery the way the extension does. Resolves its ack. */
function deliver(page: Page, delivery: Delivery) {
  return page.evaluate(
    (message) =>
      new Promise<number>((resolve, reject) => {
        const send = () =>
          window.postMessage(
            { source: "objekt-capture", type: "hello" },
            location.origin,
          );
        const timer = setInterval(send, 100);
        const expiry = setTimeout(() => {
          cleanup();
          reject(new Error("Handoff timed out"));
        }, 15000);
        const cleanup = () => {
          clearInterval(timer);
          clearTimeout(expiry);
          window.removeEventListener("message", receive);
        };
        function receive(event: MessageEvent) {
          if (event.data?.source !== "objekt-match") return;
          if (event.data.type === "ready")
            window.postMessage(
              {
                source: "objekt-capture",
                type: "import",
                nickname: "",
                wants: "",
                ...message,
              },
              location.origin,
            );
          if (event.data.type === "received" && event.data.id === message.id) {
            cleanup();
            resolve(event.data.posts);
          }
        }
        window.addEventListener("message", receive);
        send();
      }),
    delivery,
  );
}

const scan = (run: string, age: number, overrides: Partial<Delivery> = {}) => ({
  id: `${run}-delivery`,
  transcript: FIRST_SCAN,
  wants: "SeoYeon CC102",
  capture: {
    run,
    capturedAt: Date.now() - age,
    queries: ["CC101", "CC102"],
  },
  ...overrides,
});

async function openDesk(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("match:offering:v1", "SeoYeon CC101");
  });
  await page.route("**/api/objekts/search**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/match");
}

/** Stand in for the extension's bridge, keeping what the page asks of it. */
async function installBridge(page: Page) {
  await page.addInitScript(() => {
    const asked: unknown[] = [];
    Object.assign(window, { asked });
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.source !== "objekt-match") return;
      const reply = (data: object) =>
        window.postMessage(
          { source: "objekt-capture", ...data },
          location.origin,
        );
      if (message.type === "ping") reply({ type: "present", version: "1.4.0" });
      if (message.type === "hunt") {
        asked.push(message);
        reply({ type: "hunt-saved", id: message.id, count: 1 });
      }
      if (message.type === "open-panel") {
        asked.push(message);
        reply({ type: "panel-opened", id: message.id });
      }
    });
  });
}

const library = (page: Page) => page.getByRole("dialog", { name: "Captures" });
const rows = (page: Page) => page.getByTestId("capture-row");
const traders = (page: Page) => page.getByTestId("trader-result");
const alert = (page: Page) => page.getByRole("alertdialog");
const captureButton = (page: Page) =>
  page.getByRole("button", { name: /^Captures/ });
const openLibrary = (page: Page) => captureButton(page).click();
const asked = (page: Page) =>
  page.evaluate(() => (window as unknown as { asked: object[] }).asked);

async function addByHand(page: Page, text: string, name = "") {
  await page.getByRole("button", { name: "New capture" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New capture" });
  await dialog.getByRole("textbox", { name: /Discord messages/ }).fill(text);
  if (name)
    await dialog.getByRole("textbox", { name: /Name this capture/ }).fill(name);
  await dialog.getByRole("button", { name: "Save capture" }).click();
  await expect(dialog).toBeHidden();
}

test("a search is saved as a dated capture and survives a reload", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await openLibrary(page);

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("CC101–102");
  await expect(rows(page)).toContainText("1 Nov, 10:30–18:30");
  await expect(rows(page)).toContainText("2 posts");
  await expect(rows(page)).toContainText("just now");
  await expect(traders(page)).toHaveCount(2);

  await page.reload();
  await openLibrary(page);
  await expect(rows(page)).toContainText("1 Nov, 10:30–18:30");
  await expect(traders(page)).toHaveCount(2);
});

test("the desk shows how fresh it is without opening anything", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await expect(captureButton(page)).toContainText("1 on");
  await expect(captureButton(page)).toContainText("newest just now");
  await expect(captureButton(page)).not.toContainText("old");
});

test("each capture says who has what it looked for, and what is new", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 2 * DAY));
  await deliver(
    page,
    scan("run-b", 1000, {
      transcript: SECOND_SCAN,
      wants: "Nien CC301",
      capture: { run: "run-b", capturedAt: Date.now(), queries: ["CC301"] },
    }),
  );
  await openLibrary(page);

  const first = rows(page).filter({ hasText: "CC101–102" });
  const second = rows(page).filter({ hasText: "CC301" });
  await expect(first).toContainText("2 traders have your wants");
  await expect(second).toContainText("1 trader has your wants");
  // gamma is new; beta was already in the first capture.
  await expect(second).toContainText("1 new");
  // A first capture is all new, which is no news.
  await expect(first).not.toContainText("new");
});

test("switching a capture updates the desk beside the open panel", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 2 * DAY));
  await deliver(
    page,
    scan("run-b", 1000, {
      transcript: SECOND_SCAN,
      capture: { run: "run-b", capturedAt: Date.now(), queries: ["CC301"] },
    }),
  );
  await openLibrary(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(traders(page)).toHaveCount(3);

  await page.getByRole("switch", { name: /CC101/ }).click();
  await expect(traders(page)).toHaveCount(2);
  // beta is in both captures, so it stays with the one still on.
  await expect(traders(page).filter({ hasText: "beta" })).toHaveCount(1);
  await expect(traders(page).filter({ hasText: "alpha" })).toHaveCount(0);
  await expect(page.getByText("2 of 3 posts")).toBeVisible();
  // The panel is meant to stay put while the desk changes.
  await expect(library(page)).toBeVisible();

  await page.reload();
  await expect(traders(page)).toHaveCount(2);
  await openLibrary(page);
  await expect(page.getByRole("switch", { name: /CC101/ })).not.toBeChecked();
  await page.getByRole("switch", { name: /CC101/ }).click();
  await expect(traders(page)).toHaveCount(3);
});

test("the panel leaves room for the desk and stays open until closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await openLibrary(page);

  const panel = await library(page).boundingBox();
  const desk = await page
    .getByRole("button", { name: "My objekts" })
    .boundingBox();
  expect((desk?.x ?? 0) + (desk?.width ?? 0)).toBeLessThan(panel?.x ?? 0);

  // Using the desk does not dismiss it.
  await traders(page).first().getByRole("button", { name: "Handled" }).click();
  await expect(library(page)).toBeVisible();

  await library(page).getByRole("button", { name: "Close captures" }).click();
  await expect(library(page)).toBeHidden();
});

test("a capture can be renamed, and keeps the name", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await openLibrary(page);

  await page.getByRole("button", { name: "Rename CC101–102" }).click();
  const name = page.getByRole("textbox", { name: "Capture name" });
  await name.fill("SeoYeon grid");
  await name.press("Enter");
  await expect(rows(page)).toContainText("SeoYeon grid");

  await page.reload();
  await openLibrary(page);
  await expect(rows(page)).toContainText("SeoYeon grid");

  // Delivered again, the run keeps the name it was given.
  await deliver(page, scan("run-a", 1000, { id: "run-a-again" }));
  await expect(rows(page)).toContainText("SeoYeon grid");
});

test("escape cancels a rename without closing the panel", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await openLibrary(page);

  await page.getByRole("button", { name: "Rename CC101–102" }).click();
  const name = page.getByRole("textbox", { name: "Capture name" });
  await name.fill("Nope");
  await name.press("Escape");
  await expect(name).toBeHidden();
  await expect(rows(page)).toContainText("CC101–102");
  await expect(rows(page)).not.toContainText("Nope");
  await expect(library(page)).toBeVisible();
});

test("the tabs narrow the list", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));
  await alert(page).getByRole("button", { name: "Not now" }).click();
  await deliver(
    page,
    scan("run-b", 1000, {
      transcript: SECOND_SCAN,
      capture: { run: "run-b", capturedAt: Date.now(), queries: ["CC301"] },
    }),
  );
  await openLibrary(page);
  await page.getByRole("switch", { name: /CC301/ }).click();

  await library(page).getByRole("button", { name: "Old 1" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("CC101–102");
  await library(page).getByRole("button", { name: "On 1" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("CC101–102");
  await library(page).getByRole("button", { name: "All 2" }).click();
  await expect(rows(page)).toHaveCount(2);
});

test("with every capture off the desk is empty but the panel still works", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await openLibrary(page);

  await page.getByRole("switch", { name: /CC101/ }).click();
  await expect(traders(page)).toHaveCount(0);
  await expect(page.getByText("All captures are off")).toBeVisible();
  await expect(captureButton(page)).toContainText("0 on");
});

test("scrolled posts from an older extension are refused", async ({ page }) => {
  await openDesk(page);
  const acknowledged = await deliver(page, {
    id: "index-abc123",
    transcript: FIRST_SCAN,
  });

  expect(acknowledged).toBe(0);
  await expect(page.getByText("only scrolled past")).toBeVisible();
  await expect(captureButton(page)).toHaveCount(0);
  await expect(traders(page)).toHaveCount(0);
});

test("an older extension's search is still filed, dated on arrival", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, {
    id: "abc-def-ghi",
    transcript: FIRST_SCAN,
    wants: "SeoYeon CC102",
  });
  await openLibrary(page);

  await expect(rows(page)).toContainText("SeoYeon CC102");
  await expect(rows(page)).toContainText("just now");
  await expect(alert(page)).toBeHidden();
});

test("posts added by hand are a capture of their own each time", async ({
  page,
}) => {
  await openDesk(page);
  await addByHand(
    page,
    `alpha — 3:41 PM
HAVE
Mayu CC103
WANT
SeoYeon CC101`,
  );
  await addByHand(
    page,
    `beta — 3:42 PM
HAVE
Xinyu CC104
WANT
SeoYeon CC101`,
    "From the server",
  );
  await openLibrary(page);

  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: "From the server" })).toHaveCount(
    1,
  );
  await expect(rows(page).filter({ hasText: "Manual capture" })).toHaveCount(1);
  await expect(page.getByText(/Pasted/)).toHaveCount(0);
  await expect(traders(page)).toHaveCount(2);

  await page.getByRole("switch", { name: /Manual capture/ }).click();
  await expect(traders(page)).toHaveCount(1);
  await expect(traders(page)).toContainText("beta");
});

test("adding the same posts twice does not make a second capture", async ({
  page,
}) => {
  const text = `alpha — 3:41 PM
HAVE
Mayu CC103
WANT
SeoYeon CC101`;
  await openDesk(page);
  await addByHand(page, text);
  await addByHand(page, text);
  await expect(page.getByText("already in your captures")).toBeVisible();
  await openLibrary(page);
  await expect(rows(page)).toHaveCount(1);
});

test("a rescan that finds nothing new is still a dated scan", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));
  await alert(page).getByRole("button", { name: "Not now" }).click();
  await deliver(page, scan("run-b", 1000));
  await openLibrary(page);

  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("just now");
  await expect(captureButton(page)).not.toContainText("old");
});

test("a store from before captures reads as earlier, with nothing lost", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await expect(traders(page)).toHaveCount(2);
  // What a browser that used /match before captures has on disk. Dated ahead,
  // so the stale alert stays out of this test's way.
  await page.evaluate(async (year) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("objekt-match", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const blocks = [
      {
        author: "alpha",
        time: `${year + 1}-11-01T10:30:00.000Z`,
        body: "HAVE\nMayu CC103\nWANT\nSeoYeon CC101",
      },
    ];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete("match:captures:v1");
      tx.objectStore("kv").put(
        { gz: false, data: new Blob([JSON.stringify(blocks)]) },
        "match:blocks:v2",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, YEAR);

  await page.reload();
  await openLibrary(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Earlier capture");
  // Its only date is its newest post, not a scan, so it does not claim one.
  await expect(rows(page)).toContainText("no scan date");
  await expect(traders(page)).toHaveCount(1);
});

test("deleting a capture can be undone", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await deliver(
    page,
    scan("run-b", 1000, {
      transcript: SECOND_SCAN,
      capture: { run: "run-b", capturedAt: Date.now(), queries: ["CC301"] },
    }),
  );
  await openLibrary(page);

  await page.getByRole("button", { name: /^Delete CC101/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(2);
  // Undoing should not have cost the panel: it is alongside the toast.
  await expect(library(page)).toBeVisible();
  await expect(traders(page)).toHaveCount(3);

  await page.reload();
  await expect(traders(page)).toHaveCount(3);
});

test("a capture under 72 hours old raises no alert", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 2.9 * DAY));
  await expect(captureButton(page)).toBeVisible();
  await expect(alert(page)).toBeHidden();
  await expect(captureButton(page)).not.toContainText("old");
});

test("a capture past 72 hours raises the alert, and Not now holds it", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));

  await expect(alert(page)).toContainText("4 days ago");
  await expect(alert(page)).toContainText("CC101–102");
  await alert(page).getByRole("button", { name: "Not now" }).click();
  await expect(alert(page)).toBeHidden();
  // Still flagged on the desk, and its posts still there.
  await expect(captureButton(page)).toContainText("1 old");
  await expect(traders(page)).toHaveCount(2);

  await page.reload();
  await expect(captureButton(page)).toBeVisible();
  await expect(alert(page)).toBeHidden();
});

test("the alert comes back once a snooze runs out", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));
  await alert(page).getByRole("button", { name: "Not now" }).click();

  await page.evaluate(() =>
    localStorage.setItem("match:stale-snooze:v1", String(Date.now() - 1000)),
  );
  await page.reload();
  await expect(alert(page)).toBeVisible();
});

test("old captures can be turned off from the alert", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));

  await alert(page)
    .getByRole("button", { name: "Turn off old captures" })
    .click();
  await expect(alert(page)).toBeHidden();
  await expect(traders(page)).toHaveCount(0);

  await page.reload();
  await expect(captureButton(page)).toContainText("0 on");
  await expect(alert(page)).toBeHidden();
});

test("without the extension the alert leads to a new capture", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));

  await alert(page).getByRole("button", { name: "New capture" }).click();
  await expect(alert(page)).toBeHidden();
  await expect(page.getByRole("dialog", { name: "New capture" })).toBeVisible();
});

test("a new scan hands the extension the same search", async ({ page }) => {
  await installBridge(page);
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));

  await alert(page).getByRole("button", { name: "Run a new scan" }).click();
  await expect(alert(page)).toBeHidden();
  await expect
    .poll(() => asked(page))
    .toEqual([
      expect.objectContaining({ type: "hunt", wants: "SeoYeon CC102" }),
    ]);
});

test("a capture's Rescan searches just that one again", async ({ page }) => {
  await installBridge(page);
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await deliver(
    page,
    scan("run-b", 1000, {
      transcript: SECOND_SCAN,
      wants: "Nien CC301",
      capture: { run: "run-b", capturedAt: Date.now(), queries: ["CC301"] },
    }),
  );
  await openLibrary(page);

  await rows(page)
    .filter({ hasText: "CC301" })
    .getByRole("button", { name: "Rescan" })
    .click();
  await expect
    .poll(() => asked(page))
    .toEqual([expect.objectContaining({ type: "hunt", wants: "Nien CC301" })]);
});

test("Rescan old searches every old capture at once", async ({ page }) => {
  await installBridge(page);
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));
  await alert(page).getByRole("button", { name: "Not now" }).click();
  await openLibrary(page);

  await library(page).getByRole("button", { name: "Rescan old" }).click();
  await expect
    .poll(() => asked(page))
    .toEqual([
      expect.objectContaining({ type: "hunt", wants: "SeoYeon CC102" }),
    ]);
});

test("a scan with no want list just opens the panel", async ({ page }) => {
  await installBridge(page);
  await openDesk(page);
  await deliver(
    page,
    scan("run-a", 4 * DAY, {
      wants: "",
      capture: { run: "run-a", capturedAt: Date.now() - 4 * DAY, queries: [] },
    }),
  );

  await alert(page).getByRole("button", { name: "Run a new scan" }).click();
  await expect
    .poll(() => asked(page))
    .toEqual([expect.objectContaining({ type: "open-panel" })]);
});

test("New capture sends the list to Discord and says what is next", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    localStorage.setItem("match:wants:v1", "SeoYeon CC101-103");
  });
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));

  await page.getByRole("button", { name: "New capture" }).click();
  const dialog = page.getByRole("dialog", { name: "New capture" });
  const wants = dialog.getByRole("textbox", { name: /looking for/ });
  await expect(wants).toHaveValue("SeoYeon CC101-103");
  await expect(dialog).toContainText("3 cards");
  await dialog.getByRole("button", { name: "Search Discord" }).click();

  const waiting = page.getByRole("dialog", {
    name: "Finish your capture in Discord",
  });
  await expect(waiting).toContainText("Open in match");
  await expect
    .poll(() => asked(page))
    .toEqual([
      expect.objectContaining({ type: "hunt", wants: "SeoYeon CC101-103" }),
    ]);

  // The capture landing is what finishes it.
  await deliver(page, scan("run-b", 1000, { transcript: SECOND_SCAN }));
  await expect(waiting).toBeHidden();
});

test("with the extension, adding by hand is folded away", async ({ page }) => {
  await installBridge(page);
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));

  await page.getByRole("button", { name: "New capture" }).click();
  const dialog = page.getByRole("dialog", { name: "New capture" });
  const text = dialog.getByRole("textbox", { name: /Discord messages/ });
  await expect(text).toBeHidden();
  await dialog.getByRole("button", { name: "Add posts by hand" }).click();
  await expect(text).toBeVisible();
});

test("the rescan that comes back replaces the old capture on the desk", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));
  await alert(page).getByRole("button", { name: "Not now" }).click();

  await deliver(page, scan("run-b", 1000, { transcript: SECOND_SCAN }));
  await openLibrary(page);

  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText("Turned off an older capture")).toBeVisible();
  await expect(rows(page).first()).toHaveAttribute("data-active", "true");
  await expect(rows(page).nth(1)).toHaveAttribute("data-active", "false");
  await expect(traders(page).filter({ hasText: "alpha" })).toHaveCount(0);

  // Nothing left for the alert to warn about, even with the snooze gone.
  await page.evaluate(() => localStorage.removeItem("match:stale-snooze:v1"));
  await page.reload();
  await expect(captureButton(page)).toBeVisible();
  await expect(alert(page)).toBeHidden();
});

test("clearing posts removes the captures too", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));

  await page.getByRole("button", { name: "Clear posts" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Clear posts" })
    .click();
  await expect(captureButton(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Capture Discord posts")).toBeVisible();
  await expect(traders(page)).toHaveCount(0);
});

test("an extension post shows a readable time, not an ISO stamp", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  const alpha = traders(page).filter({ hasText: "alpha" });
  await expect(alpha).toContainText("1 Nov, 10:30");
  await expect(alpha).not.toContainText(`${YEAR}-11-01T`);
});

/** Enough cards for several rows on both sides. */
async function fullDesk(page: Page, columns = 4) {
  const codes = Array.from({ length: 14 }, (_, i) => `CC${200 + i}`);
  await page.addInitScript(
    ([list, perRow]) => {
      localStorage.setItem("match:columns:v1", perRow);
      localStorage.setItem("match:offering:v1", list);
    },
    [codes.map((code) => `Mayu ${code}`).join("\n"), String(columns)],
  );
  await page.route("**/api/objekts/search**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/match");
  await deliver(page, {
    id: "run-full-delivery",
    wants: "SeoYeon CC301\nSeoYeon CC302",
    capture: {
      run: "run-full",
      capturedAt: Date.now(),
      queries: ["CC301", "CC302"],
    },
    transcript: `trader — ${YEAR}-11-01T10:30:00.000Z
HAVE
SeoYeon CC301
SeoYeon CC302
${codes.map((code) => `Xinyu ${code}`).join("\n")}
WANT
${codes.map((code) => `Mayu ${code}`).join("\n")}`,
  });
}

/** The top of each row of a grid's cards, in page order. */
const rowTops = (page: Page, side: "My" | "Their") =>
  page
    .getByRole("button", { name: new RegExp(`^${side} \\S+ \\S+,`) })
    .evaluateAll((cards) => [
      ...new Set(
        cards.map((card) => Math.round(card.getBoundingClientRect().top)),
      ),
    ]);

test("both grids' rows line up, with a search pinned on one side", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fullDesk(page);

  const mine = await rowTops(page, "My");
  expect(mine.length).toBeGreaterThan(1);
  expect(await rowTops(page, "Their")).toEqual(mine);
  await expect(page.getByTestId("search-match-summary")).toBeVisible();
});

test("picking a card keeps the grids level", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fullDesk(page);

  await page.getByRole("button", { name: /^Their SeoYeon CC301/ }).click();
  await expect(
    page.getByRole("button", { name: "Remove SeoYeon CC301" }),
  ).toBeVisible();
  expect(await rowTops(page, "Their")).toEqual(await rowTops(page, "My"));
});

test("cards stay readable beside the open panel, and level", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1490, height: 900 });
  await fullDesk(page, 8);
  await openLibrary(page);

  const cards = page.getByRole("button", { name: /^My \S+ \S+,/ });
  const widths = await cards.evaluateAll((all) =>
    all.map((card) => card.getBoundingClientRect().width),
  );
  expect(Math.min(...widths)).toBeGreaterThan(60);
  expect(await rowTops(page, "Their")).toEqual(await rowTops(page, "My"));

  // Closing it goes back to the chosen number.
  await library(page).getByRole("button", { name: "Close captures" }).click();
  await expect(library(page)).toBeHidden();
  const [first] = await rowTops(page, "My");
  const inFirstRow = await cards.evaluateAll(
    (all, top) =>
      all.filter((card) => Math.round(card.getBoundingClientRect().top) === top)
        .length,
    first,
  );
  expect(inFirstRow).toBe(8);
});

test("the empty selection boxes and hints are gone", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));

  await expect(page.getByText("Select a card to see")).toHaveCount(0);
  await expect(page.getByText("Cards with interested people")).toHaveCount(0);
  await expect(page.getByText("Choose either side to start")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear selections" }),
  ).toHaveCount(0);
});

test("picking shows how many matched, and takes you to them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await fullDesk(page);
  const found = page.getByRole("button", { name: /\d+ match(es)? found/ });
  await expect(found).toHaveCount(0);

  await page.getByRole("button", { name: /^Their SeoYeon CC301/ }).click();
  await expect(found).toHaveText("1 match found");
  await expect(found).toBeInViewport();

  const results = page.getByRole("region", { name: "Traders to contact" });
  await expect(results).not.toBeInViewport();
  await found.click();
  await expect(results).toBeInViewport();
});

test("a pick nobody matches says so, and leads nowhere", async ({ page }) => {
  await openDesk(page);
  // Offers a card, but wants nothing the viewer has.
  await deliver(
    page,
    scan("run-a", 1000, {
      transcript: `loner — ${YEAR}-11-01T10:30:00.000Z
HAVE
Nien CC399
WANT
Lynn CC998`,
    }),
  );

  await page.getByRole("button", { name: /^Their Nien CC399/ }).click();
  const none = page.getByRole("button", { name: "No matches for these cards" });
  await expect(none).toBeVisible();
  await expect(none).toBeDisabled();
});
