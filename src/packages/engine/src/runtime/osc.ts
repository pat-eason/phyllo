/**
 * OSC out to SuperDirt (DECISIONS V12): a port of @strudel/osc `parseControlsFromHap` (osc.mjs:34)
 * producing `/dirt/play` key/value args for the native UDP sender. Pure.
 */
import { isNote, noteToMidi, parseNumeral } from "@strudel/core";
import type { OscOutMessage } from "./types";

export const DIRT_ADDRESS = "/dirt/play";

export interface OscHapInput {
  value: Record<string, unknown>;
  cps: number;
  /** Onset cycle (`hap.wholeOrPart().begin`). */
  cycle: number;
  /** Hap duration in cycles. */
  durationCycles: number;
}

/** SuperDirt controls for one hap (same transformations as Strudel's OSC output). */
export function oscControlsFromHap({ value, cps, cycle, durationCycles }: OscHapInput): Record<string, unknown> {
  const controls: Record<string, unknown> = { cps, cycle, delta: durationCycles / cps, ...value };
  if (controls["n"]) controls["n"] = parseNumeral(controls["n"]);
  if (controls["note"] !== undefined) {
    if (isNote(controls["note"])) {
      const octave = typeof controls["octave"] === "number" ? controls["octave"] : 3;
      controls["midinote"] = noteToMidi(String(controls["note"]), octave);
    } else {
      controls["note"] = parseNumeral(controls["note"]);
    }
  }
  if (controls["bank"] && controls["s"] !== undefined) controls["s"] = `${String(controls["bank"])}${String(controls["s"])}`;
  if (controls["roomsize"]) controls["size"] = parseNumeral(controls["roomsize"]);
  if (controls["unit"] === "c" && typeof controls["speed"] === "number") controls["speed"] = controls["speed"] / cps;
  if (controls["channels"] !== undefined) controls["channels"] = JSON.stringify(controls["channels"]);
  return controls;
}

/** Flattens controls into OSC args; numbers and strings pass, booleans become 0/1, anything else JSON. */
export function oscArgs(controls: Record<string, unknown>): (number | string)[] {
  const args: (number | string)[] = [];
  for (const [key, v] of Object.entries(controls)) {
    if (v === undefined || v === null || typeof v === "function") continue;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) continue;
      args.push(key, v);
    } else if (typeof v === "string") args.push(key, v);
    else if (typeof v === "boolean") args.push(key, v ? 1 : 0);
    else args.push(key, JSON.stringify(v));
  }
  return args;
}

export function hapToOscMessage(input: OscHapInput, atMs: number): OscOutMessage {
  return { address: DIRT_ADDRESS, args: oscArgs(oscControlsFromHap(input)), atMs: Math.max(0, atMs) };
}
