// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanupMounted, mountHost } from "./ui/mountHost.testHelpers";
import { isTypingTarget } from "../utils/typingTarget";
import { shouldIgnorePlaybackShortcutTarget } from "../player/lib/playbackShortcuts";

const editHistory = {
  canUndo: false,
  canRedo: false,
  undoLabel: undefined as string | undefined,
  redoLabel: undefined as string | undefined,
};
const handleUndo = vi.fn();
const handleRedo = vi.fn();
const trackStudioEvent = vi.fn();

const studioShell = { editHistory, handleUndo, handleRedo };
let shell: typeof studioShell | null = studioShell;
vi.mock("../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => shell,
}));
vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent }));

const { TimelineHistoryButtons } = await import("./TimelineHistoryButtons");
const { TimelineToolbar } = await import("./TimelineToolbar");

beforeEach(() => {
  Object.assign(editHistory, {
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    redoLabel: undefined,
  });
  shell = studioShell;
  vi.clearAllMocks();
});

afterEach(cleanupMounted);

const mount = mountHost;

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!el) throw new Error(`not rendered: ${label}`);
  return el;
}

function click(el: HTMLElement): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

it("calls handleUndo once and tracks the event when Undo is enabled", () => {
  editHistory.canUndo = true;
  const host = mount(<TimelineHistoryButtons />);

  click(button(host, "Undo"));

  expect(handleUndo).toHaveBeenCalledTimes(1);
  expect(handleRedo).not.toHaveBeenCalled();
  expect(trackStudioEvent).toHaveBeenCalledWith("toolbar_action", { action: "undo" });
});

it("calls handleRedo once and tracks the event when Redo is enabled", () => {
  editHistory.canRedo = true;
  const host = mount(<TimelineHistoryButtons />);

  click(button(host, "Redo"));

  expect(handleRedo).toHaveBeenCalledTimes(1);
  expect(trackStudioEvent).toHaveBeenCalledWith("toolbar_action", { action: "redo" });
});

it("disables both buttons and ignores clicks on an empty history", () => {
  const host = mount(<TimelineHistoryButtons />);

  for (const label of ["Undo", "Redo"]) {
    const el = button(host, label);
    expect(el.disabled).toBe(true);
    expect(el.className).toContain("cursor-not-allowed");
    click(el);
  }
  expect(handleUndo).not.toHaveBeenCalled();
  expect(handleRedo).not.toHaveBeenCalled();
  expect(trackStudioEvent).not.toHaveBeenCalled();
});

it("leaves enabled buttons without the disabled attribute", () => {
  editHistory.canUndo = true;
  const el = button(mount(<TimelineHistoryButtons />), "Undo");

  expect(el.disabled).toBe(false);
  expect(el.className).not.toContain("cursor-not-allowed");
});

it("orders the toolbar Undo, Redo, then the tool picker showing the active tool", () => {
  const host = mount(<TimelineToolbar />);
  const labels = Array.from(host.querySelectorAll("button"))
    .map((b) => b.getAttribute("aria-label"))
    .filter((l) => l !== null)
    .slice(0, 3);

  expect(labels).toEqual(["Undo", "Redo", "Timeline tool: Select"]);
});

it("shows the Split tool on the picker while the razor is active", async () => {
  const { usePlayerStore } = await import("../player");
  usePlayerStore.setState({ activeTool: "razor" });
  try {
    const host = mount(<TimelineToolbar />);
    expect(host.querySelector('button[aria-label="Timeline tool: Split"]')).not.toBeNull();
  } finally {
    usePlayerStore.setState({ activeTool: "select" });
  }
});

it("classifies Undo and Redo for the hotkey filters at their new location (KTD13)", () => {
  // The header's own version of this check dropped Undo/Redo when they moved
  // here; a <button> is never a typing target and is always claimed by the
  // playback filter, same as every other toolbar tool.
  const host = mount(<TimelineHistoryButtons />);

  for (const label of ["Undo", "Redo"]) {
    const el = button(host, label);
    expect(isTypingTarget(el), label).toBe(false);
    expect(shouldIgnorePlaybackShortcutTarget(el), label).toBe(true);
  }
});

it("takes a host's history props over the shell's", async () => {
  editHistory.canUndo = true;
  editHistory.redoLabel = "shell move";
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  const host = mount(
    <TimelineHistoryButtons
      canUndo={false}
      canRedo
      redoLabel="host trim"
      onUndo={onUndo}
      onRedo={onRedo}
    />,
  );

  expect(button(host, "Undo").disabled).toBe(true);
  act(() => button(host, "Redo").focus());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("Redo host trim");
  click(button(host, "Redo"));

  expect(onRedo).toHaveBeenCalledTimes(1);
  expect(handleRedo).not.toHaveBeenCalled();
});

it("keeps a button disabled when it has no handler, whatever canUndo/canRedo say", () => {
  shell = null;
  const host = mount(<TimelineHistoryButtons canUndo canRedo />);

  for (const label of ["Undo", "Redo"]) expect(button(host, label).disabled).toBe(true);
});
