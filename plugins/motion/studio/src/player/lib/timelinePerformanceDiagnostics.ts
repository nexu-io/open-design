import { TIMELINE_VIEWPORT_BUDGETS, type TimelineViewportBudgets } from "./timelineViewportBudgets";

export type TimelinePosterState = "idle" | "loading" | "ready" | "fallback" | "error";

export interface TimelinePerformanceDiagnostics {
  timelineRoots: number;
  mountedRows: number;
  mountedClipRoots: number;
  maxMountedClipRootsInOneRow: number;
  mountedTimeGridCells: number;
  mountedTimelineDescendants: number;
  schedulerQueued: number;
  schedulerActive: number;
  cacheBytes: number;
  posterStates: Readonly<Record<TimelinePosterState, number>>;
}

export interface TimelineResourceBudgetStatus {
  timelineRoot: boolean;
  rows: boolean;
  clipRoots: boolean;
  clipRootsPerRow: boolean;
  descendants: boolean;
}

function readNonNegativeNumber(value: string | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function countPosters(root: ParentNode): Readonly<Record<TimelinePosterState, number>> {
  const counts: Record<TimelinePosterState, number> = {
    idle: 0,
    loading: 0,
    ready: 0,
    fallback: 0,
    error: 0,
  };
  for (const node of root.querySelectorAll<HTMLElement>("[data-timeline-poster-state]")) {
    const state = node.dataset.timelinePosterState;
    if (state && Object.hasOwn(counts, state)) counts[state as TimelinePosterState] += 1;
  }
  return Object.freeze(counts);
}

function maxClipsInOneRow(root: ParentNode): number {
  const byRow = new Map<Element, number>();
  for (const clip of root.querySelectorAll<HTMLElement>('[data-clip="true"]')) {
    const row = clip.closest("[data-timeline-row]");
    if (!row) continue;
    byRow.set(row, (byRow.get(row) ?? 0) + 1);
  }
  return Math.max(0, ...byRow.values());
}

function sumDataAttribute(root: ParentNode, selector: string, dataKey: string): number {
  let total = 0;
  for (const node of root.querySelectorAll<HTMLElement>(selector)) {
    total += readNonNegativeNumber(node.dataset[dataKey]);
  }
  return total;
}

/**
 * Read current timeline costs directly from the mounted DOM. No counters are
 * retained, so an unmount or project reset is reflected as a zero baseline on
 * the next read rather than depending on cleanup ordering.
 */
export function readTimelinePerformanceDiagnostics(
  root: ParentNode = document,
): Readonly<TimelinePerformanceDiagnostics> {
  const timelineRoots = root.querySelectorAll<HTMLElement>('[aria-label="Timeline track view"]');
  let mountedTimelineDescendants = 0;
  for (const timelineRoot of timelineRoots) {
    mountedTimelineDescendants += timelineRoot.querySelectorAll("*").length;
  }
  return Object.freeze({
    timelineRoots: timelineRoots.length,
    mountedRows: root.querySelectorAll("[data-timeline-row]").length,
    mountedClipRoots: root.querySelectorAll('[data-clip="true"]').length,
    maxMountedClipRootsInOneRow: maxClipsInOneRow(root),
    mountedTimeGridCells: root.querySelectorAll("[data-timeline-grid-cell]").length,
    mountedTimelineDescendants,
    schedulerQueued: sumDataAttribute(
      root,
      "[data-timeline-scheduler-queued]",
      "timelineSchedulerQueued",
    ),
    schedulerActive: sumDataAttribute(
      root,
      "[data-timeline-scheduler-active]",
      "timelineSchedulerActive",
    ),
    cacheBytes: sumDataAttribute(root, "[data-timeline-cache-bytes]", "timelineCacheBytes"),
    posterStates: countPosters(root),
  });
}

export function getTimelineResourceBudgetStatus(
  diagnostics: TimelinePerformanceDiagnostics,
  budgets: Readonly<TimelineViewportBudgets> = TIMELINE_VIEWPORT_BUDGETS,
): Readonly<TimelineResourceBudgetStatus> {
  return Object.freeze({
    timelineRoot: diagnostics.timelineRoots === 1,
    rows: diagnostics.mountedRows <= budgets.maxMountedRows,
    clipRoots: diagnostics.mountedClipRoots <= budgets.maxMountedClipRoots,
    clipRootsPerRow: diagnostics.maxMountedClipRootsInOneRow <= budgets.maxMountedClipRootsPerRow,
    descendants: diagnostics.mountedTimelineDescendants <= budgets.maxMountedTimelineDescendants,
  });
}

export function resolveTimelineScrollStrategy(
  contentWidthPx: number,
  budgets: Readonly<TimelineViewportBudgets> = TIMELINE_VIEWPORT_BUDGETS,
): "direct" | "segmented" {
  if (!Number.isFinite(contentWidthPx) || contentWidthPx < 0) {
    throw new RangeError("Timeline content width must be a finite non-negative number");
  }
  return contentWidthPx <= budgets.directScrollSafetyPx ? "direct" : "segmented";
}
