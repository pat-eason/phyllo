import type { EngineError } from "@phyllo/model";
import type { RecordTake } from "../../../state/recorder";

/** `~/Music/Phyllo/x.phyllo` for `/Users/<name>/Music/…` (macOS) and `/home/<name>/…` (Linux). */
export function tildify(path: string): string {
  return path.replace(/^(?:\/Users|\/home)\/[^/]+(?=\/|$)/, "~");
}

/** "System default · 48 kHz"; the rate is left out while the engine hasn't pinned one. */
export function describeAudioOutput(outputDevice: string | null, sampleRate: number | null): string {
  const device = outputDevice ?? "System default";
  return sampleRate === null ? device : `${device} · ${formatKilohertz(sampleRate)}`;
}

function formatKilohertz(hertz: number): string {
  return `${Number((hertz / 1000).toFixed(1))} kHz`;
}

/** Display name of a native MIDI port id (`in:KeyStep 37:0` → `KeyStep 37`); other ids pass through. */
export function midiPortName(portId: string): string {
  const match = /^(?:in|out):(.*?)(?::\d+)?$/.exec(portId);
  return match?.[1] ?? portId;
}

/** "MIDI in: KeyStep 37" or "No MIDI input". */
export function describeMidiInput(enabledPorts: readonly string[]): string {
  return enabledPorts.length === 0 ? "No MIDI input" : `MIDI in: ${enabledPorts.map(midiPortName).join(", ")}`;
}

/** "1 error · Bass line 6: message" (the track and line parts only when the engine knows them). */
export function describeEngineError(count: number, error: EngineError, trackName: string | undefined): string {
  const where = [trackName, error.line === undefined ? undefined : `line ${error.line}`].filter(Boolean).join(" ");
  const noun = count === 1 ? "error" : "errors";
  return `${count} ${noun} · ${where === "" ? "" : `${where}: `}${error.message}`;
}

/** Shown while `useMidiInput().hint` is set: the first MIDI note arrived before audio was started. */
export const MIDI_NEEDS_AUDIO = "MIDI notes need audio — press Play once";

/** What a finished record take did: "Recorded 7 notes onto Bass" (and why nothing was written, otherwise). */
export function describeTake(take: RecordTake, trackName: string | undefined): string {
  const target = trackName ?? "the selected track";
  switch (take.status) {
    case "written": {
      const notes = take.noteCount === 1 ? "1 note" : `${take.noteCount} notes`;
      return `Recorded ${notes} onto ${target}`;
    }
    case "empty":
      return "Nothing recorded — no notes were played";
    case "noTrack":
      return "Select a track to record onto";
    case "unsupported":
      return `Couldn't record onto ${target}`;
    default:
      return assertNever(take.status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled take status: ${String(value)}`);
}
