/**
 * MIDI out (DECISIONS V12): hap value → raw MIDI messages for the native bridge.
 * Mirrors the controls @strudel/midi reads (midi.mjs): note, velocity × gain, midichan, ccn/ccv,
 * progNum, midibend, miditouch, midiport. Pure.
 */
import { noteToMidi } from "@strudel/core";
import type { MidiOutMessage } from "./types";

/** @strudel/midi sends note-off 10 ms early so back-to-back notes don't glitch. */
export const NOTE_OFF_OFFSET_MS = 10;
const DEFAULT_VELOCITY = 0.9;

export interface MidiHapInput {
  value: Record<string, unknown>;
  /** Hap duration in seconds. */
  durationSec: number;
  /** Delay from now until the note sounds, in ms. */
  atMs: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** MIDI note number for a Strudel `note` value (number or name like `c3`, `eb2`). */
export function toMidiNote(note: unknown): number | undefined {
  if (typeof note === "number" && Number.isFinite(note)) return Math.round(note);
  if (typeof note === "string" && note !== "") {
    const asNumber = Number(note);
    if (Number.isFinite(asNumber)) return Math.round(asNumber);
    try {
      return noteToMidi(note);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** 1-based `midichan` (1..16) → status nibble 0..15. */
export function channelNibble(midichan: unknown): number {
  const ch = num(midichan) ?? 1;
  return clamp(Math.round(ch), 1, 16) - 1;
}

export function hapToMidiMessages({ value, durationSec, atMs }: MidiHapInput): MidiOutMessage[] {
  const ch = channelNibble(value["midichan"]);
  const at = Math.max(0, atMs);
  const out: MidiOutMessage[] = [];

  const ccn = num(value["ccn"]);
  const ccv = num(value["ccv"]);
  if (ccn !== undefined && ccv !== undefined) {
    out.push({ bytes: [0xb0 | ch, clamp(Math.round(ccn), 0, 127), clamp(Math.round(ccv * 127), 0, 127)], atMs: at });
  }

  const prog = num(value["progNum"]);
  if (prog !== undefined) out.push({ bytes: [0xc0 | ch, clamp(Math.round(prog), 0, 127)], atMs: at });

  const bend = num(value["midibend"]);
  if (bend !== undefined) {
    // -1..1 → 0..16383, centre 8192
    const v14 = clamp(Math.round(((clamp(bend, -1, 1) + 1) / 2) * 16383), 0, 16383);
    out.push({ bytes: [0xe0 | ch, v14 & 0x7f, (v14 >> 7) & 0x7f], atMs: at });
  }

  const touch = num(value["miditouch"]);
  if (touch !== undefined) out.push({ bytes: [0xd0 | ch, clamp(Math.round(touch * 127), 0, 127)], atMs: at });

  const note = toMidiNote(value["note"]);
  if (note !== undefined && note >= 0 && note <= 127) {
    const velocity = (num(value["velocity"]) ?? DEFAULT_VELOCITY) * (num(value["gain"]) ?? 1);
    // velocity 0 would be read as note-off; keep the quietest audible note instead
    const vel = clamp(Math.round(clamp(velocity, 0, 1) * 127), 1, 127);
    const lengthMs = Math.max(1, durationSec * 1000 - NOTE_OFF_OFFSET_MS);
    out.push({ bytes: [0x90 | ch, note, vel], atMs: at });
    out.push({ bytes: [0x80 | ch, note, 0], atMs: at + lengthMs });
  }
  return out;
}

/** Port name for a hap: `midiport` control, else the `.midi(port)` argument, else default (null). */
export function midiPortName(value: Record<string, unknown>, fallback: unknown): string | null {
  const port = value["midiport"] ?? fallback;
  return typeof port === "string" && port !== "" ? port : null;
}
