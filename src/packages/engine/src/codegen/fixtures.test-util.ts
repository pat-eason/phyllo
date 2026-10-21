// Test fixtures shared by codegen/ and parse/ tests (not a test file itself). All patterns are original.
import type { Project, Track } from "@phyllo/model";

let seq = 0;

export function track(partial: Partial<Track> & Pick<Track, "id">): Track {
  return {
    name: partial.id,
    color: "#7FD98A",
    kind: "drum",
    source: { type: "s", sound: null, bank: null },
    pattern: "bd*4",
    params: {},
    modifiers: [],
    orbit: 1,
    mute: false,
    solo: false,
    clips: [{ id: `c${++seq}`, startBar: 1, endBar: 32 }],
    rawCode: null,
    ...partial,
  };
}

export function project(partial: Partial<Project> = {}): Project {
  return {
    format: "phyllo/1",
    id: "proj",
    name: "Untitled Groove",
    tags: [],
    favorite: false,
    created: "2026-10-21T12:00:00Z",
    modified: "2026-10-21T12:00:00Z",
    tempo: { bpm: 120, beatsPerBar: 4 },
    key: "C minor",
    lengthBars: 32,
    loop: { enabled: false, startBar: 9, endBar: 16 },
    sections: [],
    tracks: [],
    buses: [],
    master: { postgain: 1, limiter: true },
    prelude: [],
    ui: { selectedTrack: null, zoom: 1 },
    ...partial,
  };
}

export const full = (id = "full") => [{ id, startBar: 1, endBar: 32 }];

/** SPEC §4.1 example: kick, bass with a filter sweep, keys. */
export function specExample(): Project {
  return project({
    tracks: [
      track({
        id: "kick",
        kind: "drum",
        source: { type: "s", sound: null, bank: "RolandTR909" },
        pattern: "bd*4",
        params: { gain: 0.82, shape: 0.15 },
      }),
      track({
        id: "bass",
        kind: "melodic",
        source: { type: "note", sound: "sawtooth", bank: null },
        pattern: "<c2 eb2 g2 bb1>*2",
        params: { lpq: 10, shape: 0.3, room: 0.2 },
        modifiers: [{ id: "m1", code: ".lpf(sine.range(400, 1400).slow(8))", enabled: true, origin: "suggestion" }],
      }),
      track({
        id: "keys",
        kind: "chord",
        source: { type: "chord", sound: "gm_epiano1", bank: null },
        pattern: "<Cm7 Fm7 Ab^7 G7>",
        params: { room: 0.5, delay: 0.15 },
      }),
    ],
  });
}

/** Mockup `Main.dc.html` arrangement: sections Intro/Groove/Break/Drop and seven tracks with clips. */
export function arrangeDemo(): Project {
  const c = (startBar: number, endBar: number) => ({ id: `c${++seq}`, startBar, endBar });
  return project({
    loop: { enabled: true, startBar: 9, endBar: 16 },
    sections: [
      { id: "intro", name: "Intro", startBar: 1, endBar: 8 },
      { id: "groove", name: "Groove", startBar: 9, endBar: 16 },
      { id: "break", name: "Break", startBar: 17, endBar: 20 },
      { id: "drop", name: "Drop", startBar: 21, endBar: 32 },
    ],
    buses: [{ orbit: 1, roomsize: 2, delaytime: 0.125, delayfeedback: 0.4 }],
    tracks: [
      track({ id: "kick", source: { type: "s", sound: null, bank: "RolandTR909" }, pattern: "bd*4", params: { gain: 0.82, shape: 0.15 }, clips: [c(9, 16), c(21, 32)] }),
      track({ id: "clap", source: { type: "s", sound: null, bank: "RolandTR909" }, pattern: "~ cp", params: { gain: 0.7, room: 0.25 }, clips: [c(9, 16), c(21, 32)] }),
      track({ id: "hats", source: { type: "s", sound: null, bank: "RolandTR909" }, pattern: "hh*8", params: { gain: "[.45 .7]*4", pan: 0.62 }, clips: [c(1, 8), c(9, 16), c(21, 32)] }),
      track({
        id: "bass",
        kind: "melodic",
        source: { type: "note", sound: "sawtooth", bank: null },
        pattern: "<c2 eb2 g2 bb1>*2",
        params: { lpq: 10, shape: 0.3, room: 0.2 },
        modifiers: [
          { id: "m1", code: ".lpf(sine.range(400, 1400).slow(8))", enabled: true },
          { id: "m2", code: ".sometimes(x => x.ply(2))", enabled: true },
          { id: "m3", code: ".lastOf(4, rev)", enabled: false },
        ],
        clips: [c(9, 16), c(21, 32)],
      }),
      track({ id: "keys", kind: "chord", source: { type: "chord", sound: "gm_epiano1", bank: null }, pattern: "<Cm7 Fm7 Ab^7 G7>", params: { gain: 0.6, room: 0.5, delay: 0.15, pan: 0.42 }, clips: [c(1, 8), c(9, 16), c(17, 20), c(25, 32)] }),
      track({ id: "lead", kind: "melodic", source: { type: "note", sound: "triangle", bank: null }, pattern: "c4 [eb4 g4] ~ bb4", params: { gain: 0.6, delay: 0.5 }, orbit: 2, clips: [c(21, 32)], mute: true }),
      track({ id: "vox", kind: "sample", source: { type: "s", sound: "vox", bank: null }, pattern: "vox", params: { gain: 0.7 }, modifiers: [{ id: "m4", code: ".chop(8)", enabled: true }], clips: [c(17, 20), c(29, 32)] }),
    ],
  });
}
