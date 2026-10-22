import { expect, test } from "@playwright/test";
import {
  MOD,
  focusNothing,
  generatedCode,
  inspector,
  openFirstLaunch,
  positionValue,
  readPosition,
  startLofi,
  tracks,
} from "./helpers";

// Every test gets a fresh browser context: no saved settings and an empty (localStorage) library = first launch.

test("first launch: Guided start → Lo-fi keys at 83 BPM → Arrange in Guided", async ({ page }) => {
  await openFirstLaunch(page);
  // Tokens and bundled fonts are loaded (formerly the smoke test).
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
  expect(fonts.join(",")).toContain("Source Serif 4");

  await page.getByRole("button", { name: /Lo-fi keys/ }).click();
  await page.getByRole("button", { name: "Faster" }).click();
  await expect(page.getByRole("textbox", { name: "Tempo in BPM" })).toHaveValue("83");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/#\/arrange$/);
  await expect(tracks(page)).toHaveCount(3);
  await expect(page.getByRole("radio", { name: "Guided" })).toBeChecked();
  await expect(page.getByRole("button", { name: /83 BPM/ })).toBeVisible();
  await expect(inspector(page).getByRole("slider")).toHaveCount(6);
  await expect(page.getByRole("region", { name: "Tip" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show code" })).toBeVisible();
  await expect(page.getByLabel("Generated Strudel code")).toHaveCount(0);
});

test("play, mute, select and turn a knob: code follows within 100 ms", async ({ page }) => {
  await startLofi(page);

  // Space plays (focus outside fields); the position readout advances.
  await focusNothing(page);
  const before = positionValue(await readPosition(page));
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(async () => positionValue(await readPosition(page)), { timeout: 10_000 }).toBeGreaterThan(before);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

  // Mute → `_$:` in the drawer within 100 ms of the click (measured in the page).
  const code = await generatedCode(page);
  await expect(code).not.toContainText("_$:");
  const mute = page.getByRole("button", { name: "Mute Hats" });
  const latency = await mute.evaluate(
    (button) =>
      new Promise<number>((resolve, reject) => {
        const pre = document.querySelector('[aria-label="Generated Strudel code"]');
        if (!pre) return reject(new Error("no code view"));
        let clickedAt = 0;
        const observer = new MutationObserver(() => {
          if (clickedAt > 0 && pre.textContent?.includes("_$:")) {
            observer.disconnect();
            resolve(performance.now() - clickedAt);
          }
        });
        observer.observe(pre, { subtree: true, childList: true, characterData: true });
        clickedAt = performance.now();
        (button as HTMLButtonElement).click();
        setTimeout(() => reject(new Error("no _$: after 2 s")), 2000);
      }),
  );
  expect(latency).toBeLessThan(100);
  await expect(mute).toHaveAttribute("aria-pressed", "true");

  // Selecting a track updates the inspector.
  await page.getByRole("list", { name: "Tracks" }).getByRole("button", { name: /^Keys/ }).first().click();
  await expect(inspector(page).getByRole("heading", { level: 2 })).toContainText("Keys");

  // Turning a knob from the keyboard rewrites the code.
  const textBefore = await code.innerText();
  const volume = inspector(page).getByRole("slider", { name: /Volume/ });
  await volume.focus();
  await page.keyboard.press("Shift+ArrowUp");
  await expect.poll(() => code.innerText()).not.toBe(textBefore);
});

test("Guided → Pro shows 8 knobs and the open drawer without changing the code", async ({ page }) => {
  await startLofi(page);
  await expect(inspector(page).getByRole("slider")).toHaveCount(6);

  await page.getByRole("radio", { name: "Pro" }).click();
  await expect(inspector(page).getByRole("slider")).toHaveCount(8);
  // Pro default: drawer expanded (no explicit Show/Hide choice was made).
  const code = page.getByLabel("Generated Strudel code");
  await expect(code).toBeVisible();
  const pro = await code.innerText();

  await page.getByRole("radio", { name: "Guided" }).click();
  await expect(inspector(page).getByRole("slider")).toHaveCount(6);
  await expect(code).toHaveCount(0);
  const guided = await (await generatedCode(page)).innerText();
  expect(guided).toBe(pro);

  // ⇧⌘G flips back to Pro, still the same code.
  await focusNothing(page);
  await page.keyboard.press(`Shift+${MOD}+g`);
  await expect(page.getByRole("radio", { name: "Pro" })).toBeChecked();
  expect(await code.innerText()).toBe(pro);
});

test("theme toggle switches data-theme; an accent picked in Settings applies", async ({ page }) => {
  await startLofi(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset["theme"]);
  const first = await theme();
  const next = first === "dark" ? "light" : "dark";
  await page.getByRole("button", { name: `Switch to ${next} theme` }).click();
  await expect.poll(theme).toBe(next);

  await page.evaluate(() => {
    window.location.hash = "#/settings";
  });
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.getByRole("radio", { name: /Purple/ }).first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset["accent"])).toBe("purple");

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/#\/arrange$/);
  expect(await page.evaluate(() => document.documentElement.dataset["accent"])).toBe("purple");
});

test("⌘2 pattern editor step → live code and track pattern; ⌘3 mixer fader → .gain(", async ({ page }) => {
  await startLofi(page);
  const pattern = inspector(page).getByRole("textbox", { name: /Pattern/ });
  const patternBefore = await pattern.inputValue();

  await focusNothing(page);
  await page.keyboard.press(`${MOD}+2`);
  await expect(page).toHaveURL(/#\/pattern/);
  const live = page.getByRole("textbox", { name: "Live code" });
  const liveBefore = await live.inputValue();
  const step = page.getByRole("button", { name: /^Kick step 3$/ });
  await expect(step).toHaveAttribute("aria-pressed", "false");
  await step.click();
  await expect(step).toHaveAttribute("aria-pressed", "true");
  await expect(live).not.toHaveValue(liveBefore);
  const liveAfter = await live.inputValue();

  await focusNothing(page);
  await page.keyboard.press(`${MOD}+1`);
  await expect(page).toHaveURL(/#\/arrange$/);
  const patternAfter = await inspector(page).getByRole("textbox", { name: /Pattern/ }).inputValue();
  expect(patternAfter).not.toBe(patternBefore);
  expect(liveAfter).toContain(patternAfter);

  const gainCalls = async () => ((await (await generatedCode(page)).innerText()).match(/\.gain\(/g) ?? []).length;
  const gainBefore = await gainCalls();
  await focusNothing(page);
  await page.keyboard.press(`${MOD}+3`);
  await expect(page).toHaveURL(/#\/mixer$/);
  const fader = page.getByRole("slider", { name: "Drums volume" });
  await fader.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  await focusNothing(page);
  await page.keyboard.press(`${MOD}+1`);
  await expect.poll(gainCalls).toBeGreaterThan(gainBefore);
});

test("⇧⌘L opens the library with the autosaved groove", async ({ page }) => {
  await startLofi(page);
  await expect(page.getByText(/Autosaved \d/)).toBeVisible({ timeout: 10_000 });
  await focusNothing(page);
  await page.keyboard.press(`Shift+${MOD}+l`);
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByRole("navigation").getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: /Open Untitled Groove/ })).toBeVisible();

  // Opening it goes back to Arrange.
  await page.getByRole("button", { name: /Open Untitled Groove/ }).click();
  await expect(page).toHaveURL(/#\/arrange$/);
});

test("shortcuts stay quiet while typing in the inspector pattern field", async ({ page }) => {
  await startLofi(page);
  const field = inspector(page).getByRole("textbox", { name: /Pattern/ });
  const loop = page.getByRole("button", { name: "Loop", exact: true });
  const loopBefore = await loop.getAttribute("aria-pressed");
  await field.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" m s l r ");
  await expect(field).toHaveValue(/ m s l r $/);
  await page.keyboard.press(`${MOD}+z`);

  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Mute / }).first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: /^Solo / }).first()).toHaveAttribute("aria-pressed", "false");
  expect(await loop.getAttribute("aria-pressed")).toBe(loopBefore);
  await expect(page).toHaveURL(/#\/arrange$/);

  // The same keys outside the field do act (M mutes the selected track).
  await page.keyboard.press("Escape");
  await focusNothing(page);
  await page.keyboard.press("m");
  await expect(page.getByRole("button", { name: "Mute Drums" })).toHaveAttribute("aria-pressed", "true");
});

test("right-click a track header → Duplicate adds a copy below; ⌘Z removes it", async ({ page }) => {
  await startLofi(page);
  await expect(tracks(page)).toHaveCount(3);

  const list = page.getByRole("list", { name: "Tracks" });
  await list.getByRole("button", { name: "Hats", exact: true }).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Track Hats" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(menu).toHaveCount(0);
  await expect(tracks(page)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Mute Hats copy" })).toBeVisible();

  await focusNothing(page);
  await page.keyboard.press(`${MOD}+z`);
  await expect(tracks(page)).toHaveCount(3);
});
