import { describe, expect, it } from "vitest";
import { MENU_ACTIONS } from "../../native/types";
import { SHORTCUTS, acceleratorFor, describeTarget, detectMac, matchShortcut } from "./shortcuts";
import type { KeyLike, ShortcutContext, TargetInfo } from "./shortcuts";

const BODY: TargetInfo = { field: false, editor: false, activates: false, inTransport: false };
const FIELD: TargetInfo = { ...BODY, field: true };
const EDITOR: TargetInfo = { ...BODY, editor: true };
const BUTTON: TargetInfo = { ...BODY, activates: true };

function ctx(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
  return { screen: "arrange", uiMode: "guided", nativeMenu: false, isMac: true, modalOpen: false, ...overrides };
}

function key(k: string, mods: Partial<Omit<KeyLike, "key">> = {}): KeyLike {
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods };
}

const cmd = (k: string, extra: Partial<KeyLike> = {}) => key(k, { metaKey: true, ...extra });

describe("shortcuts", () => {
  it.each([
    [key(" "), "transport.playPause"],
    [key("l"), "transport.loop"],
    [key("r"), "transport.record"],
    [key("m"), "track.mute"],
    [key("s"), "track.solo"],
    [cmd("k"), "library.search"],
    [cmd("j"), "view.libraryPanel"],
    [cmd("j", { shiftKey: true }), "view.inspectorPanel"],
    [cmd("z"), "edit.undo"],
    [cmd("z", { shiftKey: true }), "edit.redo"],
    [cmd("e"), "file.export"],
    [cmd(","), "app.settings"],
    [cmd("1"), "view.arrange"],
    [cmd("2"), "view.pattern"],
    [cmd("3"), "view.mixer"],
    [cmd("L", { shiftKey: true }), "view.library"],
    [cmd("/"), "view.codeDrawer"],
    [cmd("G", { shiftKey: true }), "view.uiMode"],
    [cmd("s"), "file.save"],
    [cmd("S", { shiftKey: true }), "file.saveAs"],
    [cmd("n"), "file.new"],
    [cmd("o"), "file.open"],
  ] as const)("should map %o to %s on Arrange", (event, action) => {
    // Arrange / Act
    const match = matchShortcut(event, ctx(), BODY);

    // Assert
    expect(match?.action).toBe(action);
  });

  it("should make V / B / S the edit tools in Pro on Arrange and keep S as Solo elsewhere", () => {
    // Arrange
    const pro = ctx({ uiMode: "pro" });

    // Act / Assert
    expect(matchShortcut(key("v"), pro, BODY)?.action).toBe("tool.select");
    expect(matchShortcut(key("b"), pro, BODY)?.action).toBe("tool.draw");
    expect(matchShortcut(key("s"), pro, BODY)?.action).toBe("tool.split");
    expect(matchShortcut(key("s"), ctx({ uiMode: "pro", screen: "mixer" }), BODY)?.action).toBe("track.solo");
    expect(matchShortcut(key("v"), ctx(), BODY)).toBeNull();
  });

  it("should not fire single keys, undo or ⌘/ while typing in a field", () => {
    // Arrange
    const keys = [key(" "), key("m"), key("s"), key("l"), cmd("z"), cmd("z", { shiftKey: true }), cmd("/"), cmd("k")];

    // Act
    const matches = keys.map((event) => matchShortcut(event, ctx(), FIELD));

    // Assert
    expect(matches).toEqual(keys.map(() => null));
  });

  it("should keep ⌘ commands that don't edit text working in fields, but nothing in code editors", () => {
    // Arrange / Act / Assert
    expect(matchShortcut(cmd("s"), ctx(), FIELD)?.action).toBe("file.save");
    expect(matchShortcut(cmd("1"), ctx(), FIELD)?.action).toBe("view.arrange");
    expect(matchShortcut(cmd("s"), ctx(), EDITOR)).toBeNull();
    expect(matchShortcut(cmd("1"), ctx(), EDITOR)).toBeNull();
  });

  it("should leave Space to a focused button and Enter to the transport group", () => {
    // Arrange / Act / Assert
    expect(matchShortcut(key(" "), ctx(), BUTTON)).toBeNull();
    expect(matchShortcut(key("m"), ctx(), BUTTON)?.action).toBe("track.mute");
    expect(matchShortcut(key("Enter"), ctx(), BODY)).toBeNull();
    expect(matchShortcut(key("Enter"), ctx(), { ...BUTTON, inTransport: true })?.action).toBe("transport.stop");
  });

  it("should skip menu-owned accelerators when the native menu is active, but never undo or ⌘K", () => {
    // Arrange
    const desktop = ctx({ nativeMenu: true });

    // Act / Assert
    expect(matchShortcut(cmd("e"), desktop, BODY)).toBeNull();
    expect(matchShortcut(cmd("1"), desktop, BODY)).toBeNull();
    expect(matchShortcut(cmd(","), desktop, BODY)).toBeNull();
    expect(matchShortcut(cmd("z"), desktop, BODY)?.action).toBe("edit.undo");
    expect(matchShortcut(cmd("k"), desktop, BODY)?.action).toBe("library.search");
    expect(matchShortcut(key(" "), desktop, BODY)?.action).toBe("transport.playPause");
  });

  it("should use Ctrl off macOS and ignore the other platform's modifier", () => {
    // Arrange
    const linux = ctx({ isMac: false });

    // Act / Assert
    expect(matchShortcut(key("s", { ctrlKey: true }), linux, BODY)?.action).toBe("file.save");
    expect(matchShortcut(cmd("s"), linux, BODY)).toBeNull();
    expect(matchShortcut(key("s", { ctrlKey: true }), ctx(), BODY)).toBeNull();
  });

  it("should stay quiet while a modal is open, for handled events, ⌥ chords and key repeats", () => {
    // Arrange / Act / Assert
    expect(matchShortcut(key("m"), ctx({ modalOpen: true }), BODY)).toBeNull();
    expect(matchShortcut({ ...key("m"), defaultPrevented: true }, ctx(), BODY)).toBeNull();
    expect(matchShortcut(key("m", { altKey: true }), ctx(), BODY)).toBeNull();
    expect(matchShortcut(key("m", { repeat: true }), ctx(), BODY)).toBeNull();
    expect(matchShortcut(cmd("z", { repeat: true }), ctx(), BODY)?.action).toBe("edit.undo");
  });

  it("should bind transport and track keys only on project screens", () => {
    // Arrange / Act / Assert
    expect(matchShortcut(key(" "), ctx({ screen: "library" }), BODY)).toBeNull();
    expect(matchShortcut(key("m"), ctx({ screen: "start" }), BODY)).toBeNull();
    expect(matchShortcut(cmd("e"), ctx({ screen: "start" }), BODY)).toBeNull();
    expect(matchShortcut(cmd("e"), ctx({ screen: "library" }), BODY)?.action).toBe("file.export");
    expect(matchShortcut(cmd("1"), ctx({ screen: "start" }), BODY)?.action).toBe("view.arrange");
  });

  it("should mirror the native menu's accelerators for every menu-linked shortcut", () => {
    // Arrange
    const linked = SHORTCUTS.filter((shortcut) => shortcut.menu !== undefined);

    // Act
    const accelerators = linked.map((shortcut) => [shortcut.action, MENU_ACTIONS[shortcut.menu!].accelerator]);

    // Assert
    expect(Object.fromEntries(accelerators)).toEqual({
      "file.export": "CmdOrCtrl+E",
      "app.settings": "CmdOrCtrl+,",
      "view.arrange": "CmdOrCtrl+1",
      "view.pattern": "CmdOrCtrl+2",
      "view.mixer": "CmdOrCtrl+3",
      "view.library": "Shift+CmdOrCtrl+L",
      "view.codeDrawer": "CmdOrCtrl+/",
      "view.uiMode": "Shift+CmdOrCtrl+G",
      "file.save": "CmdOrCtrl+S",
      "file.saveAs": "Shift+CmdOrCtrl+S",
      "file.new": "CmdOrCtrl+N",
      "file.open": "CmdOrCtrl+O",
    });
  });

  it("should classify focus targets", () => {
    // Arrange
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}) => {
      const element = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
      return element;
    };
    const transport = make("div", { role: "group", "aria-label": "Transport" });
    const play = transport.appendChild(make("button"));

    // Act / Assert
    expect(describeTarget(make("input"))).toEqual({ ...BODY, field: true });
    expect(describeTarget(make("select"))).toEqual({ ...BODY, field: true });
    expect(describeTarget(make("input", { type: "checkbox" }))).toEqual(BUTTON);
    expect(describeTarget(make("input", { type: "range" }))).toEqual(BODY);
    expect(describeTarget(make("textarea"))).toEqual(EDITOR);
    expect(describeTarget(play)).toEqual({ ...BUTTON, inTransport: true });
    expect(describeTarget(make("div", { role: "switch" }))).toEqual(BUTTON);
    expect(describeTarget(make("div", { role: "slider" }))).toEqual(BODY);
    expect(describeTarget(null)).toEqual(BODY);
  });

  it("should detect macOS from the platform", () => {
    // Arrange / Act / Assert
    expect(detectMac({ platform: "MacIntel", userAgent: "" })).toBe(true);
    expect(detectMac({ platform: "Win32", userAgent: "" })).toBe(false);
    expect(detectMac({ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" })).toBe(true);
  });

  it.each([
    ["track.mute", "M"],
    ["transport.playPause", "Space"],
    ["view.library", "CmdOrCtrl+Shift+L"],
    ["view.codeDrawer", "CmdOrCtrl+/"],
  ] as const)("should give %s the context-menu hint %s", (action, expected) => {
    // Arrange / Act / Assert
    expect(acceleratorFor(action)).toBe(expected);
  });

  it("should have no hint for an action without a key", () => {
    // Arrange / Act / Assert
    expect(acceleratorFor("file.history")).toBeUndefined();
  });
});
