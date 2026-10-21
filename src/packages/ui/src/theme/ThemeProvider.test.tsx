import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme, type Accent, type ThemeMode } from "./ThemeProvider";

type Listener = (e: MediaQueryListEvent) => void;

/** Controllable matchMedia: `setDark()` flips the OS preference and notifies listeners. */
function mockMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();

  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("dark") ? dark : !dark;
    },
    media: query,
    addEventListener: (_: "change", l: Listener) => listeners.add(l),
    removeEventListener: (_: "change", l: Listener) => listeners.delete(l),
  }));
  // jsdom defines window.matchMedia as undefined; stubGlobal covers globalThis === window here.
  return {
    listenerCount: () => listeners.size,
    setDark(next: boolean) {
      dark = next;
      listeners.forEach((l) => l({ matches: next } as MediaQueryListEvent));
    },
  };
}

function Probe() {
  const { mode, theme, accent } = useTheme();
  return <output data-testid="probe">{`${mode}/${theme}/${accent}`}</output>;
}

function renderWith(mode: ThemeMode, accent: Accent = "green") {
  const ui = (m: ThemeMode, a: Accent) => (
    <ThemeProvider mode={m} accent={a}>
      <Probe />
    </ThemeProvider>
  );
  const utils = render(ui(mode, accent));
  return { ...utils, update: (m: ThemeMode, a: Accent = accent) => utils.rerender(ui(m, a)) };
}

const html = () => document.documentElement;

describe("ThemeProvider", () => {
  beforeEach(() => {
    delete html().dataset.theme;
    delete html().dataset.accent;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("system mode follows the OS preference and updates live", () => {
    const mq = mockMatchMedia(true);
    renderWith("system");
    expect(html().dataset.theme).toBe("dark");
    expect(screen.getByTestId("probe")).toHaveTextContent("system/dark/green");

    act(() => mq.setDark(false));
    expect(html().dataset.theme).toBe("light");
    expect(screen.getByTestId("probe")).toHaveTextContent("system/light/green");

    act(() => mq.setDark(true));
    expect(html().dataset.theme).toBe("dark");
  });

  it("starts light when the OS prefers light", () => {
    mockMatchMedia(false);
    renderWith("system");
    expect(html().dataset.theme).toBe("light");
  });

  it("explicit modes ignore OS changes", () => {
    const mq = mockMatchMedia(true);
    renderWith("light");
    expect(html().dataset.theme).toBe("light");
    act(() => mq.setDark(false));
    act(() => mq.setDark(true));
    expect(html().dataset.theme).toBe("light");
  });

  it("switching mode and accent updates <html> attributes", () => {
    mockMatchMedia(true);
    const { update } = renderWith("dark", "green");
    expect(html().dataset.accent).toBe("green");

    update("light", "purple");
    expect(html().dataset.theme).toBe("light");
    expect(html().dataset.accent).toBe("purple");

    update("system", "teal");
    expect(html().dataset.theme).toBe("dark");
    expect(html().dataset.accent).toBe("teal");
  });

  describe("data-theme-switching", () => {
    /** Manual animation frames so the two-frame lifetime can be stepped. */
    function stubFrames() {
      const callbacks = new Map<number, FrameRequestCallback>();
      let nextId = 0;
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        callbacks.set(++nextId, cb);
        return nextId;
      });
      vi.stubGlobal("cancelAnimationFrame", (id: number) => {
        callbacks.delete(id);
      });
      return () => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        pending.forEach((cb) => cb(0));
      };
    }
    const switching = () => html().hasAttribute("data-theme-switching");

    beforeEach(() => {
      delete html().dataset.themeSwitching;
    });

    it("is not set by the first mount", () => {
      mockMatchMedia(true);
      stubFrames();
      renderWith("dark", "green");
      expect(switching()).toBe(false);
    });

    it("is set when the theme changes and removed after two animation frames", () => {
      mockMatchMedia(true);
      const step = stubFrames();
      const { update } = renderWith("dark", "green");

      update("light");
      expect(html().dataset.theme).toBe("light");
      expect(switching()).toBe(true);

      step();
      expect(switching()).toBe(true);
      step();
      expect(switching()).toBe(false);
    });

    it("is set when only the accent changes", () => {
      mockMatchMedia(true);
      const step = stubFrames();
      const { update } = renderWith("dark", "green");

      update("dark", "red");
      expect(switching()).toBe(true);
      step();
      step();
      expect(switching()).toBe(false);
    });

    it("restarts the two frames when another change lands mid-switch", () => {
      mockMatchMedia(true);
      const step = stubFrames();
      const { update } = renderWith("dark", "green");

      update("light");
      step();
      update("light", "blue");
      step();
      expect(switching()).toBe(true);
      step();
      expect(switching()).toBe(false);
    });

    it("is not set by a re-render that changes nothing", () => {
      mockMatchMedia(true);
      stubFrames();
      const { update } = renderWith("dark", "green");

      update("dark", "green");
      expect(switching()).toBe(false);
    });

    it("is set when the OS preference flips in system mode", () => {
      const mq = mockMatchMedia(true);
      const step = stubFrames();
      renderWith("system");

      act(() => mq.setDark(false));
      expect(switching()).toBe(true);
      step();
      step();
      expect(switching()).toBe(false);
    });

    it("is cleared when the provider unmounts mid-switch", () => {
      mockMatchMedia(true);
      stubFrames();
      const { update, unmount } = renderWith("dark", "green");

      update("light");
      unmount();
      expect(switching()).toBe(false);
    });
  });

  it("unsubscribes from the media query on unmount", () => {
    const mq = mockMatchMedia(true);
    const { unmount } = renderWith("system");
    expect(mq.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(mq.listenerCount()).toBe(0);
  });

  it("falls back to dark when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    renderWith("system");
    expect(html().dataset.theme).toBe("dark");
  });

  it("useTheme throws outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
