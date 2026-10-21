import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MOD, focusNothing } from "./helpers";

// Screenshots of every screen for the visual parity pass against the mockups (`__inspiration/mockups/png`).
// Not part of `pnpm e2e`; run `pnpm --filter phyllo e2e:visual`. Output: test-results/screens/<theme>-<accent>/*.png
// (Playwright empties test-results/ at the start of every run, so copy the shots out before running e2e again).

const SETTINGS_KEY = "phyllo.settings.v1";
const COMBOS = [
  { theme: "dark", accent: "green" },
  { theme: "light", accent: "green" },
  { theme: "dark", accent: "purple" },
  { theme: "light", accent: "purple" },
] as const;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Let entrance transitions and the first meter/readout frames finish.
  await page.waitForTimeout(400);
}

for (const { theme, accent } of COMBOS) {
  test(`screens in ${theme} / ${accent} @visual`, async ({ page }) => {
    const dir = `test-results/screens/${theme}-${accent}`;
    const shot = async (name: string) => {
      await settle(page);
      await page.screenshot({ path: `${dir}/${name}.png` });
    };
    await page.addInitScript(
      ([key, value]) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
      },
      [SETTINGS_KEY, JSON.stringify({ appearance: { mode: theme, accent }, uiMode: "guided" })] as const,
    );

    await page.goto("/#/start");
    await expect(page.getByRole("heading", { name: /Start from a seed/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset["theme"])).toBe(theme);
    await shot("03-guided-start");

    await page.getByRole("button", { name: /House groove/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/#\/arrange$/);
    await page.getByRole("list", { name: "Tracks" }).getByRole("button", { name: /^Bass/ }).first().click();
    await focusNothing(page);
    await shot("01-arrange-guided");

    await page.getByRole("radio", { name: "Pro" }).click();
    await focusNothing(page);
    await shot("02-arrange-pro");
    await page.getByRole("radio", { name: "Guided" }).click();

    await page.keyboard.press(`${MOD}+2`);
    await expect(page.getByRole("textbox", { name: "Live code" })).toBeVisible();
    await shot("04-pattern-editor");

    await page.keyboard.press(`${MOD}+3`);
    await expect(page.getByRole("main", { name: "Mixer" })).toBeVisible();
    await shot("05-mixer");

    await page.keyboard.press(`Shift+${MOD}+l`);
    await expect(page.getByRole("main", { name: "Groove library" })).toBeVisible();
    await shot("08-groove-library");

    await page.evaluate(() => {
      window.location.hash = "#/settings";
    });
    await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
    await shot("07-settings");

    await page.evaluate(() => {
      window.location.hash = "#/arrange";
    });
    await page.getByRole("button", { name: "Untitled Groove", exact: true }).click();
    await page.getByRole("menuitem", { name: "Version History…" }).click();
    await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
    await shot("09-version-history");
  });
}
