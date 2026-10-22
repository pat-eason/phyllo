import type { Accent, LibrarySort, LibraryView, ParamName, Settings, ThemeMode, UiMode } from "@phyllo/model";
import { PARAM_ORDER } from "@phyllo/model";

/** Settings of a fresh install (SPEC §6.6, design-system §4). */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  appearance: { mode: "system", accent: "green" },
  uiMode: "guided",
  audio: { outputDevice: null, sampleRate: null, lookaheadMs: 100 },
  midi: { enabledPorts: [], ccMap: {} },
  osc: { enabled: false, host: "127.0.0.1", port: 57120 },
  sampleFolders: [],
  system: { mediaKeys: true, menuBar: false, fileAssociations: true, autosave: true, reopenLastProject: false },
  tips: { hidden: false, step: 1 },
  library: { view: "grid", tileSize: 2, sort: "edited" },
  /** null = follow the mode default (collapsed in Guided, open in Pro, SPEC §6.1). */
  codeDrawer: { open: null },
}) as Settings;

/** A deep copy of the defaults (the frozen constant must never be handed to a store). */
export function defaultSettings(): Settings {
  return structuredClone(DEFAULT_SETTINGS) as Settings;
}

/** A partial update for one top-level key: object sections merge, arrays and scalars replace. */
export type SettingsSectionPatch<K extends keyof Settings> = Settings[K] extends readonly unknown[]
  ? Settings[K]
  : Settings[K] extends object
    ? Partial<Settings[K]>
    : Settings[K];

/** Deep-ish partial of the whole settings model (sections merge one level deep). */
export type SettingsPatch = { [K in keyof Settings]?: SettingsSectionPatch<K> };

const THEME_MODES: readonly ThemeMode[] = ["dark", "light", "system"];
const ACCENTS: readonly Accent[] = ["green", "red", "blue", "purple", "orange", "teal"];
const UI_MODES: readonly UiMode[] = ["guided", "pro"];
const VIEWS: readonly LibraryView[] = ["grid", "list"];
const SORTS: readonly LibrarySort[] = ["edited", "name", "created", "bpm"];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Raw) : {});
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, fallback: string): string => (typeof v === "string" && v.trim() !== "" ? v : fallback);
const strings = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : fallback;
const nullableStr = (v: unknown, fallback: string | null): string | null =>
  v === null ? null : typeof v === "string" ? v : fallback;
const nullableNum = (v: unknown, fallback: number | null): number | null =>
  v === null ? null : typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;

function ccMap(v: unknown, fallback: Settings["midi"]["ccMap"]): Settings["midi"]["ccMap"] {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return fallback;
  const out: Settings["midi"]["ccMap"] = {};
  for (const [key, entry] of Object.entries(v as Raw)) {
    const e = obj(entry);
    const param = e.trackParam;
    if (typeof param === "string" && (PARAM_ORDER as readonly string[]).includes(param) && typeof e.cc === "number") {
      out[key] = { trackParam: param as ParamName, cc: Math.round(num(e.cc, 0, 0, 127)) };
    }
  }
  return out;
}

/**
 * Validates a stored settings blob (`unknown`, possibly from an older version or hand-edited) over `base`.
 * Unknown keys are dropped, wrong types fall back to `base`, numbers are clamped. Never throws.
 */
export function mergeSettings(raw: unknown, base: Settings = defaultSettings()): Settings {
  const r = obj(raw);
  const appearance = obj(r.appearance);
  const audio = obj(r.audio);
  const midi = obj(r.midi);
  const osc = obj(r.osc);
  const system = obj(r.system);
  const tips = obj(r.tips);
  const library = obj(r.library);
  const codeDrawer = obj(r.codeDrawer);
  return {
    appearance: {
      mode: oneOf(appearance.mode, THEME_MODES, base.appearance.mode),
      accent: oneOf(appearance.accent, ACCENTS, base.appearance.accent),
    },
    uiMode: oneOf(r.uiMode, UI_MODES, base.uiMode),
    audio: {
      outputDevice: nullableStr(audio.outputDevice, base.audio.outputDevice),
      sampleRate: nullableNum(audio.sampleRate, base.audio.sampleRate),
      lookaheadMs: Math.round(num(audio.lookaheadMs, base.audio.lookaheadMs, 20, 1000)),
    },
    midi: {
      enabledPorts: strings(midi.enabledPorts, [...base.midi.enabledPorts]),
      ccMap: ccMap(midi.ccMap, { ...base.midi.ccMap }),
    },
    osc: {
      enabled: bool(osc.enabled, base.osc.enabled),
      host: str(osc.host, base.osc.host),
      port: Math.round(num(osc.port, base.osc.port, 1, 65535)),
    },
    sampleFolders: strings(r.sampleFolders, [...base.sampleFolders]),
    system: {
      mediaKeys: bool(system.mediaKeys, base.system.mediaKeys),
      menuBar: bool(system.menuBar, base.system.menuBar),
      fileAssociations: bool(system.fileAssociations, base.system.fileAssociations),
      autosave: bool(system.autosave, base.system.autosave),
      reopenLastProject: bool(system.reopenLastProject, base.system.reopenLastProject),
    },
    tips: {
      hidden: bool(tips.hidden, base.tips.hidden),
      step: Math.round(num(tips.step, base.tips.step, 1, 5)),
    },
    library: {
      view: oneOf(library.view, VIEWS, base.library.view),
      tileSize: Math.round(num(library.tileSize, base.library.tileSize, 0, 4)) as Settings["library"]["tileSize"],
      sort: oneOf(library.sort, SORTS, base.library.sort),
    },
    codeDrawer: {
      open: codeDrawer.open === null || typeof codeDrawer.open === "boolean" ? codeDrawer.open : base.codeDrawer.open,
    },
  };
}

/** Applies a patch (sections merge one level deep) and re-validates the result. */
export function applySettingsPatch(settings: Settings, patch: SettingsPatch): Settings {
  const next: Raw = { ...settings };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (settings as unknown as Raw)[key];
    next[key] =
      typeof current === "object" && current !== null && !Array.isArray(current) && typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...(current as Raw), ...(value as Raw) }
        : value;
  }
  return mergeSettings(next, settings);
}

/** Whether the code drawer is open: the user's explicit choice, else the mode default (open in Pro). */
export function codeDrawerOpen(settings: Pick<Settings, "codeDrawer" | "uiMode">): boolean {
  return settings.codeDrawer.open ?? settings.uiMode === "pro";
}
