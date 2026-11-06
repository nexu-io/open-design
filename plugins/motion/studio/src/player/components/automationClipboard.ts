/**
 * Internal clipboard for automation ranges. Module-level, not the OS
 * clipboard — points are not text, and useClipboard is already the DOM-element
 * channel. Values cross parameters through unit space, so a volume duck
 * pasted onto a log-scaled wet knob lands proportionally, not literally.
 *
 * Project-scoped by itself rather than by a caller, because the failure is
 * destructive and silent: a range copied in project A pasted into B is remapped
 * through A's captured `sourceRange` for an FX node B may not even have, and the
 * keystroke is consumed so clip paste never runs. Every entry point carries the
 * project it is speaking for and a mismatch empties the module, so no future
 * caller can forget the guard — the same shape `keyframeSlice` uses to discard a
 * request from a previous session.
 */
import {
  sampleAutomationLane,
  type AutomationRange,
  type HfAutomationLane,
  type HfAutomationPoint,
} from "@hyperframes/core/audio-automation";
import { fromUnit, toUnit } from "./automationLaneGeometry";
import { pointsIn } from "./automationLaneSelection";

export interface AutomationClipboardEntry {
  sourceRange: AutomationRange;
  span: number;
  points: HfAutomationPoint[];
}

/** The span one paste covered, in the same shape as the selection it left. */
export interface AutomationPasteMark {
  elementKey: string;
  target: string;
  t0: number;
  t1: number;
}

let ownerProjectId: string | null = null;
let entry: AutomationClipboardEntry | null = null;
let lastPaste: AutomationPasteMark | null = null;

/**
 * Rebind the module to `projectId`, discarding anything captured under a
 * different one. Called by both entry points, so the mark is scoped
 * transitively: `isLastPasteSpan` can only ever see a mark left by a paste in
 * the project that most recently read the clipboard.
 *
 * `null` (no timeline session yet) is a project id like any other — it can hold
 * an entry, and the first real session id evicts it.
 */
function useProject(projectId: string | null): void {
  if (projectId === ownerProjectId) return;
  ownerProjectId = projectId;
  entry = null;
  lastPaste = null;
}

/**
 * Capture `[t0, t1]` rebased to zero. Returns false — leaving the clipboard as
 * it was — when the lane has nothing to capture.
 *
 * `pointsIn` reports only explicit breakpoints, so a range drawn over a smooth
 * stretch of envelope has none. Storing that as `points: []` would arm a
 * clipboard whose paste is byte-identical to the Delete write, so every later
 * Cmd+V would erase its destination instead of reproducing the copied shape.
 * Over a lane that HAS an envelope the range is a real flat or sloped segment,
 * captured by sampling both edges (what `replaceRange`'s own anchors do). Over
 * an entirely empty lane there is no shape at all, so nothing is stored — a
 * failed copy leaves an earlier clipboard alone rather than destroying it.
 */
export function copyRange(
  projectId: string | null,
  lane: HfAutomationLane,
  range: AutomationRange,
  t0: number,
  t1: number,
): boolean {
  const inner = pointsIn(lane, t0, t1).map((p) => ({ ...p, t: p.t - t0 }));
  if (inner.length === 0 && lane.points.length === 0) return false;
  useProject(projectId);
  entry = {
    sourceRange: range,
    span: t1 - t0,
    points:
      inner.length > 0
        ? inner
        : [
            { t: 0, v: sampleAutomationLane(lane, t0, range.scale) },
            { t: t1 - t0, v: sampleAutomationLane(lane, t1, range.scale) },
          ],
  };
  return true;
}

export function readClipboard(projectId: string | null): AutomationClipboardEntry | null {
  useProject(projectId);
  return entry;
}

export function pastePoints(
  from: AutomationClipboardEntry,
  target: AutomationRange,
  atT: number,
): HfAutomationPoint[] {
  return from.points.map((p) => ({
    ...p,
    t: atT + p.t,
    v: fromUnit(target, toUnit(from.sourceRange, p.v)),
  }));
}

/**
 * Remember the span a paste just covered and left selected, so the next Cmd+V
 * can tell that selection apart from one the user drew and chain after it
 * instead of overwriting it.
 */
export function markLastPaste(mark: AutomationPasteMark): void {
  lastPaste = { ...mark };
}

/** True when `mark` is exactly the span the last paste left selected. */
export function isLastPasteSpan(mark: AutomationPasteMark): boolean {
  if (!lastPaste) return false;
  return (
    lastPaste.elementKey === mark.elementKey &&
    lastPaste.target === mark.target &&
    lastPaste.t0 === mark.t0 &&
    lastPaste.t1 === mark.t1
  );
}

export function clearAutomationClipboard(): void {
  ownerProjectId = null;
  entry = null;
  lastPaste = null;
}
