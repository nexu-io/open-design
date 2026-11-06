// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installReactActEnvironment, makeSelection } from "./domSelectionTestHarness";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { SelectElementOptions, TimelineElement } from "../player";
import { usePlayerStore } from "../player";

installReactActEnvironment();

// ── Module mocks ──
// Control the async selection-resolution ordering so the race guard can be
// exercised deterministically, and neutralise the DOM re-apply side effect.
vi.mock("../components/editor/manualEdits", () => ({
  reapplyPositionEditsAfterSeek: () => undefined,
}));

const deferreds = new Map<string, { promise: Promise<DomEditSelection>; resolve: () => void }>();

function deferredFor(el: HTMLElement): Promise<DomEditSelection> {
  const id = el.id;
  let resolveFn: () => void = () => undefined;
  const promise = new Promise<DomEditSelection>((resolve) => {
    resolveFn = () => resolve(makeSelection(id.toUpperCase(), el));
  });
  deferreds.set(id, { promise, resolve: resolveFn });
  return promise;
}

vi.mock("../components/editor/domEditing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/editor/domEditing")>();
  return {
    ...actual,
    findElementForTimelineElement: (doc: Document, element: { id?: string }) =>
      element.id ? doc.getElementById(element.id) : null,
    resolveDomEditSelection: (startEl: HTMLElement | null) =>
      startEl ? deferredFor(startEl) : Promise.resolve(null),
  };
});

// Imported after the mocks so the hook picks up the mocked modules.
const { useDomSelection } = await import("./useDomSelection");

interface HarnessProps {
  rightPanelTab: "design" | "variables";
  setRightPanelTab: (tab: "design" | "variables") => void;
  iframe: HTMLIFrameElement | null;
  timelineElements: TimelineElement[];
  setSelectedTimelineElementId?: (id: string | null, options?: SelectElementOptions) => void;
  setTimelineSelectionSet?: (ids: Set<string>) => void;
}

function renderHarness(props: HarnessProps) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let currentHook: ReturnType<typeof useDomSelection> | null = null;

  function Harness() {
    currentHook = useDomSelection({
      projectId: "project-1",
      activeCompPath: "index.html",
      isMasterView: false,
      compIdToSrc: new Map(),
      captionEditMode: false,
      previewIframeRef: { current: props.iframe },
      timelineElements: props.timelineElements,
      getTimelineSelectionSet: () => usePlayerStore.getState().selectedElementIds,
      setSelectedTimelineElementId: props.setSelectedTimelineElementId ?? vi.fn(),
      setTimelineSelectionSet:
        props.setTimelineSelectionSet ?? usePlayerStore.getState().setSelectedElementIds,
      setRightCollapsed: vi.fn(),
      setRightPanelTab: props.setRightPanelTab,
      previewIframe: props.iframe,
      refreshKey: 0,
      rightPanelTab: props.rightPanelTab,
    });
    return null;
  }

  act(() => root.render(React.createElement(Harness)));

  return {
    current: () => {
      if (!currentHook) throw new Error("Expected hook result");
      return currentHook;
    },
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("useDomSelection — Variables tab preservation", () => {
  it("does not yank the user off the Variables tab when selecting on canvas", () => {
    const setRightPanelTab = vi.fn();
    const el = document.createElement("div");
    el.id = "headline";
    const harness = renderHarness({
      rightPanelTab: "variables",
      setRightPanelTab,
      iframe: null,
      timelineElements: [],
    });

    act(() => harness.current().applyDomSelection(makeSelection("Headline", el)));

    expect(setRightPanelTab).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("switches to the Design tab when not on Variables (control)", () => {
    const setRightPanelTab = vi.fn();
    const el = document.createElement("div");
    el.id = "headline";
    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab,
      iframe: null,
      timelineElements: [],
    });

    act(() => harness.current().applyDomSelection(makeSelection("Headline", el)));

    expect(setRightPanelTab).toHaveBeenCalledWith("design");
    harness.cleanup();
  });
});

describe("useDomSelection — canvas-only targets replace timeline clips", () => {
  beforeEach(() => {
    deferreds.clear();
    usePlayerStore.getState().clearSelection();
  });
  afterEach(() => {
    deferreds.clear();
    usePlayerStore.getState().clearSelection();
  });

  it("deselects every clip when an audio bus is selected", () => {
    const store = usePlayerStore.getState();
    store.setSelectedElementId("voice-1");
    store.setSelectedElementIds(new Set(["voice-1", "voice-2"]));

    const bus = document.createElement("hf-audio-group");
    bus.id = "voiceover";
    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab: vi.fn(),
      iframe: null,
      timelineElements: [
        { id: "voice-1", tag: "audio", start: 0, duration: 1, track: 0 },
        { id: "voice-2", tag: "audio", start: 1, duration: 1, track: 1 },
      ],
      setSelectedTimelineElementId: usePlayerStore.getState().setSelectedElementId,
      setTimelineSelectionSet: usePlayerStore.getState().setSelectedElementIds,
    });

    act(() => harness.current().applyDomSelection(makeSelection("Voiceover", bus)));

    expect(harness.current().domEditSelection?.id).toBe("voiceover");
    expect(usePlayerStore.getState().selectedElementId).toBeNull();
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set());
    harness.cleanup();
  });

  it("lets a bus supersede a clip selection that is still resolving", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument!;
    const clipNode = doc.createElement("audio");
    clipNode.id = "voice-1";
    const busNode = doc.createElement("hf-audio-group");
    busNode.id = "voiceover";
    doc.body.append(clipNode, busNode);

    const clip: TimelineElement = {
      id: "voice-1",
      domId: "voice-1",
      tag: "audio",
      start: 0,
      duration: 1,
      track: 0,
    };
    const bus: TimelineElement = {
      id: "voiceover",
      domId: "voiceover",
      tag: "audio",
      start: 0,
      duration: 10,
      track: -0.5,
    };
    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab: vi.fn(),
      iframe,
      // The bus is a synthetic row target, not a clip in the store.
      timelineElements: [clip],
      setSelectedTimelineElementId: usePlayerStore.getState().setSelectedElementId,
      setTimelineSelectionSet: usePlayerStore.getState().setSelectedElementIds,
    });

    let pendingClip = Promise.resolve();
    let pendingBus = Promise.resolve();
    act(() => {
      pendingClip = harness.current().handleTimelineElementSelect(clip);
      pendingBus = harness.current().handleTimelineElementSelect(bus);
    });
    await act(async () => {
      deferreds.get("voiceover")?.resolve();
      await pendingBus;
      deferreds.get("voice-1")?.resolve();
      await pendingClip;
    });

    expect(harness.current().domEditSelection?.id).toBe("voiceover");
    expect(usePlayerStore.getState().selectedElementId).toBeNull();
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set());
    harness.cleanup();
    iframe.remove();
  });

  it("preserves clip context for a non-bus canvas-only selection", () => {
    const store = usePlayerStore.getState();
    store.setSelectedElementId("voice-1");
    const decoration = document.createElement("div");
    decoration.id = "decoration";
    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab: vi.fn(),
      iframe: null,
      timelineElements: [{ id: "voice-1", tag: "audio", start: 0, duration: 1, track: 0 }],
      setSelectedTimelineElementId: usePlayerStore.getState().setSelectedElementId,
      setTimelineSelectionSet: usePlayerStore.getState().setSelectedElementIds,
    });

    act(() => harness.current().applyDomSelection(makeSelection("Decoration", decoration)));

    expect(usePlayerStore.getState().selectedElementId).toBe("voice-1");
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["voice-1"]));
    harness.cleanup();
  });
});

describe("useDomSelection — timeline-select race guard", () => {
  beforeEach(() => deferreds.clear());
  afterEach(() => deferreds.clear());

  it("a stale async resolution never clobbers a newer selection", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument!;
    const elA = doc.createElement("div");
    elA.id = "a";
    const elB = doc.createElement("div");
    elB.id = "b";
    doc.body.append(elA, elB);

    const elementA: TimelineElement = { id: "a", tag: "div", start: 0, duration: 1, track: 0 };
    const elementB: TimelineElement = { id: "b", tag: "div", start: 0, duration: 1, track: 0 };

    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab: vi.fn(),
      iframe,
      timelineElements: [elementA, elementB],
    });

    // Fire A then B; both suspend on their (pending) resolveDomEditSelection.
    let pA: Promise<void> = Promise.resolve();
    let pB: Promise<void> = Promise.resolve();
    act(() => {
      pA = harness.current().handleTimelineElementSelect(elementA);
      pB = harness.current().handleTimelineElementSelect(elementB);
    });

    // Resolve the NEWER select (B) first, then the older one (A) last.
    await act(async () => {
      deferreds.get("b")?.resolve();
      await pB;
    });
    await act(async () => {
      deferreds.get("a")?.resolve();
      await pA;
    });

    // The stale A resolution must be dropped: B wins.
    expect(harness.current().domEditSelection?.id).toBe("b");
    harness.cleanup();
    iframe.remove();
  });
});

describe("useDomSelection — marquee multi-select survives the late async primary", () => {
  beforeEach(() => {
    deferreds.clear();
    const store = usePlayerStore.getState();
    store.setSelectedElementId(null);
    store.clearSelectedElementIds();
  });
  afterEach(() => {
    deferreds.clear();
    const store = usePlayerStore.getState();
    store.setSelectedElementId(null);
    store.clearSelectedElementIds();
  });

  function timelineEl(id: string): TimelineElement {
    return { id, domId: id, tag: "div", start: 0, duration: 1, track: 0 };
  }

  // Reproduces the reported regression: a marquee over N clips leaves N members in
  // selectedElementIds, then the inspector-open notify (finishMarquee →
  // handleTimelineElementSelect → applyDomSelection) resolves LATE and writes the
  // primary again. Before the fix that late write collapsed the set to one clip.
  it("keeps all N members when a late primary-set targets a set member", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument!;
    for (const id of ["a", "b", "c"]) {
      const el = doc.createElement("div");
      el.id = id;
      doc.body.append(el);
    }

    const store = usePlayerStore.getState();
    // Marquee end state: primary written first, then the full set (real ordering).
    store.setSelectedElementId("a");
    store.setSelectedElementIds(new Set(["a", "b", "c"]));

    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab: vi.fn(),
      iframe,
      timelineElements: [timelineEl("a"), timelineEl("b"), timelineEl("c")],
      // Wire the real store write so applyDomSelection's collapse decision is exercised.
      setSelectedTimelineElementId: usePlayerStore.getState().setSelectedElementId,
    });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = harness.current().handleTimelineElementSelect(timelineEl("a"));
    });
    await act(async () => {
      deferreds.get("a")?.resolve();
      await pending;
    });

    expect(usePlayerStore.getState().selectedElementIds.size).toBe(3);
    expect(usePlayerStore.getState().selectedElementId).toBe("a");
    harness.cleanup();
    iframe.remove();
  });

  it("collapses the set to a fresh single-click target instead of publishing an empty set", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument!;
    for (const id of ["a", "b", "d"]) {
      const el = doc.createElement("div");
      el.id = id;
      doc.body.append(el);
    }

    const store = usePlayerStore.getState();
    // Stale set left over from a previous gesture.
    store.setSelectedElementId("a");
    store.setSelectedElementIds(new Set(["a", "b"]));

    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab: vi.fn(),
      iframe,
      timelineElements: [timelineEl("a"), timelineEl("b"), timelineEl("d")],
      setSelectedTimelineElementId: usePlayerStore.getState().setSelectedElementId,
    });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = harness.current().handleTimelineElementSelect(timelineEl("d"));
    });
    await act(async () => {
      deferreds.get("d")?.resolve();
      await pending;
    });

    expect([...usePlayerStore.getState().selectedElementIds]).toEqual(["d"]);
    expect(usePlayerStore.getState().selectedElementId).toBe("d");
    harness.cleanup();
    iframe.remove();
  });
});

describe("useDomSelection — picking a clip with no canvas node", () => {
  function timelineEl(id: string): TimelineElement {
    return { id, domId: id, tag: "div", start: 0, duration: 1, track: 0 };
  }

  it("drops the canvas selection without deselecting the clip", async () => {
    // Delete acts on the canvas first, so a canvas selection left pointing at
    // the previous element removed THAT element when the user pressed Delete
    // right after picking an audio clip. Clearing it has to stay quiet, though:
    // announcing the clear back would deselect the clip that was just picked.
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument!;
    const onCanvas = doc.createElement("div");
    onCanvas.id = "on-canvas";
    doc.body.append(onCanvas);

    const setSelectedTimelineElementId = vi.fn();
    const setTimelineSelectionSet = vi.fn();
    const harness = renderHarness({
      rightPanelTab: "design",
      setRightPanelTab: vi.fn(),
      iframe,
      timelineElements: [timelineEl("on-canvas"), timelineEl("audio-only")],
      setSelectedTimelineElementId,
      setTimelineSelectionSet,
    });

    await act(async () => {
      const pending = harness.current().handleTimelineElementSelect(timelineEl("on-canvas"));
      deferreds.get("on-canvas")?.resolve();
      await pending;
    });
    expect(harness.current().domEditSelectionRef.current).not.toBeNull();

    setSelectedTimelineElementId.mockClear();
    setTimelineSelectionSet.mockClear();
    await act(async () => {
      await harness.current().handleTimelineElementSelect(timelineEl("audio-only"));
    });

    expect(harness.current().domEditSelectionRef.current).toBeNull();
    expect(setSelectedTimelineElementId).not.toHaveBeenCalled();
    expect(setTimelineSelectionSet).not.toHaveBeenCalled();

    harness.cleanup();
  });
});
