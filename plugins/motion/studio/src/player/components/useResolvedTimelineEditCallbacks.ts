import { useMemo } from "react";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import type { TimelineEditCallbacks } from "./timelineCallbacks";

// Props a parent (e.g. NLELayout) may pass to <Timeline> to intercept edits —
// the rest of the callback bag still comes from TimelineEditContext.
export type TimelineEditOverrides = Pick<
  TimelineEditCallbacks,
  | "onMoveElement"
  | "onMoveElements"
  | "onResizeElement"
  | "onResizeElements"
  | "onBlockedEditAttempt"
  | "onSplitElement"
>;

// Merge any prop overrides over the context callbacks. Used so NLELayout can
// wrap move/resize/split (to rebase expanded sub-comp clips) while every other
// callback falls through to the context unchanged.
export function useResolvedTimelineEditCallbacks(
  overrides: TimelineEditOverrides,
): TimelineEditCallbacks {
  const ctx = useTimelineEditContextOptional();
  const {
    onMoveElement,
    onMoveElements,
    onResizeElement,
    onResizeElements,
    onBlockedEditAttempt,
    onSplitElement,
  } = overrides;
  return useMemo(
    () => ({
      ...ctx,
      onMoveElement: onMoveElement ?? ctx.onMoveElement,
      onMoveElements: onMoveElements ?? ctx.onMoveElements,
      onResizeElement: onResizeElement ?? ctx.onResizeElement,
      onResizeElements: onResizeElements ?? ctx.onResizeElements,
      onBlockedEditAttempt: onBlockedEditAttempt ?? ctx.onBlockedEditAttempt,
      onSplitElement: onSplitElement ?? ctx.onSplitElement,
    }),
    [
      ctx,
      onMoveElement,
      onMoveElements,
      onResizeElement,
      onResizeElements,
      onBlockedEditAttempt,
      onSplitElement,
    ],
  );
}
