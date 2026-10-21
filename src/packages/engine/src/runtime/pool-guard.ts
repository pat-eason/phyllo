/**
 * Cross-context node-pool guard (B19).
 *
 * Superdough re-uses finished filters, compressors, supersaw and wavetable nodes through a module-private pool
 * (`nodePools.mjs`: `pool.push(new WeakRef(node))` / `ref.deref()`) whose keys ignore the AudioContext. An offline
 * render therefore picked up nodes released by live voices (and live voices picked up nodes released by an
 * offline render), and the first `connect` threw "… different audio context" — the hap was dropped and
 * `renderOffline` logged it once per render.
 *
 * The pool isn't exported, so the guard wraps `WeakRef.prototype.deref`: a weakly held AudioNode that belongs to
 * a context other than the one superdough is using now reads as collected. The pool then discards it and builds a
 * fresh node. Every other WeakRef target is returned unchanged. Reference-counted across engines.
 */

type Deref = (this: WeakRef<object>) => object | undefined;

/**
 * Wraps `proto.deref` so AudioNodes (per `isNode`) of a context other than `current()` read as collected.
 * Returns the function that restores the original, or undefined when `proto` has no `deref`.
 */
export function patchDeref(
  proto: { deref?: unknown },
  isNode: (v: object) => v is AudioNode,
  current: () => BaseAudioContext | undefined,
): (() => void) | undefined {
  const original = proto.deref;
  if (typeof original !== "function") return undefined;
  const deref = original as Deref;
  const wrapped: Deref = function (this: WeakRef<object>) {
    const target = deref.call(this);
    if (target && isNode(target)) {
      const ctx = current();
      if (ctx && target.context !== ctx) return undefined;
    }
    return target;
  };
  proto.deref = wrapped;
  return () => {
    if (proto.deref === wrapped) proto.deref = original;
  };
}

let installs = 0;
let restore: (() => void) | undefined;

/** Installs the guard on `WeakRef.prototype` (browser only: needs `AudioNode`). Returns the uninstaller. */
export function guardNodePool(current: () => BaseAudioContext | undefined): () => void {
  const NodeCtor = (globalThis as { AudioNode?: abstract new () => AudioNode }).AudioNode;
  const proto = (globalThis as { WeakRef?: { prototype: { deref?: unknown } } }).WeakRef?.prototype;
  if (!NodeCtor || !proto) return () => undefined;
  if (installs++ === 0) {
    restore = patchDeref(proto, (v): v is AudioNode => v instanceof NodeCtor, current);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--installs === 0) {
      restore?.();
      restore = undefined;
    }
  };
}
