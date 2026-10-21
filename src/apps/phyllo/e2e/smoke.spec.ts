import { expect, test } from "@playwright/test";

test("shell renders with theme and fonts applied", async ({ page }) => {
  await page.goto("/");

  const wordmark = page.getByRole("heading", { name: "Phyllo" });
  await expect(wordmark).toBeVisible();

  const theme = await page.evaluate(() => document.documentElement.dataset["theme"]);
  expect(["dark", "light"]).toContain(theme);
  expect(await page.evaluate(() => document.documentElement.dataset["accent"])).toBe("green");

  // Tokens are loaded: the shell background resolves from --ph-bg.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");

  // Bundled fonts load without network access to a CDN.
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
  expect(loaded.join(",")).toContain("Source Serif 4");
});
