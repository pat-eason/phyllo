/** Internal: meter ballistics + direct DOM writes. Not exported from the package. */

export interface MeterConfig {
  hold: boolean;
  /** dB/s; 0 = no ballistics. */
  release: number;
  stopped: boolean;
}

export interface MeterEngine {
  write(left: number, right?: number): void;
  reset(): void;
  dispose(): void;
}

interface Channel {
  shown: number;
  target: number;
  peak: number;
  peakAt: number;
}

const HOLD_MS = 1000;
const FLOOR_DB = -60;
/** Hold tick release when ballistics are off. */
const DEFAULT_RELEASE = 20;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Lower a linear level by `db` decibels; snaps to 0 below the floor. */
export function fallBy(level: number, db: number): number {
  if (level <= 0) return 0;
  const next = 20 * Math.log10(level) - db;
  return next <= FLOOR_DB ? 0 : 10 ** (next / 20);
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Instant attack, `release` dB/s fall, optional 1 s peak hold. Writes `--meter-level` / `--meter-peak`
 * on each bar element; runs a rAF loop only while something is falling.
 */
export function createMeterEngine(bars: { current: (HTMLElement | null)[] }, config: { current: MeterConfig }): MeterEngine {
  const channels: Channel[] = [0, 1].map(() => ({ shown: 0, target: 0, peak: 0, peakAt: 0 }));
  let frame: number | null = null;
  let lastTick: number | null = null;

  const paint = () => {
    channels.forEach((ch, i) => {
      const bar = bars.current[i];
      if (!bar) return;
      bar.style.setProperty("--meter-level", ch.shown.toFixed(4));
      bar.style.setProperty("--meter-peak", config.current.hold ? ch.peak.toFixed(4) : "0");
    });
  };

  const settling = () => channels.some((ch) => ch.shown > ch.target || (config.current.hold && ch.peak > ch.shown));

  const tick = (time: number) => {
    frame = null;
    const dt = lastTick === null ? 0 : (time - lastTick) / 1000;
    lastTick = time;
    const { release, hold } = config.current;
    for (const ch of channels) {
      if (ch.shown > ch.target) ch.shown = release > 0 ? Math.max(ch.target, fallBy(ch.shown, release * dt)) : ch.target;
      if (hold && ch.peak > ch.shown && now() - ch.peakAt >= HOLD_MS) {
        ch.peak = Math.max(ch.shown, fallBy(ch.peak, (release > 0 ? release : DEFAULT_RELEASE) * dt));
      }
      if (ch.peak < ch.shown) ch.peak = ch.shown;
    }
    paint();
    if (settling()) frame = requestAnimationFrame(tick);
    else lastTick = null;
  };

  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTick = null;
  };

  return {
    write(left, right) {
      if (config.current.stopped) return;
      const levels = [clamp01(left), clamp01(right ?? left)];
      const t = now();
      channels.forEach((ch, i) => {
        const next = levels[i] ?? 0;
        ch.target = next;
        if (next >= ch.shown || config.current.release <= 0) ch.shown = next;
        if (ch.shown >= ch.peak) {
          ch.peak = ch.shown;
          ch.peakAt = t;
        }
      });
      paint();
      if (frame === null && settling()) frame = requestAnimationFrame(tick);
    },
    reset() {
      cancel();
      for (const ch of channels) Object.assign(ch, { shown: 0, target: 0, peak: 0, peakAt: 0 });
      paint();
    },
    dispose: cancel,
  };
}
