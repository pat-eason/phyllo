/**
 * Self-test report model (T7.5a). Pure: no Tauri, no DOM, unit-tested.
 *
 * Each step records `{ step, ok, ms, detail }`. A step fails when its body throws, times out, or any `check` in it
 * fails; failed checks are listed in `detail.failures` and the run carries on with the next step.
 */

export type Detail = Record<string, unknown>;

export interface StepResult {
  step: string;
  ok: boolean;
  ms: number;
  detail: Detail;
}

export interface ConsoleEntry {
  level: "error" | "warn" | "uncaught" | "rejection";
  message: string;
  /** ms since the run started */
  at: number;
}

export interface SelftestReport {
  version: 1;
  /** All steps passed. */
  ok: boolean;
  /** False while the run is still going (the report is rewritten after every step). */
  complete: boolean;
  startedAt: string;
  finishedAt: string | null;
  totalMs: number;
  steps: StepResult[];
  /** WKWebView capabilities observed along the way (worklets, setSinkId, latency, autoplay…). */
  findings: Detail;
  console: ConsoleEntry[];
  /** `summarize(report)`: one PASS/FAIL line per step (what `scripts/selftest.sh` prints). */
  summary: string;
}

/** Handed to a step body: record values and soft assertions. */
export interface StepContext {
  detail: Detail;
  /** Records a failure (and keeps going) unless `condition` holds. Returns `condition`. */
  check(condition: boolean, message: string): boolean;
}

export class StepTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms} ms`);
    this.name = "StepTimeoutError";
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ? `${error.name}: ${error.message}` : error.message;
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: unknown; message?: unknown };
    if (typeof e.message === "string") return typeof e.code === "string" ? `${e.code}: ${e.message}` : e.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/** Rejects with `StepTimeoutError` if `promise` hasn't settled after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface RecorderOptions {
  /** ms clock; default `performance.now` */
  clock?: () => number;
  /** ISO timestamps; default `new Date().toISOString()` */
  isoNow?: () => string;
  /** Called after every step with the report so far (write it to disk so a hang still leaves evidence). */
  onUpdate?: (report: SelftestReport) => void | Promise<void>;
}

export interface Recorder {
  readonly report: SelftestReport;
  findings: Detail;
  /** Runs one step; never throws. Resolves with the step's result. */
  step(name: string, body: (ctx: StepContext) => Promise<void> | void, timeoutMs?: number): Promise<StepResult>;
  log(entry: Omit<ConsoleEntry, "at">): void;
  /** ms since the run started */
  elapsed(): number;
  finish(): SelftestReport;
}

/** Keeps the report small: long console spam is capped. */
export const MAX_CONSOLE_ENTRIES = 200;
const MAX_MESSAGE = 2000;

export function createRecorder(options: RecorderOptions = {}): Recorder {
  const clock = options.clock ?? (() => performance.now());
  const isoNow = options.isoNow ?? (() => new Date().toISOString());
  const t0 = clock();
  const findings: Detail = {};
  const report: SelftestReport = {
    version: 1,
    ok: true,
    complete: false,
    startedAt: isoNow(),
    finishedAt: null,
    totalMs: 0,
    steps: [],
    findings,
    console: [],
    summary: "",
  };
  let dropped = 0;
  const elapsed = () => Math.round(clock() - t0);
  const update = async () => {
    report.totalMs = elapsed();
    report.summary = summarize(report);
    try {
      await options.onUpdate?.(report);
    } catch {
      /* best effort: the final write reports the same data */
    }
  };

  return {
    report,
    findings,
    elapsed,
    log(entry) {
      if (report.console.length >= MAX_CONSOLE_ENTRIES) {
        dropped += 1;
        findings["consoleDropped"] = dropped;
        return;
      }
      report.console.push({ ...entry, message: entry.message.slice(0, MAX_MESSAGE), at: elapsed() });
    },
    async step(name, body, timeoutMs = 30_000) {
      const detail: Detail = {};
      const failures: string[] = [];
      const ctx: StepContext = {
        detail,
        check(condition, message) {
          if (!condition) failures.push(message);
          return condition;
        },
      };
      const start = clock();
      let ok = true;
      try {
        await withTimeout(Promise.resolve().then(() => body(ctx)), timeoutMs, name);
      } catch (error) {
        ok = false;
        detail["error"] = errorText(error);
      }
      if (failures.length > 0) {
        ok = false;
        detail["failures"] = failures;
      }
      const result: StepResult = { step: name, ok, ms: Math.round(clock() - start), detail };
      report.steps.push(result);
      if (!ok) report.ok = false;
      await update();
      return result;
    },
    finish() {
      report.complete = true;
      report.finishedAt = isoNow();
      report.totalMs = elapsed();
      report.summary = summarize(report);
      return report;
    },
  };
}

/** WAV size for interleaved PCM: data plus a header (44 bytes plain, 68 with WAVE_FORMAT_EXTENSIBLE). */
export function expectedWavBytes(frames: number, channels: number, bitsPerSample: number, header = 68): number {
  return header + frames * channels * (bitsPerSample / 8);
}

/** `|actual - expected| <= tolerance × expected` */
export function near(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= Math.abs(expected) * tolerance;
}

/**
 * Song cycles advanced over a series of `getCycle()` samples, ignoring jumps (loop wraps, seeks): only steps in
 * `[0, maxStep]` count.
 */
export function advancedCycles(samples: readonly number[], maxStep = 0.5): number {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i]! - samples[i - 1]!;
    if (d >= 0 && d <= maxStep) total += d;
  }
  return total;
}

/** One line per step for the console / script summary. */
export function summarize(report: SelftestReport): string {
  const lines = report.steps.map((s) => {
    const why = s.ok ? "" : `  ${String(s.detail["error"] ?? (s.detail["failures"] as string[] | undefined)?.join("; ") ?? "")}`;
    return `${s.ok ? "PASS" : "FAIL"}  ${s.step.padEnd(28)} ${String(s.ms).padStart(6)} ms${why}`;
  });
  const passed = report.steps.filter((s) => s.ok).length;
  lines.push(`${report.ok ? "PASS" : "FAIL"}  ${passed}/${report.steps.length} steps in ${report.totalMs} ms`);
  return lines.join("\n");
}
