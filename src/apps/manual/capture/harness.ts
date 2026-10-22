import { buildStarterProject, serializeProject } from "@phyllo/model";
import type { Accent, StarterId, ThemeMode, UiMode } from "@phyllo/model";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Shared helpers for the manual's screenshot specs. Every spec drives the Phyllo frontend in a plain browser (the
// in-memory NativeApi), seeds a small groove library through localStorage, then draws numbered callouts over the
// page before each capture. Output lands in docs/public/screenshots/<name>.png.

export const MOD = "ControlOrMeta";
export const SCREENSHOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/public/screenshots");

// Storage keys owned by the app (src/apps/phyllo/src/native/browser.ts, src/ui/shell/startup.ts).
const NATIVE_KEY = "phyllo.native.v1";
const SETTINGS_KEY = "phyllo.settings.v1";
const LAST_PROJECT_KEY = "phyllo.lastProject";
const ROOT = "/Phyllo";

interface SeedGroove {
  starter: StarterId;
  name: string;
  tags: string[];
  favorite?: boolean;
  bpm?: number;
  key?: string;
  /** Days before the capture date. */
  daysAgo: number;
  /** Days before the capture date it was last opened (shows under Recent). */
  openedDaysAgo?: number;
}

/** The library every spec starts with. "Night Bus" is the groove most screenshots open. */
export const LIBRARY: readonly SeedGroove[] = [
  { starter: "house", name: "Night Bus", tags: ["house", "late"], favorite: true, daysAgo: 0, openedDaysAgo: 0 },
  { starter: "lofi", name: "Paper Sky", tags: ["lo-fi", "keys"], favorite: true, key: "F major", daysAgo: 1, openedDaysAgo: 1 },
  { starter: "breaks", name: "Copper Tape", tags: ["breaks"], key: "E minor", daysAgo: 3, openedDaysAgo: 2 },
  { starter: "stage", name: "Neon Orchard", tags: ["chiptune"], daysAgo: 4 },
  { starter: "ambient", name: "Fog Bank", tags: ["ambient", "sketch"], favorite: true, daysAgo: 5, openedDaysAgo: 4 },
  { starter: "euclid", name: "Tidal Fold", tags: ["euclid", "study"], key: "D dorian", daysAgo: 7 },
  { starter: "house", name: "Lantern Walk", tags: ["house", "sketch"], bpm: 122, key: "G minor", daysAgo: 9 },
  { starter: "lofi", name: "Velvet Loop", tags: ["lo-fi"], bpm: 76, key: "Bb major", daysAgo: 11 },
];

/** "Now" for every capture (the browser clock starts here too), so library dates read the same on every run. */
export const CAPTURE_DATE = new Date("2026-10-20T18:27:00");

interface SeededNative {
  files: Record<string, { content: string; modifiedMs: number }>;
  opened: Record<string, string>;
}

function seedNative(): SeededNative {
  const files: SeededNative["files"] = {};
  const opened: SeededNative["opened"] = {};
  for (const groove of LIBRARY) {
    const when = new Date(CAPTURE_DATE.getTime() - groove.daysAgo * 86_400_000);
    const project = buildStarterProject(groove.starter, {
      name: groove.name,
      now: when,
      ...(groove.bpm === undefined ? {} : { bpm: groove.bpm }),
      ...(groove.key === undefined ? {} : { key: groove.key }),
    });
    project.tags = groove.tags;
    project.favorite = groove.favorite ?? false;
    const file = `${ROOT}/${groove.name}.phyllo`;
    files[file] = { content: serializeProject(project), modifiedMs: when.getTime() };
    if (groove.openedDaysAgo !== undefined) {
      opened[file] = new Date(CAPTURE_DATE.getTime() - groove.openedDaysAgo * 86_400_000 - 3_600_000).toISOString();
    }
  }
  return { files, opened };
}

export interface SetupOptions {
  theme?: Exclude<ThemeMode, "system">;
  accent?: Accent;
  uiMode?: UiMode;
  /** Seed the groove library (default true). */
  library?: boolean;
  /** Reopen this groove at launch (lands on Arrange). Default "Night Bus"; null lands on the Library/Guided start. */
  open?: string | null;
  /** Show the tip coach (default false, so it doesn't cover the timeline). */
  tips?: boolean;
  /** Code drawer open state; null follows the mode default. */
  codeDrawer?: boolean | null;
}

/** Seeds settings and the library before the app boots, then loads it and waits for the first screen. */
export async function launch(page: Page, options: SetupOptions = {}): Promise<void> {
  const { theme = "light", accent = "green", uiMode = "guided", library = true, open = "Night Bus", tips = false, codeDrawer = null } = options;
  const settings = {
    appearance: { mode: theme, accent },
    uiMode,
    tips: { hidden: !tips, step: 1 },
    codeDrawer: { open: codeDrawer },
    system: { mediaKeys: true, menuBar: false, fileAssociations: true, autosave: true, reopenLastProject: open !== null },
  };
  const native: SeededNative = library ? seedNative() : { files: {}, opened: {} };
  const last = open === null ? null : `${ROOT}/${open}.phyllo`;
  await page.addInitScript(
    ([keys, values]) => {
      // Only on the first load of the page, so reloads inside a spec keep what the app wrote since.
      if (window.sessionStorage.getItem("manual.seeded") !== null) return;
      window.sessionStorage.setItem("manual.seeded", "1");
      window.localStorage.clear();
      window.localStorage.setItem(keys[0], values[0]);
      window.localStorage.setItem(keys[1], values[1]);
      if (values[2] !== null) window.localStorage.setItem(keys[2], values[2]);
    },
    [
      [SETTINGS_KEY, NATIVE_KEY, LAST_PROJECT_KEY],
      [JSON.stringify(settings), JSON.stringify(native), last],
    ] as const,
  );
  // Pin the date (time keeps running) so "Today", "Mon"… in the library match the seeded files.
  await page.clock.setSystemTime(CAPTURE_DATE);
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Phyllo is starting" })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset["theme"])).toBe(theme);
  if (open !== null) await expect(page.getByRole("main", { name: "Arrange" })).toBeVisible();
}

/** Clicks somewhere neutral so focus rings don't show up in the capture. */
export async function blur(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

export interface Callout {
  target: Locator;
  /** Badge text. Defaults to the callout's 1-based position. */
  label?: string;
  /** Where the badge sits relative to the box. Default "tl" (top-left corner). */
  badge?: "tl" | "tr" | "bl" | "br" | "left" | "right" | "top" | "bottom";
  /** Extra space around the target, in px. Default 4. */
  pad?: number;
}

export interface AnnotateOptions {
  /** Darken everything outside the callouts. Default true. */
  dim?: boolean;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draws numbered outlines (and an optional spotlight) over the page. Replaces any earlier annotation. */
export async function annotate(page: Page, callouts: readonly Callout[], options: AnnotateOptions = {}): Promise<void> {
  const marks: { box: Box; label: string; badge: NonNullable<Callout["badge"]> }[] = [];
  for (const [index, callout] of callouts.entries()) {
    await expect(callout.target).toBeVisible();
    const box = await callout.target.boundingBox();
    if (box === null) throw new Error(`callout ${index + 1} has no box`);
    const pad = callout.pad ?? 4;
    marks.push({
      box: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
      label: callout.label ?? String(index + 1),
      badge: callout.badge ?? "tl",
    });
  }
  await page.evaluate(
    ({ marks, dim }) => {
      document.getElementById("manual-annotations")?.remove();
      const ns = "http://www.w3.org/2000/svg";
      const width = window.innerWidth;
      const height = window.innerHeight;
      const svg = document.createElementNS(ns, "svg");
      svg.id = "manual-annotations";
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;pointer-events:none");
      const el = (name: string, attrs: Record<string, string | number>, parent: Element = svg) => {
        const node = document.createElementNS(ns, name);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
        parent.appendChild(node);
        return node;
      };
      const ink = "#E8336D";
      if (dim) {
        const mask = el("mask", { id: "manual-spot" }, el("defs", {}));
        el("rect", { x: 0, y: 0, width, height, fill: "white" }, mask);
        for (const { box } of marks) el("rect", { ...box, rx: 8, fill: "black" }, mask);
        el("rect", { x: 0, y: 0, width, height, fill: "rgba(12,16,12,0.42)", mask: "url(#manual-spot)" });
      }
      for (const { box } of marks) {
        el("rect", { ...box, rx: 8, fill: "none", stroke: "white", "stroke-width": 5 });
        el("rect", { ...box, rx: 8, fill: "none", stroke: ink, "stroke-width": 2.5 });
      }
      const r = 13;
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      for (const { box, label, badge } of marks) {
        const right = box.x + box.width;
        const bottom = box.y + box.height;
        const midX = box.x + box.width / 2;
        const midY = box.y + box.height / 2;
        const spots = {
          tl: [box.x, box.y],
          tr: [right, box.y],
          bl: [box.x, bottom],
          br: [right, bottom],
          left: [box.x - r - 6, midY],
          right: [right + r + 6, midY],
          top: [midX, box.y - r - 6],
          bottom: [midX, bottom + r + 6],
        } as const;
        const [cx0, cy0] = spots[badge];
        const cx = clamp(cx0, r + 2, width - r - 2);
        const cy = clamp(cy0, r + 2, height - r - 2);
        el("circle", { cx, cy, r: r + 2, fill: "white" });
        el("circle", { cx, cy, r, fill: ink });
        const text = el("text", {
          x: cx,
          y: cy,
          fill: "white",
          "font-family": "Instrument Sans, system-ui, sans-serif",
          "font-size": label.length > 1 ? 12 : 14,
          "font-weight": 700,
          "text-anchor": "middle",
          "dominant-baseline": "central",
        });
        text.textContent = label;
      }
      document.body.appendChild(svg);
    },
    { marks, dim: options.dim ?? true },
  );
}

export async function clearAnnotations(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById("manual-annotations")?.remove());
}

export interface ShotOptions {
  /** Crop to this element (plus `margin`) instead of the whole window. */
  clip?: Locator;
  /** Space kept around `clip`, in px. Default 16. */
  margin?: number;
}

/** Waits for fonts and transitions, then writes docs/public/screenshots/<name>.png. */
export async function shot(page: Page, name: string, options: ShotOptions = {}): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  if (options.clip === undefined) {
    await page.screenshot({ path: file });
    return;
  }
  const box = await options.clip.boundingBox();
  if (box === null) throw new Error(`${name}: clip target has no box`);
  const margin = options.margin ?? 16;
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  await page.screenshot({
    path: file,
    clip: {
      x,
      y,
      width: Math.min(viewport.width - x, box.width + margin * 2),
      height: Math.min(viewport.height - y, box.height + margin * 2),
    },
  });
}
