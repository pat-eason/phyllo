import { buildStarterProject } from "@phyllo/model";
import type { Project, StarterId } from "@phyllo/model";
import type { NativeApi } from "../../../native/api";
import { createBrowserApi } from "../../../native/browser";
import { seedLibrary } from "../../../state/mocks";

/** The clock stories and tests pin: Wednesday 2026-10-21, 12:41 local time. */
export const FIXTURE_CLOCK = new Date(2026, 9, 21, 12, 41, 0);

interface GrooveSpec {
  name: string;
  starter: StarterId;
  tags: string[];
  bpm: number;
  key: string;
  lengthBars: number;
  /** Whole days before the fixture clock the groove was last edited. */
  editedDaysAgo: number;
  favorite?: boolean;
  /** Days since it was opened (omit: never opened, so not in Recent). */
  openedDaysAgo?: number;
}

/** Twelve invented grooves built from the starters, varied in name, tags, tempo, key and age. */
const SPECS: readonly GrooveSpec[] = [
  { name: "Untitled Groove", starter: "house", tags: ["house", "sketch"], bpm: 120, key: "C minor", lengthBars: 32, editedDaysAgo: 0, favorite: true, openedDaysAgo: 0 },
  { name: "Night bus", starter: "lofi", tags: ["lo-fi"], bpm: 82, key: "F major", lengthBars: 48, editedDaysAgo: 2, openedDaysAgo: 2 },
  { name: "Tidal study 2", starter: "euclid", tags: ["euclid", "study"], bpm: 110, key: "D dorian", lengthBars: 16, editedDaysAgo: 9, favorite: true, openedDaysAgo: 9 },
  { name: "Slow harbor", starter: "ambient", tags: ["ambient"], bpm: 70, key: "C minor", lengthBars: 64, editedDaysAgo: 11, openedDaysAgo: 30 },
  { name: "Copper pipes", starter: "stage", tags: ["techno", "live set"], bpm: 132, key: "A minor", lengthBars: 96, editedDaysAgo: 12 },
  { name: "Pixel stairs", starter: "euclid", tags: ["chiptune"], bpm: 150, key: "E minor", lengthBars: 40, editedDaysAgo: 14 },
  { name: "Rain on tin", starter: "lofi", tags: ["lo-fi", "sketch"], bpm: 76, key: "B♭ major", lengthBars: 24, editedDaysAgo: 16, favorite: true },
  { name: "Kite season", starter: "ambient", tags: ["ambient", "live set"], bpm: 90, key: "G major", lengthBars: 72, editedDaysAgo: 21 },
  { name: "Static bloom", starter: "breaks", tags: ["breaks"], bpm: 170, key: "F minor", lengthBars: 64, editedDaysAgo: 23 },
  { name: "Glasshouse", starter: "house", tags: ["house", "live set"], bpm: 124, key: "A minor", lengthBars: 128, editedDaysAgo: 30 },
  { name: "Fern loop", starter: "lofi", tags: ["sketch"], bpm: 100, key: "D minor", lengthBars: 8, editedDaysAgo: 33 },
  { name: "Overpass", starter: "breaks", tags: ["breaks", "chiptune"], bpm: 160, key: "C minor", lengthBars: 56, editedDaysAgo: 39 },
];

function daysBefore(days: number): Date {
  const at = new Date(FIXTURE_CLOCK);
  at.setDate(at.getDate() - days);
  return at;
}

/** The fixture grooves as projects (stable ids, so tests can find them). */
export function fixtureGrooves(): Project[] {
  let counter = 0;
  return SPECS.map((spec) => {
    counter += 1;
    const edited = daysBefore(spec.editedDaysAgo);
    const project = buildStarterProject(spec.starter, {
      name: spec.name,
      bpm: spec.bpm,
      key: spec.key,
      now: edited,
      newId: (kind, hint) => (kind === "project" ? `prj_fx_${counter}` : hint),
    });
    return { ...project, tags: spec.tags, favorite: spec.favorite ?? false, lengthBars: spec.lengthBars };
  });
}

/** A browser `NativeApi` whose clock is `FIXTURE_CLOCK` (so "opened" times line up with Recent). */
export function createFixtureNative(): NativeApi {
  return createBrowserApi({ storage: null, requestMidiAccess: null, log: () => {}, now: () => FIXTURE_CLOCK });
}

/** Writes the fixture grooves and marks the recently opened ones. Skips when the library already has files. */
export async function seedFixtureLibrary(native: NativeApi, projects: readonly Project[] = fixtureGrooves()): Promise<void> {
  if ((await native.libraryScan()).entries.length > 0) return;
  const paths = await seedLibrary(native, projects);
  const opened = SPECS.flatMap((spec, index) => (spec.openedDaysAgo !== undefined && spec.openedDaysAgo <= 14 ? [paths[index]] : []));
  for (const path of opened) if (path) await native.libraryMarkOpened(path);
}
