// B19: superdough's node pool must never hand a node of one AudioContext to a voice on another.
import { describe, expect, it } from "vitest";
import { patchDeref } from "./pool-guard";

class FakeNode {
  constructor(readonly context: object) {}
}
const isNode = (v: object): v is AudioNode => v instanceof FakeNode;

/** A WeakRef stand-in with its own prototype, so the global WeakRef stays untouched. */
function weakRefClass() {
  class Ref<T extends object> {
    constructor(private readonly target: T) {}
    deref(): T | undefined {
      return this.target;
    }
  }
  return Ref;
}

describe("node pool guard", () => {
  it("should read a pooled node of another context as collected", () => {
    // Arrange
    const Ref = weakRefClass();
    const live = {};
    const offline = {};
    let current: object = offline;
    patchDeref(Ref.prototype, isNode, () => current as BaseAudioContext);
    const liveNode = new Ref(new FakeNode(live));
    // Act + Assert
    expect(liveNode.deref()).toBeUndefined();
    current = live;
    expect(liveNode.deref()).toBeInstanceOf(FakeNode);
  });

  it("should return other targets unchanged", () => {
    const Ref = weakRefClass();
    patchDeref(Ref.prototype, isNode, () => ({}) as BaseAudioContext);
    const handle = { node: new FakeNode({}) };
    expect(new Ref(handle).deref()).toBe(handle);
  });

  it("should leave nodes alone while no context is known", () => {
    const Ref = weakRefClass();
    patchDeref(Ref.prototype, isNode, () => undefined);
    const node = new FakeNode({});
    expect(new Ref(node).deref()).toBe(node);
  });

  it("should restore the original deref", () => {
    const Ref = weakRefClass();
    const original = Ref.prototype.deref;
    const restore = patchDeref(Ref.prototype, isNode, () => ({}) as BaseAudioContext);
    restore?.();
    expect(Ref.prototype.deref).toBe(original);
  });

  it("should do nothing without a deref to wrap", () => {
    expect(patchDeref({}, isNode, () => undefined)).toBeUndefined();
  });
});
