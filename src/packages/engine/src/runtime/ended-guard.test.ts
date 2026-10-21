import { describe, expect, it, vi } from "vitest";
import { isCrossContextError, patchEndedHandlers } from "./ended-guard";

const CROSS = "Failed to execute 'connect' on 'AudioNode': cannot connect to an AudioNode belonging to a different audio context.";

function crossContextError(): Error {
  const err = new Error(CROSS);
  err.name = "InvalidAccessError";
  return err;
}

/** Stand-in for AudioScheduledSourceNode: an `onended` accessor on the prototype, fired by `end()`. */
function makeNodeClass() {
  const slot = new WeakMap<object, unknown>();
  class FakeNode {
    end(): unknown {
      const h = slot.get(this);
      return typeof h === "function" ? (h as (this: FakeNode, ev: unknown) => unknown).call(this, { type: "ended" }) : undefined;
    }
  }
  Object.defineProperty(FakeNode.prototype, "onended", {
    configurable: true,
    enumerable: true,
    get(this: object) {
      return slot.get(this) ?? null;
    },
    set(this: object, v: unknown) {
      slot.set(this, v);
    },
  });
  return FakeNode as unknown as new () => { end(): unknown; onended: unknown };
}

describe("isCrossContextError", () => {
  it.each([
    [crossContextError(), true],
    [Object.assign(new Error(CROSS), { name: "Error" }), true],
    [new Error("cannot connect"), false],
    [Object.assign(new Error(CROSS), { name: "TypeError" }), false],
    ["different audio context", false],
    [null, false],
  ])("%s → %s", (err, expected) => {
    expect(isCrossContextError(err)).toBe(expected);
  });
});

describe("patchEndedHandlers", () => {
  it("swallows a handler's cross-context error and reports it", () => {
    const Node = makeNodeClass();
    const suppressed = vi.fn();
    const restore = patchEndedHandlers(Node.prototype, suppressed);
    const n = new Node();
    const err = crossContextError();
    n.onended = () => {
      throw err;
    };
    expect(() => n.end()).not.toThrow();
    expect(suppressed).toHaveBeenCalledWith(err);
    restore?.();
  });

  it("rethrows every other error and keeps handler results, `this` and the original handler on read", () => {
    const Node = makeNodeClass();
    const restore = patchEndedHandlers(Node.prototype, () => undefined);
    const n = new Node();
    const failing = () => {
      throw new TypeError("boom");
    };
    n.onended = failing;
    expect(n.onended).toBe(failing); // superdough checks `onended.name`
    expect(() => n.end()).toThrow("boom");

    n.onended = function (this: unknown) {
      return this === n ? 7 : 0;
    };
    expect(n.end()).toBe(7); // result passed through, called with the node as `this`

    n.onended = null;
    expect(n.onended).toBeNull();
    restore?.();
  });

  it("restores the original accessor", () => {
    const Node = makeNodeClass();
    const before = Object.getOwnPropertyDescriptor(Node.prototype, "onended");
    const restore = patchEndedHandlers(Node.prototype, () => undefined);
    expect(Object.getOwnPropertyDescriptor(Node.prototype, "onended")).not.toEqual(before);
    restore?.();
    expect(Object.getOwnPropertyDescriptor(Node.prototype, "onended")).toEqual(before);
    const n = new Node();
    n.onended = () => {
      throw crossContextError();
    };
    expect(() => n.end()).toThrow(CROSS);
  });

  it("does nothing on a prototype without an onended accessor", () => {
    expect(patchEndedHandlers({}, () => undefined)).toBeUndefined();
  });
});
