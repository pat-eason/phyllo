import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
  DEFAULT_KEY,
  DEFAULT_LENGTH_BARS,
  DEFAULT_LOOP_BARS,
  DEFAULT_MASTER,
  DEFAULT_ORBIT,
  DEFAULT_PROJECT_NAME,
  PROJECT_FORMAT,
  createClip,
  defaultTrackName,
  nextTrackColor,
} from "./factories";
import { newId } from "./ids";
import { canonicalParam } from "./params";
import { clampInt, sanitizeRanges } from "./ranges";
import { LIMITS } from "./reducer";
import { PARAM_ORDER } from "./types";
import type {
  Bus,
  Clip,
  Master,
  Modifier,
  ModifierOrigin,
  ParamName,
  ParamValue,
  Project,
  Section,
  SourceType,
  Track,
  TrackKind,
  TrackSource,
} from "./types";

// ── serialize ───────────────────────────────────────────────────────────────

function orderedParams(params: Track["params"]): Track["params"] {
  const out: Track["params"] = {};
  for (const name of PARAM_ORDER) {
    const v = params[name];
    if (v !== undefined) out[name] = v;
  }
  return out;
}

function orderedModifier(m: Modifier): Modifier {
  return {
    id: m.id,
    code: m.code,
    ...(m.label !== undefined ? { label: m.label } : {}),
    enabled: m.enabled,
    ...(m.origin !== undefined ? { origin: m.origin } : {}),
  };
}

function orderedTrack(t: Track): Track {
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    kind: t.kind,
    source: { type: t.source.type, sound: t.source.sound, bank: t.source.bank },
    pattern: t.pattern,
    params: orderedParams(t.params),
    modifiers: t.modifiers.map(orderedModifier),
    orbit: t.orbit,
    mute: t.mute,
    solo: t.solo,
    clips: t.clips.map((c) => ({ id: c.id, startBar: c.startBar, endBar: c.endBar })),
    rawCode: t.rawCode,
  };
}

function orderedBus(b: Bus): Bus {
  const out: Bus = { orbit: b.orbit };
  if (b.roomsize !== undefined) out.roomsize = b.roomsize;
  if (b.delaytime !== undefined) out.delaytime = b.delaytime;
  if (b.delayfeedback !== undefined) out.delayfeedback = b.delayfeedback;
  return out;
}

/** Stable-key-order, 2-space JSON with a trailing newline (diff-friendly `.phyllo` file). */
export function serializeProject(p: Project): string {
  const ordered: Project = {
    format: p.format,
    id: p.id,
    name: p.name,
    tags: [...p.tags],
    favorite: p.favorite,
    created: p.created,
    modified: p.modified,
    tempo: { bpm: p.tempo.bpm, beatsPerBar: p.tempo.beatsPerBar },
    key: p.key,
    lengthBars: p.lengthBars,
    loop: { enabled: p.loop.enabled, startBar: p.loop.startBar, endBar: p.loop.endBar },
    sections: p.sections.map((s) => ({ id: s.id, name: s.name, startBar: s.startBar, endBar: s.endBar })),
    tracks: p.tracks.map(orderedTrack),
    buses: p.buses.map(orderedBus),
    master: { postgain: p.master.postgain, limiter: p.master.limiter },
    prelude: [...p.prelude],
    ui: { selectedTrack: p.ui.selectedTrack, zoom: p.ui.zoom },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

// ── migration ───────────────────────────────────────────────────────────────

export const CURRENT_FORMAT_VERSION = 1;

type RawObject = Record<string, unknown>;
/** Upgrades a raw file object from version N to N+1 (and should set nothing but its content; `migrate` rewrites `format`). */
export type Migration = (raw: RawObject) => RawObject;

/** Migrations keyed by the version they upgrade *from*. Empty while `phyllo/1` is the only format. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type MigrateResult = { ok: true; raw: RawObject } | { ok: false; error: string };

/** Walk `raw` from its declared `format` version up to `target`, or explain why that's impossible. */
export function migrate(
  raw: RawObject,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = CURRENT_FORMAT_VERSION,
): MigrateResult {
  const declared = raw.format;
  if (typeof declared !== "string") return { ok: false, error: 'Missing "format" field: this is not a .phyllo project file.' };
  const m = /^phyllo\/(\d+)$/.exec(declared);
  if (!m) return { ok: false, error: `Unsupported format "${declared}": expected "phyllo/${target}".` };
  let version = Number(m[1]);
  if (version > target) {
    return { ok: false, error: `This project was saved by a newer Phyllo (format "${declared}"); update Phyllo to open it.` };
  }
  let current = raw;
  while (version < target) {
    const step = migrations[version];
    if (!step) return { ok: false, error: `No migration from format "phyllo/${version}".` };
    current = step(current);
    version += 1;
  }
  return { ok: true, raw: { ...current, format: `phyllo/${target}` } };
}

// ── parse ───────────────────────────────────────────────────────────────────

export type ParseProjectResult =
  | { ok: true; project: Project; warnings: string[] }
  | { ok: false; error: string };

const KINDS: readonly TrackKind[] = ["drum", "melodic", "chord", "sample", "code"];
const SOURCE_TYPES: readonly SourceType[] = ["s", "note", "n", "chord"];
const ORIGINS: readonly ModifierOrigin[] = ["suggestion", "feel", "user", "parsed"];
const TOP_LEVEL_KEYS = new Set([
  "format", "id", "name", "tags", "favorite", "created", "modified", "tempo", "key", "lengthBars",
  "loop", "sections", "tracks", "buses", "master", "prelude", "ui",
]);
const KIND_SOURCES: Record<TrackKind, TrackSource> = {
  drum: { type: "s", sound: null, bank: "RolandTR909" },
  melodic: { type: "note", sound: "sawtooth", bank: null },
  chord: { type: "chord", sound: "gm_epiano1", bank: null },
  sample: { type: "s", sound: null, bank: null },
  code: { type: "s", sound: null, bank: null },
};

const isObj = (v: unknown): v is RawObject => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * Validate and load a `.phyllo` file by hand (no deps). Hard errors: not JSON, not an object, missing /
 * wrong / newer `format`, `tracks` present but not an array. Everything else is coerced to a valid project
 * and reported in `warnings`; missing optional fields are filled with defaults silently.
 */
export function parseProjectFile(text: string): ParseProjectResult {
  let json: unknown;
  try {
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isObj(json)) return { ok: false, error: "Expected a JSON object at the top level." };
  const migrated = migrate(json);
  if (!migrated.ok) return migrated;
  const raw = migrated.raw;
  if (raw.tracks !== undefined && !Array.isArray(raw.tracks)) return { ok: false, error: '"tracks" must be an array.' };

  const warnings: string[] = [];
  const warn = (msg: string): void => {
    warnings.push(msg);
  };
  for (const key of Object.keys(raw)) if (!TOP_LEVEL_KEYS.has(key)) warn(`Ignored unknown field "${key}".`);

  // tempo
  const tempoRaw = isObj(raw.tempo) ? raw.tempo : {};
  let bpm = DEFAULT_BPM;
  if (tempoRaw.bpm !== undefined) {
    if (isNum(tempoRaw.bpm) && tempoRaw.bpm >= LIMITS.bpm.min && tempoRaw.bpm <= LIMITS.bpm.max) bpm = tempoRaw.bpm;
    else warn(`Invalid tempo.bpm; using ${DEFAULT_BPM}.`);
  }
  let beatsPerBar = DEFAULT_BEATS_PER_BAR;
  if (tempoRaw.beatsPerBar !== undefined) {
    if (isNum(tempoRaw.beatsPerBar) && tempoRaw.beatsPerBar >= 1 && tempoRaw.beatsPerBar <= LIMITS.beatsPerBar.max) {
      beatsPerBar = Math.round(tempoRaw.beatsPerBar);
    } else warn(`Invalid tempo.beatsPerBar; using ${DEFAULT_BEATS_PER_BAR}.`);
  }

  // length: declared, else the furthest clip/section end, else the default
  let lengthBars = 0;
  if (raw.lengthBars !== undefined) {
    if (isNum(raw.lengthBars) && raw.lengthBars >= 1) lengthBars = clampInt(raw.lengthBars, 1, LIMITS.lengthBars.max);
    else warn("Invalid lengthBars; inferring from content.");
  }
  if (lengthBars === 0) lengthBars = inferLength(raw);

  const tracks = parseTracks(raw.tracks, lengthBars, warn);
  const sections = parseSections(raw.sections, lengthBars, warn);

  const loopRaw = isObj(raw.loop) ? raw.loop : {};
  const defaultEnd = Math.min(DEFAULT_LOOP_BARS, lengthBars);
  let loopStart = isNum(loopRaw.startBar) ? clampInt(loopRaw.startBar, 1, lengthBars) : 1;
  let loopEnd = isNum(loopRaw.endBar) ? clampInt(loopRaw.endBar, 1, lengthBars) : defaultEnd;
  if (loopStart > loopEnd) [loopStart, loopEnd] = [loopEnd, loopStart];
  const loop = { enabled: typeof loopRaw.enabled === "boolean" ? loopRaw.enabled : true, startBar: loopStart, endBar: loopEnd };

  const masterRaw = isObj(raw.master) ? raw.master : {};
  const master: Master = {
    postgain: isNum(masterRaw.postgain)
      ? Math.min(LIMITS.postgain.max, Math.max(LIMITS.postgain.min, masterRaw.postgain))
      : DEFAULT_MASTER.postgain,
    limiter: typeof masterRaw.limiter === "boolean" ? masterRaw.limiter : DEFAULT_MASTER.limiter,
  };

  const uiRaw = isObj(raw.ui) ? raw.ui : {};
  const selected = isStr(uiRaw.selectedTrack) && tracks.some((t) => t.id === uiRaw.selectedTrack) ? uiRaw.selectedTrack : null;

  const created = isValidDate(raw.created) ? raw.created : new Date().toISOString();
  const project: Project = {
    format: PROJECT_FORMAT,
    id: isStr(raw.id) && raw.id !== "" ? raw.id : fallbackId(warn),
    name: isStr(raw.name) ? raw.name : DEFAULT_PROJECT_NAME,
    tags: stringArray(raw.tags, "tags", warn),
    favorite: raw.favorite === true,
    created,
    modified: isValidDate(raw.modified) ? raw.modified : created,
    tempo: { bpm, beatsPerBar },
    key: isStr(raw.key) && raw.key !== "" ? raw.key : DEFAULT_KEY,
    lengthBars,
    loop,
    sections,
    tracks,
    buses: parseBuses(raw.buses, warn),
    master,
    prelude: stringArray(raw.prelude, "prelude", warn),
    ui: { selectedTrack: selected, zoom: isNum(uiRaw.zoom) && uiRaw.zoom > 0 ? uiRaw.zoom : 1 },
  };
  return { ok: true, project, warnings };
}

function fallbackId(warn: (m: string) => void): string {
  warn("Missing project id; generated a new one.");
  return newId("prj_");
}

function isValidDate(v: unknown): v is string {
  return isStr(v) && !Number.isNaN(Date.parse(v));
}

function stringArray(v: unknown, field: string, warn: (m: string) => void): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    warn(`Ignored non-array "${field}".`);
    return [];
  }
  const out = v.filter(isStr);
  if (out.length !== v.length) warn(`Dropped non-string entries from "${field}".`);
  return out;
}

function inferLength(raw: RawObject): number {
  let max = 0;
  const scan = (items: unknown): void => {
    if (!Array.isArray(items)) return;
    for (const it of items) if (isObj(it) && isNum(it.endBar)) max = Math.max(max, it.endBar);
  };
  scan(raw.sections);
  if (Array.isArray(raw.tracks)) for (const t of raw.tracks) if (isObj(t)) scan(t.clips);
  return max > 0 ? clampInt(max, 1, LIMITS.lengthBars.max) : DEFAULT_LENGTH_BARS;
}

function parseSections(v: unknown, lengthBars: number, warn: (m: string) => void): Section[] {
  if (v === undefined) return [{ id: "song", name: "Song", startBar: 1, endBar: lengthBars }];
  if (!Array.isArray(v)) {
    warn('Ignored non-array "sections".');
    return [];
  }
  const out: Section[] = [];
  v.forEach((s, i) => {
    if (!isObj(s) || !isNum(s.startBar) || !isNum(s.endBar)) {
      warn(`Dropped invalid section #${i + 1}.`);
      return;
    }
    const id = isStr(s.id) && s.id !== "" && !out.some((o) => o.id === s.id) ? s.id : `section-${i + 1}`;
    out.push({ id, name: isStr(s.name) ? s.name : `Section ${i + 1}`, startBar: s.startBar, endBar: s.endBar });
  });
  const fixed = sanitizeRanges(out, lengthBars);
  if (!sameRanges(fixed, out)) warn("Adjusted sections (clamped to the song, sorted, overlaps trimmed).");
  return fixed;
}

function sameRanges(a: readonly Section[], b: readonly Section[]): boolean {
  return a.length === b.length && a.every((s, i) => s.startBar === b[i]?.startBar && s.endBar === b[i]?.endBar && s.id === b[i]?.id);
}

function parseBuses(v: unknown, warn: (m: string) => void): Bus[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    warn('Ignored non-array "buses".');
    return [];
  }
  const out: Bus[] = [];
  for (const [i, b] of v.entries()) {
    if (!isObj(b) || !isNum(b.orbit)) {
      warn(`Dropped invalid bus #${i + 1}.`);
      continue;
    }
    const orbit = clampInt(b.orbit, LIMITS.orbit.min, LIMITS.orbit.max);
    if (out.some((o) => o.orbit === orbit)) {
      warn(`Dropped duplicate bus for orbit ${orbit}.`);
      continue;
    }
    const bus: Bus = { orbit };
    if (isNum(b.roomsize)) bus.roomsize = b.roomsize;
    if (isNum(b.delaytime)) bus.delaytime = b.delaytime;
    if (isNum(b.delayfeedback)) bus.delayfeedback = b.delayfeedback;
    out.push(bus);
  }
  return out.sort((a, b) => a.orbit - b.orbit);
}

function parseTracks(v: unknown, lengthBars: number, warn: (m: string) => void): Track[] {
  if (v === undefined) return [];
  const list = v as unknown[];
  const out: Track[] = [];
  list.forEach((t, i) => {
    const track = parseTrack(t, i, out, lengthBars, warn);
    if (track) out.push(track);
  });
  return out;
}

function parseTrack(
  t: unknown,
  index: number,
  previous: readonly Track[],
  lengthBars: number,
  warn: (m: string) => void,
): Track | null {
  const label = `track #${index + 1}`;
  if (!isObj(t)) {
    warn(`Dropped ${label}: not an object.`);
    return null;
  }

  let kind: TrackKind;
  if (KINDS.includes(t.kind as TrackKind)) {
    kind = t.kind as TrackKind;
  } else if (isStr(t.rawCode)) {
    kind = "code";
    warn(`${label}: unknown kind; treated as a code track.`);
  } else {
    warn(`Dropped ${label}: unknown kind ${JSON.stringify(t.kind)}.`);
    return null;
  }

  let id = isStr(t.id) && t.id !== "" ? t.id : `track-${index + 1}`;
  if (previous.some((p) => p.id === id)) {
    warn(`${label}: duplicate id "${id}"; renamed.`);
    let n = 2;
    while (previous.some((p) => p.id === `${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }

  const srcRaw = isObj(t.source) ? t.source : {};
  const fallback = KIND_SOURCES[kind];
  const source: TrackSource = {
    type: SOURCE_TYPES.includes(srcRaw.type as SourceType) ? (srcRaw.type as SourceType) : fallback.type,
    sound: isStr(srcRaw.sound) ? srcRaw.sound : srcRaw.sound === null ? null : fallback.sound,
    bank: isStr(srcRaw.bank) ? srcRaw.bank : srcRaw.bank === null ? null : fallback.bank,
  };

  const color =
    isStr(t.color) && /^#[0-9a-f]{6}$/i.test(t.color)
      ? t.color
      : (warn(`${label}: missing or invalid color; picked one.`), nextTrackColor(previous));

  return {
    id,
    name: isStr(t.name) && t.name !== "" ? t.name : defaultTrackName(kind, previous),
    color,
    kind,
    source,
    pattern: isStr(t.pattern) ? t.pattern : "",
    params: parseParams(t.params, label, warn),
    modifiers: parseModifiers(t.modifiers, id, label, warn),
    orbit: isNum(t.orbit) ? clampInt(t.orbit, LIMITS.orbit.min, LIMITS.orbit.max) : DEFAULT_ORBIT,
    mute: t.mute === true,
    solo: t.solo === true,
    clips: parseClips(t.clips, id, lengthBars, label, warn),
    rawCode: kind === "code" ? (isStr(t.rawCode) ? t.rawCode : "silence") : null,
  };
}

function parseParams(v: unknown, label: string, warn: (m: string) => void): Partial<Record<ParamName, ParamValue>> {
  const out: Partial<Record<ParamName, ParamValue>> = {};
  if (v === undefined || v === null) return out;
  if (!isObj(v)) {
    warn(`${label}: ignored non-object params.`);
    return out;
  }
  for (const [key, value] of Object.entries(v)) {
    const name = canonicalParam(key);
    if (!name) {
      warn(`${label}: dropped unknown param "${key}".`);
    } else if (value === null || value === undefined) {
      continue;
    } else if (isNum(value) || (isStr(value) && value.trim() !== "")) {
      out[name] = value;
    } else {
      warn(`${label}: dropped invalid value for param "${key}".`);
    }
  }
  return orderedParams(out);
}

function parseModifiers(v: unknown, trackId: string, label: string, warn: (m: string) => void): Modifier[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    warn(`${label}: ignored non-array modifiers.`);
    return [];
  }
  const out: Modifier[] = [];
  v.forEach((m, j) => {
    if (!isObj(m) || !isStr(m.code) || m.code.trim() === "") {
      warn(`${label}: dropped invalid modifier #${j + 1}.`);
      return;
    }
    let id = isStr(m.id) && m.id !== "" ? m.id : `${trackId}:m${j + 1}`;
    if (out.some((o) => o.id === id)) id = `${trackId}:m${j + 1}`;
    const mod: Modifier = { id, code: m.code, enabled: m.enabled !== false };
    if (isStr(m.label)) mod.label = m.label;
    if (ORIGINS.includes(m.origin as ModifierOrigin)) mod.origin = m.origin as ModifierOrigin;
    out.push(mod);
  });
  return out;
}

function parseClips(
  v: unknown,
  trackId: string,
  lengthBars: number,
  label: string,
  warn: (m: string) => void,
): Clip[] {
  if (v === undefined) return [createClip(1, lengthBars, `${trackId}:c1`)];
  if (!Array.isArray(v)) {
    warn(`${label}: ignored non-array clips; using a full-song clip.`);
    return [createClip(1, lengthBars, `${trackId}:c1`)];
  }
  const clips: Clip[] = [];
  v.forEach((c, j) => {
    if (!isObj(c) || !isNum(c.startBar) || !isNum(c.endBar)) {
      warn(`${label}: dropped invalid clip #${j + 1}.`);
      return;
    }
    let id = isStr(c.id) && c.id !== "" ? c.id : `${trackId}:c${j + 1}`;
    if (clips.some((o) => o.id === id)) id = `${trackId}:c${j + 1}`;
    clips.push({ id, startBar: c.startBar, endBar: c.endBar });
  });
  const fixed = sanitizeRanges(clips, lengthBars);
  if (fixed.length !== clips.length || fixed.some((c, i) => c.id !== clips[i]?.id || c.startBar !== clips[i]?.startBar || c.endBar !== clips[i]?.endBar)) {
    warn(`${label}: adjusted clips (clamped to the song, sorted, overlaps trimmed).`);
  }
  return fixed;
}
