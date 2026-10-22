import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import path from "node:path";
import { MOD, SCREENSHOT_DIR, annotate, blur, clearAnnotations, launch, shot } from "./harness";

// Pattern editor, Mixer, Groove library, Export, Settings and device screenshots
// (docs/screens/{pattern-editor,mixer,groove-library,export,settings,devices}.md).

async function openSettings(page: Page, section?: string): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  if (!(await nav.isVisible())) await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(nav).toBeVisible();
  if (section !== undefined) {
    await nav.getByRole("button", { name: section, exact: true }).or(nav.getByRole("link", { name: section, exact: true })).click();
    await page.waitForTimeout(500);
  }
}

/** Crops to the box around several elements (the harness's `clip` takes one). */
async function shotAround(page: Page, name: string, targets: Locator[], margin = 16): Promise<void> {
  const boxes = [];
  for (const target of targets) {
    const box = await target.boundingBox();
    if (box === null) throw new Error(`${name}: target has no box`);
    boxes.push(box);
  }
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - margin);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - margin);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + margin;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + margin;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), clip: { x, y, width: right - x, height: bottom - y } });
}

/** A settings section by its heading. */
const settingsSection = (page: Page, title: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).first();

test.describe("pattern editor", () => {
  test("steps view and tools", async ({ page }) => {
    await launch(page);
    await page.keyboard.press(`${MOD}+2`);
    const grid = page.getByRole("grid", { name: "Kick steps" });
    await expect(grid).toBeVisible();
    await blur(page);

    await annotate(page, [
      { target: page.getByRole("tablist", { name: "Editor" }), badge: "tl" },
      { target: grid, badge: "tl" },
      { target: grid.getByRole("gridcell").filter({ hasText: "bd*4" }), badge: "tr" },
      { target: page.getByLabel("Add a sound row"), badge: "right" },
      { target: page.locator('[class*="_velocity_"]').first(), badge: "tl" },
      { target: page.getByRole("region", { name: "Live code" }), badge: "tl" },
      { target: page.locator('[class*="_length_"]').first(), badge: "bl" },
      { target: page.getByRole("main", { name: "Pattern editor" }).getByRole("button", { name: /Kit/ }).or(page.getByRole("combobox", { name: "Kit" })).first(), badge: "br" },
      { target: page.getByRole("button", { name: "Play pattern" }), badge: "left" },
    ]);
    await shot(page, "pattern-steps");

    await clearAnnotations(page);
    const tools = page.getByRole("complementary", { name: "Pattern tools" });
    await annotate(page, [
      { target: tools.getByRole("region", { name: "Spread hits evenly" }), badge: "left" },
      { target: tools.getByRole("region", { name: "Feel" }), badge: "left" },
      { target: tools.getByRole("region", { name: "Mini-notation, quickly" }), badge: "left" },
    ]);
    await shot(page, "pattern-tools", { clip: tools, margin: 28 });
  });

  test("euclid applied", async ({ page }) => {
    await launch(page);
    await page.keyboard.press(`${MOD}+2`);
    await page.getByRole("button", { name: "Clap cp" }).click();
    await page.getByRole("button", { name: "More hits" }).click();
    await page.getByRole("button", { name: "More hits" }).click();
    await page.getByRole("button", { name: "Apply to Clap" }).click();
    await blur(page);
    const grid = page.getByRole("grid", { name: "Kick steps" });
    await annotate(page, [{ target: grid.getByRole("row").nth(1), badge: "tl" }], { dim: false });
    await shot(page, "pattern-euclid", { clip: page.getByRole("main", { name: "Pattern editor" }), margin: 0 });
  });

  test("piano roll", async ({ page }) => {
    await launch(page, { open: "Neon Orchard" });
    await page.getByRole("list", { name: "Tracks" }).getByRole("button", { name: "Lead", exact: true }).click();
    await page.keyboard.press(`${MOD}+2`);
    const roll = page.getByRole("grid", { name: "Piano roll" });
    await expect(roll).toBeVisible();
    await blur(page);
    await annotate(page, [
      { target: page.locator('[class*="_pianoBar_"]').first(), badge: "tr" },
      { target: roll, badge: "bl" },
      { target: page.getByRole("region", { name: "Live code" }), badge: "tl" },
    ]);
    await shot(page, "pattern-piano-roll");
  });

  test("code tab", async ({ page }) => {
    await launch(page);
    await page.keyboard.press(`${MOD}+2`);
    await page.getByRole("tab", { name: "Code" }).click();
    await blur(page);
    const main = page.getByRole("main", { name: "Pattern editor" });
    await annotate(page, [
      { target: page.getByRole("region", { name: "Generated code for Kick" }), badge: "tl" },
      { target: main.getByRole("textbox").first(), badge: "tl" },
    ]);
    await shot(page, "pattern-code", { clip: page.locator('[class*="_codeView_"]').first(), margin: 28 });
  });
});

test.describe("mixer", () => {
  test("strips", async ({ page }) => {
    await launch(page);
    await page.keyboard.press(`${MOD}+3`);
    const mixer = page.getByRole("main", { name: "Mixer" });
    await expect(mixer).toBeVisible();
    await blur(page);
    const kick = page.getByRole("region", { name: "Kick channel" });
    await annotate(page, [
      { target: kick.locator('[class*="_head_"]').first(), badge: "tl" },
      { target: kick.locator('[class*="_list_"]').first(), badge: "tl" },
      { target: kick.locator('[class*="_sends_"]').first(), badge: "tl" },
      { target: kick.locator('[class*="_route_"]').first(), badge: "tl" },
      { target: kick.locator('[class*="_faderArea_"]').first(), badge: "tl" },
      { target: kick.getByRole("button", { name: /^Mute|^Solo/ }).first().locator(".."), badge: "bl" },
      { target: page.getByRole("region", { name: "Bus 1 channel" }), badge: "tl" },
      { target: page.getByRole("region", { name: "Master channel" }), badge: "tl" },
    ]);
    await shot(page, "mixer-overview");
  });

  test("effect menu", async ({ page }) => {
    await launch(page);
    await page.keyboard.press(`${MOD}+3`);
    await page.getByRole("button", { name: "Add effect to Clap" }).click();
    const menu = page.getByRole("menu", { name: "Effects for Clap" });
    await expect(menu).toBeVisible();
    await page.waitForTimeout(200);
    await shot(page, "mixer-effect-menu", { clip: menu, margin: 40 });
  });

  test("master", async ({ page }) => {
    await launch(page, { theme: "dark" });
    await page.keyboard.press(`${MOD}+3`);
    await blur(page);
    const master = page.getByRole("region", { name: "Master channel" });
    await annotate(page, [
      { target: master.locator('[class*="_head_"]').first(), badge: "left" },
      { target: master.getByRole("list", { name: "Master output" }), badge: "left" },
      { target: master.getByText("Peak", { exact: true }).locator(".."), badge: "left" },
      { target: master.locator('[class*="_faderArea_"]').first(), badge: "left" },
      { target: master.getByRole("button", { name: /Rec output/ }), badge: "left" },
    ]);
    await shot(page, "mixer-master", { clip: master, margin: 40 });
  });
});

test.describe("groove library", () => {
  test("grid", async ({ page }) => {
    await launch(page, { open: null });
    const main = page.getByRole("main", { name: "Groove library" });
    await expect(main).toBeVisible();
    await expect(main.getByText("Night Bus").first()).toBeVisible();
    await blur(page);
    const card = main.locator("article").filter({ has: page.getByRole("heading", { name: "Night Bus" }) });
    await annotate(page, [
      { target: page.getByRole("radiogroup", { name: "Collections" }), badge: "tl" },
      { target: page.getByRole("heading", { name: "Tags" }).locator("..").locator(".."), badge: "tl" },
      { target: page.getByRole("searchbox", { name: "Search grooves" }).or(page.getByLabel("Search grooves")).first(), badge: "tl" },
      { target: page.getByLabel("Sort").locator(".."), badge: "tl" },
      { target: page.getByText("Tile size", { exact: true }).locator(".."), badge: "tl" },
      { target: page.getByRole("group", { name: "View" }).or(page.getByRole("radiogroup", { name: "View" })).first(), badge: "tr" },
      { target: card, badge: "tl" },
      { target: card.getByRole("button", { name: "Play Night Bus" }), badge: "br", pad: 2 },
      { target: card.getByRole("button", { name: "Favorite Night Bus" }), badge: "right", pad: 2 },
      { target: page.getByRole("button", { name: "Import…" }), badge: "left" },
      { target: page.getByRole("button", { name: "New groove" }), badge: "br" },
    ]);
    await shot(page, "library-grid");
  });

  test("list and menu", async ({ page }) => {
    await launch(page, { open: null });
    const main = page.getByRole("main", { name: "Groove library" });
    await expect(main.getByText("Night Bus").first()).toBeVisible();
    await page.getByRole("button", { name: "List view" }).or(page.getByRole("radio", { name: "List view" })).first().click();
    const table = page.getByRole("grid", { name: "Grooves" });
    await expect(table).toBeVisible();
    await blur(page);
    await shot(page, "library-list");

    await table.getByRole("row").filter({ hasText: "Paper Sky" }).click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Groove actions" });
    await expect(menu).toBeVisible();
    await shot(page, "library-context-menu", { clip: menu, margin: 60 });
  });

  test("version history", async ({ page }) => {
    await launch(page);
    // Two saves so the dialog has versions to show.
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForTimeout(1500);
    await page.getByRole("list", { name: "Tracks" }).getByRole("button", { name: "Mute Clap" }).click();
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Night Bus", exact: true }).click();
    const projectMenu = page.getByRole("menu", { name: "Project" });
    await expect(projectMenu).toBeVisible();
    await annotate(page, [{ target: projectMenu.getByRole("menuitem", { name: "Version History…" }), badge: "right" }], { dim: false });
    await shot(page, "library-project-menu", { clip: projectMenu, margin: 40 });
    await clearAnnotations(page);
    await projectMenu.getByRole("menuitem", { name: "Version History…" }).click();
    const dialog = page.getByRole("dialog", { name: "Version history" });
    await expect(dialog).toBeVisible();
    await shot(page, "library-version-history", { clip: dialog, margin: 24 });
  });
});

test.describe("export", () => {
  test("mixdown", async ({ page }) => {
    await launch(page);
    await page.keyboard.press(`${MOD}+e`);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("navigation", { name: "Export type" })).toBeVisible();
    await blur(page);
    await annotate(page, [
      { target: dialog.getByRole("navigation", { name: "Export type" }), badge: "tl" },
      { target: dialog.getByRole("radiogroup").first(), badge: "tl" },
      { target: dialog.locator('[class*="_selects_"]').first(), badge: "tl" },
      { target: dialog.getByLabel("Save to").locator("..").locator(".."), badge: "tl" },
      { target: dialog.getByRole("checkbox").first().locator("..").locator(".."), badge: "tl" },
      { target: dialog.getByRole("button", { name: /^Export WAV/ }), badge: "top" },
    ]);
    await shot(page, "export-mixdown", { clip: dialog, margin: 24 });
  });

  test("stems, midi and code", async ({ page }) => {
    await launch(page);
    await page.keyboard.press(`${MOD}+e`);
    const dialog = page.getByRole("dialog");
    const nav = dialog.getByRole("navigation", { name: "Export type" });
    await nav.getByRole("button", { name: /Stems/ }).or(nav.getByRole("tab", { name: /Stems/ })).first().click();
    await page.mouse.move(0, 0);
    await blur(page);
    await shot(page, "export-stems", { clip: dialog, margin: 24 });
    await nav.getByRole("button", { name: /MIDI/ }).or(nav.getByRole("tab", { name: /MIDI/ })).first().click();
    await page.mouse.move(0, 0);
    await blur(page);
    await shot(page, "export-midi", { clip: dialog, margin: 24 });
    await nav.getByRole("button", { name: /Code/ }).or(nav.getByRole("tab", { name: /Code/ })).first().click();
    await page.mouse.move(0, 0);
    await blur(page);
    await shot(page, "export-code", { clip: dialog, margin: 24 });
  });
});

test.describe("settings", () => {
  test("appearance", async ({ page }) => {
    await launch(page, { theme: "dark" });
    await openSettings(page);
    await blur(page);
    await annotate(page, [
      { target: page.getByRole("navigation", { name: "Settings sections" }), badge: "br" },
      { target: settingsSection(page, "Appearance"), badge: "tl" },
    ]);
    await shot(page, "settings-appearance");
  });

  test("general and system", async ({ page }) => {
    await launch(page);
    await openSettings(page, "General");
    await blur(page);
    await shot(page, "settings-general", { clip: settingsSection(page, "General"), margin: 20 });
    await openSettings(page, "Audio");
    await shot(page, "settings-audio", { clip: settingsSection(page, "Audio"), margin: 20 });
    await openSettings(page, "System");
    await shot(page, "settings-system", { clip: settingsSection(page, "System"), margin: 20 });
  });
});

test.describe("devices", () => {
  test("midi and osc", async ({ page }) => {
    await launch(page);
    await openSettings(page, "MIDI & OSC");
    await blur(page);
    const section = settingsSection(page, "MIDI & OSC");
    await annotate(page, [
      { target: section.getByRole("table"), badge: "tl" },
      { target: section.getByRole("button", { name: /Map 8 knobs/ }), badge: "left" },
      { target: section.locator('[class*="_fieldRow_"]').first(), badge: "left" },
    ]);
    await shot(page, "devices-midi-osc", { clip: section, margin: 24 });
  });

  test("sample folders", async ({ page }) => {
    await launch(page);
    await page.getByRole("tab", { name: "Samples" }).click();
    await blur(page);
    const panel = page.getByRole("complementary", { name: "Sound library" });
    await annotate(page, [{ target: panel.getByRole("button", { name: /Link a folder/ }), badge: "tr" }], { dim: false });
    await shotAround(page, "devices-samples-tab", [panel.getByRole("tablist", { name: "Library" }), panel.getByRole("button", { name: /Link a folder/ })], 24);
  });
});
