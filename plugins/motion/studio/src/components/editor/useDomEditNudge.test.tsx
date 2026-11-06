// fallow-ignore-file code-duplication
import { trackStudioEvent } from "../../utils/studioTelemetry";
// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installReactActEnvironment, makeSelection } from "../../hooks/domSelectionTestHarness";
import { useDomEditNudge, type UseDomEditNudgeParams } from "./useDomEditNudge";
import { CANVAS_NUDGE_COMMIT_DEBOUNCE_MS, CANVAS_NUDGE_STEP_PX } from "./domEditNudge";
import { __resetForTests } from "../../utils/canvasNudgeGate";
import {
  flushStudioPendingEdits,
  hasStudioPendingEdits,
  trackedStudioEdit,
} from "../../utils/studioPendingEdits";
import type { DomEditSelection } from "./domEditing";
import type { OverlayRect } from "./domEditOverlayGeometry";

installReactActEnvironment();

function makeRef<T>(current: T): { current: T } {
  return { current };
}

const REST_RECT: OverlayRect = {
  left: 0,
  top: 0,
  width: 100,
  height: 50,
  editScaleX: 1,
  editScaleY: 1,
};

// Stable across renders on purpose: the test targets the `selection` identity
// key specifically, so `groupSelections` must not itself be a source of churn.
const EMPTY_GROUP_SELECTIONS: DomEditSelection[] = [];
let flushNudge = () => {};

function Harness({
  selection,
  onPathOffsetCommit,
  onManualDragStart = () => {},
}: {
  selection: DomEditSelection | null;
  onPathOffsetCommit: UseDomEditNudgeParams["onPathOffsetCommitRef"]["current"];
  onManualDragStart?: () => void;
}) {
  flushNudge = useDomEditNudge({
    selection,
    groupSelections: EMPTY_GROUP_SELECTIONS,
    allowCanvasMovement: true,
    selectionRef: makeRef(selection),
    overlayRectRef: makeRef(REST_RECT),
    groupOverlayItemsRef: makeRef([]),
    gestureRef: makeRef(null),
    groupGestureRef: makeRef(null),
    blockedMoveRef: makeRef(null),
    onManualDragStartRef: makeRef(onManualDragStart),
    onBlockedMoveRef: makeRef(() => {}),
    onPathOffsetCommitRef: makeRef(onPathOffsetCommit),
    onGroupPathOffsetCommitRef: makeRef(async () => {}),
  }).flushNudge;
  return null;
}

function dispatchArrowRight(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
  );
}

describe("useDomEditNudge — selection cleanup keyed on stable identity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a nudge burst alive when the parent hands down a new selection object for the same element", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    const element = document.createElement("div");
    element.id = "dot-a";
    document.body.append(element);

    const commit = vi.fn();
    const firstSelection = makeSelection("Dot", element);

    act(() => {
      root.render(
        React.createElement(Harness, { selection: firstSelection, onPathOffsetCommit: commit }),
      );
    });

    act(() => {
      dispatchArrowRight();
    });
    expect(commit).not.toHaveBeenCalled();

    // Re-render with a BRAND NEW selection object describing the SAME element
    // (same id) — exactly what an un-memoized parent does on every render.
    // Before the fix, the cleanup effect was keyed on this object's identity
    // and would flush the burst right here, one arrow-press early.
    const secondSelection = makeSelection("Dot", element);
    act(() => {
      root.render(
        React.createElement(Harness, { selection: secondSelection, onPathOffsetCommit: commit }),
      );
    });
    expect(commit).not.toHaveBeenCalled();

    act(() => {
      dispatchArrowRight();
    });
    expect(commit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10);
    });

    // One combined commit for both presses, not two separate (premature) ones.
    expect(commit).toHaveBeenCalledTimes(1);
    const [, next] = commit.mock.calls[0] as [DomEditSelection, { x: number; y: number }];
    expect(next.x).toBeCloseTo(2 * CANVAS_NUDGE_STEP_PX);
    expect(next.y).toBeCloseTo(0);

    act(() => root.unmount());
    host.remove();
    element.remove();
  });

  it("leaves arrows on a focused slider alone", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const element = document.createElement("div");
    element.id = "dot-a";
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    document.body.append(element, slider);
    const commit = vi.fn();
    act(() => {
      root.render(
        React.createElement(Harness, {
          selection: makeSelection("Dot", element),
          onPathOffsetCommit: commit,
        }),
      );
    });
    act(() => {
      slider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
      vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10);
    });
    expect(commit).not.toHaveBeenCalled();
    act(() => root.unmount());
    host.remove();
    element.remove();
    slider.remove();
  });

  it("still flushes the burst when the selection actually changes to a different element", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    const elementA = document.createElement("div");
    elementA.id = "dot-a";
    document.body.append(elementA);
    const elementB = document.createElement("div");
    elementB.id = "dot-b";
    document.body.append(elementB);

    const commit = vi.fn();
    const selectionA = makeSelection("Dot A", elementA);
    const selectionB = makeSelection("Dot B", elementB);

    act(() => {
      root.render(
        React.createElement(Harness, { selection: selectionA, onPathOffsetCommit: commit }),
      );
    });

    act(() => {
      dispatchArrowRight();
    });
    expect(commit).not.toHaveBeenCalled();

    // A genuine selection change (different id) must still flush immediately —
    // only same-identity re-renders should be ignored.
    act(() => {
      root.render(
        React.createElement(Harness, { selection: selectionB, onPathOffsetCommit: commit }),
      );
    });
    expect(commit).toHaveBeenCalledTimes(1);
    const [committedSelection, next] = commit.mock.calls[0] as [
      DomEditSelection,
      { x: number; y: number },
    ];
    expect(committedSelection.element).toBe(elementA);
    expect(next.x).toBeCloseTo(CANVAS_NUDGE_STEP_PX);

    act(() => root.unmount());
    host.remove();
    elementA.remove();
    elementB.remove();
  });

  it("flushes the burst when switching between two id-less siblings that share a selector", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    // Two id-less siblings with the SAME selector — distinguished only by
    // selectorIndex. Under the old `id ?? selector ?? label` key they shared
    // one identity, so selecting B mid-burst didn't flush A and the next arrow
    // kept moving A. The key now folds in selectorIndex, so they're distinct.
    const elementA = document.createElement("div");
    document.body.append(elementA);
    const elementB = document.createElement("div");
    document.body.append(elementB);

    const commit = vi.fn();
    const base = (label: string, element: HTMLElement) => ({
      ...makeSelection(label, element),
      id: undefined,
      selector: "div.row",
    });
    const selectionA: DomEditSelection = { ...base("Row", elementA), selectorIndex: 0 };
    const selectionB: DomEditSelection = { ...base("Row", elementB), selectorIndex: 1 };

    act(() => {
      root.render(
        React.createElement(Harness, { selection: selectionA, onPathOffsetCommit: commit }),
      );
    });

    act(() => {
      dispatchArrowRight();
    });
    expect(commit).not.toHaveBeenCalled();

    act(() => {
      root.render(
        React.createElement(Harness, { selection: selectionB, onPathOffsetCommit: commit }),
      );
    });

    // The sibling switch must flush A's pending burst exactly once, for A.
    expect(commit).toHaveBeenCalledTimes(1);
    const [committedSelection, next] = commit.mock.calls[0] as [
      DomEditSelection,
      { x: number; y: number },
    ];
    expect(committedSelection.element).toBe(elementA);
    expect(next.x).toBeCloseTo(CANVAS_NUDGE_STEP_PX);

    act(() => root.unmount());
    host.remove();
    elementA.remove();
    elementB.remove();
  });
});

describe("useDomEditNudge — a focused native player owns the arrow keys", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetForTests();
  });
  let root: ReturnType<typeof createRoot> | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it.each(["video", "audio"])(
    "does not nudge the selection while a <%s controls> has focus",
    (tag) => {
      root = createRoot(document.body.appendChild(document.createElement("div")));
      const element = document.body.appendChild(document.createElement("div"));
      element.id = "dot";
      const player = document.body.appendChild(document.createElement(tag));
      player.setAttribute("controls", "");
      const commit = vi.fn();
      act(() => {
        root?.render(
          React.createElement(Harness, {
            selection: makeSelection("Dot", element),
            onPathOffsetCommit: commit,
          }),
        );
      });
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        player.dispatchEvent(event);
        vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(commit).not.toHaveBeenCalled();
    },
  );
});

describe("useDomEditNudge carries the route its press chose", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetForTests();
  });
  afterEach(() => vi.useRealTimers());

  it("commits an element without GSAP on the CSS route", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const element = document.createElement("div");
    document.body.append(element);
    const commit = vi.fn();
    act(() => {
      root.render(
        React.createElement(Harness, {
          selection: makeSelection("Dot", element),
          onPathOffsetCommit: commit,
        }),
      );
    });
    act(() => dispatchArrowRight());
    act(() => vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10));
    expect(commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ plainTranslate: true }),
    );
    act(() => root.unmount());
    element.remove();
  });
});

describe("useDomEditNudge pauses playback before it snapshots the timelines", () => {
  let reactRoot: ReturnType<typeof createRoot> | null = null;
  const pause = vi.fn();
  const mount = (selection: DomEditSelection | null) => {
    reactRoot = createRoot(document.createElement("div"));
    act(() => {
      reactRoot!.render(
        React.createElement(Harness, {
          selection,
          onPathOffsetCommit: vi.fn(),
          onManualDragStart: pause,
        }),
      );
    });
  };
  beforeEach(() => {
    vi.useFakeTimers();
    __resetForTests();
    pause.mockReset();
  });
  afterEach(() => {
    act(() => reactRoot?.unmount());
    reactRoot = null;
    document.body.innerHTML = "";
    vi.useRealTimers();
    delete (window as { __timelines?: unknown }).__timelines;
  });

  it("does not resume a timeline the playback pause stopped", () => {
    let playing = true;
    const root = { pause: () => void (playing = false), paused: () => !playing };
    (window as { __timelines?: unknown }).__timelines = { root };
    pause.mockImplementation(root.pause);
    const element = document.body.appendChild(document.createElement("div"));
    mount(makeSelection("Dot", element));

    act(() => dispatchArrowRight());

    expect(element.hasAttribute("data-hf-drag-paused-timelines")).toBe(false);
  });

  it("leaves playback alone when no layer can move", () => {
    mount(null);

    act(() => dispatchArrowRight());

    expect(pause).not.toHaveBeenCalled();
  });
});

/** A burst-ready Harness on a fresh element, under fake timers. */
function mountBurstHarness(
  id: string,
  onPathOffsetCommit: UseDomEditNudgeParams["onPathOffsetCommitRef"]["current"],
) {
  __resetForTests();
  vi.useFakeTimers();
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  const element = document.body.appendChild(document.createElement("div"));
  element.id = id;
  act(() => {
    root.render(
      React.createElement(Harness, {
        selection: makeSelection("Dot", element),
        onPathOffsetCommit,
      }),
    );
  });
  return root;
}

describe("useDomEditNudge — undo right after a burst", () => {
  it("undo's drain commits a burst still inside its debounce and waits for its save", async () => {
    let saved!: () => void;
    const commit = vi.fn(() => new Promise<void>((resolve) => (saved = resolve)));
    const root = mountBurstHarness("dot-undo", commit);
    act(() => dispatchArrowRight());

    let drained = false;
    const drain = flushStudioPendingEdits().then(() => (drained = true));
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(drained).toBe(false);
    saved();
    await drain;
    expect(drained).toBe(true);
    act(() => root.unmount());
  });

  it("counts the burst as a pending edit from its first key until its save lands", async () => {
    let saved!: () => void;
    const commit = vi.fn(() => new Promise<void>((resolve) => (saved = resolve)));
    const root = mountBurstHarness("dot-pending", commit);
    expect(hasStudioPendingEdits()).toBe(false);
    act(() => dispatchArrowRight());
    expect(hasStudioPendingEdits()).toBe(true);
    act(() => vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(hasStudioPendingEdits()).toBe(true);
    vi.useRealTimers();
    saved();
    await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
    act(() => root.unmount());
  });
});

describe("useDomEditNudge — a Design-panel edit during a burst", () => {
  it("commits the burst before the panel edit, so one undo takes back the panel edit", async () => {
    const order: string[] = [];
    const root = mountBurstHarness("dot-panel", async () => void order.push("nudge"));
    try {
      act(() => dispatchArrowRight());
      const panelEdit = trackedStudioEdit(async () => void order.push("width"), {
        afterOlderSaves: true,
      })();
      vi.useRealTimers();
      await panelEdit;
      expect(order).toEqual(["nudge", "width"]);
    } finally {
      vi.useRealTimers();
      act(() => root.unmount());
    }
  });
});

describe("useDomEditNudge — a commit that throws", () => {
  it("still ends the burst's pending edit, so undo and export never wait on it", async () => {
    __resetForTests();
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    const element = document.body.appendChild(document.createElement("div"));
    element.id = "dot-throws";
    const commit = vi.fn(() => {
      throw new Error("The commit threw.");
    });
    act(() => {
      root.render(
        React.createElement(Harness, {
          selection: makeSelection("Dot", element),
          onPathOffsetCommit: commit,
        }),
      );
    });
    act(() => dispatchArrowRight());
    expect(hasStudioPendingEdits()).toBe(true);
    expect(() => flushNudge()).toThrow("The commit threw.");
    await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
    act(() => root.unmount());
  });
});

vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
describe("nudge usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    __resetForTests();
  });
  afterEach(() => vi.useRealTimers());
  it.each([true, false])(
    "counts a whole key burst only when the writer changed source (%s)",
    async (changed) => {
      const root = createRoot(document.body.appendChild(document.createElement("div")));
      const element = document.body.appendChild(document.createElement("div"));
      const commit = vi.fn().mockResolvedValue({ ok: true, changed });
      act(() =>
        root.render(
          <Harness selection={makeSelection("Dot", element)} onPathOffsetCommit={commit} />,
        ),
      );
      act(() => {
        dispatchArrowRight();
        dispatchArrowRight();
      });
      await act(async () => vi.advanceTimersByTimeAsync(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10));
      expect(commit).toHaveBeenCalledTimes(1);
      expect(vi.mocked(trackStudioEvent).mock.calls).toEqual(
        changed
          ? [["feature_used", { feature: "nudge", surface: "preview", method: "keyboard" }]]
          : [],
      );
      act(() => root.unmount());
      element.remove();
    },
  );
});
