/// <reference path="./strudel-web.d.ts" />
import { evaluate, hush, initStrudel } from "@strudel/web";

let ready: Promise<unknown> | undefined;

/** Initialise Strudel once. Must be called from a user gesture so the AudioContext can start. */
export function init(): Promise<unknown> {
  ready ??= Promise.resolve(initStrudel());
  return ready;
}

/** Evaluate Strudel code and start playing it, replacing whatever is playing. */
export async function play(code: string): Promise<void> {
  await init();
  await evaluate(code);
}

export function stop(): void {
  hush();
}
