// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  getTimelineResourceBudgetStatus,
  readTimelinePerformanceDiagnostics,
  resolveTimelineScrollStrategy,
} from "./timelinePerformanceDiagnostics";
import { resolveTimelineViewportBudgets } from "./timelineViewportBudgets";

describe("timeline performance diagnostics", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("reads mounted resources without mutating the timeline", () => {
    document.body.innerHTML = `
      <div aria-label="Timeline track view" data-timeline-scheduler-queued="3"
           data-timeline-scheduler-active="2" data-timeline-cache-bytes="4096">
        <div data-timeline-row><div data-clip="true"></div><div data-clip="true"></div></div>
        <div data-timeline-row><div data-clip="true"></div></div>
        <div data-clip="true"></div>
        <div data-timeline-grid-cell></div><div data-timeline-grid-cell></div>
        <div data-timeline-poster-state="ready"></div>
        <div data-timeline-poster-state="error"></div>
        <div data-timeline-poster-state="constructor"></div>
      </div>`;
    const before = document.body.innerHTML;

    expect(readTimelinePerformanceDiagnostics()).toMatchObject({
      timelineRoots: 1,
      mountedRows: 2,
      mountedClipRoots: 4,
      maxMountedClipRootsInOneRow: 2,
      mountedTimeGridCells: 2,
      schedulerQueued: 3,
      schedulerActive: 2,
      cacheBytes: 4096,
      posterStates: { idle: 0, loading: 0, ready: 1, fallback: 0, error: 1 },
    });
    expect(document.body.innerHTML).toBe(before);
  });

  it("returns the zero baseline after unmount or reset removes the DOM", () => {
    document.body.innerHTML =
      '<div aria-label="Timeline track view"><div data-clip="true"></div></div>';
    expect(readTimelinePerformanceDiagnostics().mountedClipRoots).toBe(1);

    document.body.replaceChildren();

    expect(readTimelinePerformanceDiagnostics()).toEqual({
      timelineRoots: 0,
      mountedRows: 0,
      mountedClipRoots: 0,
      maxMountedClipRootsInOneRow: 0,
      mountedTimeGridCells: 0,
      mountedTimelineDescendants: 0,
      schedulerQueued: 0,
      schedulerActive: 0,
      cacheBytes: 0,
      posterStates: { idle: 0, loading: 0, ready: 0, fallback: 0, error: 0 },
    });
  });

  it("treats every DOM ceiling as inclusive", () => {
    const budgets = resolveTimelineViewportBudgets({
      maxMountedClipRoots: 2,
      maxMountedClipRootsPerRow: 1,
      maxMountedRows: 2,
      maxMountedTimelineDescendants: 4,
    });
    expect(
      getTimelineResourceBudgetStatus(
        {
          ...readTimelinePerformanceDiagnostics(),
          mountedClipRoots: 2,
          maxMountedClipRootsInOneRow: 2,
          mountedTimelineDescendants: 4,
        },
        budgets,
      ),
    ).toEqual({
      timelineRoot: false,
      rows: true,
      clipRoots: true,
      clipRootsPerRow: false,
      descendants: true,
    });
  });

  it("fails the resource status when the timeline is absent", () => {
    expect(getTimelineResourceBudgetStatus(readTimelinePerformanceDiagnostics())).toMatchObject({
      timelineRoot: false,
    });
  });

  it("selects direct scrolling only through the configured safety envelope", () => {
    expect(resolveTimelineScrollStrategy(8_000_000)).toBe("direct");
    expect(resolveTimelineScrollStrategy(8_000_001)).toBe("segmented");
    expect(() => resolveTimelineScrollStrategy(Number.NaN)).toThrow("content width");
  });
});
