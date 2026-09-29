import { expect, type Page, test } from "@playwright/test";

const POSTS = `offer344 — 3:41 PM
HAVE
SeoYeon CC344
WANT
JiYeon CC102
offer345 — 3:42 PM
HAVE
SeoYeon CC345
WANT
JiYeon CC103
unrelated — 3:43 PM
HAVE
Mayu CC344
WANT
Xinyu CC101`;

async function openDesk(page: Page, mine: string) {
  await page.addInitScript((offering) => {
    localStorage.setItem("match:offering:v1", offering);
    localStorage.setItem("match:wants:v1", "Mayu AA101");
  }, mine);
  await page.route("**/api/objekts/search**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/match");
}

async function deliver(page: Page, wants: string, id: string) {
  await page.evaluate(
    ({ transcript, wants, id }) =>
      new Promise<void>((resolve, reject) => {
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
                id,
                transcript,
                wants,
                nickname: "",
              },
              location.origin,
            );
          if (event.data.type === "received" && event.data.id === id) {
            cleanup();
            resolve();
          }
        }
        window.addEventListener("message", receive);
        send();
      }),
    { transcript: POSTS, wants, id },
  );
}

/** "Their objekts" card labels, in grid order. */
async function theirCards(page: Page) {
  return page
    .getByRole("button", { name: /^Their / })
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") ?? ""),
    );
}

test("handoff pins the searched cards without hiding the rest, and explains offers without a return trade", async ({
  page,
}) => {
  await openDesk(page, "Xinyu CC101");
  await deliver(page, "seoyeon cc344 345", "empty-mutual");
  // A highlight, not a filter: the search box stays empty and every card the
  // posts offer is still in the grid, the searched ones first.
  const search = page.getByRole("textbox", { name: "Search their objekts" });
  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: /^Their SeoYeon CC34[45],.*in your search$/,
    }),
  ).toHaveCount(2);
  const cards = await theirCards(page);
  expect(cards).toHaveLength(3);
  expect(cards[2]).toMatch(/^Their Mayu CC344,/);
  await expect(page.getByText("1 more in these posts")).toBeVisible();

  const summary = page.getByTestId("search-match-summary");
  await expect(summary).toHaveText("No matched trades for your search.");
  // The trade that exists — for a card nobody searched for — is still listed.
  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("unrelated");
  expect(
    await page.evaluate(() => localStorage.getItem("match:wants:v1")),
  ).toBe("Mayu AA101");

  await page.reload();
  await expect(search).toHaveValue("");
  await expect(summary).toHaveText("No matched trades for your search.");
  await page
    .getByRole("button", { name: "Stop pinning the searched cards" })
    .click();
  await expect(summary).toHaveCount(0);
  await expect(page.getByText(/more in these posts/)).toHaveCount(0);
});

test("a pasted want list keeps its line breaks as separate cards", async ({
  page,
}) => {
  await openDesk(page, "Xinyu CC101");
  await deliver(page, "", "paste");
  const search = page.getByRole("textbox", { name: "Search their objekts" });
  await search.focus();
  await search.evaluate((input) => {
    const data = new DataTransfer();
    data.setData("text/plain", "SeoYeon CC344\nMayu CC344\n");
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(search).toHaveValue("SeoYeon CC344, Mayu CC344");
  await expect(page.getByRole("button", { name: /^Their / })).toHaveCount(2);
});

test("either searched card can yield a mutual trade; later deliveries replace old pins and selections", async ({
  page,
}) => {
  await openDesk(page, "JiYeon CC102 103\nXinyu CC101");
  await deliver(page, "seoyeon cc344 345", "mutual");
  await expect(
    page.getByRole("textbox", { name: "Search their objekts" }),
  ).toHaveValue("");
  await expect(page.getByTestId("search-match-summary")).toHaveText(
    "2 matched trades for your search.",
  );
  // Traders offering a searched card lead; the other mutual trade follows.
  const traders = page.getByTestId("trader-result");
  await expect(traders).toHaveCount(3);
  await expect(traders.nth(2)).toContainText("unrelated");
  await page.getByRole("button", { name: /^Their SeoYeon CC344,/ }).click();
  await expect(traders).toHaveCount(1);
  const search = page.getByRole("textbox", { name: "Search their objekts" });
  await search.fill("seoyeon");

  await deliver(page, "Mayu CC344", "next-search");
  await expect(search).toHaveValue("");
  await expect(traders).toHaveCount(3);
  await expect(traders.first()).toContainText("unrelated");
  expect((await theirCards(page))[0]).toMatch(
    /^Their Mayu CC344,.*in your search$/,
  );
});

test("missing inventory asks for cards instead of claiming nobody wants them", async ({
  page,
}) => {
  await openDesk(page, "");
  await deliver(page, "seoyeon cc344 345", "no-inventory");
  await expect(page.getByTestId("search-match-summary")).toContainText(
    "Add your objekts to find matched trades.",
  );
});

test("a search nobody offers still lists the trades that do exist", async ({
  page,
}) => {
  await openDesk(page, "Xinyu CC101");
  await deliver(page, "SeoYeon CC399", "no-offers");
  await expect(page.getByTestId("search-match-summary")).toContainText(
    "No matched trades for your search.",
  );
  await expect(page.getByText(/more in these posts/)).toHaveCount(0);
  // Nothing searched turned up, but what did is still there to trade for.
  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("unrelated");
});

test("linked Objekt.top and Apollo lists load together", async ({ page }) => {
  await openDesk(page, "JiYeon CC102");
  let calls = 0;
  await page.route("**/api/external-lists?*", async (route) => {
    calls++;
    const list = new URL(route.request().url()).searchParams.get("url") ?? "";
    const apollo = list.includes("apollo.cafe");
    await route.fulfill({
      json: {
        source: apollo ? "apollo.cafe" : "objekt.top",
        url: list,
        items: [
          {
            member: apollo ? "Mayu" : "SeoYeon",
            season: "Cream02",
            collectionNo: apollo ? "345" : "344",
            imageUrl: null,
          },
        ],
        total: 1,
        partial: false,
      },
    });
  });
  await page.getByRole("button", { name: "Import Discord posts" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Discord posts" })
    .fill(`top — 3:41 PM
WTT
HAVE
https://objekt.top/list/top344
WANT
JiYeon CC102
apollo — 3:42 PM
WTT
HAVE
https://apollo.cafe/@apollo/list/apollo345
WANT
JiYeon CC102`);
  await dialog.getByRole("button", { name: "Add posts" }).click();

  await page.getByText("2 linked lists", { exact: true }).click();
  await expect(
    page.getByText("Found public Objekt.top and Apollo.cafe lists", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load all 2 lists" }).click();
  await expect(page.getByText("2 lists loaded", { exact: true })).toBeVisible();
  expect(calls).toBe(2);
  await expect(
    page.getByRole("button", { name: /^Their SeoYeon CC344,/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Their Mayu CC345,/ }),
  ).toBeVisible();
});

test("a rate-limited list import pauses and offers to load the rest", async ({
  page,
}) => {
  await openDesk(page, "JiYeon CC102");
  let calls = 0;
  await page.route("**/api/external-lists?*", async (route) => {
    calls++;
    if (calls === 2) {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "60" },
        json: { error: "Too many list imports. Try again in a minute." },
      });
      return;
    }
    const list = new URL(route.request().url()).searchParams.get("url") ?? "";
    const apollo = list.includes("apollo.cafe");
    await route.fulfill({
      json: {
        source: apollo ? "apollo.cafe" : "objekt.top",
        url: list,
        items: [
          {
            member: apollo ? "Mayu" : "SeoYeon",
            season: "Cream02",
            collectionNo: apollo ? "345" : "344",
            imageUrl: null,
          },
        ],
        total: 1,
        partial: false,
      },
    });
  });
  await page.getByRole("button", { name: "Import Discord posts" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Discord posts" })
    .fill(`top — 3:41 PM
WTT
HAVE
https://objekt.top/list/top344
WANT
JiYeon CC102
apollo — 3:42 PM
WTT
HAVE
https://apollo.cafe/@apollo/list/apollo345
WANT
JiYeon CC102`);
  await dialog.getByRole("button", { name: "Add posts" }).click();

  await page.getByText("2 linked lists", { exact: true }).click();
  await page.getByRole("button", { name: "Load all 2 lists" }).click();
  await expect(
    page.getByText("List imports are busy. Try again in a minute."),
  ).toBeVisible();
  await expect(page.getByText(/unavailable/)).toHaveCount(0);

  await page.getByRole("button", { name: "Load 1 more list" }).click();
  await expect(page.getByText("2 lists loaded", { exact: true })).toBeVisible();
  expect(calls).toBe(3);
});

test("the last Cosmo inventory reloads on the next visit", async ({ page }) => {
  let loads = 0;
  await page.route("**/api/objekts/by-nickname/**", (route) => {
    loads++;
    return route.fulfill({
      json: {
        results: [
          {
            collectionId: "cream02-xinyu-101z",
            artist: "tripleS",
            member: "Xinyu",
            collectionNo: "101Z",
            season: "Cream02",
            class: "First",
            serial: 1,
            objektId: "1",
          },
        ],
      },
    });
  });
  await openDesk(page, "");
  await deliver(page, "", "inventory");
  await page.getByRole("button", { name: "Add Cosmo" }).click();
  await page.getByLabel("Load my Cosmo inventory").fill("tester");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  const card = page.getByRole("button", { name: /^My Xinyu CC101,/ });
  await expect(card).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change Cosmo" }),
  ).toBeVisible();

  await page.reload();
  await expect(card).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change Cosmo" }),
  ).toBeVisible();
  expect(loads).toBe(2);
});
