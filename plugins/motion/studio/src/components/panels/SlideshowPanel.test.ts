// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toggleMainLineSlide,
  reorderMainLineSlide,
  reorderBranchSlide,
  setSlideNotes,
  addFragment,
  removeFragment,
  createSequence,
  renameSequence,
  deleteSequence,
  assignToBranch,
  addHotspot,
  removeHotspot,
  safeParseManifest,
  makeSlideshowNotesController,
  isPanelUndoKey,
} from "./SlideshowPanel";
import type { SlideshowManifest } from "@hyperframes/core/slideshow";

// ── toggleMainLineSlide ────────────────────────────────────────────────────

describe("toggleMainLineSlide", () => {
  it("adds a scene as a slide when absent", () => {
    const m = toggleMainLineSlide({ slides: [] }, "a");
    expect(m.slides).toEqual([{ sceneId: "a" }]);
  });

  it("removes a scene when already present", () => {
    const m = toggleMainLineSlide({ slides: [{ sceneId: "a" }] }, "a");
    expect(m.slides).toEqual([]);
  });

  it("does not mutate the input manifest", () => {
    const input: SlideshowManifest = { slides: [{ sceneId: "a" }] };
    toggleMainLineSlide(input, "a");
    expect(input.slides.length).toBe(1);
  });

  it("leaves other slides intact when removing", () => {
    const m = toggleMainLineSlide({ slides: [{ sceneId: "a" }, { sceneId: "b" }] }, "a");
    expect(m.slides).toEqual([{ sceneId: "b" }]);
  });
});

// ── reorderMainLineSlide ───────────────────────────────────────────────────

describe("reorderMainLineSlide", () => {
  it("moves a slide up", () => {
    const m = reorderMainLineSlide({ slides: [{ sceneId: "a" }, { sceneId: "b" }] }, "b", "up");
    expect(m.slides.map((s) => s.sceneId)).toEqual(["b", "a"]);
  });

  it("moves a slide down", () => {
    const m = reorderMainLineSlide({ slides: [{ sceneId: "a" }, { sceneId: "b" }] }, "a", "down");
    expect(m.slides.map((s) => s.sceneId)).toEqual(["b", "a"]);
  });

  it("returns unchanged manifest when moving first slide up", () => {
    const input: SlideshowManifest = { slides: [{ sceneId: "a" }, { sceneId: "b" }] };
    const m = reorderMainLineSlide(input, "a", "up");
    expect(m.slides.map((s) => s.sceneId)).toEqual(["a", "b"]);
  });

  it("returns unchanged manifest for unknown sceneId", () => {
    const input: SlideshowManifest = { slides: [{ sceneId: "a" }] };
    const m = reorderMainLineSlide(input, "z", "up");
    expect(m.slides).toEqual(input.slides);
  });
});

// ── reorderBranchSlide ─────────────────────────────────────────────────────
describe("reorderBranchSlide", () => {
  const base: SlideshowManifest = {
    slides: [{ sceneId: "x" }],
    slideSequences: [
      { id: "b1", label: "Branch", slides: [{ sceneId: "a" }, { sceneId: "b" }, { sceneId: "c" }] },
    ],
  };

  it("moves a branch slide down within its sequence (main line untouched)", () => {
    const m = reorderBranchSlide(base, "b1", "a", "down");
    expect(m.slideSequences?.[0].slides.map((s) => s.sceneId)).toEqual(["b", "a", "c"]);
    expect(m.slides).toEqual(base.slides);
  });

  it("is a no-op at the boundary and for an unknown branch/scene", () => {
    expect(reorderBranchSlide(base, "b1", "a", "up").slideSequences?.[0].slides[0].sceneId).toBe(
      "a",
    );
    expect(reorderBranchSlide(base, "nope", "a", "down")).toEqual(base);
  });
});

// ── setSlideNotes ──────────────────────────────────────────────────────────

describe("setSlideNotes", () => {
  it("updates notes on an existing slide", () => {
    const m = setSlideNotes({ slides: [{ sceneId: "a" }] }, "a", "hello");
    expect(m.slides[0]).toMatchObject({ sceneId: "a", notes: "hello" });
  });

  it("creates the slide entry if absent", () => {
    const m = setSlideNotes({ slides: [] }, "a", "note");
    expect(m.slides).toEqual([{ sceneId: "a", notes: "note" }]);
  });
});

// ── branch-scoped authoring (Finding #14) ──────────────────────────────────

describe("branch-scoped editing (sequenceId)", () => {
  const base: SlideshowManifest = {
    slides: [{ sceneId: "a" }],
    slideSequences: [{ id: "seq-1", label: "Branch", slides: [{ sceneId: "b" }] }],
  };

  it("setSlideNotes edits the branch slide, leaving the main line untouched", () => {
    const m = setSlideNotes(base, "b", "branch note", "seq-1");
    expect(m.slideSequences?.[0]?.slides[0]).toMatchObject({ sceneId: "b", notes: "branch note" });
    expect(m.slides[0]).toEqual({ sceneId: "a" }); // main line unchanged
  });

  it("setSlideNotes does NOT auto-add a slide to a branch when the scene is not assigned", () => {
    const m = setSlideNotes(base, "z", "nope", "seq-1");
    expect(m.slideSequences?.[0]?.slides).toEqual([{ sceneId: "b" }]);
    expect(m.slides).toEqual([{ sceneId: "a" }]);
  });

  it("addFragment edits the branch slide and does not auto-add when unassigned", () => {
    const added = addFragment(base, "b", 1.5, "seq-1");
    expect(added.slideSequences?.[0]?.slides[0]?.fragments).toEqual([1.5]);
    const noAdd = addFragment(base, "z", 2.0, "seq-1");
    expect(noAdd.slideSequences?.[0]?.slides).toEqual([{ sceneId: "b" }]);
  });

  it("addHotspot edits the branch slide and does not auto-add when unassigned", () => {
    const hotspot = { id: "h1", label: "Why", target: "seq-2" };
    const added = addHotspot(base, "b", hotspot, "seq-1");
    expect(added.slideSequences?.[0]?.slides[0]?.hotspots).toEqual([hotspot]);
    const noAdd = addHotspot(base, "z", hotspot, "seq-1");
    expect(noAdd.slideSequences?.[0]?.slides).toEqual([{ sceneId: "b" }]);
  });
});

// ── addFragment ───────────────────────────────────────────────────────────

describe("addFragment", () => {
  it("adds a fragment time to a slide", () => {
    const m = addFragment({ slides: [{ sceneId: "a" }] }, "a", 1.5);
    expect(m.slides[0]?.fragments).toEqual([1.5]);
  });

  it("deduplicates repeated fragment values", () => {
    const m1 = addFragment({ slides: [{ sceneId: "a" }] }, "a", 1.5);
    const m2 = addFragment(m1, "a", 1.5);
    expect(m2.slides[0]?.fragments).toEqual([1.5]);
  });

  it("keeps fragments sorted ascending", () => {
    let m: SlideshowManifest = { slides: [{ sceneId: "a" }] };
    m = addFragment(m, "a", 3.0);
    m = addFragment(m, "a", 1.0);
    m = addFragment(m, "a", 2.0);
    expect(m.slides[0]?.fragments).toEqual([1.0, 2.0, 3.0]);
  });

  it("creates the slide entry if absent", () => {
    const m = addFragment({ slides: [] }, "a", 0.5);
    expect(m.slides[0]).toMatchObject({ sceneId: "a", fragments: [0.5] });
  });
});

// ── removeFragment ─────────────────────────────────────────────────────────

describe("removeFragment", () => {
  it("removes the specified fragment", () => {
    const m = removeFragment({ slides: [{ sceneId: "a", fragments: [1.0, 2.0] }] }, "a", 1.0);
    expect(m.slides[0]?.fragments).toEqual([2.0]);
  });

  it("no-ops when fragment not present", () => {
    const m = removeFragment({ slides: [{ sceneId: "a", fragments: [1.0] }] }, "a", 9.0);
    expect(m.slides[0]?.fragments).toEqual([1.0]);
  });
});

// ── createSequence ─────────────────────────────────────────────────────────

describe("createSequence", () => {
  it("creates a new sequence", () => {
    const m = createSequence({ slides: [] }, "seq-1", "Branch A");
    expect(m.slideSequences).toEqual([{ id: "seq-1", label: "Branch A", slides: [] }]);
  });

  it("rejects duplicate ids", () => {
    const m1 = createSequence({ slides: [] }, "seq-1", "Branch A");
    const m2 = createSequence(m1, "seq-1", "Branch A duplicate");
    expect((m2.slideSequences ?? []).length).toBe(1);
  });

  it("preserves existing sequences", () => {
    const m1 = createSequence({ slides: [] }, "seq-1", "A");
    const m2 = createSequence(m1, "seq-2", "B");
    expect((m2.slideSequences ?? []).length).toBe(2);
  });
});

// ── renameSequence ─────────────────────────────────────────────────────────

describe("renameSequence", () => {
  it("renames a sequence label", () => {
    const m = renameSequence(
      { slides: [], slideSequences: [{ id: "seq-1", label: "Old", slides: [] }] },
      "seq-1",
      "New",
    );
    expect(m.slideSequences?.[0]?.label).toBe("New");
  });

  it("no-ops on unknown id", () => {
    const input: SlideshowManifest = {
      slides: [],
      slideSequences: [{ id: "seq-1", label: "A", slides: [] }],
    };
    const m = renameSequence(input, "unknown", "B");
    expect(m.slideSequences?.[0]?.label).toBe("A");
  });
});

// ── deleteSequence ─────────────────────────────────────────────────────────

describe("deleteSequence", () => {
  it("removes the sequence by id", () => {
    const m = deleteSequence(
      { slides: [], slideSequences: [{ id: "seq-1", label: "A", slides: [] }] },
      "seq-1",
    );
    expect(m.slideSequences).toEqual([]);
  });

  it("removes hotspots targeting the deleted sequence from main-line slides", () => {
    const input: SlideshowManifest = {
      slides: [
        {
          sceneId: "s1",
          hotspots: [
            { id: "h1", label: "Go deep", target: "deep" },
            { id: "h2", label: "Other", target: "other-seq" },
          ],
        },
      ],
      slideSequences: [
        { id: "deep", label: "Deep", slides: [] },
        { id: "other-seq", label: "Other", slides: [] },
      ],
    };
    const m = deleteSequence(input, "deep");
    expect(m.slides[0]?.hotspots?.map((h) => h.id)).toEqual(["h2"]);
    expect(m.slideSequences?.some((s) => s.id === "deep")).toBe(false);
    // Verify no slide anywhere references 'deep'
    const allHotspotTargets = [
      ...m.slides.flatMap((s) => (s.hotspots ?? []).map((h) => h.target)),
      ...(m.slideSequences ?? []).flatMap((seq) =>
        seq.slides.flatMap((s) => (s.hotspots ?? []).map((h) => h.target)),
      ),
    ];
    expect(allHotspotTargets).not.toContain("deep");
  });

  it("removes hotspots targeting the deleted sequence from sequence slides", () => {
    const input: SlideshowManifest = {
      slides: [],
      slideSequences: [
        { id: "deep", label: "Deep", slides: [] },
        {
          id: "other",
          label: "Other",
          slides: [
            {
              sceneId: "s2",
              hotspots: [{ id: "h3", label: "To deep", target: "deep" }],
            },
          ],
        },
      ],
    };
    const m = deleteSequence(input, "deep");
    const otherSeq = m.slideSequences?.find((s) => s.id === "other");
    expect(otherSeq?.slides[0]?.hotspots).toEqual([]);
  });
});

// ── assignToBranch ─────────────────────────────────────────────────────────

describe("assignToBranch", () => {
  it("assigns a scene to a branch", () => {
    const m = assignToBranch(
      { slides: [], slideSequences: [{ id: "seq-1", label: "A", slides: [] }] },
      "seq-1",
      "s1",
      true,
    );
    expect(m.slideSequences?.[0]?.slides).toEqual([{ sceneId: "s1" }]);
  });

  it("does not duplicate when assigning twice", () => {
    let m: SlideshowManifest = {
      slides: [],
      slideSequences: [{ id: "seq-1", label: "A", slides: [] }],
    };
    m = assignToBranch(m, "seq-1", "s1", true);
    m = assignToBranch(m, "seq-1", "s1", true);
    expect(m.slideSequences?.[0]?.slides.length).toBe(1);
  });

  it("removes a scene when assign=false", () => {
    const m = assignToBranch(
      {
        slides: [],
        slideSequences: [{ id: "seq-1", label: "A", slides: [{ sceneId: "s1" }] }],
      },
      "seq-1",
      "s1",
      false,
    );
    expect(m.slideSequences?.[0]?.slides).toEqual([]);
  });
});

// ── addHotspot / removeHotspot ─────────────────────────────────────────────

describe("addHotspot", () => {
  it("adds a hotspot to a slide", () => {
    const m = addHotspot({ slides: [{ sceneId: "a" }] }, "a", {
      id: "h1",
      label: "Go to B",
      target: "seq-b",
    });
    expect(m.slides[0]?.hotspots).toEqual([{ id: "h1", label: "Go to B", target: "seq-b" }]);
  });

  it("does not duplicate hotspot ids", () => {
    let m: SlideshowManifest = { slides: [{ sceneId: "a" }] };
    m = addHotspot(m, "a", { id: "h1", label: "X", target: "seq-b" });
    m = addHotspot(m, "a", { id: "h1", label: "Y", target: "seq-c" });
    expect(m.slides[0]?.hotspots?.length).toBe(1);
  });
});

describe("removeHotspot", () => {
  it("removes a hotspot by id", () => {
    const m = removeHotspot(
      {
        slides: [{ sceneId: "a", hotspots: [{ id: "h1", label: "X", target: "seq-b" }] }],
      },
      "a",
      "h1",
    );
    expect(m.slides[0]?.hotspots).toEqual([]);
  });

  it("no-ops for unknown hotspot id", () => {
    const m = removeHotspot(
      {
        slides: [{ sceneId: "a", hotspots: [{ id: "h1", label: "X", target: "seq-b" }] }],
      },
      "a",
      "no-such-id",
    );
    expect(m.slides[0]?.hotspots?.length).toBe(1);
  });
});

// ── safeParseManifest ──────────────────────────────────────────────────────

describe("safeParseManifest", () => {
  it("parses a valid slideshow island", () => {
    const manifest = { slides: [{ sceneId: "a" }] };
    const island = `<script type="application/hyperframes-slideshow+json">${JSON.stringify(manifest)}</script>`;
    const html = `<html><body>${island}</body></html>`;
    const result = safeParseManifest(html);
    expect(result.slides[0]?.sceneId).toBe("a");
  });

  it("returns {slides:[]} for malformed JSON in the island", () => {
    const html = `<html><body><script type="application/hyperframes-slideshow+json">NOT_JSON</script></body></html>`;
    const result = safeParseManifest(html);
    expect(result).toEqual({ slides: [] });
  });

  it("returns {slides:[]} when no island is present", () => {
    const result = safeParseManifest("<html><body></body></html>");
    expect(result).toEqual({ slides: [] });
  });
});

// ── makeSlideshowNotesController ──────────────────────────────────────────
//
// These tests prove the two stale-closure invariants without needing a DOM:
//   (a) Notes typed in comp A always flush to comp A's callback, never comp B's.
//   (b) A discrete action after typing does NOT drop the typed note.

describe("makeSlideshowNotesController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) typing notes then switching composition flushes to the ORIGINAL callback", () => {
    const ctrl = makeSlideshowNotesController();
    const persistA = vi.fn().mockResolvedValue(undefined);
    const persistB = vi.fn().mockResolvedValue(undefined);

    const manifestA = { slides: [{ sceneId: "s1", notes: "typed in A" }] };
    const manifestB = { slides: [{ sceneId: "s2" }] };

    // User types a note in composition A — schedules debounce with persistA.
    ctrl.schedule(manifestA, persistA, 450);

    // Before the debounce fires, the composition switches to B.
    // The panel calls flush() so the pending notes go to A's callback.
    ctrl.flush();

    // Now the panel re-schedules with B's manifest + callback.
    ctrl.schedule(manifestB, persistB, 450);

    // Advance time past the debounce delay.
    vi.advanceTimersByTime(500);

    // persistA must have been called with manifestA (the A-composition notes).
    expect(persistA).toHaveBeenCalledOnce();
    expect(persistA.mock.calls[0]?.[0]).toEqual(manifestA);

    // persistB must have been called with manifestB (the B-composition timer).
    expect(persistB).toHaveBeenCalledOnce();
    expect(persistB.mock.calls[0]?.[0]).toEqual(manifestB);
  });

  it("(a) flush after composition switch does NOT call the new composition's callback", () => {
    const ctrl = makeSlideshowNotesController();
    const persistA = vi.fn().mockResolvedValue(undefined);
    const persistB = vi.fn().mockResolvedValue(undefined);

    const manifestA = { slides: [{ sceneId: "s1", notes: "A notes" }] };

    ctrl.schedule(manifestA, persistA, 450);
    // Simulate comp switch: flush before B's manifest arrives.
    ctrl.flush();

    // B never schedules anything.

    vi.advanceTimersByTime(1000);

    expect(persistA).toHaveBeenCalledOnce();
    expect(persistB).not.toHaveBeenCalled();
  });

  it("(b) discrete action right after typing does NOT drop the note", () => {
    const ctrl = makeSlideshowNotesController();
    const persistNotes = vi.fn().mockResolvedValue(undefined);

    const manifestWithNotes = { slides: [{ sceneId: "s1", notes: "hello" }] };

    // User types "hello" — schedules debounce.
    ctrl.schedule(manifestWithNotes, persistNotes, 450);

    // Before debounce fires, user triggers a discrete action (e.g. mark fragment).
    // The discrete manifest comes from the helper and does NOT include the note yet
    // (it was computed from an older state snapshot).
    const discreteManifest = { slides: [{ sceneId: "s1", fragments: [1.5] }] };
    const merged = ctrl.mergeIntoDiscrete(discreteManifest);

    // The merged manifest must include BOTH the fragment AND the note.
    expect(merged.slides[0]).toMatchObject({ sceneId: "s1", notes: "hello", fragments: [1.5] });

    // After mergeIntoDiscrete, pending is cleared — debounce no longer fires.
    vi.advanceTimersByTime(500);
    expect(persistNotes).not.toHaveBeenCalled();
  });

  it("(b) notes from a different scene are not merged into an unrelated slide", () => {
    const ctrl = makeSlideshowNotesController();
    const persistNotes = vi.fn().mockResolvedValue(undefined);

    // Pending notes are for scene s1.
    const manifestWithNotes = { slides: [{ sceneId: "s1", notes: "s1 notes" }] };
    ctrl.schedule(manifestWithNotes, persistNotes, 450);

    // Discrete action affects scene s2 only.
    const discreteManifest = { slides: [{ sceneId: "s2", fragments: [2.0] }] };
    const merged = ctrl.mergeIntoDiscrete(discreteManifest);

    // s2 slide should have no notes (pending notes belong to s1 which is not in discrete).
    expect(merged.slides[0]).toMatchObject({ sceneId: "s2" });
    expect(merged.slides[0]?.notes).toBeUndefined();
  });

  it("flush is idempotent — second flush does nothing", () => {
    const ctrl = makeSlideshowNotesController();
    const persist = vi.fn().mockResolvedValue(undefined);

    ctrl.schedule({ slides: [{ sceneId: "x" }] }, persist, 450);
    ctrl.flush();
    ctrl.flush();

    expect(persist).toHaveBeenCalledOnce();
  });

  it("cancel clears pending without calling persist", () => {
    const ctrl = makeSlideshowNotesController();
    const persist = vi.fn().mockResolvedValue(undefined);

    ctrl.schedule({ slides: [] }, persist, 450);
    ctrl.cancel();

    vi.advanceTimersByTime(1000);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("isPanelUndoKey", () => {
  function undoFrom(html: string) {
    document.body.innerHTML = `<div>${html}</div>`;
    const target = document.body.firstElementChild!.firstElementChild!;
    return { metaKey: true, ctrlKey: false, shiftKey: false, key: "z", target };
  }

  it("undoes the panel from a button or a slider", () => {
    expect(isPanelUndoKey(undoFrom("<button>Add</button>"))).toBe(true);
    expect(isPanelUndoKey(undoFrom('<div role="slider" tabindex="0"></div>'))).toBe(true);
  });

  it("leaves Cmd+Z to a text field, contenteditable and select included", () => {
    expect(isPanelUndoKey(undoFrom("<input />"))).toBe(false);
    expect(isPanelUndoKey(undoFrom('<p contenteditable="plaintext-only">Note</p>'))).toBe(false);
    expect(isPanelUndoKey(undoFrom("<select><option>a</option></select>"))).toBe(false);
  });

  it("ignores Cmd+Shift+Z and a bare z", () => {
    expect(isPanelUndoKey({ ...undoFrom("<button />"), shiftKey: true })).toBe(false);
    expect(isPanelUndoKey({ ...undoFrom("<button />"), metaKey: false })).toBe(false);
  });
});
