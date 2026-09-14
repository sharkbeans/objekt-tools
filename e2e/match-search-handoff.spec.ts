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

test("handoff autofills their search and explains offers without a return trade", async ({
  page,
}) => {
  await openDesk(page, "Xinyu CC101");
  await deliver(page, "seoyeon cc344 345", "empty-mutual");
  await expect(
    page.getByRole("textbox", { name: "Search their objekts" }),
  ).toHaveValue("seoyeon cc344 345");
  const summary = page.getByTestId("search-match-summary");
  await expect(summary).toContainText("No mutual trades found");
  await expect(summary).toContainText(
    "2 WTT posts offer matching cards, but none lists any of your objekts in return",
  );
  await expect(
    page.getByRole("button", { name: /^Their SeoYeon CC34[45],/ }),
  ).toHaveCount(2);
  await expect(page.getByTestId("trader-result")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("match:wants:v1")),
  ).toBe("Mayu AA101");

  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Search their objekts" }),
  ).toHaveValue("seoyeon cc344 345");
  await expect(summary).toContainText("No mutual trades found");
  await page.getByRole("textbox", { name: "Search their objekts" }).fill("");
  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("unrelated");
});

test("either searched card can yield a mutual trade; later deliveries replace old filters and selections", async ({
  page,
}) => {
  await openDesk(page, "JiYeon CC102 103\nXinyu CC101");
  await deliver(page, "seoyeon cc344 345", "mutual");
  await expect(page.getByTestId("trader-result")).toHaveCount(2);
  await expect(page.getByTestId("search-match-summary")).toContainText(
    "2 WTT posts offer",
  );
  await page.getByRole("button", { name: /^Their SeoYeon CC344,/ }).click();
  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await deliver(page, "Mayu CC344", "next-search");
  await expect(
    page.getByRole("textbox", { name: "Search their objekts" }),
  ).toHaveValue("Mayu CC344");
  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("unrelated");
});

test("missing inventory asks for cards instead of claiming nobody wants them", async ({
  page,
}) => {
  await openDesk(page, "");
  await deliver(page, "seoyeon cc344 345", "no-inventory");
  await expect(page.getByTestId("search-match-summary")).toContainText(
    "Add your objekts to check",
  );
  await expect(page.getByTestId("search-match-summary")).not.toContainText(
    "No mutual trades",
  );
});

test("no offers is distinguished from offers with no mutual trade", async ({
  page,
}) => {
  await openDesk(page, "Xinyu CC101");
  await deliver(page, "SeoYeon CC399", "no-offers");
  await expect(page.getByTestId("search-match-summary")).toContainText(
    "No WTT posts in this paste offer cards matching",
  );
  await expect(page.getByTestId("trader-result")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Paste Discord posts" }).click();
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
