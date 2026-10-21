import { DEFAULT_ORBIT, createClip, isGenericTrackName, nextTrackColor } from "./factories";
import { newId } from "./ids";
import { PARAM_SPECS, coerceParamValue } from "./params";
import { clampInt, clampRange, placeRange, sanitizeRanges, trimRangesToLength } from "./ranges";
import type { Bus, Clip, Master, Modifier, Project, ProjectAction, Track } from "./types";

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
 * - `code/replace` is the only action that mints ids (via `newId`), and only for tracks with no match.
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
      return setLoop(project, action);

    case "section/add": {
      if (project.sections.some((s) => s.id === action.section.id)) return project;
      const section = clampRange(action.section, project.lengthBars);
      return { ...project, sections: placeRange(project.sections, section) };
    }
    case "section/update": {
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
      if (project.tracks.some((t) => t.id === action.track.id)) return project;
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
        return shallowEqual(source, t.source) ? t : { ...t, source };
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
      return mapTrack(project, action.trackId, (t) => {
        if (t.clips.some((c) => c.id === action.clip.id)) return t;
        return { ...t, clips: placeRange(t.clips, clampRange(action.clip, project.lengthBars)) };
      });
    case "clip/update":
      return mapTrack(project, action.trackId, (t) => {
        const current = t.clips.find((c) => c.id === action.clipId);
        if (!current) return t;
        const merged = clampRange({ ...current, ...action.patch, id: current.id }, project.lengthBars);
        if (shallowEqual(merged, current)) return t;
        return { ...t, clips: placeRange(t.clips.filter((c) => c.id !== current.id), merged) };
      });
    case "clip/split":
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

/**
 * Merge parsed tracks (code drawer edit, strudel.cc import) into the project.
 * Matching: by `id` first, then by position with the same `kind`. A matched track takes the incoming
 * content (source, pattern, params, modifiers, mute, rawCode …) but keeps its `id`, `color`, `clips`,
 * `solo` (code cannot express solo), its `name` when the incoming name is generic (`isGenericTrackName`)
 * and its `orbit` when the incoming one is the default (1, i.e. the code had no `.orbit()`).
 * Unmatched incoming tracks get a fresh id, the next free colour and one full-song clip.
 * Tracks missing from the incoming list are removed; order follows the incoming list.
 */
function replaceFromCode(
  project: Project,
  incoming: readonly Track[],
  prelude: readonly string[],
  tempo: { bpm: number; beatsPerBar: number } | undefined,
): Project {
  const existing = project.tracks;
  const used = new Set<number>();
  const match: number[] = incoming.map(() => -1);

  incoming.forEach((inc, i) => {
    const e = existing.findIndex((t, k) => t.id === inc.id && !used.has(k));
    if (e >= 0) {
      match[i] = e;
      used.add(e);
    }
  });
  incoming.forEach((inc, i) => {
    if (match[i] !== -1) return;
    const e = existing[i];
    if (e && !used.has(i) && e.kind === inc.kind) {
      match[i] = i;
      used.add(i);
    }
  });

  const built: (Track | null)[] = incoming.map((inc, i) => {
    const e = existing[match[i] ?? -1];
    if (!e) return null;
    return {
      ...inc,
      id: e.id,
      name: isGenericTrackName(inc.name) ? e.name : inc.name,
      color: e.color,
      clips: e.clips,
      orbit: inc.orbit === DEFAULT_ORBIT ? e.orbit : inc.orbit,
      solo: e.solo,
    };
  });
  const settled: Track[] = built.filter((t): t is Track => t !== null);
  const tracks: Track[] = built.map((t, i) => {
    if (t) return t;
    const inc = incoming[i] as Track;
    const fresh: Track = {
      ...inc,
      id: newId("trk_"),
      color: nextTrackColor(settled),
      clips: [createClip(1, project.lengthBars)],
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
