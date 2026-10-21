import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFeed, timerFrameScheduler } from "./feed";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createFeed", () => {
  it("should push one value on subscribe and one per frame while active", () => {
    // Arrange
    let n = 0;
    const feed = createFeed({ scheduler: timerFrameScheduler(16), read: () => ++n });
    const seen: number[] = [];
    feed.subscribe((v) => seen.push(v));

    // Act
    feed.setActive(true);
    vi.advanceTimersByTime(48);

    // Assert
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("should throttle pushes to the minimum interval", () => {
    // Arrange
    const feed = createFeed({ scheduler: timerFrameScheduler(16), read: () => 0, minIntervalMs: 33 });
    const seen: number[] = [];
    feed.subscribe((v) => seen.push(v));
    feed.setActive(true);

    // Act
    vi.advanceTimersByTime(1000);

    // Assert: 1 initial + ~1000/33 frames, never one per 16 ms frame
    expect(seen.length).toBeGreaterThan(20);
    expect(seen.length).toBeLessThanOrEqual(32);
  });

  it("should stop the loop when inactive or without subscribers", () => {
    // Arrange
    const feed = createFeed({ scheduler: timerFrameScheduler(16), read: () => 0 });
    const off = feed.subscribe(() => {});
    feed.setActive(true);
    const runningWithSubscriber = feed.running;

    // Act
    off();

    // Assert
    expect(runningWithSubscriber).toBe(true);
    expect(feed.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
