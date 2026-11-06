/**
 * Pure helpers for the canvas arrow-key nudge (DomEditOverlay).
 *
 * Mirrors captions/keyboard.ts conventions; the two nudge surfaces can't
 * double-fire because PreviewOverlays mounts CaptionOverlay and DomEditOverlay
 * mutually exclusively (caption edit mode returns before the DOM overlay).
 */

import { matchesKey, type StudioKeyAction } from "../../player/components/studioShortcuts";

export const CANVAS_NUDGE_STEP_PX = 1;
export const CANVAS_NUDGE_SHIFT_STEP_PX = 10;
/** One undo entry per key burst: the commit fires after this idle gap. */
export const CANVAS_NUDGE_COMMIT_DEBOUNCE_MS = 400;

type CanvasNudgeKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key"
> & { code?: string };

const NUDGES: ReadonlyArray<[StudioKeyAction, number, number, number]> = [
  ["nudgeLeft", -1, 0, CANVAS_NUDGE_STEP_PX],
  ["nudgeRight", 1, 0, CANVAS_NUDGE_STEP_PX],
  ["nudgeUp", 0, -1, CANVAS_NUDGE_STEP_PX],
  ["nudgeDown", 0, 1, CANVAS_NUDGE_STEP_PX],
  ["nudgeLeftTen", -1, 0, CANVAS_NUDGE_SHIFT_STEP_PX],
  ["nudgeRightTen", 1, 0, CANVAS_NUDGE_SHIFT_STEP_PX],
  ["nudgeUpTen", 0, -1, CANVAS_NUDGE_SHIFT_STEP_PX],
  ["nudgeDownTen", 0, 1, CANVAS_NUDGE_SHIFT_STEP_PX],
];

/** Nudge key (default: arrows, Shift = 10) to a composition-px delta; null for any other key. */
export function resolveCanvasNudgeDelta(
  event: CanvasNudgeKeyEvent,
): { dx: number; dy: number } | null {
  const hit = NUDGES.find(([action]) => matchesKey(event, action));
  return hit ? { dx: hit[1] * hit[3], dy: hit[2] * hit[3] } : null;
}

export interface CanvasNudgeTarget {
  capabilities: { canApplyManualOffset: boolean };
}

/** A nudge needs at least one target and every target must accept manual offsets. */
export function canCanvasNudgeTargets(targets: ReadonlyArray<CanvasNudgeTarget>): boolean {
  return targets.length > 0 && targets.every((t) => t.capabilities.canApplyManualOffset);
}
