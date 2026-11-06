// @vitest-environment happy-dom

/**
 * The header on the shared primitives: Capture and Inspector grouped, Export separate,
 * hotkey filters unchanged (KTD13). Contexts are mocked, not provided.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buttonSizes, buttonVariants } from "./ui";
import { isTypingTarget } from "../utils/typingTarget";
import { shouldIgnorePlaybackShortcutTarget } from "../player/lib/playbackShortcuts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const editHistory = {
  canUndo: false,
  canRedo: false,
  undoLabel: undefined as string | undefined,
  redoLabel: undefined as string | undefined,
};
const renderQueue = { isRendering: false, ffmpegMissing: false };

vi.mock("../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({
    projectId: "demo",
    editHistory,
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    renderQueue,
  }),
}));

vi.mock("../contexts/PanelLayoutContext", () => ({
  usePanelLayoutContext: () => ({
    rightCollapsed: false,
    setRightCollapsed: vi.fn(),
    setRightPanelTab: vi.fn(),
  }),
}));

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
// Probes the preview server on mount; covered in OpenInDesktopButton.dom.test.tsx.
vi.mock("./OpenInDesktopButton", () => ({ OpenInDesktopButton: () => null }));

const { StudioHeader } = await import("./StudioHeader");
const { ShowThemeToggle } = await import("./ThemeToggle");

let mounted: { root: Root; host: HTMLElement } | null = null;

beforeEach(() => {
  editHistory.canUndo = false;
  editHistory.canRedo = false;
  editHistory.undoLabel = undefined;
  editHistory.redoLabel = undefined;
  renderQueue.isRendering = false;
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = null;
  act(() => root.unmount());
  host.remove();
});

function mount(
  props: { inspectorButtonActive?: boolean; themeToggle?: boolean } = {},
): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  const header = (
    <StudioHeader
      captureFrameHref="blob:frame"
      captureFrameFilename="frame.png"
      handleCaptureFrameClick={vi.fn()}
      refreshCaptureFrameTime={vi.fn()}
      inspectorButtonActive={props.inspectorButtonActive ?? false}
      inspectorPanelActive={false}
    />
  );
  act(() =>
    root.render(
      props.themeToggle ? (
        <ShowThemeToggle.Provider value>{header}</ShowThemeToggle.Provider>
      ) : (
        header
      ),
    ),
  );
  return host;
}

function query(host: HTMLElement, selector: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`not rendered: ${selector}`);
  return el;
}

/** Every class the recipe asks for, on the element the header rendered. */
function expectRecipe(el: HTMLElement, ...recipes: string[]): void {
  const applied = new Set(el.className.split(/\s+/));
  for (const recipe of recipes) {
    for (const token of recipe.split(/\s+/)) {
      expect(applied, `${token} missing from: ${el.className}`).toContain(token);
    }
  }
}

it("renders Export as the shared primary Button at the medium size", () => {
  const host = mount();

  expectRecipe(
    query(host, '[data-testid="header-export"]'),
    buttonVariants.primary,
    buttonSizes.md,
  );
});

it("no longer renders Undo or Redo in the header", () => {
  const host = mount();

  expect(host.querySelector('[aria-label="Undo"]')).toBeNull();
  expect(host.querySelector('[aria-label="Redo"]')).toBeNull();
});

it("groups Capture and Inspector in one bordered segment, Export outside it", () => {
  const host = mount();
  const group = query(host, '[aria-label="Capture current frame"]').closest(".divide-x");

  expect(group?.contains(query(host, '[aria-label="Inspector"]'))).toBe(true);
  expect(group?.contains(query(host, '[data-testid="header-export"]'))).toBe(false);
  expect(group).not.toBeNull();
});

it("drops the Capture label below 1000px but keeps its accessible name", () => {
  const host = mount();
  const capture = query(host, '[aria-label="Capture current frame"]');

  expect(query(capture, "span").className).toContain("max-[1000px]:hidden");
});

/** The bare token, not a `hover:`/`data-[…]:`-prefixed variant of it. */
function hasToken(className: string, token: string): boolean {
  return className.split(/\s+/).includes(token);
}

it("shows Inspector pressed and filled only when on", () => {
  const host = mount({ inspectorButtonActive: true });
  const on = query(host, '[aria-label="Inspector"]');
  expect(on.getAttribute("aria-pressed")).toBe("true");
  expect(hasToken(on.className, "text-accent-ink")).toBe(true);
  expect(hasToken(on.className, "bg-on")).toBe(true);
  act(() => mounted?.root.unmount());
  mounted?.host.remove();
  mounted = null;

  const off = query(mount(), '[aria-label="Inspector"]');
  expect(off.getAttribute("aria-pressed")).toBe("false");
  expect(hasToken(off.className, "text-accent-ink")).toBe(false);
  expect(hasToken(off.className, "bg-on")).toBe(false);
});

it("keeps Capture a real download link rather than a button", () => {
  // `download` is what saves the frame. A Button here would render a <button>
  // and the control would quietly stop downloading anything.
  const host = mount();
  const capture = query(host, '[aria-label="Capture current frame"]');

  expect(capture.tagName).toBe("A");
  expect(capture.getAttribute("download")).toBe("frame.png");
  // h-full replaces the md height: the group's own h-ctl sets the shared control height.
  expectRecipe(capture, "px-3", "text-step-12");
});

it("classifies the new header controls for the hotkey filters as the old ones were (KTD13)", () => {
  // Every one of these was a <button> or an <a href> before the sweep: never a
  // typing target, always claimed by the playback filter. A primitive that
  // rendered a different element would leak or swallow hotkeys in silence.
  const host = mount();
  const controls = [
    query(host, '[data-testid="header-export"]'),
    query(host, '[aria-label="Inspector"]'),
    query(host, '[aria-label="Capture current frame"]'),
  ];

  for (const el of controls) {
    expect(isTypingTarget(el), el.getAttribute("aria-label") ?? el.tagName).toBe(false);
    expect(shouldIgnorePlaybackShortcutTarget(el), el.tagName).toBe(true);
  }
});

it("shows no theme toggle and leaves the host's data-theme alone when embedded", () => {
  document.documentElement.dataset.theme = "host";
  const host = mount();
  expect(host.querySelector('[aria-label^="Switch to"]')).toBeNull();
  expect(document.documentElement.dataset.theme).toBe("host");
});

it("shows the theme toggle in Studio's own app", () => {
  expect(mount({ themeToggle: true }).querySelector('[aria-label^="Switch to"]')).not.toBeNull();
});
