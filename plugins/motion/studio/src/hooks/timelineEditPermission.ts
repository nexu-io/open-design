import { useCallback } from "react";
import type { TimelineElement } from "../player";

/** A host's verdict on one element: editable, or blocked with a reason to show. */
export type TimelineEditPermission = true | { blocked: true; reason: string };

export type CanEditTimelineElement = (element: TimelineElement) => TimelineEditPermission;

/** What an effect save did: landed, refused before writing, or failed while writing. */
export type TimelineEditOutcome =
  | { status: "saved" }
  | { status: "refused" | "failed"; reason: string };

/** The project to save into, or why the save stops before it writes. */
export function projectForTimelineSave(
  isRecording: boolean | undefined,
  projectId: string | null,
  showToast: (message: string, tone?: "error" | "info") => void,
): string | TimelineEditOutcome {
  if (isRecording) {
    showToast("Cannot edit timeline while recording", "error");
    return { status: "refused", reason: "Cannot edit timeline while recording" };
  }
  return projectId ?? failedTimelineSave("No project is open", showToast);
}

export function failedTimelineSave(
  reason: string,
  showToast: (message: string, tone?: "error" | "info") => void,
): TimelineEditOutcome {
  showToast(reason);
  return { status: "failed", reason };
}

function timelineEditRefusal(
  canEdit: CanEditTimelineElement | undefined,
  targets: readonly TimelineElement[],
): string | null {
  for (const element of targets) {
    const verdict = canEdit?.(element) ?? true;
    if (verdict !== true) return verdict.reason;
  }
  return null;
}

/**
 * The host's reason to refuse a write when any target element is blocked, toasted,
 * or null. Absent `canEdit` never refuses, so Studio itself is unchanged.
 */
export function useTimelineEditRefusal(
  canEdit: CanEditTimelineElement | undefined,
  showToast: (message: string, tone?: "error" | "info") => void,
) {
  return useCallback(
    (targets: readonly TimelineElement[]): string | null => {
      const reason = timelineEditRefusal(canEdit, targets);
      if (reason !== null) showToast(reason, "error");
      return reason;
    },
    [canEdit, showToast],
  );
}

export function useTimelineEditGate(
  canEdit: CanEditTimelineElement | undefined,
  showToast: (message: string, tone?: "error" | "info") => void,
) {
  const refuse = useTimelineEditRefusal(canEdit, showToast);
  return useCallback(
    (targets: readonly TimelineElement[]): boolean => refuse(targets) === null,
    [refuse],
  );
}
