/**
 * Keyboard surface for the active automation selection: Escape clears,
 * Delete/Backspace deletes every breakpoint inside the selection box, Cmd/Ctrl+C
 * copies its span, Cmd/Ctrl+V pastes at the selection's start (or the playhead) onto the
 * selected clip's lane. Sibling of
 * useKeyframeKeyboard and copies its contract: capture phase so playback
 * shortcuts cannot swallow keys we act on, inert while any text input has
 * focus, and a key is only consumed when it does something.
 *
 * Falling through is NOT enough to keep clip-level copy/paste working:
 * useAppHotkeys listens on `window` with capture, so it always runs before this
 * document-level listener and `stopImmediatePropagation` here comes too late.
 * `automationOwnsKey` below is the arbitration that actually works — the
 * central dispatcher asks it first and stands down.
 */
import { useEffect } from "react";
import { usePlayerStore, type TimelineElement } from "../player/store/playerStore";
import { laneFor, withLane } from "../player/components/automationLaneGeometry";
import { pointInSelection, replaceRange } from "../player/components/automationLaneSelection";
import {
  copyRange,
  isLastPasteSpan,
  markLastPaste,
  pastePoints,
  readClipboard,
} from "../player/components/automationClipboard";
import {
  resolveAutomationRange,
  type AutomationRange,
  type HfAutomation,
  type HfAutomationLane,
} from "@hyperframes/core/audio-automation";
import { clampNumber } from "../utils/studioHelpers";
import { isTypingTarget } from "../utils/typingTarget";
import { matchesKey } from "../player/components/studioShortcuts";
import type { AutomationSelection } from "../player/store/automationSelectionSlice";
import type {
  AutomationLaneBinding,
  UseAutomationLanesResult,
} from "../player/components/useAutomationLanes";

type PlayerState = ReturnType<typeof usePlayerStore.getState>;

/** A `TimelineElement`'s identity as the selection and lane bindings key by. */
function elementKeyOf(element: TimelineElement): string {
  return element.key ?? element.id;
}

function findElement(elements: TimelineElement[], key: string | null): TimelineElement | null {
  if (!key) return null;
  return elements.find((el) => elementKeyOf(el) === key) ?? null;
}

/**
 * A selection's element, binding, lane and range — the resolution Delete and
 * copy both need. Null when the clip is gone, its lane is read-only, or the
 * target no longer resolves to a range.
 */
function resolveSelectionContext(
  state: PlayerState,
  lanes: UseAutomationLanesResult,
  sel: AutomationSelection,
): { binding: AutomationLaneBinding; lane: HfAutomationLane; range: AutomationRange } | null {
  const element = findElement(state.elements, sel.elementKey);
  if (!element) return null;
  const binding = lanes.bind(element, sel.elementKey === state.selectedElementId);
  if (binding.readOnly) return null;
  const range = resolveAutomationRange(sel.target, binding.chain ?? undefined);
  if (!range) return null;
  return { binding, lane: laneFor(binding.automation, sel.target), range };
}

/**
 * The write that deletes the breakpoints inside the active selection, or null when
 * there is nothing to do: the clip is gone, its lane is read-only, the target no
 * longer resolves to a range, or the selection covers no breakpoints.
 *
 * Deletes them outright rather than emptying the span behind anchor points. Anchors
 * are what `replaceRange` exists for, and they are right for a shape insert or a
 * paste — the envelope either side of the edit must not move. But Delete over a
 * selection is the author saying "these points, gone", and answering that with two
 * NEW points at the selection's edges reads as the delete not having worked. The
 * envelope between the surviving neighbours re-interpolates, which is what deleting
 * a breakpoint means everywhere else in the lane (right-clicking one does exactly
 * this).
 *
 * Both axes of the selection box, edges included: what Delete removes is exactly
 * what the lane drew a ring around. A point at the right time but outside the box's
 * value bounds stays — which is the whole reason the box has them.
 */
function resolveDeleteWrite(
  state: PlayerState,
  lanes: UseAutomationLanesResult,
  sel: AutomationSelection,
): { onCommit: AutomationLaneBinding["onCommit"]; next: HfAutomation } | null {
  const ctx = resolveSelectionContext(state, lanes, sel);
  if (!ctx) return null;
  const points = ctx.lane.points.filter((p) => !pointInSelection(p, sel));
  // Nothing inside is nothing to do — and it must stay a no-op rather than
  // writing, or Delete over a smooth stretch would push an undo entry that
  // changed nothing.
  if (points.length === ctx.lane.points.length) return null;
  return {
    onCommit: ctx.binding.onCommit,
    next: withLane(ctx.binding.automation, { target: sel.target, points }),
  };
}

/**
 * The lane target Cmd+V writes to: the active selection's, when the
 * selection belongs to the same clip the paste is landing on, else the
 * clip's first automation lane. A selection left over on a different clip
 * does not redirect the paste.
 */
function pasteTargetName(
  binding: AutomationLaneBinding,
  elementKey: string,
  sel: AutomationSelection | null,
): string | undefined {
  if (sel && sel.elementKey === elementKey) return sel.target;
  return binding.lanes[0]?.target;
}

/**
 * Where Cmd+V lands, or null when nothing is selected, the clip's lanes are
 * read-only, or it has no automation lane to fall back to.
 */
function resolvePasteTarget(
  state: PlayerState,
  lanes: UseAutomationLanesResult,
  sel: AutomationSelection | null,
): {
  elementKey: string;
  element: TimelineElement;
  target: string;
  binding: AutomationLaneBinding;
  lane: HfAutomationLane;
  range: AutomationRange;
} | null {
  const element = findElement(state.elements, state.selectedElementId);
  if (!element) return null;
  const elementKey = elementKeyOf(element);
  const binding = lanes.bind(element, true);
  if (binding.readOnly) return null;
  const target = pasteTargetName(binding, elementKey, sel);
  if (!target) return null;
  const range = resolveAutomationRange(target, binding.chain ?? undefined);
  if (!range) return null;
  return { elementKey, element, target, binding, lane: laneFor(binding.automation, target), range };
}

/** Is the playhead over this clip? Mirrors TimelineAutomationLaneSlot's own
 *  in-clip test, which is what decides a lane draws a playhead at all. */
function playheadInClip(state: PlayerState, element: TimelineElement): boolean {
  return (
    state.currentTime >= element.start && state.currentTime <= element.start + element.duration
  );
}

/**
 * Clip-local seconds a `span`-wide paste should start at, or null when nothing
 * can anchor it.
 *
 * Three refusals, all of which used to be silent mispastes:
 * - A span wider than the clip has nowhere to go. Clamping the start to 0 still
 *   writes breakpoints past the clip's end and leaves a selection whose far
 *   edge can never be grabbed again.
 * - A playhead outside the clip is not an anchor. It used to collapse to the
 *   clip's own t=0, so a playhead at 0:00 pasted into the head of a clip
 *   starting at 0:30.
 * - No selection on this clip and no in-clip playhead means no anchor at all.
 *
 * A repeated Cmd+V chains. Paste leaves its own span selected (the user's only
 * feedback that it landed), so anchoring at `sel.t0` unconditionally made the
 * second press overwrite the first. When the live selection is exactly the mark
 * the last paste left, anchor at its END; a selection the user drew themselves
 * still pastes at its start.
 */
function pasteAnchor(
  state: PlayerState,
  element: TimelineElement,
  span: number,
  sel: AutomationSelection | null,
): number | null {
  if (span > element.duration) return null;
  const onThisElement = sel !== null && sel.elementKey === elementKeyOf(element);
  const raw = onThisElement
    ? isLastPasteSpan(sel)
      ? sel.t1
      : sel.t0
    : playheadInClip(state, element)
      ? state.currentTime - element.start
      : null;
  if (raw === null) return null;
  // Keeps the whole pasted span inside the clip — including a chain that has
  // walked to the end — so its own selection stays grabbable.
  return clampNumber(raw, 0, element.duration - span);
}

let latestPaste = 0;

/**
 * Cmd/Ctrl+V: paste the clipboard onto the selected clip's lane, at the active
 * selection or the playhead. Returns false (untouched event) when the chord
 * doesn't match, there is nothing to paste, or no lane can take it.
 * Checked ahead of the "no selection" guard in the handler below: paste must
 * work from the playhead with no active selection at all.
 */
function handlePaste(
  e: KeyboardEvent,
  state: PlayerState,
  lanes: UseAutomationLanesResult,
): boolean {
  if (!matchesKey(e, "paste")) return false;
  const clip = readClipboard(state.timelineProjectId);
  if (!clip) return false;
  const sel = state.automationSelection;
  const paste = resolvePasteTarget(state, lanes, sel);
  if (!paste) return false;
  const atT = pasteAnchor(state, paste.element, clip.span, sel);
  if (atT === null) return false;

  const t1 = atT + clip.span;
  const inner = pastePoints(clip, paste.range, atT);
  const points = replaceRange({ lane: paste.lane, range: paste.range, t0: atT, t1, inner });

  e.preventDefault();
  e.stopImmediatePropagation();
  const saved = paste.binding.onCommit(
    withLane(paste.binding.automation, { target: paste.target, points }),
  );
  const seq = ++latestPaste;
  const mark = {
    elementKey: paste.elementKey,
    target: paste.target,
    t0: atT,
    t1,
    v0: paste.range.min,
    v1: paste.range.max,
  };
  // Once the latest paste lands, and only over the selection it was pasted at, select
  // and mark its full-height span: the feedback that it landed, what a second Cmd+V
  // chains after, and what Delete takes back in one press.
  void saved.then((outcome) => {
    if (outcome && outcome.status !== "saved") return;
    const current = usePlayerStore.getState();
    const moved = current.selectedElementId !== state.selectedElementId;
    if (seq !== latestPaste || moved || current.automationSelection !== sel) return;
    current.setAutomationSelection(mark);
    markLastPaste(mark);
  });
  return true;
}

/** Cmd/Ctrl+C on the active selection. Returns false when the chord doesn't
 *  match, the selection no longer resolves to a copyable lane, or the lane is
 *  empty so there is no shape to capture. */
function handleCopy(
  e: KeyboardEvent,
  state: PlayerState,
  lanes: UseAutomationLanesResult,
  sel: AutomationSelection,
): boolean {
  if (!matchesKey(e, "copy")) return false;
  const ctx = resolveSelectionContext(state, lanes, sel);
  if (!ctx) return false;
  if (!copyRange(state.timelineProjectId, ctx.lane, ctx.range, sel.t0, sel.t1)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  return true;
}

/**
 * Will an automation range claim this keystroke? Asked by useAppHotkeys, which
 * listens on `window` with capture and therefore always runs BEFORE this
 * hook's document listener — so `stopImmediatePropagation` cannot arbitrate and
 * the dispatcher has to stand down of its own accord. Without it Cmd+C armed
 * both clipboards and Cmd+V ran the whole clip-duplication path (read file →
 * insert → save with history → reload preview) alongside the automation write:
 * two async read-modify-writes of one file from one keypress.
 *
 * Store and clipboard only, no lane binding, so the dispatcher can call it
 * without holding the binding factory. That leaves one accepted residual: the
 * predicate cannot see a read-only lane or an unresolvable target, so in those rare cases
 * the keystroke is a no-op instead of falling through to clip copy/paste. A
 * dead key beats today's double write.
 */
export function automationOwnsKey(e: KeyboardEvent): boolean {
  if (isTypingTarget(document.activeElement)) return false;
  const state = usePlayerStore.getState();
  if (matchesKey(e, "copy")) return state.automationSelection !== null;
  if (!matchesKey(e, "paste")) return false;
  const clip = readClipboard(state.timelineProjectId);
  if (!clip) return false;
  const element = findElement(state.elements, state.selectedElementId);
  if (!element) return false;
  // Same anchor resolution the handler uses, so predicate and handler cannot
  // disagree about whether the paste has somewhere to land.
  return pasteAnchor(state, element, clip.span, state.automationSelection) !== null;
}

/** Delete/Backspace on the active selection. Returns false when the key
 *  doesn't match or there is nothing to empty. */
function handleDelete(
  e: KeyboardEvent,
  state: PlayerState,
  lanes: UseAutomationLanesResult,
  sel: AutomationSelection,
): boolean {
  if (!matchesKey(e, "deleteSelected") && !matchesKey(e, "deleteSelectedAlt")) return false;
  const write = resolveDeleteWrite(state, lanes, sel);
  if (!write) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  void write.onCommit(write.next);
  return true;
}

export function useAutomationSelectionKeyboard({
  lanes,
}: {
  lanes: UseAutomationLanesResult;
}): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (isTypingTarget(document.activeElement)) return;
      // Somebody upstream already claimed this key. useAppHotkeys is on
      // window/capture so it always runs first, and it deliberately lets a
      // keyframe selection outrank an automation range on Delete — without
      // this, that keystroke deleted the keyframes there AND emptied the range
      // here, two edits from one press. preventDefault does not stop
      // propagation, so the claim has to be read, not assumed.
      if (e.defaultPrevented) return;
      const state = usePlayerStore.getState();
      if (handlePaste(e, state, lanes)) return;

      const sel = state.automationSelection;
      if (!sel) return;

      if (matchesKey(e, "cancel")) {
        state.clearAutomationSelection();
        return;
      }
      if (handleCopy(e, state, lanes, sel)) return;
      handleDelete(e, state, lanes, sel);
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [lanes]);
}
