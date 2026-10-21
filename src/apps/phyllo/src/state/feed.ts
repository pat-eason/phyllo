/**
 * High-frequency feeds (playhead, meters). Values are pushed to subscribers from one shared animation-frame
 * loop and never go through React state (design-system §5: "meters and the playhead should subscribe on
 * their own"). The loop only runs while the feed is active (transport playing) and has subscribers.
 */

export type Unsubscribe = () => void;

/** `requestAnimationFrame` shaped, injectable so tests and stories can drive frames with fake timers. */
export interface FrameScheduler {
  request(callback: (timeMs: number) => void): unknown;
  cancel(handle: unknown): void;
}

/** A frame scheduler on `setTimeout` (16 ms). Driven by `vi.useFakeTimers()` in tests. */
export function timerFrameScheduler(intervalMs = 16): FrameScheduler {
  return {
    request: (callback) => setTimeout(() => callback(Date.now()), intervalMs),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

/** `requestAnimationFrame` when the environment has it, otherwise a 16 ms timer. */
export function defaultFrameScheduler(): FrameScheduler {
  if (typeof globalThis.requestAnimationFrame === "function" && typeof globalThis.cancelAnimationFrame === "function") {
    return {
      request: (callback) => globalThis.requestAnimationFrame(callback),
      cancel: (handle) => globalThis.cancelAnimationFrame(handle as number),
    };
  }
  return timerFrameScheduler();
}

export interface Feed<T> {
  /** Adds a subscriber. It receives the current value immediately, then one value per frame while active. */
  subscribe(callback: (value: T) => void): Unsubscribe;
  /** Starts (true) or stops (false) the frame loop. Stopping does not notify; call `emit()` for a final value. */
  setActive(active: boolean): void;
  /** Reads once and pushes to every subscriber now (after stop, seek, pause). */
  emit(): void;
  readonly subscriberCount: number;
  readonly running: boolean;
  dispose(): void;
}

export interface FeedOptions<T> {
  scheduler: FrameScheduler;
  read: () => T;
  /** Minimum ms between pushes (meters: 33 ≈ 30 Hz). 0 = every frame. */
  minIntervalMs?: number;
}

export function createFeed<T>({ scheduler, read, minIntervalMs = 0 }: FeedOptions<T>): Feed<T> {
  const subscribers = new Set<(value: T) => void>();
  let active = false;
  let handle: unknown = null;
  let lastPush = -Infinity;
  let disposed = false;

  const push = (value: T) => {
    for (const callback of [...subscribers]) callback(value);
  };

  const tick = (timeMs: number) => {
    handle = null;
    if (!active || subscribers.size === 0 || disposed) return;
    if (timeMs - lastPush >= minIntervalMs) {
      lastPush = timeMs;
      push(read());
    }
    handle = scheduler.request(tick);
  };

  const sync = () => {
    const shouldRun = active && subscribers.size > 0 && !disposed;
    if (shouldRun && handle === null) {
      lastPush = -Infinity;
      handle = scheduler.request(tick);
    } else if (!shouldRun && handle !== null) {
      scheduler.cancel(handle);
      handle = null;
    }
  };

  return {
    subscribe(callback) {
      subscribers.add(callback);
      callback(read());
      sync();
      return () => {
        subscribers.delete(callback);
        sync();
      };
    },
    setActive(next) {
      active = next;
      sync();
    },
    emit() {
      if (subscribers.size > 0) push(read());
    },
    get subscriberCount() {
      return subscribers.size;
    },
    get running() {
      return handle !== null;
    },
    dispose() {
      disposed = true;
      subscribers.clear();
      sync();
    },
  };
}
