import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MOD, annotate, blur, clearAnnotations, launch, shot } from "./harness";

// Screenshots for the Getting started and Concepts pages: docs/guide/{install,first-groove,tour,strudel-basics,
// guided-and-pro}.md.

const inspector = (page: Page) => page.getByRole("complementary", { name: "Track inspector" });
const library = (page: Page) => page.getByRole("complementary", { name: "Sound library" });
const header = (page: Page) => page.getByRole("banner");

async function selectTrack(page: Page, name: string) {
  await page.getByRole("list", { name: "Tracks" }).getByRole("button", { name, exact: true }).click();
  await expect(inspector(page).getByRole("button", { name: `${name}, rename track` })).toBeVisible();
}

test("install: first launch and library launch", async ({ page }) => {
  await launch(page, { library: false, open: null });
  await expect(page.getByRole("heading", { name: /Start from/ })).toBeVisible();
  await blur(page);
  await annotate(page, [
    { target: page.getByRole("group", { name: "Starters" }) },
    { target: page.getByRole("textbox", { name: "strudel.cc link" }).locator("xpath=ancestor::*[.//button[normalize-space()='Import']][1]") },
    { target: page.getByRole("button", { name: "Open project…" }), badge: "left" },
    { target: page.getByRole("button", { name: "I know Strudel — skip to Pro" }), badge: "bottom" },
  ]);
  await shot(page, "install-guided-start");
});

test("install: launch with grooves lands on the library", async ({ page }) => {
  await launch(page, { open: null });
  await expect(page.getByRole("main", { name: "Groove library" })).toBeVisible();
  await blur(page);
  await shot(page, "install-library");
});

test("first groove: guided start steps", async ({ page }) => {
  await launch(page, { library: false, open: null });
  await page.getByRole("button", { name: /House groove/ }).click();
  await blur(page);
  await annotate(page, [
    { target: page.getByRole("button", { name: /House groove/ }) },
    { target: page.getByRole("textbox", { name: "The code it writes" }), badge: "tl" },
  ]);
  await shot(page, "first-pick-starter");

  const continueButton = page.getByRole("button", { name: "Continue" });
  await continueButton.scrollIntoViewIfNeeded();
  await page.getByRole("group", { name: "Tempo" }).scrollIntoViewIfNeeded();
  await blur(page);
  const settingsPanel = page.getByRole("group", { name: "Tempo" }).locator("xpath=ancestor::*[.//button[normalize-space()='Continue']][1]");
  await annotate(page, [
    { target: page.getByRole("group", { name: "Tempo" }) },
    { target: page.getByRole("combobox", { name: "Key" }) },
    { target: page.getByRole("button", { name: "Preview" }) },
    { target: continueButton, badge: "tr" },
  ]);
  await shot(page, "first-tempo-key", { clip: settingsPanel, margin: 24 });
  await clearAnnotations(page);

  await continueButton.click();
  await expect(page.getByRole("main", { name: "Arrange" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tracks" }).getByRole("listitem")).toHaveCount(4);
  await blur(page);
  await annotate(page, [
    { target: page.getByRole("button", { name: "Play", exact: true }), badge: "bottom" },
    { target: page.getByRole("group", { name: "Transport readout" }), badge: "bottom" },
    { target: page.getByRole("list", { name: "Tracks" }) },
  ]);
  await shot(page, "first-arrange");
});

test("first groove: mute, solo, knobs, pattern", async ({ page }) => {
  await launch(page);

  // Mute and solo.
  await page.getByRole("button", { name: "Mute Clap" }).click();
  await page.getByRole("button", { name: "Solo Kick" }).click();
  await blur(page);
  await annotate(page, [
    { target: page.getByRole("button", { name: "Mute Clap" }), badge: "left" },
    { target: page.getByRole("button", { name: "Solo Kick" }), badge: "right" },
  ]);
  await shot(page, "first-mute-solo", { clip: page.getByRole("list", { name: "Tracks" }), margin: 28 });
  await clearAnnotations(page);
  await page.getByRole("button", { name: "Solo Kick" }).click();
  await page.getByRole("button", { name: "Mute Clap" }).click();

  // Brightness on the bass, with the code drawer open to show it change.
  await selectTrack(page, "Bass");
  const brightness = inspector(page).getByRole("slider", { name: /Brightness/ });
  await brightness.focus();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: "Show code" }).click();
  await blur(page);
  await annotate(page, [
    { target: brightness.locator("xpath=ancestor::*[contains(., '.lpf()')][1]"), badge: "tl" },
    { target: inspector(page).getByRole("region", { name: "Try one" }), badge: "left" },
    { target: page.getByRole("region", { name: "Code" }), badge: "tl" },
  ]);
  await shot(page, "first-shape-sound");
  await clearAnnotations(page);

  // Change the kick's pattern.
  await selectTrack(page, "Kick");
  const pattern = inspector(page).getByRole("textbox", { name: "Pattern" });
  await pattern.fill("bd(3,8)");
  await blur(page);
  await annotate(page, [
    { target: pattern.locator("xpath=ancestor::*[.//*[contains(., 'mini-notation')]][1]"), badge: "left" },
    { target: page.getByRole("button", { name: /^Kick, bars 5 to 16/ }), badge: "tl" },
    { target: inspector(page).getByRole("button", { name: "Edit pattern" }), badge: "bottom" },
  ]);
  await shot(page, "first-edit-pattern");
});

test("first groove: add a track and save", async ({ page }) => {
  await launch(page);
  const openHat = library(page).getByRole("listitem").filter({ has: page.getByRole("button", { name: "Preview Open hat" }) });
  const dropZone = page.getByRole("button", { name: /^Add track/ });
  await blur(page);
  await annotate(page, [
    { target: openHat, badge: "left" },
    { target: dropZone, badge: "tl" },
  ]);
  await shot(page, "first-add-track");
  await clearAnnotations(page);

  await page.getByText("Add track", { exact: true }).click();
  const kinds = page.getByRole("menu", { name: "Track kind" });
  await expect(kinds).toBeVisible();
  await blur(page);
  await annotate(page, [{ target: kinds, badge: "tr" }]);
  await shot(page, "first-add-track-menu", { clip: page.getByRole("main", { name: "Arrange" }), margin: 0 });
  await clearAnnotations(page);
  await page.keyboard.press("Escape");

  // Any edit autosaves within a couple of seconds; the status bar then says so.
  await page.getByRole("button", { name: "Mute Hats" }).click();
  await page.getByRole("button", { name: "Mute Hats" }).click();
  await expect(page.getByRole("contentinfo").getByText(/Autosaved/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Night Bus", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Project" });
  await expect(menu).toBeVisible();
  await annotate(page, [
    { target: menu.getByRole("menuitem", { name: "Save", exact: true }), badge: "left" },
    { target: page.getByRole("contentinfo").getByText(/Autosaved/), badge: "left" },
  ]);
  await shot(page, "first-save");
});

test("tour: the arrange window", async ({ page }) => {
  await launch(page);
  await blur(page);
  const banner = header(page);
  await annotate(page, [
    { target: banner.getByRole("button", { name: "Night Bus", exact: true }), badge: "bottom" },
    { target: banner.getByRole("group", { name: "Transport", exact: true }), badge: "left" },
    { target: banner.getByRole("group", { name: "Transport readout" }), badge: "bottom" },
    { target: banner.getByRole("button", { name: "Metronome" }), badge: "bottom" },
    { target: banner.getByRole("radiogroup", { name: "Interface depth" }), badge: "bottom" },
    { target: banner.getByRole("button", { name: /^Switch to (dark|light) theme$/ }), badge: "bottom" },
    { target: banner.getByRole("button", { name: "Settings", exact: true }), badge: "bottom" },
    { target: banner.getByRole("button", { name: "Export", exact: true }), badge: "bottom" },
    { target: library(page), badge: "right" },
    { target: page.getByRole("navigation", { name: "Views" }), badge: "right" },
    { target: page.getByRole("list", { name: "Tracks" }), badge: "bl" },
    { target: inspector(page), badge: "left" },
    { target: page.getByRole("region", { name: "Code" }), badge: "tl" },
    { target: page.getByRole("contentinfo"), badge: "tl", pad: 0 },
  ]);
  await shot(page, "tour-window");
});

test("tour: tips coach", async ({ page }) => {
  await launch(page, { tips: true });
  const tip = page.getByRole("region", { name: "Tip" });
  await expect(tip).toBeVisible();
  await blur(page);
  await annotate(page, [
    { target: tip.getByRole("button", { name: "Show me" }), badge: "right" },
    { target: tip.getByRole("button", { name: "Hide tips" }), badge: "left" },
  ], { dim: false });
  await shot(page, "tour-tips", { clip: tip, margin: 32 });
});

test("basics: code drawer next to the tracks", async ({ page }) => {
  await launch(page, { codeDrawer: true });
  await blur(page);
  await shot(page, "basics-code");
});

test("modes: guided and pro", async ({ page }) => {
  await launch(page);
  await selectTrack(page, "Bass");
  await blur(page);
  await annotate(page, [
    { target: inspector(page).getByRole("region", { name: "Shape the sound" }), badge: "tl" },
    { target: inspector(page).getByRole("region", { name: "Try one" }), badge: "tl" },
  ]);
  await shot(page, "modes-guided-inspector", { clip: inspector(page), margin: 0 });
  await clearAnnotations(page);

  await page.keyboard.press(`Shift+${MOD}+g`);
  await expect(page.getByRole("radio", { name: "Pro" })).toBeChecked();
  await blur(page);
  await annotate(page, [
    { target: inspector(page).getByRole("region", { name: "Parameters" }), badge: "tl" },
    { target: inspector(page).getByRole("region", { name: /Modifiers/ }), badge: "tl" },
  ]);
  await shot(page, "modes-pro-inspector", { clip: inspector(page), margin: 0 });
  await clearAnnotations(page);

  await annotate(page, [
    { target: header(page).getByRole("radiogroup", { name: "Interface depth" }), badge: "bottom" },
    { target: library(page).getByRole("tablist", { name: "Library" }), badge: "tr" },
    { target: page.getByRole("group", { name: "Edit tools" }), badge: "left" },
    { target: page.getByRole("region", { name: "Code" }), badge: "tl" },
  ]);
  await shot(page, "modes-pro-arrange");
});
