import type { EngineError } from "@phyllo/model";

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
