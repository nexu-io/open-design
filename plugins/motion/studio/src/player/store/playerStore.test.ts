// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePlayerStore, liveTime, whenPreviewBooted, type TimelineElement } from "./playerStore";
import { thumbnailRevisionOf } from "./thumbnailSlice";

/** The playback/selection state `reset()` restores (persistent prefs asserted separately). */
function expectResettableDefaults(state: ReturnType<typeof usePlayerStore.getState>): void {
  expect(state.isPlaying).toBe(false);
  expect(state.currentTime).toBe(0);
  expect(state.duration).toBe(0);
  expect(state.timelineReady).toBe(false);
  expect(state.elements).toEqual([]);
  expect(state.selectedElementId).toBeNull();
}

describe("usePlayerStore", () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = usePlayerStore.getState();
      expectResettableDefaults(state);
      expect(state.playbackRate).toBe(1);
      expect(state.audioMuted).toBe(false);
      expect(state.audioVolume).toBe(1);
      expect(state.loopEnabled).toBe(false);
      expect(state.zoomMode).toBe("fit");
      expect(state.manualZoomPercent).toBe(100);
      expect(state.expandedClipIds).toEqual(new Set());
    });
  });

  describe("thumbnail content revision", () => {
    const revisionOf = (path: string) =>
      thumbnailRevisionOf(usePlayerStore.getState().thumbnailRevisions, path);

    it("advances only the compositions an accepted file event names", () => {
      const scene = revisionOf("compositions/scene-a.html");
      const sibling = revisionOf("compositions/scene-b.html");

      usePlayerStore.getState().bumpThumbnailRevisions(["compositions/scene-a.html"]);

      expect(revisionOf("compositions/scene-a.html")).toBe(scene + 1);
      expect(revisionOf("compositions/scene-b.html")).toBe(sibling);
    });

    it("advances every composition when the event names none", () => {
      const sibling = revisionOf("compositions/scene-b.html");

      usePlayerStore.getState().bumpThumbnailRevisions(null);

      expect(revisionOf("compositions/scene-b.html")).toBe(sibling + 1);
    });

    it("remains monotonic across soft resets while project identity stays with the session epoch", () => {
      const store = usePlayerStore.getState();
      store.beginTimelineSession("project-a");
      store.bumpThumbnailRevisions(null);
      const revision = revisionOf("index.html");
      const firstEpoch = usePlayerStore.getState().timelineSessionEpoch;

      store.reset();
      expect(revisionOf("index.html")).toBe(revision);
      store.beginTimelineSession("project-b");
      expect(revisionOf("index.html")).toBe(revision);
      expect(usePlayerStore.getState().timelineSessionEpoch).toBe(firstEpoch + 1);
    });
  });

  describe("expandedClipIds", () => {
    it("toggles clip membership", () => {
      const store = usePlayerStore.getState();

      store.toggleClipExpanded("clip-1");
      expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set(["clip-1"]));

      store.toggleClipExpanded("clip-1");
      expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set());
    });

    it("sets clip membership idempotently", () => {
      const store = usePlayerStore.getState();

      store.setClipExpanded("clip-1", true);
      store.setClipExpanded("clip-1", true);
      expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set(["clip-1"]));

      store.setClipExpanded("clip-1", false);
      store.setClipExpanded("clip-1", false);
      expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set());
    });
  });

  describe("focused ease requests", () => {
    it("stamps the current project session and only lets its nonce clear it", () => {
      const store = usePlayerStore.getState();
      store.beginTimelineSession("project-a");
      store.setSelectedElementId("index.html#hero");
      store.setFocusedEaseSegment({
        elementId: "index.html#hero",
        animationId: "animation-a",
        tweenPercentage: 50,
      });
      const first = usePlayerStore.getState().focusedEaseSegment;
      if (!first) throw new Error("expected focused ease request");
      expect(first.projectId).toBe("project-a");
      expect(first.sessionEpoch).toBeGreaterThan(0);
      expect(first.nonce).toBeGreaterThan(0);

      store.setFocusedEaseSegment({
        elementId: "index.html#hero",
        animationId: "animation-a",
        tweenPercentage: 75,
      });
      const second = usePlayerStore.getState().focusedEaseSegment;
      if (!second) throw new Error("expected replacement request");
      expect(second.nonce).toBe(first.nonce + 1);

      store.clearFocusedEaseSegment(first.nonce);
      expect(usePlayerStore.getState().focusedEaseSegment).toBe(second);
      store.clearFocusedEaseSegment(second.nonce);
      expect(usePlayerStore.getState().focusedEaseSegment).toBeNull();
    });

    it("clears a pending request when the project session changes", () => {
      const store = usePlayerStore.getState();
      store.beginTimelineSession("project-a");
      store.setFocusedEaseSegment({
        elementId: "index.html#hero",
        animationId: "animation-a",
        tweenPercentage: 50,
      });

      store.beginTimelineSession("project-b");
      expect(usePlayerStore.getState().focusedEaseSegment).toBeNull();
    });

    it("does not revive an old request after selecting away and back", () => {
      const store = usePlayerStore.getState();
      store.setSelectedElementId("index.html#a");
      store.setFocusedEaseSegment({
        elementId: "index.html#a",
        animationId: "animation-a",
        tweenPercentage: 50,
      });

      store.setSelectedElementId("index.html#b");
      expect(usePlayerStore.getState().focusedEaseSegment).toBeNull();
      store.setSelectedElementId("index.html#a");
      expect(usePlayerStore.getState().focusedEaseSegment).toBeNull();
    });

    it("invalidates on a genuine selection-anchor change but not a same-anchor echo", () => {
      const store = usePlayerStore.getState();
      store.setSelection(new Set(["index.html#a", "index.html#b"]), "index.html#a");
      store.setFocusedEaseSegment({
        elementId: "index.html#a",
        animationId: "animation-a",
        tweenPercentage: 50,
      });
      const request = usePlayerStore.getState().focusedEaseSegment;

      store.setSelectionAnchor("index.html#a");
      expect(usePlayerStore.getState().focusedEaseSegment).toBe(request);
      store.setSelectionAnchor("index.html#b");
      expect(usePlayerStore.getState().focusedEaseSegment).toBeNull();
    });
  });

  describe("setIsPlaying", () => {
    it("sets isPlaying to true", () => {
      usePlayerStore.getState().setIsPlaying(true);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it("sets isPlaying to false", () => {
      usePlayerStore.getState().setIsPlaying(true);
      usePlayerStore.getState().setIsPlaying(false);
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });
  });

  describe("setCurrentTime", () => {
    it("updates currentTime", () => {
      usePlayerStore.getState().setCurrentTime(12.5);
      expect(usePlayerStore.getState().currentTime).toBe(12.5);
    });

    it("accepts zero", () => {
      usePlayerStore.getState().setCurrentTime(42);
      usePlayerStore.getState().setCurrentTime(0);
      expect(usePlayerStore.getState().currentTime).toBe(0);
    });
  });

  describe("setDuration", () => {
    it("updates duration", () => {
      usePlayerStore.getState().setDuration(120);
      expect(usePlayerStore.getState().duration).toBe(120);
    });
  });

  describe("setPlaybackRate", () => {
    it("updates playbackRate", () => {
      usePlayerStore.getState().setPlaybackRate(2);
      expect(usePlayerStore.getState().playbackRate).toBe(2);
    });
  });

  describe("setAudioMuted", () => {
    it("updates audioMuted", () => {
      usePlayerStore.getState().setAudioMuted(true);
      expect(usePlayerStore.getState().audioMuted).toBe(true);
    });
  });

  describe("setAudioVolume", () => {
    it("updates and clamps audioVolume", () => {
      usePlayerStore.getState().setAudioVolume(0.35);
      expect(usePlayerStore.getState().audioVolume).toBe(0.35);

      usePlayerStore.getState().setAudioVolume(2);
      expect(usePlayerStore.getState().audioVolume).toBe(1);

      usePlayerStore.getState().setAudioVolume(-1);
      expect(usePlayerStore.getState().audioVolume).toBe(0);
    });
  });

  describe("setLoopEnabled", () => {
    it("updates loopEnabled", () => {
      usePlayerStore.getState().setLoopEnabled(true);
      expect(usePlayerStore.getState().loopEnabled).toBe(true);
    });
  });

  describe("setInPoint", () => {
    it("updates inPoint", () => {
      usePlayerStore.getState().setInPoint(1.5);
      expect(usePlayerStore.getState().inPoint).toBe(1.5);
    });

    it("clears inPoint when given null", () => {
      usePlayerStore.getState().setInPoint(1.5);
      usePlayerStore.getState().setInPoint(null);
      expect(usePlayerStore.getState().inPoint).toBeNull();
    });

    it("rejects non-finite values", () => {
      usePlayerStore.getState().setInPoint(Number.NaN);
      expect(usePlayerStore.getState().inPoint).toBeNull();
    });

    it("nullifies outPoint when new inPoint is at or past existing outPoint", () => {
      usePlayerStore.getState().setOutPoint(2);
      usePlayerStore.getState().setInPoint(3);
      expect(usePlayerStore.getState().outPoint).toBeNull();
      expect(usePlayerStore.getState().inPoint).toBe(3);
    });

    it("preserves outPoint when new inPoint is before it", () => {
      usePlayerStore.getState().setOutPoint(5);
      usePlayerStore.getState().setInPoint(2);
      expect(usePlayerStore.getState().outPoint).toBe(5);
    });

    it("auto-enables loopEnabled when set to a non-null value", () => {
      usePlayerStore.getState().setLoopEnabled(false);
      usePlayerStore.getState().setInPoint(1.5);
      expect(usePlayerStore.getState().loopEnabled).toBe(true);
    });

    it("preserves loopEnabled when cleared with null", () => {
      usePlayerStore.getState().setLoopEnabled(true);
      usePlayerStore.getState().setInPoint(null);
      expect(usePlayerStore.getState().loopEnabled).toBe(true);

      usePlayerStore.getState().setLoopEnabled(false);
      usePlayerStore.getState().setInPoint(null);
      expect(usePlayerStore.getState().loopEnabled).toBe(false);
    });
  });

  describe("setOutPoint", () => {
    it("updates outPoint", () => {
      usePlayerStore.getState().setOutPoint(4.2);
      expect(usePlayerStore.getState().outPoint).toBe(4.2);
    });

    it("clears outPoint when given null", () => {
      usePlayerStore.getState().setOutPoint(4.2);
      usePlayerStore.getState().setOutPoint(null);
      expect(usePlayerStore.getState().outPoint).toBeNull();
    });

    it("rejects non-finite values", () => {
      usePlayerStore.getState().setOutPoint(Number.POSITIVE_INFINITY);
      expect(usePlayerStore.getState().outPoint).toBeNull();
    });

    it("nullifies inPoint when new outPoint is at or before existing inPoint", () => {
      usePlayerStore.getState().setInPoint(5);
      usePlayerStore.getState().setOutPoint(3);
      expect(usePlayerStore.getState().inPoint).toBeNull();
      expect(usePlayerStore.getState().outPoint).toBe(3);
    });

    it("preserves inPoint when new outPoint is after it", () => {
      usePlayerStore.getState().setInPoint(2);
      usePlayerStore.getState().setOutPoint(5);
      expect(usePlayerStore.getState().inPoint).toBe(2);
    });

    it("auto-enables loopEnabled when set to a non-null value", () => {
      usePlayerStore.getState().setLoopEnabled(false);
      usePlayerStore.getState().setOutPoint(4.2);
      expect(usePlayerStore.getState().loopEnabled).toBe(true);
    });

    it("preserves loopEnabled when cleared with null", () => {
      usePlayerStore.getState().setLoopEnabled(true);
      usePlayerStore.getState().setOutPoint(null);
      expect(usePlayerStore.getState().loopEnabled).toBe(true);

      usePlayerStore.getState().setLoopEnabled(false);
      usePlayerStore.getState().setOutPoint(null);
      expect(usePlayerStore.getState().loopEnabled).toBe(false);
    });
  });

  describe("setTimelineReady", () => {
    it("updates timelineReady", () => {
      usePlayerStore.getState().setTimelineReady(true);
      expect(usePlayerStore.getState().timelineReady).toBe(true);
    });
  });

  describe("requestTimelineReady", () => {
    function stalledVideoDoc(): { doc: Document; video: HTMLVideoElement } {
      const doc = document.implementation.createHTMLDocument("composition");
      const video = doc.createElement("video");
      Object.defineProperty(video, "readyState", { value: 0, configurable: true });
      doc.body.appendChild(video);
      usePlayerStore.getState().markPreviewLoadStep(doc);
      return { doc, video };
    }

    it("waits for the document's load step before marking it ready", async () => {
      const doc = document.implementation.createHTMLDocument("composition");
      usePlayerStore.getState().requestTimelineReady(doc);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(usePlayerStore.getState().timelineReady).toBe(false);

      usePlayerStore.getState().markPreviewLoadStep(doc);
      await vi.waitFor(() => expect(usePlayerStore.getState().timelineReady).toBe(true));
    });

    it("resolves timelineReady once the doc's media settles", async () => {
      const { doc, video } = stalledVideoDoc();
      usePlayerStore.getState().requestTimelineReady(doc);
      expect(usePlayerStore.getState().timelineReady).toBe(false);

      video.dispatchEvent(new Event("canplay"));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(usePlayerStore.getState().timelineReady).toBe(true);
    });

    it("a stale wait from a project switched away from never marks the new project ready", async () => {
      // beginTimelineSession no-ops when projectId is unchanged, so pin a
      // known starting project first rather than relying on reset()'s
      // leftover timelineProjectId from whatever test ran before this one.
      usePlayerStore.getState().beginTimelineSession("readiness-test-project-a");
      const { doc: docA, video: videoA } = stalledVideoDoc();
      usePlayerStore.getState().requestTimelineReady(docA);

      // Switches projects mid-wait — beginTimelineSession resets timelineReady
      // to false for project B, whose own media has not been checked at all.
      usePlayerStore.getState().beginTimelineSession("readiness-test-project-b");
      expect(usePlayerStore.getState().timelineReady).toBe(false);

      // A's wait settles late; it must not resolve into B's readiness.
      videoA.dispatchEvent(new Event("canplay"));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(usePlayerStore.getState().timelineReady).toBe(false);
    });
  });

  describe("setElements", () => {
    it("sets the elements array", () => {
      const elements: TimelineElement[] = [
        { id: "el-1", tag: "div", start: 0, duration: 5, track: 0 },
        {
          id: "el-2",
          tag: "video",
          start: 2,
          duration: 10,
          track: 1,
          src: "test.mp4",
        },
      ];
      usePlayerStore.getState().setElements(elements);
      expect(usePlayerStore.getState().elements).toEqual(elements);
      expect(usePlayerStore.getState().elements).toHaveLength(2);
    });

    it("replaces existing elements", () => {
      usePlayerStore
        .getState()
        .setElements([{ id: "el-1", tag: "div", start: 0, duration: 5, track: 0 }]);
      usePlayerStore
        .getState()
        .setElements([{ id: "el-3", tag: "span", start: 1, duration: 3, track: 0 }]);
      const elements = usePlayerStore.getState().elements;
      expect(elements).toHaveLength(1);
      expect(elements[0].id).toBe("el-3");
    });
  });

  describe("setSelectedElementId", () => {
    it("selects an element", () => {
      usePlayerStore.getState().setSelectedElementId("el-1");
      expect(usePlayerStore.getState().selectedElementId).toBe("el-1");
    });

    it("clears selection with null", () => {
      usePlayerStore.getState().setSelectedElementId("el-1");
      usePlayerStore.getState().setSelectedElementId(null);
      expect(usePlayerStore.getState().selectedElementId).toBeNull();
    });
  });

  describe("selectedElementIds", () => {
    it("sets a multi-id selection with a coherent anchor", () => {
      usePlayerStore.getState().setSelection(["el-1", "el-2", "el-3"], "el-2");

      const state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["el-1", "el-2", "el-3"]);
      expect(state.selectedElementId).toBe("el-2");
    });

    it("falls back to the first selected id when the anchor is outside the set", () => {
      usePlayerStore.getState().setSelection(["el-1", "el-2"], "missing");

      const state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["el-1", "el-2"]);
      expect(state.selectedElementId).toBe("el-1");
    });

    it("single-click selection replaces the set with the selected id", () => {
      const store = usePlayerStore.getState();
      store.setSelection(["el-1", "el-2"], "el-2");
      store.setSelectedElementId("el-3");

      const state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["el-3"]);
      expect(state.selectedElementId).toBe("el-3");
    });

    it("setSelectedElementId collapses to a single element even for a current member", () => {
      const store = usePlayerStore.getState();
      store.setSelection(["el-1", "el-2", "el-3"], "el-1");
      // A genuine single selection (click) collapses the set, even if the id was a member.
      store.setSelectedElementId("el-2");

      const state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["el-2"]);
      expect(state.selectedElementId).toBe("el-2");
    });

    it("setSelectionAnchor moves the anchor within a group without collapsing it", () => {
      const store = usePlayerStore.getState();
      store.setSelection(["el-1", "el-2", "el-3"], "el-1");
      // A DOM->store echo during a group gesture only moves the anchor.
      store.setSelectionAnchor("el-2");

      let state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["el-1", "el-2", "el-3"]);
      expect(state.selectedElementId).toBe("el-2");

      // A non-member anchor is a genuine new single selection.
      store.setSelectionAnchor("outside");
      state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["outside"]);
      expect(state.selectedElementId).toBe("outside");
    });

    it("clearing single selection empties the set", () => {
      const store = usePlayerStore.getState();
      store.setSelection(["el-1", "el-2"], "el-2");
      store.setSelectedElementId(null);

      const state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual([]);
      expect(state.selectedElementId).toBeNull();
    });

    it("toggle adds and removes members while keeping the anchor in the set", () => {
      const store = usePlayerStore.getState();
      store.setSelectedElementId("el-1");
      store.toggleSelectedElementId("el-2");

      let state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["el-1", "el-2"]);
      expect(state.selectedElementId).toBe("el-1");

      store.toggleSelectedElementId("el-1");

      state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual(["el-2"]);
      expect(state.selectedElementId).toBe("el-2");
    });

    it("clearSelection empties the set and the anchor", () => {
      const store = usePlayerStore.getState();
      store.setSelection(["el-1", "el-2"], "el-2");
      store.clearSelection();

      const state = usePlayerStore.getState();
      expect([...state.selectedElementIds]).toEqual([]);
      expect(state.selectedElementId).toBeNull();
    });
  });

  describe("updateElement", () => {
    it("updates the start time of a specific element", () => {
      usePlayerStore.getState().setElements([
        { id: "el-1", tag: "div", start: 0, duration: 5, track: 0 },
        { id: "el-2", tag: "div", start: 5, duration: 5, track: 1 },
      ]);
      usePlayerStore.getState().updateElement("el-1", { start: 3 });
      const elements = usePlayerStore.getState().elements;
      expect(elements[0].start).toBe(3);
      expect(elements[1].start).toBe(5); // unchanged
    });

    it("does not modify elements when id is not found", () => {
      const original: TimelineElement[] = [
        { id: "el-1", tag: "div", start: 0, duration: 5, track: 0 },
      ];
      usePlayerStore.getState().setElements(original);
      usePlayerStore.getState().updateElement("nonexistent", { start: 10 });
      expect(usePlayerStore.getState().elements[0].start).toBe(0);
    });

    it("prefers the stable element key when duplicate ids exist", () => {
      usePlayerStore.getState().setElements([
        { id: "headline", key: "a", tag: "div", start: 0, duration: 5, track: 0 },
        { id: "headline", key: "b", tag: "div", start: 5, duration: 5, track: 1 },
      ]);

      usePlayerStore.getState().updateElement("b", { start: 9 });

      const elements = usePlayerStore.getState().elements;
      expect(elements[0].start).toBe(0);
      expect(elements[1].start).toBe(9);
    });
  });

  describe("setZoomMode", () => {
    it("changes zoom mode to manual", () => {
      usePlayerStore.getState().setZoomMode("manual");
      expect(usePlayerStore.getState().zoomMode).toBe("manual");
    });

    it("changes zoom mode back to fit", () => {
      usePlayerStore.getState().setZoomMode("manual");
      usePlayerStore.getState().setZoomMode("fit");
      expect(usePlayerStore.getState().zoomMode).toBe("fit");
    });
  });

  describe("setManualZoomPercent", () => {
    it("updates the manual zoom percent", () => {
      usePlayerStore.getState().setManualZoomPercent(200);
      expect(usePlayerStore.getState().manualZoomPercent).toBe(200);
    });

    it("clamps to minimum of 10", () => {
      usePlayerStore.getState().setManualZoomPercent(5);
      expect(usePlayerStore.getState().manualZoomPercent).toBe(10);
    });

    it("clamps negative values to 10", () => {
      usePlayerStore.getState().setManualZoomPercent(-50);
      expect(usePlayerStore.getState().manualZoomPercent).toBe(10);
    });

    it("clamps to the frame-level zoom for the current fit scale", () => {
      usePlayerStore.getState().setTimelineScale(12, 12);
      usePlayerStore.getState().setManualZoomPercent(100_000);
      expect(usePlayerStore.getState().manualZoomPercent).toBe(12_000);
      usePlayerStore.getState().setTimelineScale(100, 100);
    });
  });

  describe("timelineFocus", () => {
    it("stamps project scope and carries the requested logical id", () => {
      usePlayerStore.getState().beginTimelineSession("project-a");
      usePlayerStore.getState().requestTimelineFocus("clip:el-1");
      expect(usePlayerStore.getState().timelineFocus).toMatchObject({
        id: "clip:el-1",
        projectId: "project-a",
        sessionEpoch: usePlayerStore.getState().timelineSessionEpoch,
      });
      const store = usePlayerStore.getState();
      store.requestTimelineFocus("clip:el-1");
      const first = usePlayerStore.getState().timelineFocus;
      if (!first) throw new Error("expected timeline focus request");
      store.clearTimelineFocus(first.nonce);
      store.reset();
      store.requestTimelineFocus("clip:el-1");
      const second = usePlayerStore.getState().timelineFocus;
      expect(second?.nonce).toBe(first.nonce + 1);

      store.beginTimelineSession("project-a");
      store.requestTimelineFocus("clip:el-1");
      const stale = usePlayerStore.getState().timelineFocus;
      if (!stale) throw new Error("expected timeline focus request");
      store.requestTimelineFocus("clip:el-2");
      const replacement = usePlayerStore.getState().timelineFocus;
      if (!replacement) throw new Error("expected replacement timeline focus request");
      store.clearTimelineFocus(stale.nonce);
      expect(usePlayerStore.getState().timelineFocus).toBe(replacement);
      store.beginTimelineSession("project-b");
      expect(usePlayerStore.getState().timelineFocus).toBeNull();
    });
  });

  describe("reset", () => {
    it("increments the session epoch only for a hard project switch", () => {
      usePlayerStore.getState().beginTimelineSession("project-a");
      const firstEpoch = usePlayerStore.getState().timelineSessionEpoch;

      usePlayerStore.getState().reset();
      expect(usePlayerStore.getState().timelineSessionEpoch).toBe(firstEpoch);

      usePlayerStore.getState().beginTimelineSession("project-a");
      expect(usePlayerStore.getState().timelineSessionEpoch).toBe(firstEpoch);

      usePlayerStore.getState().beginTimelineSession("project-b");
      expect(usePlayerStore.getState().timelineSessionEpoch).toBe(firstEpoch + 1);
      expect(usePlayerStore.getState().timelineProjectId).toBe("project-b");
    });

    it("resets all state to defaults", () => {
      // Mutate everything
      const store = usePlayerStore.getState();
      store.setIsPlaying(true);
      store.setCurrentTime(42);
      store.setDuration(120);
      store.setTimelineReady(true);
      store.setElements([{ id: "el-1", tag: "div", start: 0, duration: 5, track: 0 }]);
      store.setSelectedElementId("el-1");

      // Reset
      usePlayerStore.getState().reset();

      expectResettableDefaults(usePlayerStore.getState());
    });

    it("drops an automation time selection on reset and on a project switch", () => {
      const sel = { elementKey: "bgm", target: "volume", t0: 1, t1: 2 };

      usePlayerStore.getState().setAutomationSelection(sel);
      usePlayerStore.getState().reset();
      expect(usePlayerStore.getState().automationSelection).toBeNull();

      // The switch matters more than reset(): a stale elementKey can match a
      // same-keyed clip in the new project and redirect a paste to its old t0.
      usePlayerStore.getState().beginTimelineSession("project-a");
      usePlayerStore.getState().setAutomationSelection(sel);
      usePlayerStore.getState().beginTimelineSession("project-b");
      expect(usePlayerStore.getState().automationSelection).toBeNull();
    });

    it("does not reset playbackRate, audioMuted, audioVolume, loopEnabled, zoomMode, or manualZoomPercent", () => {
      const store = usePlayerStore.getState();
      store.setPlaybackRate(2);
      store.setAudioMuted(true);
      store.setAudioVolume(0.4);
      store.setLoopEnabled(true);
      store.setZoomMode("manual");
      store.setManualZoomPercent(200);

      usePlayerStore.getState().reset();

      const state = usePlayerStore.getState();
      // reset() only resets the fields explicitly listed in the reset function
      expect(state.playbackRate).toBe(2);
      expect(state.audioMuted).toBe(true);
      expect(state.audioVolume).toBe(0.4);
      expect(state.loopEnabled).toBe(true);
      expect(state.zoomMode).toBe("manual");
      expect(state.manualZoomPercent).toBe(200);
    });
  });
});

describe("liveTime", () => {
  it("notifies subscribers with the current time", () => {
    const listener = vi.fn();
    const unsubscribe = liveTime.subscribe(listener);

    liveTime.notify(5.5);
    expect(listener).toHaveBeenCalledWith(5.5);
    expect(listener).toHaveBeenCalledTimes(1);

    liveTime.notify(10);
    expect(listener).toHaveBeenCalledWith(10);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("supports multiple subscribers", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = liveTime.subscribe(listener1);
    const unsub2 = liveTime.subscribe(listener2);

    liveTime.notify(3);
    expect(listener1).toHaveBeenCalledWith(3);
    expect(listener2).toHaveBeenCalledWith(3);

    unsub1();
    unsub2();
  });

  it("unsubscribe stops notifications", () => {
    const listener = vi.fn();
    const unsubscribe = liveTime.subscribe(listener);

    liveTime.notify(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    liveTime.notify(2);
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it("unsubscribe returns true when listener existed", () => {
    const listener = vi.fn();
    const unsubscribe = liveTime.subscribe(listener);
    // Set.delete returns boolean, our unsubscribe wraps it
    const result = unsubscribe();
    expect(result).toBe(true);
  });

  it("double unsubscribe returns false", () => {
    const listener = vi.fn();
    const unsubscribe = liveTime.subscribe(listener);
    unsubscribe();
    const result = unsubscribe();
    expect(result).toBe(false);
  });
});

describe("whenPreviewBooted", () => {
  it("resolves false for a project the user left before its preview booted", async () => {
    usePlayerStore.setState({ timelineProjectId: "project-a", previewBooted: false });
    const waitA = whenPreviewBooted("project-a");

    usePlayerStore.getState().beginTimelineSession("project-b");
    usePlayerStore.getState().markPreviewBooted();

    await expect(waitA).resolves.toBe(false);
    await expect(whenPreviewBooted("project-b")).resolves.toBe(true);
  });

  it("waits through the open of its own project, then resolves on that project's boot", async () => {
    usePlayerStore.setState({ timelineProjectId: "project-a", previewBooted: true });
    const waitB = whenPreviewBooted("project-b");

    usePlayerStore.getState().beginTimelineSession("project-b");
    usePlayerStore.getState().markPreviewBooted();

    await expect(waitB).resolves.toBe(true);
  });
});
