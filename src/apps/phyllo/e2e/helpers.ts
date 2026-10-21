import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** ⌘ on macOS, Ctrl elsewhere (the app reads the platform the same way). */
export const MOD = "ControlOrMeta";

/** First launch (fresh browser context: no settings, empty library) → Guided start. */
export async function openFirstLaunch(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/start$/);
  await expect(page.getByRole("heading", { name: /Start from a seed/ })).toBeVisible();
}

/** Guided start → Lo-fi keys at `bpm` → Continue → Arrange. */
export async function startLofi(page: Page, options: { faster?: number } = {}): Promise<void> {
  await openFirstLaunch(page);
  await page.getByRole("button", { name: /Lo-fi keys/ }).click();
  for (let i = 0; i < (options.faster ?? 0); i += 1) await page.getByRole("button", { name: "Faster" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/#\/arrange$/);
  await expect(tracks(page)).toHaveCount(3);
}

export const inspector = (page: Page): Locator => page.getByRole("complementary", { name: "Track inspector" });

/** Timeline lanes (one per track). */
export const tracks = (page: Page): Locator => page.getByRole("list", { name: "Tracks" }).getByRole("button", { name: /^Mute / });

/** Header position readout as `[bar, beat, sixteenth]`. */
export async function readPosition(page: Page): Promise<[number, number, number]> {
  const text = await page.locator('[data-cell="position"]').innerText();
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) throw new Error(`no position in "${text}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Positions compare as bar-beat-sixteenth tuples. */
export function positionValue([bar, beat, sixteenth]: [number, number, number]): number {
  return bar * 10_000 + beat * 100 + sixteenth;
}

/** The code drawer's generated code (opens the drawer first when it is collapsed). */
export async function generatedCode(page: Page): Promise<Locator> {
  const show = page.getByRole("button", { name: "Show code" });
  if (await show.isVisible()) await show.click();
  const code = page.getByLabel("Generated Strudel code");
  await expect(code).toBeVisible();
  return code;
}

/** Clicks somewhere neutral so focus leaves buttons/fields (global single-key shortcuts then apply). */
export async function focusNothing(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}
