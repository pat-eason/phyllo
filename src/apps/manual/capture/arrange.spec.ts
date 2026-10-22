import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Locator } from "@playwright/test";
import path from "node:path";
import { MOD, SCREENSHOT_DIR, annotate, blur, clearAnnotations, launch, shot } from "./harness";

// Arrange, the sound library panel, the track inspector, the code drawer and "How Phyllo writes code".

const inspector = (page: Page) => page.getByRole("complementary", { name: "Track inspector" });
const libraryPanel = (page: Page) => page.getByRole("complementary", { name: "Sound library" });
const codeDrawer = (page: Page) => page.getByRole("region", { name: "Code", exact: true });
const lane = (page: Page, name: string) => page.getByRole("list", { name: "Tracks" }).getByRole("listitem", { name, exact: true });

/** Crops from the top of `from` to the bottom of `to` across `across`'s width (for tall panels with empty space). */
async function shotSpan(page: Page, name: string, across: Locator, from: Locator, to: Locator, margin = 16) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const [a, f, t] = await Promise.all([across.boundingBox(), from.boundingBox(), to.boundingBox()]);
  if (!a || !f || !t) throw new Error(`${name}: missing box`);
  const y = Math.max(0, f.y - margin);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    clip: { x: a.x, y, width: a.width, height: t.y + t.height + margin - y },
  });
}

async function selectTrack(page: Page, name: string) {
  await page.getByRole("list", { name: "Tracks" }).getByRole("button", { name, exact: true }).click();
}

test("arrange", async ({ page }) => {
  await launch(page);
  await blur(page);

  await annotate(page, [
    { target: page.getByRole("navigation", { name: "Views" }) },
    { target: page.getByRole("button", { name: "Intro 1–8, section" }), badge: "left" },
    { target: page.getByRole("button", { name: /^Loop region/ }), badge: "br" },
    { target: lane(page, "Kick").locator("[data-track-header]"), badge: "left" },
    { target: page.getByRole("button", { name: "Kick, bars 5 to 16, bd*4" }), badge: "bl" },
    { target: page.getByTestId("add-track-row"), badge: "left" },
    { target: page.getByRole("combobox", { name: "Snap" }).locator("xpath=.."), badge: "left" },
    { target: page.getByRole("group", { name: "Zoom" }), badge: "tr" },
  ]);
  await shot(page, "arrange-overview");
  await clearAnnotations(page);

  // One track header up close.
  await selectTrack(page, "Clap");
  await selectTrack(page, "Kick");
  await blur(page);
  await page.getByRole("list", { name: "Tracks" }).locator("[data-track-header]").first().hover();
  const header = lane(page, "Kick").locator("[data-track-header]");
  await annotate(
    page,
    [
      { target: header.getByRole("button", { name: "Kick", exact: true }), badge: "left", pad: 2 },
      { target: header.getByRole("button", { name: "Remove Kick" }), badge: "top", pad: 2 },
      { target: header.getByRole("button", { name: "Mute Kick" }), badge: "bottom", pad: 2 },
      { target: header.getByRole("button", { name: "Solo Kick" }), badge: "right", pad: 2 },
    ],
    { dim: false },
  );
  await shot(page, "arrange-track-header", { clip: header, margin: 40 });
  await clearAnnotations(page);

  // Ruler: sections, loop band, bar numbers.
  await annotate(
    page,
    [
      { target: page.getByRole("button", { name: "Groove 9–16, section" }), badge: "top" },
      { target: page.getByRole("button", { name: /^Loop region/ }), badge: "bottom", pad: 2 },
      { target: page.getByTestId("ruler").locator("span", { hasText: /^17$/ }), badge: "bottom", pad: 3 },
    ],
    { dim: false },
  );
  await shot(page, "arrange-ruler", { clip: page.getByTestId("ruler"), margin: 36 });
  await clearAnnotations(page);

  // Add track menu.
  await page.getByRole("button", { name: /^Add track/ }).click();
  const menu = page.getByRole("menu", { name: "Track kind" });
  await expect(menu).toBeVisible();
  await shot(page, "arrange-add-track-menu", { clip: menu, margin: 24 });
  await page.keyboard.press("Escape");

  // Pro toolbar: edit tools, snap, zoom.
  await page.getByRole("radio", { name: "Pro" }).click();
  await blur(page);
  const toolbar = page.getByRole("group", { name: "Edit tools" }).locator("xpath=..");
  await annotate(
    page,
    [
      { target: page.getByRole("button", { name: "Select (V)" }), badge: "bottom", pad: 2 },
      { target: page.getByRole("button", { name: "Draw (B)" }), badge: "bottom", pad: 2 },
      { target: page.getByRole("button", { name: "Split (S)" }), badge: "bottom", pad: 2 },
      { target: page.getByRole("combobox", { name: "Snap" }).locator("xpath=.."), badge: "bottom", pad: 2 },
      { target: page.getByRole("group", { name: "Zoom" }), badge: "bottom", pad: 2 },
    ],
    { dim: false },
  );
  await shot(page, "arrange-pro-toolbar", { clip: toolbar, margin: 40 });
  await clearAnnotations(page);

  // Both side panels folded away.
  await page.keyboard.press(`${MOD}+j`);
  await page.keyboard.press(`Shift+${MOD}+j`);
  await expect(page.getByRole("button", { name: "Expand sound library" })).toBeVisible();
  await blur(page);
  await annotate(page, [
    { target: page.getByRole("button", { name: "Expand sound library" }), badge: "right" },
    { target: page.getByRole("button", { name: "Expand inspector" }), badge: "left" },
  ]);
  await shot(page, "arrange-panels-collapsed");
});

test("sound library panel", async ({ page }) => {
  await launch(page);
  await blur(page);
  const panel = libraryPanel(page);
  await annotate(
    page,
    [
      { target: panel.getByRole("tablist", { name: "Library" }), badge: "tr" },
      { target: panel.getByRole("searchbox"), badge: "tr" },
      { target: panel.getByRole("group", { name: "Drum machine" }), badge: "tr" },
      { target: panel.getByRole("button", { name: "Preview Snare" }), badge: "left", pad: 2 },
      { target: panel.getByRole("list", { name: "Drum sounds" }).getByRole("listitem").nth(1), badge: "tr", pad: 1 },
      { target: panel.getByRole("list", { name: "Synths" }), badge: "tr" },
    ],
    { dim: false },
  );
  await shot(page, "library-panel-sounds", { clip: panel, margin: 20 });
  await clearAnnotations(page);

  // Plain-language search (Guided).
  await panel.getByRole("searchbox").fill("warm");
  await expect(panel.getByRole("region", { name: "Instruments" })).toBeVisible();
  await blur(page);
  await shotSpan(page, "library-panel-search", panel, panel.getByRole("tablist", { name: "Library" }), panel.getByRole("region", { name: "Instruments" }));
  await panel.getByRole("searchbox").fill("");

  // Instruments and linked folders further down the Sounds tab.
  await panel.getByRole("region", { name: "Your folders" }).scrollIntoViewIfNeeded();
  await annotate(
    page,
    [
      { target: panel.getByRole("list", { name: "Instruments" }), badge: "tr" },
      { target: panel.getByRole("button", { name: "Link a folder…" }), badge: "tr" },
    ],
    { dim: false },
  );
  await shot(page, "library-panel-instruments", { clip: panel, margin: 12 });
  await clearAnnotations(page);

  // Pro: Snippets tab with the ⌘K hint.
  await page.getByRole("radio", { name: "Pro" }).click();
  await panel.getByRole("tab", { name: "Snippets" }).click();
  await blur(page);
  await annotate(
    page,
    [
      { target: panel.getByRole("tab", { name: "Snippets" }), badge: "tr", pad: 2 },
      { target: panel.getByRole("listitem").first(), badge: "tr", pad: 2 },
      { target: panel.locator("footer"), badge: "tr" },
    ],
    { dim: false },
  );
  await shot(page, "library-panel-snippets", { clip: panel, margin: 12 });
});

test("inspector", async ({ page }) => {
  await launch(page);
  await selectTrack(page, "Bass");
  await blur(page);
  const panel = inspector(page);
  await annotate(
    page,
    [
      { target: panel.getByRole("button", { name: "Bass, rename track" }), badge: "right", pad: 2 },
      { target: panel.getByRole("button", { name: "Edit pattern" }), badge: "tr", pad: 2 },
      { target: panel.getByRole("button", { name: /^Sound: / }), badge: "tr", pad: 2 },
      { target: panel.getByRole("textbox", { name: "Pattern" }), badge: "tr", pad: 2 },
      { target: panel.getByRole("region", { name: "Shape the sound" }), badge: "tr" },
      { target: panel.getByRole("region", { name: "Try one" }), badge: "tr" },
    ],
    { dim: false },
  );
  await shot(page, "inspector-guided", { clip: panel, margin: 0 });
  await clearAnnotations(page);

  // Sound picker popover.
  await panel.getByRole("button", { name: /^Sound: / }).click();
  const picker = page.getByRole("dialog", { name: "Choose a sound" });
  await expect(picker).toBeVisible();
  await page.keyboard.type("warm");
  await shot(page, "inspector-sound-picker", { clip: panel, margin: 0 });
  await page.keyboard.press("Escape");

  // Apply two "Try one" ideas, then look at them as Pro modifiers.
  await panel.getByRole("button", { name: /Slow filter sweep/ }).click();
  await panel.getByRole("button", { name: /Flip every 4th bar/ }).click();
  await page.getByRole("radio", { name: "Pro" }).click();
  await blur(page);
  await annotate(
    page,
    [
      { target: panel.getByRole("region", { name: "Parameters" }), badge: "tr" },
      { target: panel.getByRole("button", { name: "Add modifier" }), badge: "left", pad: 2 },
      { target: panel.getByRole("list", { name: "Modifiers · applied in order" }).getByRole("listitem").last(), badge: "bottom", pad: 2 },
      { target: panel.getByRole("switch").first(), badge: "left", pad: 2 },
    ],
    { dim: false },
  );
  await shotSpan(page, "inspector-pro", panel, panel.getByRole("region", { name: "Parameters" }), panel.getByRole("list", { name: "Modifiers · applied in order" }), 40);
});

test("code drawer", async ({ page }) => {
  await launch(page, { uiMode: "pro", codeDrawer: true });
  await selectTrack(page, "Clap");
  await blur(page);
  const drawer = codeDrawer(page);
  await expect(drawer.getByRole("button", { name: "Hide code" })).toBeVisible();
  await annotate(
    page,
    [
      { target: drawer.getByRole("radiogroup", { name: "Code scope" }).or(drawer.getByRole("tablist", { name: "Code scope" })), badge: "top", pad: 2 },
      { target: drawer.getByRole("button", { name: "Edit code" }), badge: "top", pad: 2 },
      { target: drawer.getByRole("button", { name: "Copy strudel.cc link" }), badge: "top", pad: 2 },
      { target: drawer.getByRole("button", { name: "Hide code" }), badge: "top", pad: 2 },
    ],
    { dim: false },
  );
  await shot(page, "code-drawer", { clip: drawer, margin: 32 });
  await clearAnnotations(page);

  // Whole song: one arrange() per track.
  await drawer.getByText("Whole song · arrange()").click();
  // Give the drawer room for the whole program.
  const handle = page.getByLabel("Resize code drawer");
  const box = await handle.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 300, { steps: 8 });
    await page.mouse.up();
  }
  await blur(page);
  await shot(page, "howcode-song", { clip: drawer, margin: 0 });

  // Edit code (Pro): the whole song as text.
  await drawer.getByRole("button", { name: "Edit code" }).click();
  await expect(page.getByRole("textbox", { name: "Strudel code for the whole song" })).toBeVisible();
  await shot(page, "code-edit", { clip: drawer, margin: 0 });

  // A line Phyllo can't map becomes a Code track.
  const editor = page.getByRole("textbox", { name: "Strudel code for the whole song" });
  await editor.fill(`${await editor.inputValue()}\n$: stack(s("rim*2"), s("~ oh")).bank("RolandTR808")`);
  await drawer.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("img", { name: "Code track" }).first()).toBeVisible();
  const codeLane = page.getByRole("list", { name: "Tracks" }).getByRole("listitem").last();
  await codeLane.locator("[data-track-header]").getByRole("button").first().click();
  await blur(page);
  await annotate(page, [
    { target: codeLane.locator("[data-track-header]"), badge: "left" },
    { target: inspector(page).getByRole("region", { name: "Code" }), badge: "tl" },
  ]);
  await shot(page, "code-track");
});
