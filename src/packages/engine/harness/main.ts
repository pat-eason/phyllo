// Browser harness for the runtime: exposes the engine on window for Playwright (runtime.spec.ts, fixes.spec.ts).
import { buildStarterProject } from "@phyllo/model";
import { generate } from "../src/codegen";
import { createEngine } from "../src/runtime";
import type { MidiOutMessage, OscOutMessage } from "../src/runtime";

const logs: { message: string; level: string }[] = [];
const midi: { port: string | null; messages: MidiOutMessage[] }[] = [];
const osc: OscOutMessage[] = [];

const engine = createEngine({
  logger: (message, level) => {
    logs.push({ message, level });
    if (level !== "debug") document.getElementById("log")?.append(`${level} ${message}\n`);
  },
  bridge: {
    midiSend: (port, messages) => midi.push({ port, messages }),
    oscSend: (messages) => osc.push(...messages),
  },
});

/** The evaluated (instrumented) song program of a starter project. */
const starterProgram = (id: string) => {
  const project = buildStarterProject(id);
  return { program: generate(project, { scope: "song", instrument: true }), loop: project.loop, lengthBars: project.lengthBars };
};

const harness = { engine, logs, midi, osc, starterProgram, initError: null as string | null };
(window as unknown as { harness: typeof harness }).harness = harness;

document.getElementById("init")?.addEventListener("click", () => {
  engine.init().catch((err: unknown) => {
    harness.initError = String(err);
  });
});
