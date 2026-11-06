/**
 * The active selection box on one automation lane.
 *
 * A store slice, not lane-local state, for the same reason keyframe selection
 * is one: Delete/copy/paste handlers and the shape menu live outside the lane
 * component and need to read it. Ephemeral by construction — nothing
 * serializes store state, and the selection must never survive into a render.
 */
import type { StoreApi } from "zustand";

export interface AutomationSelection {
  /** TimelineElement key (key ?? id) of the clip that owns the lane. */
  elementKey: string;
  /** Lane target: "volume" or "fx.<nodeId>.<param>". */
  target: string;
  /** Clip-local seconds; always t0 <= t1 (ordered on write). */
  t0: number;
  t1: number;
  /**
   * The box's value bounds, in the parameter's own units; always v0 <= v1.
   *
   * What makes the selection a box rather than a time span: a point is caught
   * only if it falls inside both axes. Span operations — copy, paste, shape
   * insert, simplify — still read t0/t1 alone, because they act on the envelope
   * over a stretch of time rather than on a set of breakpoints.
   */
  v0: number;
  v1: number;
}

export interface AutomationSelectionSlice {
  automationSelection: AutomationSelection | null;
  setAutomationSelection: (sel: AutomationSelection) => void;
  clearAutomationSelection: () => void;
}

export function createAutomationSelectionSlice(
  set: StoreApi<AutomationSelectionSlice>["setState"],
): AutomationSelectionSlice {
  return {
    automationSelection: null,
    setAutomationSelection: (sel) =>
      set({
        automationSelection: {
          ...sel,
          t0: Math.min(sel.t0, sel.t1),
          t1: Math.max(sel.t0, sel.t1),
          v0: Math.min(sel.v0, sel.v1),
          v1: Math.max(sel.v0, sel.v1),
        },
      }),
    clearAutomationSelection: () => set({ automationSelection: null }),
  };
}
