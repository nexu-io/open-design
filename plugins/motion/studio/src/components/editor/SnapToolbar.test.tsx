import { trackStudioEvent } from "../../utils/studioTelemetry";
// @vitest-environment happy-dom

import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppHotkeys } from "../../hooks/useAppHotkeys";
import { usePlayerStore } from "../../player/store/playerStore";
import type { DomEditSelection } from "./domEditing";
import { SnapToolbar } from "./SnapToolbar";
import { PreviewOverlayProvider } from "./PreviewOverlayProvider";
import { usePreviewGuidesStore } from "./previewGuidesStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  usePlayerStore.getState().reset();
});

function renderToolbar() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <PreviewOverlayProvider>
        <SnapToolbar />
      </PreviewOverlayProvider>,
    );
  });
  return { root };
}

function AppHotkeyHarness() {
  const domEditSelectionRef = useRef<DomEditSelection | null>(null);
  const clearDomSelectionRef = useRef<() => void>(() => undefined);

  useAppHotkeys({
    handleTimelineElementsDelete: vi.fn(async () => {}),
    handleTimelineElementSplit: vi.fn(),
    handleDomEditElementDelete: vi.fn(),
    domEditSelectionRef,
    clearDomSelectionRef,
    editHistory: {
      undo: vi.fn(async () => ({ ok: false })),
      redo: vi.fn(async () => ({ ok: false })),
      state: { undo: [], redo: [] },
    },
    readOptionalProjectFile: vi.fn(async () => ""),
    readProjectFile: vi.fn(async () => ""),
    writeProjectFile: vi.fn(async () => undefined),
    showToast: vi.fn(),
    syncHistoryPreviewAfterApply: vi.fn(async () => undefined),
    settlePendingEdits: vi.fn(async () => undefined),
    handleCopy: vi.fn(() => false),
    handlePaste: vi.fn(async () => undefined),
    handleCut: vi.fn(async () => false),
    handleDuplicate: vi.fn(async () => false),
    onResetKeyframes: vi.fn(() => false),
    onDeleteSelectedKeyframes: vi.fn(),
    readOnlyPreview: false,
  });

  return null;
}

function renderToolbarWithAppHotkeys() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <>
        <AppHotkeyHarness />
        <PreviewOverlayProvider>
          <SnapToolbar />
        </PreviewOverlayProvider>
      </>,
    );
  });
  return { root };
}

describe("SnapToolbar keyboard shortcuts", () => {
  it("toggles snap on an unclaimed S keypress", () => {
    const { root } = renderToolbar();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true }),
      );
    });

    expect(
      JSON.parse(window.localStorage.getItem("hf-studio-ui-preferences") ?? "{}").snapEnabled,
    ).toBe(false);
    act(() => root.unmount());
  });

  it("does not toggle snap when another handler already prevented S", () => {
    const { root } = renderToolbar();
    const event = new KeyboardEvent("keydown", {
      key: "s",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();

    act(() => {
      document.dispatchEvent(event);
    });

    expect(
      JSON.parse(window.localStorage.getItem("hf-studio-ui-preferences") ?? "{}").snapEnabled,
    ).not.toBe(false);
    act(() => root.unmount());
  });

  it("does not toggle snap when the app split shortcut claims S without a selected clip", () => {
    const { root } = renderToolbarWithAppHotkeys();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true }),
      );
    });

    expect(
      JSON.parse(window.localStorage.getItem("hf-studio-ui-preferences") ?? "{}").snapEnabled,
    ).not.toBe(false);
    act(() => root.unmount());
  });
});

describe("SnapToolbar keys and a focused control", () => {
  let root: ReturnType<typeof createRoot> | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  const controls: Array<[string, string, string, string]> = [
    ["a combobox", "button", "role", "combobox"],
    ["a select", "select", "name", "font"],
    ["a switch", "button", "role", "switch"],
    ["a video player", "video", "controls", ""],
  ];

  it.each(controls)("leaves S and G alone while %s has focus", (_name, tag, attr, value) => {
    root = renderToolbar().root;
    const control = document.body.appendChild(document.createElement(tag));
    control.setAttribute(attr, value);
    act(() => {
      for (const key of ["s", "g"])
        control.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
    });

    const prefs = JSON.parse(window.localStorage.getItem("hf-studio-ui-preferences") ?? "{}");
    expect(prefs.snapEnabled).not.toBe(false);
    expect(prefs.gridVisible).not.toBe(true);
  });
});

describe("SnapToolbar ruler and safe-margin toggles", () => {
  it.each([
    ["Toggle ruler", "rulerVisible"],
    ["Toggle safe margins", "safeMarginsVisible"],
  ])("%s flips %s and remembers it", (label, key) => {
    usePreviewGuidesStore.setState({ rulerVisible: false, safeMarginsVisible: false });
    const { root } = renderToolbar();
    const button = () => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
    expect(button()?.getAttribute("aria-pressed")).toBe("false");

    act(() => button()?.click());

    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    const stored = window.localStorage.getItem("hf-studio-ui-preferences") ?? "{}";
    expect(JSON.parse(stored)[key]).toBe(true);
    act(() => root.unmount());
  });
});

vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe("preview setting usage", () => {
  it.each([
    ["Toggle snap", "snapping"],
    ["Toggle grid", "grid"],
    ["Toggle ruler", "ruler"],
    ["Toggle safe margins", "safe_margins"],
  ])("counts the %s button without setting values", (label, feature) => {
    const { root } = renderToolbar();
    const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    act(() => button.click());
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature,
      surface: "preview",
      method: "button",
    });
    act(() => root.unmount());
  });
  it("counts keyboard grid toggling once", () => {
    const { root } = renderToolbar();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true })));
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: "grid",
      surface: "preview",
      method: "keyboard",
    });
    act(() => root.unmount());
  });
});

describe("preview field and key gesture counting", () => {
  it("counts a grid spacing edit once when the field settles", () => {
    const { root } = renderToolbar();
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Grid options"]')!.click());
    const input = document.querySelector<HTMLInputElement>('input[type="number"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => input.focus());
    for (const value of ["20", "200"]) {
      act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(trackStudioEvent).not.toHaveBeenCalled();
    act(() => input.blur());
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: "grid_spacing",
      surface: "preview",
      method: "field",
    });
    act(() => root.unmount());
  });
  it("counts snap-to-grid through its committed checkbox", () => {
    const { root } = renderToolbar();
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Grid options"]')!.click());
    act(() => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: "snap_to_grid",
      surface: "preview",
      method: "button",
    });
    act(() => root.unmount());
  });
  it.each(["s", "g"])("does not count auto-repeat as another %s key gesture", (key) => {
    const { root } = renderToolbar();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key, repeat: true, bubbles: true })),
    );
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: key === "s" ? "snapping" : "grid",
      surface: "preview",
      method: "keyboard",
    });
    act(() => root.unmount());
  });
});

it("counts a changed field when click-away dismisses it before blur", () => {
  const { root } = renderToolbar();
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Grid options"]')!.click());
  const input = document.querySelector<HTMLInputElement>('input[type="number"]')!;
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "230");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(document.querySelector('input[type="number"]')).toBeNull();
  expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
    feature: "grid_spacing",
    surface: "preview",
    method: "field",
  });
  act(() => root.unmount());
});
