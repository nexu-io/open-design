import { describe, expect, it } from "vitest";
import {
  TIMELINE_VIEWPORT_BUDGETS,
  resolveTimelineViewportBudgets,
} from "./timelineViewportBudgets";

describe("timeline viewport budgets", () => {
  it("owns the agreed direct-scroll, DOM, media, and measurement ceilings", () => {
    expect(TIMELINE_VIEWPORT_BUDGETS).toMatchObject({
      directScrollSafetyPx: 8_000_000,
      rowOverscanPerSide: 2,
      timeOverscanViewportRatio: 0.25,
      maxMountedRows: 64,
      maxMountedClipRoots: 512,
      maxMountedClipRootsPerRow: 128,
      maxMountedTimelineDescendants: 5_000,
      thumbnailCacheBytes: 64 * 1024 * 1024,
      sharedFrameCacheBytes: 32 * 1024 * 1024,
      waveformCacheBytes: 16 * 1024 * 1024,
      interactionP95Ms: 50,
      constrainedInteractionP95Ms: 75,
      constrainedFrameIntervalP95Ms: 75,
      ciVirtualizedInteractionP95Ms: 58.3,
      ciVirtualizedFrameIntervalP95Ms: 25,
      longTaskLimitMs: 50,
      constrainedLongTaskLimitMs: 300,
      posterCoverageRatio: 0.9,
      supportedFixtureFallbackRatio: 0.02,
      scrollSamplesPerRun: 63,
      warmupRuns: 3,
      measuredRuns: 5,
      requiredPassingRuns: 4,
    });
    expect(Object.isFrozen(TIMELINE_VIEWPORT_BUDGETS)).toBe(true);
  });

  it("creates an immutable test override without changing production defaults", () => {
    const resolved = resolveTimelineViewportBudgets({
      directScrollSafetyPx: 256,
      measuredRuns: 1,
      requiredPassingRuns: 1,
    });

    expect(resolved.directScrollSafetyPx).toBe(256);
    expect(resolved.maxMountedClipRoots).toBe(512);
    expect(TIMELINE_VIEWPORT_BUDGETS.directScrollSafetyPx).toBe(8_000_000);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it.each([
    [{ maxMountedClipRoots: -1 }, "maxMountedClipRoots"],
    [{ frameIntervalP95Ms: Number.NaN }, "frameIntervalP95Ms"],
    [{ warmupRuns: 0.5 }, "warmupRuns"],
    [{ measuredRuns: 0 }, "measuredRuns"],
    [{ requiredPassingRuns: 0 }, "requiredPassingRuns"],
    [{ measuredRuns: 1.5, requiredPassingRuns: 1 }, "measuredRuns"],
    [{ measuredRuns: 4, requiredPassingRuns: 5 }, "requiredPassingRuns"],
    [{ scrollSamplesPerRun: 19 }, "scrollSamplesPerRun"],
    [{ posterCoverageRatio: 1.1 }, "posterCoverageRatio"],
  ] as const)("rejects an invalid override %#", (overrides, message) => {
    expect(() => resolveTimelineViewportBudgets(overrides)).toThrow(message);
  });
});
