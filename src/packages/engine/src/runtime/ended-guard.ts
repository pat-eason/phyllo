/**
 * Cross-context `onended` guard (T1.V #19).
 *
 * Superdough keeps one global AudioContext. While `renderOffline` has it swapped to the OfflineAudioContext,
 * live voices that end run their cleanup (`onceEnded` → `webAudioTimeout`) against the offline context, and
 * offline voices that end during rendering run it against the live one; both throw `InvalidAccessError:
 * … different audio context` from the `onended` event handler, i.e. as uncaught errors (~1 per voice).
 * Those cleanups only release nodes of a voice that has already finished, so the guard wraps every handler
 * assigned to `AudioScheduledSourceNode#onended` and drops exactly that error (reported to the sinks for a
 * debug log). Anything else is rethrown unchanged. Reference-counted across engines.
 */

const CROSS_CONTEXT = /different audio context/i;

/** True for the "node belongs to a different audio context" error the Web Audio API throws. */
export function isCrossContextError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  return typeof message === "string" && CROSS_CONTEXT.test(message) && (name === undefined || name === "InvalidAccessError" || name === "Error");
}

type Handler = (this: unknown, ev: unknown) => unknown;

/**
 * Wraps the `onended` accessor of `proto` so handlers that throw a cross-context error don't escape.
 * Returns the function that restores the original accessor, or undefined when `proto` has no such accessor.
 */
export function patchEndedHandlers(proto: object, onSuppressed: (err: unknown) => void): (() => void) | undefined {
  const desc = Object.getOwnPropertyDescriptor(proto, "onended");
  const get = desc?.get;
  const set = desc?.set;
  if (!desc || !get || !set) return undefined;
  const originals = new WeakMap<Handler, Handler>();
  Object.defineProperty(proto, "onended", {
    configurable: true,
    enumerable: desc.enumerable ?? true,
    get(this: unknown) {
      const current = get.call(this) as Handler | null;
      return (current && originals.get(current)) ?? current;
    },
    set(this: unknown, fn: unknown) {
      if (typeof fn !== "function") {
        set.call(this, fn);
        return;
      }
      const handler = fn as Handler;
      const wrapped: Handler = function (this: unknown, ev: unknown) {
        try {
          return handler.call(this, ev);
        } catch (err) {
          if (!isCrossContextError(err)) throw err;
          onSuppressed(err);
          return undefined;
        }
      };
      originals.set(wrapped, handler);
      set.call(this, wrapped);
    },
  });
  return () => Object.defineProperty(proto, "onended", desc);
}

let installs = 0;
let restore: (() => void) | undefined;
const sinks = new Set<(err: unknown) => void>();

/** Installs the guard on `AudioScheduledSourceNode.prototype` (browser only). Returns the uninstaller. */
export function guardEndedHandlers(onSuppressed: (err: unknown) => void): () => void {
  const proto = (globalThis as { AudioScheduledSourceNode?: { prototype: object } }).AudioScheduledSourceNode?.prototype;
  if (!proto) return () => undefined;
  sinks.add(onSuppressed);
  if (installs++ === 0) {
    restore = patchEndedHandlers(proto, (err) => {
      for (const sink of sinks) sink(err);
    });
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    sinks.delete(onSuppressed);
    if (--installs === 0) {
      restore?.();
      restore = undefined;
    }
  };
}
