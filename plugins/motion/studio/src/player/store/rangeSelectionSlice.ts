export interface TimelineTimeRange {
  t0: number;
  t1: number;
}

export interface RangeSelectionSlice {
  /** Shift-drag ruler range in seconds, normalized so t0 <= t1. */
  rangeSelection: TimelineTimeRange | null;
}

export function createRangeSelectionSlice(): RangeSelectionSlice {
  return { rangeSelection: null };
}
