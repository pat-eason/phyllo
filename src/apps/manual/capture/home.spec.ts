import { expect, test } from "@playwright/test";
import { blur, launch, shot } from "./harness";

// The home page's hero images: the same groove in Guided (light) and Pro (dark, code drawer open).

test("home: guided, light", async ({ page }) => {
  await launch(page, { theme: "light", uiMode: "guided" });
  await blur(page);
  await shot(page, "home-guided");
});

test("home: pro, dark, code open", async ({ page }) => {
  await launch(page, { theme: "dark", uiMode: "pro", codeDrawer: true });
  await page.getByRole("list", { name: "Tracks" }).getByRole("button", { name: "Bass", exact: true }).click();
  await expect(page.getByRole("region", { name: "Code" })).toBeVisible();
  await blur(page);
  await shot(page, "home-pro");
});
