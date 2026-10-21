import { DEFAULT_ORBIT, createClip, defaultTrackName, nextTrackColor } from "./factories";
import { newId } from "./ids";
import { PARAM_SPECS, coerceParamValue } from "./params";
import { clampInt, clampRange, placeRange, sanitizeRanges, trimRangesToLength } from "./ranges";
import { isAudible } from "./selectors";
import type { Bus, Clip, Master, Modifier, Project, ProjectAction, Track, TrackSource } from "./types";

/** Reducer limits. Deliberately wide for tempo/orbit: code the user wrote is never silently rewritten. */
export const LIMITS = {
  bpm: { min: 20, max: 400 },
  beatsPerBar: { min: 1, max: 16 },
  lengthBars: { min: 1, max: 512 },
  orbit: { min: 0, max: 99 },
  zoom: { min: 0.25, max: 8 },
  postgain: { min: 0, max: 2 },
} as const;

/**
 * Pure, immutable project reducer. Handles every `ProjectAction`; an unknown action, an unknown id or a
 * change that alters nothing returns the *same object* (cheap equality for React).
 *
 * Policies:
 * - Clips and sections never overlap and are kept sorted. The item being added/moved/resized WINS:
 *   neighbours lose the bars it covers (removed if fully covered; split in two, the right part getting a
 *   derived `<id>~2` id, if it strictly contains the new range). Adjacent ranges are fine.
 * - `clip/split` at `atBar` cuts so the right clip *starts* at `atBar`; valid when `startBar < atBar <= endBar`.
 * - `track/setParam` clamps and rounds to the param spec and removes the key for `null`, `""` or the Strudel default.
 * - `code/replace` is the only action that mints ids (via `newId`): for unmatched tracks and new clips.
 * - An action carrying a bar number or a length that isn't finite (NaN, ±Infinity) returns the project unchanged.
 * - The reducer never touches `project.modified`; the persistence layer stamps it.
 */
export function projectReducer(project: Project, action: ProjectAction): Project {
  switch (action.type) {
    case "project/load":
      return action.project;
    case "project/rename":
      return project.name === action.name ? project : { ...project, name: action.name };
    case "project/setTags": {
      const tags = [...new Set(action.tags.map((t) => t.trim()).filter((t) => t !== ""))];
      return sameStrings(tags, project.tags) ? project : { ...project, tags };
    }
    case "project/setFavorite":
      return project.favorite === action.favorite ? project : { ...project, favorite: action.favorite };
    case "project/setKey":
      return project.key === action.key ? project : { ...project, key: action.key };
    case "project/setLength":
      return setLength(project, action.lengthBars);
    case "tempo/set":
      return setTempo(project, action.bpm, action.beatsPerBar);
    case "loop/set":
      if (!finite(action.startBar, action.endBar)) return project;
      return setLoop(project, action);

    case "section/add": {
      if (!finite(action.section.startBar, action.section.endBar)) return project;
      if (project.sections.some((s) => s.id === action.section.id)) return project;
      const section = clampRange(action.section, project.lengthBars);
      return { ...project, sections: placeRange(project.sections, section) };
    }
    case "section/update": {
      if (!finite(action.patch.startBar, action.patch.endBar)) return project;
      const current = project.sections.find((s) => s.id === action.sectionId);
      if (!current) return project;
      const merged = clampRange({ ...current, ...action.patch, id: current.id }, project.lengthBars);
      if (shallowEqual(merged, current)) return project;
      const others = project.sections.filter((s) => s.id !== current.id);
      return { ...project, sections: placeRange(others, merged) };
    }
    case "section/remove": {
      const sections = project.sections.filter((s) => s.id !== action.sectionId);
      return sections.length === project.sections.length ? project : { ...project, sections };
    }

    case "track/add": {
      if (project.tracks.some((t) => t.id === action.track.id) || !finiteRanges(action.track.clips)) return project;
      const track = { ...action.track, clips: sanitizeRanges(action.track.clips, project.lengthBars) };
      const tracks = project.tracks.slice();
      const index = action.index === undefined ? tracks.length : clampInt(action.index, 0, tracks.length);
      tracks.splice(index, 0, track);
      return { ...project, tracks };
    }
    case "track/remove": {
      const tracks = project.tracks.filter((t) => t.id !== action.trackId);
      if (tracks.length === project.tracks.length) return project;
      const ui = project.ui.selectedTrack === action.trackId ? { ...project.ui, selectedTrack: null } : project.ui;
      return { ...project, tracks, ui };
    }
    case "track/update":
      if (action.patch.clips && !finiteRanges(action.patch.clips)) return project;
      return mapTrack(project, action.trackId, (t) => {
        const next: Track = { ...t, ...action.patch, id: t.id };
        if (action.patch.clips) next.clips = sanitizeRanges(action.patch.clips, project.lengthBars);
        if (action.patch.orbit !== undefined) next.orbit = clampOrbit(action.patch.orbit);
        return shallowEqual(next, t) ? t : next;
      });
    case "track/move": {
      const from = project.tracks.findIndex((t) => t.id === action.trackId);
      if (from < 0) return project;
      const to = clampInt(action.toIndex, 0, project.tracks.length - 1);
      if (to === from) return project;
      const tracks = project.tracks.slice();
      const [moved] = tracks.splice(from, 1);
      if (!moved) return project;
      tracks.splice(to, 0, moved);
      return { ...project, tracks };
    }
    case "track/setParam":
      return mapTrack(project, action.trackId, (t) => {
        const value = coerceParamValue(action.param, action.value);
        if (value === undefined) return t; // unusable (NaN, ±Infinity)
        const had = Object.hasOwn(t.params, action.param);
        if (value === null) {
          if (!had) return t;
          const params = { ...t.params };
          delete params[action.param];
          return { ...t, params };
        }
        if (had && t.params[action.param] === value) return t;
        return { ...t, params: { ...t.params, [action.param]: value } };
      });
    case "track/setPattern":
      return mapTrack(project, action.trackId, (t) => (t.pattern === action.pattern ? t : { ...t, pattern: action.pattern }));
    case "track/setSource":
      return mapTrack(project, action.trackId, (t) => {
        const source = { ...t.source, ...action.source };
        if (shallowEqual(source, t.source)) return t;
        const pattern = patternForSound(t, source);
        return pattern === t.pattern ? { ...t, source } : { ...t, source, pattern };
      });
    case "track/setMute":
      return mapTrack(project, action.trackId, (t) => (t.mute === action.mute ? t : { ...t, mute: action.mute }));
    case "track/setSolo":
      return mapTrack(project, action.trackId, (t) => (t.solo === action.solo ? t : { ...t, solo: action.solo }));
    case "track/setOrbit":
      return mapTrack(project, action.trackId, (t) => {
        const orbit = clampOrbit(action.orbit);
        return t.orbit === orbit ? t : { ...t, orbit };
      });

    case "modifier/add":
      return mapTrack(project, action.trackId, (t) => {
        if (t.modifiers.some((m) => m.id === action.modifier.id)) return t;
        const modifiers = t.modifiers.slice();
        const index = action.index === undefined ? modifiers.length : clampInt(action.index, 0, modifiers.length);
        modifiers.splice(index, 0, action.modifier);
        return { ...t, modifiers };
      });
    case "modifier/remove":
      return mapTrack(project, action.trackId, (t) => {
        const modifiers = t.modifiers.filter((m) => m.id !== action.modifierId);
        return modifiers.length === t.modifiers.length ? t : { ...t, modifiers };
      });
    case "modifier/update":
      return mapTrack(project, action.trackId, (t) => {
        const idx = t.modifiers.findIndex((m) => m.id === action.modifierId);
        const current = t.modifiers[idx];
        if (!current) return t;
        const next: Modifier = { ...current, ...action.patch, id: current.id };
        if (shallowEqual(next, current)) return t;
        const modifiers = t.modifiers.slice();
        modifiers[idx] = next;
        return { ...t, modifiers };
      });
    case "modifier/move":
      return mapTrack(project, action.trackId, (t) => {
        const from = t.modifiers.findIndex((m) => m.id === action.modifierId);
        if (from < 0) return t;
        const to = clampInt(action.toIndex, 0, t.modifiers.length - 1);
        if (to === from) return t;
        const modifiers = t.modifiers.slice();
        const [moved] = modifiers.splice(from, 1);
        if (!moved) return t;
        modifiers.splice(to, 0, moved);
        return { ...t, modifiers };
      });

    case "clip/add":
      if (!finite(action.clip.startBar, action.clip.endBar)) return project;
      return mapTrack(project, action.trackId, (t) => {
        if (t.clips.some((c) => c.id === action.clip.id)) return t;
        return { ...t, clips: placeRange(t.clips, clampRange(action.clip, project.lengthBars)) };
      });
    case "clip/update":
      if (!finite(action.patch.startBar, action.patch.endBar)) return project;
      return mapTrack(project, action.trackId, (t) => {
        const current = t.clips.find((c) => c.id === action.clipId);
        if (!current) return t;
        const merged = clampRange({ ...current, ...action.patch, id: current.id }, project.lengthBars);
        if (shallowEqual(merged, current)) return t;
        return { ...t, clips: placeRange(t.clips.filter((c) => c.id !== current.id), merged) };
      });
    case "clip/split":
      if (!finite(action.atBar)) return project;
      return mapTrack(project, action.trackId, (t) => {
        const clip = t.clips.find((c) => c.id === action.clipId);
        const at = Math.round(action.atBar);
        if (!clip || !(clip.startBar < at && at <= clip.endBar)) return t;
        if (t.clips.some((c) => c.id === action.newClipId)) return t;
        const left: Clip = { ...clip, endBar: at - 1 };
        const right: Clip = { ...clip, id: action.newClipId, startBar: at };
        const clips = t.clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c]));
        return { ...t, clips };
      });
    case "clip/remove":
      return mapTrack(project, action.trackId, (t) => {
        const clips = t.clips.filter((c) => c.id !== action.clipId);
        return clips.length === t.clips.length ? t : { ...t, clips };
      });

    case "bus/set":
      return setBus(project, action.orbit, action.patch);
    case "master/set":
      return setMaster(project, action.patch);

    case "code/replace": {
      const sized = action.lengthBars === undefined ? project : setLength(project, action.lengthBars);
      const replaced = replaceFromCode(sized, action.tracks, action.prelude, action.tempo);
      const buses = action.buses ?? replaced.buses;
      const master = action.master ? { ...replaced.master, ...action.master } : replaced.master;
      return buses === replaced.buses && master === replaced.master ? replaced : { ...replaced, buses, master };
    }

    case "ui/select": {
      const id = action.trackId !== null && project.tracks.some((t) => t.id === action.trackId) ? action.trackId : null;
      return project.ui.selectedTrack === id ? project : { ...project, ui: { ...project.ui, selectedTrack: id } };
    }
    case "ui/setZoom": {
      if (!Number.isFinite(action.zoom)) return project;
      const zoom = Math.min(LIMITS.zoom.max, Math.max(LIMITS.zoom.min, action.zoom));
      return project.ui.zoom === zoom ? project : { ...project, ui: { ...project.ui, zoom } };
    }
    default:
      return unknownAction(project, action);
  }
}

/** Compile-time exhaustiveness check; at runtime an unknown action leaves the project untouched. */
function unknownAction(project: Project, _action: never): Project {
  return project;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function mapTrack(project: Project, trackId: string, fn: (t: Track) => Track): Project {
  const idx = project.tracks.findIndex((t) => t.id === trackId);
  const current = project.tracks[idx];
  if (!current) return project;
  const next = fn(current);
  if (next === current) return project;
  const tracks = project.tracks.slice();
  tracks[idx] = next;
  return { ...project, tracks };
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const ak = Object.keys(a) as (keyof T)[];
  const bk = Object.keys(b) as (keyof T)[];
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.hasOwn(b, k) && Object.is(a[k], b[k]));
}

/** True when every given value is a finite number; `undefined` (field not given) is fine. */
function finite(...values: (number | undefined)[]): boolean {
  return values.every((v) => v === undefined || Number.isFinite(v));
}

function finiteRanges(items: readonly { startBar: number; endBar: number }[]): boolean {
  return items.every((c) => Number.isFinite(c.startBar) && Number.isFinite(c.endBar));
}

/** Mini-notation name tokens (`"vox:2 [~ vox]*2"` → `vox`, `vox`); same rule as the engine's `soundTokens`. */
const NAME_TOKEN = /[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * `track/setSource` on a track whose sound *is* its pattern (`sample`, or melodic with `source.type "s"`,
 * both emitted as `s(pattern)`): the pattern follows the new sound so the code changes too. An empty or
 * rest-only pattern becomes the sound; one whose every name token is the old sound has them renamed
 * (`vox*2` → `breaks*2`); any other pattern is the user's and stays.
 */
function patternForSound(t: Track, source: TrackSource): string {
  const soundIsPattern = t.kind === "sample" || (t.kind === "melodic" && source.type === "s");
  const next = source.sound;
  if (!soundIsPattern || next === null || next === t.source.sound || !/^[A-Za-z0-9_]+$/.test(next)) return t.pattern;
  const tokens = t.pattern.match(NAME_TOKEN) ?? [];
  if (tokens.length === 0) return next;
  const old = t.source.sound;
  if (old === null || !tokens.every((tok) => tok === old)) return t.pattern;
  return t.pattern.replace(NAME_TOKEN, next);
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

function clampOrbit(orbit: number): number {
  return Number.isFinite(orbit) ? clampInt(orbit, LIMITS.orbit.min, LIMITS.orbit.max) : DEFAULT_ORBIT;
}

function setTempo(project: Project, bpm: number | undefined, beatsPerBar: number | undefined): Project {
  const next = {
    bpm:
      bpm !== undefined && Number.isFinite(bpm)
        ? Math.min(LIMITS.bpm.max, Math.max(LIMITS.bpm.min, bpm))
        : project.tempo.bpm,
    beatsPerBar:
      beatsPerBar !== undefined && Number.isFinite(beatsPerBar)
        ? clampInt(beatsPerBar, LIMITS.beatsPerBar.min, LIMITS.beatsPerBar.max)
        : project.tempo.beatsPerBar,
  };
  return shallowEqual(next, project.tempo) ? project : { ...project, tempo: next };
}

function setLoop(project: Project, action: Extract<ProjectAction, { type: "loop/set" }>): Project {
  const len = project.lengthBars;
  let start = action.startBar !== undefined ? clampInt(action.startBar, 1, len) : project.loop.startBar;
  let end = action.endBar !== undefined ? clampInt(action.endBar, 1, len) : project.loop.endBar;
  if (start > end) {
    if (action.startBar !== undefined && action.endBar === undefined) end = start;
    else if (action.endBar !== undefined && action.startBar === undefined) start = end;
    else [start, end] = [end, start];
  }
  const loop = { enabled: action.enabled ?? project.loop.enabled, startBar: start, endBar: end };
  return shallowEqual(loop, project.loop) ? project : { ...project, loop };
}

function setLength(project: Project, requested: number): Project {
  if (!Number.isFinite(requested)) return project;
  const lengthBars = clampInt(requested, LIMITS.lengthBars.min, LIMITS.lengthBars.max);
  if (lengthBars === project.lengthBars) return project;

  const tracks = project.tracks.map((t) => {
    const clips = trimRangesToLength(t.clips, lengthBars);
    return clips === t.clips ? t : { ...t, clips };
  });
  const loop = {
    ...project.loop,
    startBar: Math.min(project.loop.startBar, lengthBars),
    endBar: Math.min(project.loop.endBar, lengthBars),
  };
  return {
    ...project,
    lengthBars,
    tracks: tracks.some((t, i) => t !== project.tracks[i]) ? tracks : project.tracks,
    sections: trimRangesToLength(project.sections, lengthBars),
    loop,
  };
}

function setBus(project: Project, orbit: number, patch: Partial<Omit<Bus, "orbit">>): Project {
  if (!Number.isFinite(orbit)) return project;
  const o = clampOrbit(orbit);
  const current = project.buses.find((b) => b.orbit === o);
  const next: Bus = { ...(current ?? { orbit: o }) };
  for (const key of ["roomsize", "delaytime", "delayfeedback"] as const) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    if (raw === undefined || raw === null || !Number.isFinite(raw)) {
      delete next[key];
    } else {
      const spec = PARAM_SPECS[key];
      next[key] = Math.round(Math.min(spec.max, Math.max(spec.min, raw)) * 10 ** spec.round) / 10 ** spec.round;
    }
  }
  if (current && shallowEqual(next, current)) return project;
  const buses = project.buses.filter((b) => b.orbit !== o);
  buses.push(next);
  buses.sort((a, b) => a.orbit - b.orbit);
  return { ...project, buses };
}

function setMaster(project: Project, patch: Partial<Master>): Project {
  const next: Master = { ...project.master };
  if (patch.postgain !== undefined && Number.isFinite(patch.postgain)) {
    next.postgain = Math.min(LIMITS.postgain.max, Math.max(LIMITS.postgain.min, patch.postgain));
  }
  if (patch.limiter !== undefined) next.limiter = patch.limiter;
  return shallowEqual(next, project.master) ? project : { ...project, master: next };
}

/** What a track plays, for matching an incoming track to an unchanged existing one. */
function identityKey(t: Track): string {
  if (t.kind === "code") return JSON.stringify([t.kind, (t.rawCode ?? "").trim()]);
  return JSON.stringify([t.kind, t.source.type, t.source.sound, t.source.bank, t.pattern]);
}

const spansKey = (clips: readonly Clip[]) => clips.map((c) => `${c.startBar}-${c.endBar}`).join(",");

/**
 * Pair each incoming track with at most one existing track, in passes over what is still unpaired:
 * (a) same `id`; (b) same `identityKey` (kind + source + pattern, or raw code); (c) an `arrange()`d block
 * whose clips equal the existing track's, same kind first, then any kind (an edited or re-inferred block
 * keeps its arrangement); (d) same `kind`, in order; (e) in order regardless of kind, only when as many
 * incoming as existing tracks remain (an in-place kind change). Deleting or inserting a block therefore
 * doesn't shift identities onto its neighbours.
 */
function matchTracks(existing: readonly Track[], incoming: readonly Track[]): number[] {
  const match: number[] = incoming.map(() => -1);
  const used = new Set<number>();
  const pass = (accept: (inc: Track, e: Track) => boolean) => {
    incoming.forEach((inc, i) => {
      if (match[i] !== -1) return;
      const k = existing.findIndex((e, j) => !used.has(j) && accept(inc, e));
      if (k < 0) return;
      match[i] = k;
      used.add(k);
    });
  };
  pass((inc, e) => inc.id === e.id);
  const keys = new Map(existing.map((e) => [e, identityKey(e)]));
  pass((inc, e) => identityKey(inc) === keys.get(e));
  const sameSpans = (inc: Track, e: Track) => inc.clips.length > 0 && spansKey(inc.clips) === spansKey(e.clips);
  pass((inc, e) => inc.kind === e.kind && sameSpans(inc, e));
  pass(sameSpans);
  pass((inc, e) => inc.kind === e.kind);
  if (match.filter((m) => m === -1).length === existing.length - used.size) pass(() => true);
  return match;
}

/** Incoming clips with valid ranges; an existing clip with the same span keeps its id, others get new ids. */
function adoptClips(incoming: readonly Clip[], existing: readonly Clip[], lengthBars: number): Clip[] {
  const valid = incoming.filter((c) => Number.isFinite(c.startBar) && Number.isFinite(c.endBar));
  const taken = new Set<string>();
  const withIds = valid.map((c) => {
    const same = existing.find((e) => e.startBar === c.startBar && e.endBar === c.endBar && !taken.has(e.id));
    const id = same ? same.id : newId("clip_");
    taken.add(id);
    return { id, startBar: c.startBar, endBar: c.endBar };
  });
  return sanitizeRanges(withIds, lengthBars);
}

/**
 * Merge parsed tracks (code drawer edit, strudel.cc import) into the project. Song-scope code is the truth
 * for what it can express; the model keeps what code can't express.
 * - Matching: see `matchTracks`. Order follows the incoming list; unpaired existing tracks are removed.
 * - A matched track takes the incoming content (source, pattern, params, modifiers, mute, rawCode …) and
 *   keeps its `id`, `color` and `solo` (code can't express solo); its `name` when the incoming one is `""`
 *   (an unlabelled block); its `orbit` when the incoming one is the default 1 (no `.orbit()`) and it
 *   wasn't a code track (whose orbit codegen never writes).
 * - Clips: non-empty incoming clips (the block was wrapped in `arrange()`) win; empty ones mean "no
 *   arrangement in the code", so a matched track keeps its clips (a clip-less one whose block now plays,
 *   `$:`, gets one full-song clip).
 * - Mute: `_$:` on a track that was only silent because another track is soloed, or because it has no clips
 *   (codegen writes both as `_$:`), keeps it unmuted.
 * - Unmatched tracks get a fresh id, the next free colour, `defaultTrackName` when unnamed, and their
 *   incoming clips or one full-song clip.
 */
function replaceFromCode(
  project: Project,
  incoming: readonly Track[],
  prelude: readonly string[],
  tempo: { bpm: number; beatsPerBar: number } | undefined,
): Project {
  const existing = project.tracks;
  const length = project.lengthBars;
  const match = matchTracks(existing, incoming);

  const built: (Track | null)[] = incoming.map((inc, i) => {
    const e = existing[match[i] ?? -1];
    if (!e) return null;
    const hasClips = inc.clips.length > 0;
    const silentOnlyByCodegen = !e.mute && (!isAudible(e, existing) || (e.clips.length === 0 && !hasClips));
    // A clip-less track whose block was changed to a playing `$:` plays the whole song, as the code says.
    const kept = e.clips.length === 0 && !inc.mute ? [createClip(1, length)] : e.clips;
    return {
      ...inc,
      id: e.id,
      name: inc.name === "" ? e.name : inc.name,
      color: e.color,
      clips: hasClips ? adoptClips(inc.clips, e.clips, length) : kept,
      // A code track's orbit never reaches the code, so only a typed track's orbit is "kept from before".
      orbit: inc.orbit === DEFAULT_ORBIT && e.kind !== "code" ? e.orbit : inc.orbit,
      mute: inc.mute && !silentOnlyByCodegen,
      solo: e.solo,
    };
  });
  const settled: Track[] = built.filter((t): t is Track => t !== null);
  const tracks: Track[] = built.map((t, i) => {
    if (t) return t;
    const inc = incoming[i] as Track;
    const clips = adoptClips(inc.clips, [], length);
    const fresh: Track = {
      ...inc,
      id: newId("trk_"),
      name: inc.name === "" ? defaultTrackName(inc.kind, settled) : inc.name,
      color: nextTrackColor(settled),
      clips: clips.length > 0 ? clips : [createClip(1, length)],
    };
    settled.push(fresh);
    return fresh;
  });

  const selected = project.ui.selectedTrack;
  const ui =
    selected !== null && !tracks.some((t) => t.id === selected) ? { ...project.ui, selectedTrack: null } : project.ui;

  const next: Project = { ...project, tracks, prelude: [...prelude], ui };
  return tempo ? setTempo(next, tempo.bpm, tempo.beatsPerBar) : next;
}
