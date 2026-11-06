// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../player/store/playerStore";
import {
  createTimelinePerformanceFixture,
  hasTimelinePerformanceFixtureLease,
  setTimelinePerformanceFixtureLease,
  type TimelinePerformanceFixtureProfile,
} from "../player/lib/timelinePerformanceFixture";
import { useStudioTestHooks } from "./useStudioTestHooks";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const PROFILES: readonly TimelinePerformanceFixtureProfile[] = [
  "dense-short",
  "long-overlap",
  "keyframe-heavy-expanded",
  "composition-heavy",
  "remote-unsupported",
];

function Probe(): null {
  useStudioTestHooks({
    previewIframeRef: { current: null },
    buildDomSelectionFromTarget: vi.fn(),
    applyDomSelection: vi.fn(),
  });
  return null;
}

describe("timeline performance fixture", () => {
  afterEach(() => {
    setTimelinePerformanceFixtureLease(false);
    window.__studioTest = undefined;
    usePlayerStore.getState().reset();
  });

  it("generates the expected dense-short 50k distribution", () => {
    const first = createTimelinePerformanceFixture({
      elementCount: 50_000,
      profile: "dense-short",
    });

    expect(first.summary).toEqual({
      elementCount: 50_000,
      profile: "dense-short",
      duration: 120,
      trackCount: 1_000,
      keyframedElementCount: 0,
      expandedElementCount: 0,
    });
    expect(new Set(first.elements.map((element) => element.track)).size).toBe(1_000);
    const perTrack = new Map<number, number>();
    for (const element of first.elements) {
      perTrack.set(element.track, (perTrack.get(element.track) ?? 0) + 1);
    }
    expect(Math.max(...perTrack.values())).toBeLessThanOrEqual(128);
  });

  it.each(PROFILES)(
    "generates an identical 50k %s fixture",
    (profile) => {
      const first = createTimelinePerformanceFixture({ elementCount: 50_000, profile });
      const second = createTimelinePerformanceFixture({ elementCount: 50_000, profile });
      expect(second).toEqual(first);
    },
    30_000,
  );

  it.each(PROFILES)("builds the %s 1k scale profile", (profile) => {
    const fixture = createTimelinePerformanceFixture({ elementCount: 1_000, profile });
    expect(fixture.elements).toHaveLength(1_000);
    expect(fixture.summary.elementCount).toBe(1_000);
    expect(fixture.summary.duration).toBeGreaterThan(0);
    expect(new Set(fixture.elements.map((element) => element.key)).size).toBe(1_000);
    if (profile === "keyframe-heavy-expanded") {
      expect(fixture.keyframeCache.size).toBe(1_000);
      expect(fixture.gsapAnimations.size).toBe(1_000);
      expect(fixture.expandedClipIds.size).toBe(1_000);
    }
  });

  it("publishes one dev-only loader that replaces fixture state atomically", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    const api = window.__studioTest;
    expect(api).toBeDefined();
    if (!api) throw new Error("Expected dev Studio test API");
    expect(api.runtimeMode).toBe("development");
    let notifications = 0;
    usePlayerStore.setState({
      isPlaying: true,
      requestedSeekTime: 42,
      timelineFocus: { id: "stale", projectId: null, sessionEpoch: 0, nonce: 7 },
      clipManifest: [],
      lintFindingsByElement: new Map([["stale", { count: 1, messages: ["stale"] }]]),
    });
    const unsubscribe = usePlayerStore.subscribe(() => {
      notifications += 1;
    });

    const summary = api.loadTimelinePerformanceFixture({
      elementCount: 1_000,
      profile: "keyframe-heavy-expanded",
    });

    expect(summary.elementCount).toBe(1_000);
    expect(notifications).toBe(1);
    expect(usePlayerStore.getState()).toMatchObject({
      isPlaying: false,
      requestedSeekTime: null,
      timelineFocus: null,
      clipManifest: null,
      duration: 600,
      timelineReady: true,
    });
    expect(usePlayerStore.getState().lintFindingsByElement.size).toBe(0);
    expect(usePlayerStore.getState().elements).toHaveLength(1_000);
    expect(usePlayerStore.getState().expandedClipIds.size).toBe(1_000);
    expect(hasTimelinePerformanceFixtureLease()).toBe(true);

    api.resetTimelinePerformanceFixture();
    expect(notifications).toBe(2);
    expect(usePlayerStore.getState()).toMatchObject({
      isPlaying: false,
      duration: 0,
      timelineReady: false,
      elements: [],
    });
    expect(hasTimelinePerformanceFixtureLease()).toBe(true);
    unsubscribe();
    act(() => root.unmount());
    expect(window.__studioTest).toBeUndefined();
    // The lease outlives the effect on purpose. Loading a fixture changes the
    // player state this effect depends on, so the effect tears down right after
    // the loader runs; releasing the lease there let live iframe discovery
    // overwrite the fixture before anything could measure it.
    expect(hasTimelinePerformanceFixtureLease()).toBe(true);
  });

  it("does not mutate state when the fixture request is invalid", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    const api = window.__studioTest;
    if (!api) throw new Error("Expected dev Studio test API");
    const before = usePlayerStore.getState().elements;

    expect(() =>
      Reflect.apply(api.loadTimelinePerformanceFixture, api, [
        { elementCount: 999, profile: "dense-short" },
      ]),
    ).toThrow("elementCount must be 1000 or 50000");
    expect(usePlayerStore.getState().elements).toBe(before);
    expect(() =>
      Reflect.apply(api.loadTimelinePerformanceFixture, api, [
        { elementCount: 1_000, profile: "constructor" },
      ]),
    ).toThrow("Unknown timeline performance fixture profile");
    act(() => root.unmount());
  });
});
