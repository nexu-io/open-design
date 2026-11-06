import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIdentity } from "./timelineElementHelpers";

export interface TimelineTimeRange {
  readonly start: number;
  readonly end: number;
}

export interface TimelineClipQueryWindow {
  readonly range: TimelineTimeRange;
  readonly identities: ReadonlySet<string>;
}

interface TimelineClipInterval {
  readonly element: TimelineElement;
  readonly identity: string;
  readonly ordinal: number;
  readonly start: number;
  readonly end: number;
}

interface TimelineClipRowIndex {
  readonly byStart: readonly TimelineClipInterval[];
  readonly treeLeafCount: number;
  readonly maxPositiveEndTree: readonly number[];
  readonly maxPointStartTree: readonly number[];
  readonly byIdentity: ReadonlyMap<string, readonly TimelineClipInterval[]>;
}

export interface TimelineClipIndex {
  readonly rows: ReadonlyMap<number, TimelineClipRowIndex>;
}

function clipInterval(element: TimelineElement, ordinal: number): TimelineClipInterval | null {
  if (!Number.isFinite(element.start) || !Number.isFinite(element.duration)) return null;
  const duration = Math.max(0, element.duration);
  return Object.freeze({
    element,
    identity: getTimelineElementIdentity(element),
    ordinal,
    start: element.start,
    end: element.start + duration,
  });
}

function timelineClipTreeLeafCount(intervalCount: number): number {
  let leafCount = 1;
  while (leafCount < intervalCount) leafCount *= 2;
  return leafCount;
}

function createTimelineClipMaxTrees(intervals: readonly TimelineClipInterval[]) {
  const treeLeafCount = timelineClipTreeLeafCount(intervals.length);
  const maxPositiveEndTree = Array<number>(treeLeafCount * 2).fill(Number.NEGATIVE_INFINITY);
  const maxPointStartTree = Array<number>(treeLeafCount * 2).fill(Number.NEGATIVE_INFINITY);
  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (!interval) continue;
    const leaf = treeLeafCount + index;
    if (interval.end > interval.start) maxPositiveEndTree[leaf] = interval.end;
    else maxPointStartTree[leaf] = interval.start;
  }
  for (let node = treeLeafCount - 1; node > 0; node -= 1) {
    maxPositiveEndTree[node] = Math.max(
      maxPositiveEndTree[node * 2] ?? Number.NEGATIVE_INFINITY,
      maxPositiveEndTree[node * 2 + 1] ?? Number.NEGATIVE_INFINITY,
    );
    maxPointStartTree[node] = Math.max(
      maxPointStartTree[node * 2] ?? Number.NEGATIVE_INFINITY,
      maxPointStartTree[node * 2 + 1] ?? Number.NEGATIVE_INFINITY,
    );
  }
  return {
    treeLeafCount,
    maxPositiveEndTree: Object.freeze(maxPositiveEndTree),
    maxPointStartTree: Object.freeze(maxPointStartTree),
  };
}

/**
 * Build an immutable snapshot for one exact display-track projection.
 * Rebuild only when that projection's array identity changes. Construction is
 * O(n log n) overall because each row is sorted once.
 */
export function createTimelineClipIndex(
  tracks: readonly (readonly [number, readonly TimelineElement[]])[],
): TimelineClipIndex {
  const rows = new Map<number, TimelineClipRowIndex>();
  for (const [rowKey, elements] of tracks) {
    const intervals = elements
      .map(clipInterval)
      .filter((interval): interval is TimelineClipInterval => interval !== null);
    const byStart = Object.freeze(
      [...intervals].sort(
        (left, right) => left.start - right.start || left.ordinal - right.ordinal,
      ),
    );
    const maxTrees = createTimelineClipMaxTrees(byStart);
    const mutableByIdentity = new Map<string, TimelineClipInterval[]>();
    for (const interval of intervals) {
      const matches = mutableByIdentity.get(interval.identity) ?? [];
      matches.push(interval);
      mutableByIdentity.set(interval.identity, matches);
    }
    const byIdentity = new Map(
      [...mutableByIdentity].map(([identity, matches]) => [identity, Object.freeze(matches)]),
    );
    rows.set(rowKey, Object.freeze({ byStart, ...maxTrees, byIdentity }));
  }
  return Object.freeze({ rows });
}

function upperBoundStart(intervals: readonly TimelineClipInterval[], end: number): number {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((intervals[mid]?.start ?? Number.POSITIVE_INFINITY) < end) low = mid + 1;
    else high = mid;
  }
  return low;
}

function overlaps(interval: TimelineClipInterval, range: TimelineTimeRange): boolean {
  if (interval.end <= interval.start)
    return interval.start >= range.start && interval.start < range.end;
  return interval.start < range.end && interval.end > range.start;
}

function collectTimelineClipOverlaps(
  row: TimelineClipRowIndex,
  candidateCount: number,
  range: TimelineTimeRange,
  selected: Set<TimelineClipInterval>,
  identities?: ReadonlySet<string>,
): void {
  const visit = (node: number, left: number, right: number) => {
    if (
      left >= candidateCount ||
      ((row.maxPositiveEndTree[node] ?? Number.NEGATIVE_INFINITY) <= range.start &&
        (row.maxPointStartTree[node] ?? Number.NEGATIVE_INFINITY) < range.start)
    ) {
      return;
    }
    if (right - left === 1) {
      const interval = row.byStart[left];
      if (interval) selectTimelineClipOverlap(interval, range, selected, identities);
      return;
    }
    const middle = Math.floor((left + right) / 2);
    visit(node * 2, left, middle);
    visit(node * 2 + 1, middle, right);
  };
  visit(1, 0, row.treeLeafCount);
}

function selectTimelineClipOverlap(
  interval: TimelineClipInterval,
  range: TimelineTimeRange,
  selected: Set<TimelineClipInterval>,
  identities: ReadonlySet<string> | undefined,
): void {
  if (!overlaps(interval, range)) return;
  if (identities !== undefined && !identities.has(interval.identity)) return;
  selected.add(interval);
}

/**
 * Query one display row. The overlap set and explicit actor pins are returned
 * in the row's original projection order, so windowing never changes z/DOM order.
 * The start lookup is O(log n). Balanced max trees prune both children whose
 * positive intervals and point clips cannot reach the window. The overlap walk
 * is O((k + 1) log n) for k candidates across the primary and actor windows;
 * pin lookup is O(p), followed by the projection-order sort of the unique
 * result set.
 */
export function queryTimelineClipIndex(
  index: TimelineClipIndex,
  rowKey: number,
  range: TimelineTimeRange,
  pinnedIdentities: ReadonlySet<string> = new Set(),
  actorWindows: readonly TimelineClipQueryWindow[] = [],
): readonly TimelineElement[] {
  const row = index.rows.get(rowKey);
  if (!row) return Object.freeze([]);
  const selected = new Set<TimelineClipInterval>();
  if (range.end > range.start) {
    collectTimelineClipOverlaps(row, upperBoundStart(row.byStart, range.end), range, selected);
  }
  for (const actorWindow of actorWindows) {
    if (actorWindow.range.end <= actorWindow.range.start) continue;
    collectTimelineClipOverlaps(
      row,
      upperBoundStart(row.byStart, actorWindow.range.end),
      actorWindow.range,
      selected,
      actorWindow.identities,
    );
  }
  for (const identity of pinnedIdentities) {
    for (const interval of row.byIdentity.get(identity) ?? []) selected.add(interval);
  }
  return Object.freeze(
    [...selected]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((interval) => interval.element),
  );
}
