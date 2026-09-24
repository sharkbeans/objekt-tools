import { expect, test } from "@playwright/test";

test("home page exposes the main public tools", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "objekt.my",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Lists/i }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Collection/i }).first(),
  ).toBeVisible();
});

test("match page loads its main heading", async ({ page }) => {
  await page.goto("/match");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("retired trade URLs redirect to match", async ({ page }) => {
  for (const path of ["/trades", "/trades/abc", "/active-trades/x"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/match$/);
  }
});

test("health endpoint reports ok", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as { ok?: boolean };
  expect(payload.ok).toBe(true);
});
