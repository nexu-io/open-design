// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../player";
import type { DomEditSelection } from "../components/editor/domEditing";
import { installReactActEnvironment, makeSelection } from "./domSelectionTestHarness";
import { useTimelineSelectionPreviewSync } from "./useTimelineSelectionPreviewSync";

installReactActEnvironment();

interface HarnessProps {
  selectedElementId: string | null;
  selectedElementIds: Set<string>;
  timelineElements: TimelineElement[];
  domEditSelection: DomEditSelection | null;
  domEditGroupSelections: DomEditSelection[];
  buildDomSelectionForTimelineElement: (
    element: TimelineElement,
  ) => Promise<DomEditSelection | null>;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: { revealPanel?: boolean; additive?: boolean; preserveGroup?: boolean },
  ) => void;
  applyMarqueeSelection: (selections: DomEditSelection[], additive: boolean) => void;
  onSelectionNotFound: () => void;
}

afterEach(() => {
  document.body.innerHTML = "";
});

function renderHarness() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  function Harness(nextProps: HarnessProps) {
    useTimelineSelectionPreviewSync({
      ...nextProps,
      activeCompPath: "index.html",
    });
    return null;
  }

  const rerender = async (nextProps: HarnessProps) => {
    await act(async () => {
      root.render(React.createElement(Harness, nextProps));
      await Promise.resolve();
    });
  };

  return {
    rerender,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function makeSyncFixture() {
  const firstElement = document.createElement("div");
  firstElement.id = "clip-1";
  const secondElement = document.createElement("div");
  secondElement.id = "clip-2";
  const firstSelection = makeSelection("First", firstElement);
  const secondSelection = makeSelection("Second", secondElement);
  const timelineElements: TimelineElement[] = [
    { id: "clip-1", domId: "clip-1", tag: "div", start: 0, duration: 1, track: 0 },
    { id: "clip-2", domId: "clip-2", tag: "div", start: 1, duration: 1, track: 1 },
  ];
  const selectionById = new Map([
    ["clip-1", firstSelection],
    ["clip-2", secondSelection],
  ]);
  return { firstSelection, secondSelection, timelineElements, selectionById };
}

describe("useTimelineSelectionPreviewSync", () => {
  it("syncs a multi-id timeline selection into preview group selections", async () => {
    const { firstSelection, secondSelection, timelineElements, selectionById } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const buildDomSelectionForTimelineElement = vi.fn(async (element: TimelineElement) => {
      return selectionById.get(element.id) ?? null;
    });
    const harness = renderHarness();

    await harness.rerender({
      selectedElementId: "clip-2",
      selectedElementIds: new Set(["clip-1", "clip-2"]),
      timelineElements,
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound: vi.fn(),
    });

    expect(applyMarqueeSelection).toHaveBeenCalledWith([secondSelection, firstSelection], false);
    expect(applyDomSelection).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("clears preview selection when the timeline selection set is empty", async () => {
    const { firstSelection, timelineElements, selectionById } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const harness = renderHarness();
    const buildDomSelectionForTimelineElement = vi.fn(async (element: TimelineElement) => {
      return selectionById.get(element.id) ?? null;
    });

    await harness.rerender({
      selectedElementId: "clip-1",
      selectedElementIds: new Set(["clip-1"]),
      timelineElements,
      domEditSelection: firstSelection,
      domEditGroupSelections: [firstSelection],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound: vi.fn(),
    });

    await harness.rerender({
      selectedElementId: null,
      selectedElementIds: new Set(),
      timelineElements,
      domEditSelection: firstSelection,
      domEditGroupSelections: [firstSelection],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound: vi.fn(),
    });

    expect(applyDomSelection).toHaveBeenCalledWith(null, { revealPanel: false });
    expect(applyMarqueeSelection).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("drops a canvas selection that points outside the timeline selection", async () => {
    // The reveal paths (sidebar audio/asset click, asset drop) select a clip
    // with no canvas node. Bailing here kept whatever the canvas held, and
    // Delete acts on the canvas first — so pressing it deleted the element the
    // user had selected before, and left the clip they had just picked.
    const { firstSelection, timelineElements } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    // clip-2 is a timeline element with no DOM node — an audio clip.
    const buildDomSelectionForTimelineElement = vi.fn(async () => null);
    const harness = renderHarness();

    await harness.rerender({
      selectedElementId: "clip-2",
      selectedElementIds: new Set(["clip-2"]),
      timelineElements,
      domEditSelection: firstSelection,
      domEditGroupSelections: [firstSelection],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound: vi.fn(),
    });

    // Quietly: announcing the clear would deselect the clip just picked.
    expect(applyDomSelection).toHaveBeenCalledWith(null, {
      revealPanel: false,
      announce: false,
    });
    harness.cleanup();
  });

  it("does not clear the selection when the selected clip is not in timelineElements yet", async () => {
    // A freshly-dropped clip is selected before the reload that adds it to
    // timelineElements has completed. Bailing quietly here (like the
    // DOM-node-not-ready case above) lets the later effect run, once the
    // element exists, apply the selection instead of wiping it.
    const { timelineElements } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const onSelectionNotFound = vi.fn();
    const buildDomSelectionForTimelineElement = vi.fn(async () => null);
    const harness = renderHarness();

    await harness.rerender({
      selectedElementId: "clip-3",
      selectedElementIds: new Set(["clip-3"]),
      timelineElements,
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound,
    });

    // Still within the retry grace window: quiet, not yet a warning.
    expect(onSelectionNotFound).not.toHaveBeenCalled();
    expect(applyDomSelection).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("does not shrink a pasted or duplicated group's selection when only some members have appeared yet", async () => {
    // Paste/duplicate of a group selects every new id up front; one member
    // (clip-1) is already in timelineElements, the other (a fresh paste/dup
    // target, "clip-3") is not yet. Applying only the resolved member would
    // silently drop the rest of the group from the store.
    const { firstSelection, timelineElements, selectionById } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const onSelectionNotFound = vi.fn();
    const buildDomSelectionForTimelineElement = vi.fn(async (element: TimelineElement) => {
      return selectionById.get(element.id) ?? firstSelection;
    });
    const harness = renderHarness();

    await harness.rerender({
      selectedElementId: "clip-1",
      selectedElementIds: new Set(["clip-1", "clip-3"]),
      timelineElements,
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound,
    });

    // Still within the retry grace window: quiet, not yet a warning.
    expect(onSelectionNotFound).not.toHaveBeenCalled();
    expect(applyDomSelection).not.toHaveBeenCalled();
    expect(applyMarqueeSelection).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("stays quiet through retries and resolves once the preview refreshes", async () => {
    const { secondSelection, timelineElements } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const onSelectionNotFound = vi.fn();
    let previewReady = false;
    const buildDomSelectionForTimelineElement = vi.fn(async () =>
      previewReady ? secondSelection : null,
    );
    const selectedElementIds = new Set(["clip-2"]);
    const harness = renderHarness();

    await harness.rerender({
      selectedElementId: "clip-2",
      selectedElementIds,
      timelineElements,
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound,
    });

    expect(onSelectionNotFound).not.toHaveBeenCalled();
    expect(applyDomSelection).not.toHaveBeenCalled();

    await harness.rerender({
      selectedElementId: "clip-2",
      selectedElementIds,
      timelineElements: [...timelineElements],
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound,
    });

    expect(onSelectionNotFound).not.toHaveBeenCalled();

    previewReady = true;
    await harness.rerender({
      selectedElementId: "clip-2",
      selectedElementIds,
      timelineElements: [...timelineElements],
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound,
    });

    expect(applyDomSelection).toHaveBeenCalledWith(secondSelection);
    expect(onSelectionNotFound).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("degrades to the resolvable subset once a group member never resolves", async () => {
    // clip-2 is a permanent hold-out (deleted out of band, a stale id, or
    // anything else that will never build a selection). Retrying forever
    // would leave the whole group's selection stuck; after a few attempts,
    // apply the members that did resolve instead.
    const { firstSelection, timelineElements } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const onSelectionNotFound = vi.fn();
    const buildDomSelectionForTimelineElement = vi.fn(async (element: TimelineElement) =>
      element.id === "clip-1" ? firstSelection : null,
    );
    const selectedElementIds = new Set(["clip-1", "clip-2"]);
    const harness = renderHarness();

    for (let attempt = 0; attempt < 4; attempt++) {
      await harness.rerender({
        selectedElementId: "clip-1",
        selectedElementIds,
        timelineElements: [...timelineElements],
        domEditSelection: null,
        domEditGroupSelections: [],
        buildDomSelectionForTimelineElement,
        applyDomSelection,
        applyMarqueeSelection,
        onSelectionNotFound,
      });
    }

    expect(onSelectionNotFound).toHaveBeenCalledOnce();
    expect(applyDomSelection).toHaveBeenCalledWith(firstSelection);
    expect(applyMarqueeSelection).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("gives a fresh retry budget after deselecting a permanently-unresolvable selection", async () => {
    // Same permanent hold-out as the test above, but the user deselects and
    // reselects the exact same group afterward. Without resetting the retry
    // budget on deselect, reselecting the same key resumes an already-
    // exhausted count and degrades on the very first attempt with no warning.
    const { firstSelection, timelineElements } = makeSyncFixture();
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const onSelectionNotFound = vi.fn();
    const buildDomSelectionForTimelineElement = vi.fn(async (element: TimelineElement) =>
      element.id === "clip-1" ? firstSelection : null,
    );
    const selectedElementIds = new Set(["clip-1", "clip-2"]);
    const harness = renderHarness();

    for (let attempt = 0; attempt < 4; attempt++) {
      await harness.rerender({
        selectedElementId: "clip-1",
        selectedElementIds,
        timelineElements: [...timelineElements],
        domEditSelection: null,
        domEditGroupSelections: [],
        buildDomSelectionForTimelineElement,
        applyDomSelection,
        applyMarqueeSelection,
        onSelectionNotFound,
      });
    }
    expect(onSelectionNotFound).toHaveBeenCalledOnce();

    await harness.rerender({
      selectedElementId: null,
      selectedElementIds: new Set(),
      timelineElements: [...timelineElements],
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound,
    });

    for (let attempt = 0; attempt < 4; attempt++) {
      await harness.rerender({
        selectedElementId: "clip-1",
        selectedElementIds,
        timelineElements: [...timelineElements],
        domEditSelection: null,
        domEditGroupSelections: [],
        buildDomSelectionForTimelineElement,
        applyDomSelection,
        applyMarqueeSelection,
        onSelectionNotFound,
      });
    }

    expect(onSelectionNotFound).toHaveBeenCalledTimes(2);
    harness.cleanup();
  });

  it("resolves every member of a large selection concurrently, not one network round trip at a time", async () => {
    const elementCount = 30;
    const timelineElements: TimelineElement[] = Array.from({ length: elementCount }, (_, i) => ({
      id: `clip-${i}`,
      domId: `clip-${i}`,
      tag: "div",
      start: i,
      duration: 1,
      track: i % 4,
    }));
    const selectionById = new Map(
      timelineElements.map((el) => {
        const domEl = document.createElement("div");
        domEl.id = el.id;
        return [el.id, makeSelection(el.id, domEl)];
      }),
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const buildDomSelectionForTimelineElement = vi.fn(async (element: TimelineElement) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Stands in for the network round trip: yields once so every member's
      // call has a chance to start before any of them finish.
      await Promise.resolve();
      inFlight -= 1;
      return selectionById.get(element.id) ?? null;
    });
    const applyDomSelection = vi.fn();
    const applyMarqueeSelection = vi.fn();
    const harness = renderHarness();

    await harness.rerender({
      selectedElementId: timelineElements[0].id,
      selectedElementIds: new Set(timelineElements.map((el) => el.id)),
      timelineElements,
      domEditSelection: null,
      domEditGroupSelections: [],
      buildDomSelectionForTimelineElement,
      applyDomSelection,
      applyMarqueeSelection,
      onSelectionNotFound: vi.fn(),
    });

    expect(buildDomSelectionForTimelineElement).toHaveBeenCalledTimes(elementCount);
    // A sequential loop never has more than one call in flight at once; this
    // asserts every member's probe started before any of them resolved.
    expect(maxInFlight).toBe(elementCount);
    expect(applyMarqueeSelection).toHaveBeenCalledOnce();
    expect(applyMarqueeSelection.mock.calls[0]?.[0]).toHaveLength(elementCount);
    harness.cleanup();
  });
});
