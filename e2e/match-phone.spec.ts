import { devices, expect, test } from "@playwright/test";

// The matcher is fed by the browser extension, which phones can't run, so
// they get a note pointing at a computer, and a demo of what it does, instead
// of the page.
test.use({
  userAgent: devices["iPhone 13"].userAgent,
  viewport: { width: 390, height: 844 },
});

test("phones are told to use a computer instead of getting the matcher", async ({
  page,
}) => {
  await page.goto("/match");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Match only works on desktop",
    }),
  ).toBeVisible();
  // The demo, and it starts on the first of its three steps.
  await expect(page.getByRole("button", { name: /the demo$/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Search for your missing cards/ }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    page.getByRole("button", { name: "Import Discord posts" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try a sample" })).toHaveCount(
    0,
  );
});
