import { expect, type Page, test } from "@playwright/test";

const DAY = 24 * 60 * 60 * 1000;

// Dates are pinned by the transcript, and read back in this zone and format.
test.use({ locale: "en-GB", timezoneId: "UTC" });

const FIRST_SCAN = `alpha — 2026-11-01T10:30:00.000Z
HAVE
Mayu CC103
WANT
SeoYeon CC101
beta — 2026-11-01T18:30:00.000Z
HAVE
Xinyu CC104
WANT
SeoYeon CC101`;

// Shares beta's post with the scan above, so turning that one off keeps it.
const SECOND_SCAN = `beta — 2026-11-01T18:30:00.000Z
HAVE
Xinyu CC104
WANT
SeoYeon CC101
gamma — 2026-11-02T09:00:00.000Z
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
  wants: "SeoYeon CC101\nSeoYeon CC102",
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

const rows = (page: Page) => page.getByTestId("capture-row");
const traders = (page: Page) => page.getByTestId("trader-result");
const alert = (page: Page) => page.getByRole("alertdialog");

test("a search is saved as a dated capture and survives a reload", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("CC101–102");
  await expect(rows(page)).toContainText("01/11/2026 10:30–18:30");
  await expect(rows(page)).toContainText("2 posts");
  await expect(rows(page)).toContainText("scanned just now");
  await expect(traders(page)).toHaveCount(2);

  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("01/11/2026 10:30–18:30");
  await expect(traders(page)).toHaveCount(2);
});

test("captures sit side by side, and a switch controls what is on the desk", async ({
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
  await expect(rows(page)).toHaveCount(2);
  await expect(traders(page)).toHaveCount(3);

  await page.getByRole("switch", { name: /CC101/ }).click();
  await expect(traders(page)).toHaveCount(2);
  // beta is in both captures, so it stays with the one still on.
  await expect(traders(page).filter({ hasText: "beta" })).toHaveCount(1);
  await expect(traders(page).filter({ hasText: "alpha" })).toHaveCount(0);
  await expect(page.getByText("2 of 3 posts")).toBeVisible();

  await page.reload();
  await expect(traders(page)).toHaveCount(2);
  await expect(page.getByRole("switch", { name: /CC101/ })).not.toBeChecked();

  await page.getByRole("switch", { name: /CC101/ }).click();
  await expect(traders(page)).toHaveCount(3);
});

test("with every capture off the desk is empty but the switches stay", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));

  await page.getByRole("switch", { name: /CC101/ }).click();
  await expect(traders(page)).toHaveCount(0);
  await expect(page.getByText("All captures are off")).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
});

test("scrolled posts from an older extension are refused", async ({ page }) => {
  await openDesk(page);
  const acknowledged = await deliver(page, {
    id: "index-abc123",
    transcript: FIRST_SCAN,
  });

  expect(acknowledged).toBe(0);
  await expect(page.getByText("only scrolled past")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(traders(page)).toHaveCount(0);
});

test("an older extension's search is still filed, dated on arrival", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, {
    id: "abc-def-ghi",
    transcript: FIRST_SCAN,
    wants: "SeoYeon CC101",
  });

  await expect(rows(page)).toContainText("SeoYeon CC101");
  await expect(rows(page)).toContainText("scanned just now");
  await expect(alert(page)).toBeHidden();
});

test("hand-pasted posts keep a row of their own", async ({ page }) => {
  await openDesk(page);
  await page.getByRole("button", { name: "Import Discord posts" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Discord posts" }).fill(
    `alpha — 3:41 PM
HAVE
Mayu CC103
WANT
SeoYeon CC101`,
  );
  await dialog.getByRole("button", { name: "Add posts" }).click();

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Pasted posts");
  await expect(rows(page)).toContainText("added just now");
  await page.getByRole("switch", { name: /Pasted posts/ }).click();
  await expect(traders(page)).toHaveCount(0);
});

test("a store from before captures reads as pasted, with nothing lost", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  await expect(traders(page)).toHaveCount(2);
  // What a browser that used /match before this feature has on disk.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("objekt-match", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const blocks = [
      {
        author: "alpha",
        time: "2026-11-01T10:30:00.000Z",
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
  });

  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Pasted posts");
  await expect(traders(page)).toHaveCount(1);
});

test("removing a capture can be undone", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));

  await page.getByRole("button", { name: /^Remove CC101/ }).click();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(traders(page)).toHaveCount(2);

  await page.reload();
  await expect(traders(page)).toHaveCount(2);
});

test("a capture under 72 hours old raises no alert", async ({ page }) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 2.9 * DAY));
  await expect(rows(page)).toHaveCount(1);
  await expect(alert(page)).toBeHidden();
  await expect(rows(page).getByText("Old", { exact: true })).toBeHidden();
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
  // Still marked in the list, and still on the desk.
  await expect(rows(page).getByText("Old", { exact: true })).toBeVisible();
  await expect(traders(page)).toHaveCount(2);

  await page.reload();
  await expect(rows(page)).toHaveCount(1);
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
  await expect(rows(page)).toHaveCount(1);
  await expect(alert(page)).toBeHidden();
});

test("without the extension the alert offers to import instead", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));

  await alert(page).getByRole("button", { name: "Import new posts" }).click();
  await expect(alert(page)).toBeHidden();
  await expect(page.getByRole("dialog")).toContainText("Import Discord posts");
});

test("a new scan hands the extension the same search", async ({ page }) => {
  await installBridge(page);
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));

  await alert(page).getByRole("button", { name: "Run a new scan" }).click();
  await expect(alert(page)).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { asked: object[] }).asked),
    )
    .toEqual([
      expect.objectContaining({
        type: "hunt",
        wants: "SeoYeon CC101\nSeoYeon CC102",
      }),
    ]);
});

test("a capture's own button scans just that one again", async ({ page }) => {
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

  await rows(page)
    .filter({ hasText: "CC301" })
    .getByRole("button", { name: "Scan again" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { asked: object[] }).asked),
    )
    .toEqual([expect.objectContaining({ type: "hunt", wants: "Nien CC301" })]);
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
    .poll(() =>
      page.evaluate(() => (window as unknown as { asked: object[] }).asked),
    )
    .toEqual([expect.objectContaining({ type: "open-panel" })]);
});

test("the rescan that comes back replaces the old capture on the desk", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 4 * DAY));
  await alert(page).getByRole("button", { name: "Not now" }).click();

  await deliver(page, scan("run-b", 1000, { transcript: SECOND_SCAN }));

  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText("Turned off an older capture")).toBeVisible();
  await expect(rows(page).first()).toHaveAttribute("data-active", "true");
  await expect(rows(page).nth(1)).toHaveAttribute("data-active", "false");
  await expect(traders(page).filter({ hasText: "alpha" })).toHaveCount(0);

  // Nothing left for the alert to warn about, even with the snooze gone.
  await page.evaluate(() => localStorage.removeItem("match:stale-snooze:v1"));
  await page.reload();
  await expect(rows(page)).toHaveCount(2);
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
  await expect(rows(page)).toHaveCount(0);

  await page.reload();
  await expect(rows(page)).toHaveCount(0);
  await expect(traders(page)).toHaveCount(0);
});

test("an extension post shows a readable time, not an ISO stamp", async ({
  page,
}) => {
  await openDesk(page);
  await deliver(page, scan("run-a", 1000));
  const alpha = traders(page).filter({ hasText: "alpha" });
  await expect(alpha).toContainText("01/11/2026, 10:30");
  await expect(alpha).not.toContainText("2026-11-01T");
});
