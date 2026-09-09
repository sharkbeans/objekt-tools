import { expect, test } from "@playwright/test";

// traderA wants CC101, which the test user types as theirs — enough for the
// post to show up as a contact result with its triage actions.
const SAMPLE = `traderA — 3:41 PM
HAVE
Mayu CC103
WANT
SeoYeon CC101
traderB — 3:44 PM
HAVE
Xinyu CC104
WANT
SeoYeon CC101`;

async function setUp(page: import("@playwright/test").Page) {
  await page.goto("/match");
  await page.getByRole("button", { name: "Paste Discord posts" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Discord posts" }).fill(SAMPLE);
  await dialog.getByRole("button", { name: "Add posts" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "My lists" }).click();
  await page.getByLabel("Or type what I have").fill("SeoYeon CC101");
  await page.getByRole("button", { name: "Done — show my cards" }).click();

  await expect(page.getByTestId("trader-result")).toHaveCount(2);
}

test("marking a post handled hides it, and it stays hidden across a reload", async ({
  page,
}) => {
  await setUp(page);

  await page
    .getByTestId("trader-result")
    .filter({ hasText: "traderA" })
    .getByRole("button", { name: "Handled" })
    .click();

  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("traderB");

  await page.reload();
  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("traderB");

  // The hidden one can be brought back without losing the triage list.
  await page.getByRole("button", { name: /Show 1 handled/ }).click();
  await expect(page.getByTestId("trader-result")).toHaveCount(2);
});

test("muting a trader hides them and survives a reload", async ({ page }) => {
  await setUp(page);

  await page
    .getByTestId("trader-result")
    .filter({ hasText: "traderB" })
    .getByRole("button", { name: "Mute" })
    .click();

  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("traderA");

  await page.reload();
  await expect(page.getByTestId("trader-result")).toHaveCount(1);
  await expect(page.getByTestId("trader-result")).toContainText("traderA");
});

test("triage ids stored locally are opaque digests, not message text", async ({
  page,
}) => {
  await setUp(page);
  await page
    .getByTestId("trader-result")
    .filter({ hasText: "traderA" })
    .getByRole("button", { name: "Handled" })
    .click();
  await expect(page.getByTestId("trader-result")).toHaveCount(1);

  const stored = await page.evaluate(() =>
    localStorage.getItem("match:seen:v1"),
  );
  expect(stored).toBeTruthy();
  expect(stored).toMatch(/^\["post:[0-9a-f]{64}"\]$/);
  expect(stored).not.toContain("traderA");
  expect(stored).not.toContain("CC101");
});
