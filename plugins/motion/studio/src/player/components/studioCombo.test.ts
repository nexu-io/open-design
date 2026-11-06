// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCombo, matchCombo, parseCombo } from "./studioCombo";
import {
  getStudioKey,
  getStudioKeys,
  keyHint,
  matchesKey,
  setStudioKeys,
  studioKeyClash,
} from "./studioShortcuts";

afterEach(() => {
  setStudioKeys(null);
  vi.restoreAllMocks();
});

const getAll = () => ({ ...getStudioKeys() });
const press = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
const matches = (text: string, init: KeyboardEventInit) =>
  matchCombo(press(init), parseCombo(text)!);

describe("combo model", () => {
  it("parses characters, named keys and modifiers", () => {
    expect(parseCombo("B")).toMatchObject({ key: "b", named: false });
    expect(parseCombo("Space")).toMatchObject({ key: "Space", named: true });
    expect(parseCombo("mod+shift+z")).toMatchObject({ mod: true, shift: true, key: "z" });
    expect(parseCombo("cmd++")).toMatchObject({ meta: true, key: "+" });
  });

  it("refuses what cannot be matched: modifier-only, unknown, empty, and Ctrl+Alt (AltGr on Windows)", () => {
    for (const bad of [
      "ctrl",
      "shift+",
      "",
      "mod+ab",
      "hyper+x",
      "ctrl+alt+x",
      "mod+alt+x",
      "Spacebar",
    ]) {
      expect(parseCombo(bad), bad).toBeNull();
    }
    expect(parseCombo("cmd+alt+x")).not.toBeNull();
  });

  it("mod is Cmd or Ctrl; cmd and ctrl are exact; extra modifiers never match", () => {
    expect(matches("mod+c", { key: "c", metaKey: true })).toBe(true);
    expect(matches("mod+c", { key: "c", ctrlKey: true })).toBe(true);
    expect(matches("mod+c", { key: "c" })).toBe(false);
    expect(matches("mod+c", { key: "c", metaKey: true, shiftKey: true })).toBe(false);
    expect(matches("cmd+c", { key: "c", ctrlKey: true })).toBe(false);
    expect(matches("c", { key: "c", metaKey: true })).toBe(false);
  });

  it("characters match e.key (so layouts follow the typed letter), named keys match e.code", () => {
    expect(matches("a", { key: "a", code: "KeyQ" })).toBe(true);
    expect(matches("a", { key: "q", code: "KeyA" })).toBe(false);
    expect(matches("Space", { key: " ", code: "Space" })).toBe(true);
    expect(
      matches("shift+ArrowLeft", { key: "ArrowLeft", code: "ArrowLeft", shiftKey: true }),
    ).toBe(true);
    expect(matches("alt+shift+d", { key: "∂", code: "KeyD", altKey: true, shiftKey: true })).toBe(
      true,
    );
  });

  it("formats like the shortcut lists do", () => {
    expect(formatCombo(parseCombo("mod+shift+z")!)).toBe("⌘⇧Z");
    expect(formatCombo(parseCombo("alt+shift+d")!)).toBe("⌥⇧D");
    expect(formatCombo(parseCombo("ArrowLeft")!)).toBe("←");
    expect(formatCombo(parseCombo("[")!)).toBe("[");
  });
});

describe("resolver with combos", () => {
  it("accepts a combo for an action that today takes a single key, and the list follows", () => {
    setStudioKeys({ fullscreen: "mod+shift+f" });
    expect(getStudioKey("fullscreen")).toBe("mod+shift+f");
    expect(keyHint("fullscreen")).toBe("⌘⇧F");
    expect(matchesKey(press({ key: "F", metaKey: true, shiftKey: true }), "fullscreen")).toBe(true);
    expect(matchesKey(press({ key: "f" }), "fullscreen")).toBe(false);
  });

  it("keeps a single character working and canonical", () => {
    setStudioKeys({ mute: "X" });
    expect(getStudioKey("mute")).toBe("x");
    expect(matchesKey(press({ key: "x" }), "mute")).toBe(true);
  });

  it("refuses a map with an AltGr combo or two actions on one combo, keeping every default", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setStudioKeys({ mute: "ctrl+alt+m" });
    expect(getStudioKey("mute")).toBe("m");
    setStudioKeys({ mute: "mod+k", record: "cmd+k" });
    expect(getStudioKey("mute")).toBe("m");
    expect(getStudioKey("record")).toBe("r");
  });
});

describe("combos with symbol keys", () => {
  it("matches a symbol whatever Shift it needs, and refuses shift+symbol", () => {
    expect(matches("?", { key: "?", shiftKey: true })).toBe(true);
    expect(matches("mod++", { key: "+", metaKey: true, shiftKey: true })).toBe(true);
    expect(parseCombo("shift+1")).toBeNull();
  });
});

describe("studioKeyClash", () => {
  it("names the action that holds a combo, by modifiers and key, and lets a design-shared pair through", () => {
    expect(studioKeyClash("mute", "mod+z")).toBe("undo");
    expect(studioKeyClash("mute", "mod+shift+z")).toBe("redo");
    expect(studioKeyClash("mute", "q")).toBeNull();
    expect(studioKeyClash("pause", "k")).toBeNull();
    expect(studioKeyClash("mute", "b")).toBe("razorTool");
    expect(studioKeyClash("mute", "mod+z", { ...getAll(), undo: "q" })).toBeNull();
    expect(studioKeyClash("mute", "q", { ...getAll(), undo: "" })).toBeNull();
  });
});
