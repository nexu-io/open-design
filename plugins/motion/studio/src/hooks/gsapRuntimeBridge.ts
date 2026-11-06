/**
 * Bridge between the Studio drag system and GSAP animations running in the
 * preview iframe.
 *
 * The preview iframe exposes `window.gsap` with a `getProperty(element, prop)`
 * method that returns the ACTUAL interpolated value at the current seek time.
 * This module reads those runtime values so that drag commits can write correct
 * absolute positions back into the GSAP script, regardless of tween type,
 * easing, or seek position.
 */
import type { GsapAnimation, PropertyGroupName } from "@hyperframes/core/gsap-parser";
import { isXYPositionWrite, PROPERTY_GROUPS } from "@hyperframes/parsers/gsap-constants";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";

import { readAllAnimatedProperties, readGsapProperty } from "./gsapRuntimeReaders";
import { commitGsapPositionFromDrag, gsapPositionFromDragOutcome } from "./gsapDragPositionCommit";
import { commitValueAtPlayhead } from "./gsapValueAtPlayhead";
import {
  commitStaticGsapPosition,
  commitStaticGsapRotation,
  commitWholePathOffset,
  computeCurrentPercentage,
  findExistingPositionWrite,
  findRotationSetAnimation,
  stepListBlock,
} from "./gsapDragCommit";
import { commitWholePropertyOffset } from "./gsapWholePropertyOffsetCommit";
import { isGestureTransactionCommit } from "./gestureTransaction";
import { tweenReach, tweensForThisElement } from "./gsapTweenReach";
import { resolveTweenDuration } from "../utils/globalTimeCompiler";
import { roundTo3 } from "../utils/rounding";
import type { GsapDragCommitCallbacks } from "./gsapDragCommit";
import { readDragStamp, type DragStamp } from "./draggedGsapPosition";
import { editMoment } from "./editMoment";
import type { EditMoment } from "../components/editor/manualEditsTypes";
import { isInstantHold, selectorFromSelection, writeTargetSelector } from "./gsapShared";
import {
  findGsapPositionAnimation,
  pickClosestToPlayhead,
  readGsapPositionFromIframe,
} from "./gsapPositionDetection";
import {
  hasNonHoldTweenForElement,
  POSITION_CHANNELS,
  ROTATION_CHANNELS,
} from "./gsapRuntimeKeyframes";
import { getAnimationsForElement } from "./gsapElementMatch";
import {
  animationWritesAnyProperty,
  directEditOutcomeForProperties,
  type GsapEditOutcome,
} from "./gsapEditOutcome";

const POSITION_CHANNEL_SET = new Set<string>(POSITION_CHANNELS);
const ROTATION_CHANNEL_SET = new Set<string>(ROTATION_CHANNELS);

// ── Property-group tween resolution ───────────────────────────────────────

/**
 * The tween to edit for a property group: a tween tagged with it, else a legacy tween that mixes
 * it with other groups. A mixed tween is edited in place, never split first: inside a gesture the
 * split is only buffered, so ids read after it are stale and the edit lands beside the old tween.
 */
export async function resolveGroupTween(
  group: PropertyGroupName,
  animations: GsapAnimation[],
  _selection: DomEditSelection,
  _commitMutation: GsapDragCommitCallbacks["commitMutation"],
  fetchFallbackAnimations?: () => Promise<GsapAnimation[]>,
  time?: number,
): Promise<{ anim: GsapAnimation; animations: GsapAnimation[] } | null> {
  const inGroup = (list: GsapAnimation[]) => {
    const tagged = list.filter((a) => a.propertyGroup === group);
    const props = new Set(PROPERTY_GROUPS[group]);
    const mixed = list.filter((a) => !a.propertyGroup && animationWritesAnyProperty(a, props));
    return pickClosestToPlayhead(tagged.length > 0 ? tagged : mixed, time);
  };
  const anim = inGroup(animations);
  if (anim) return { anim, animations };
  if (!fetchFallbackAnimations) return null;
  const fresh = await fetchFallbackAnimations();
  const freshAnim = inGroup(fresh);
  return freshAnim ? { anim: freshAnim, animations: fresh } : null;
}

// ── High-level intercept ───────────────────────────────────────────────────

export type { GsapDragCommitCallbacks };

const writesPosition = (a: GsapAnimation) => animationWritesAnyProperty(a, POSITION_CHANNEL_SET);

/** Only a tween shared with siblings positions this element (a stagger on `.w`). */
function positionedOnlyBySharedTween(selection: DomEditSelection, animations: GsapAnimation[]) {
  const positioning = animations.filter(writesPosition);
  return (
    positioning.some((a) => tweenReach(a, selection.element) === "shared") &&
    tweensForThisElement(selection, positioning).length === 0
  );
}

// fallow-ignore-next-line complexity
async function preflightGsapDragIntercept(
  selection: DomEditSelection,
  animations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  fetchFallbackAnimations?: () => Promise<GsapAnimation[]>,
  group?: boolean,
): Promise<GsapEditOutcome> {
  const fetchedAnimations = fetchFallbackAnimations ? await fetchFallbackAnimations() : [];
  return dragEditOutcome(selection, animations, iframe, fetchedAnimations, group);
}

/** The move commit's refusal rule, also run ahead of time to hide the move handles. */
// fallow-ignore-next-line complexity
export function dragEditOutcome(
  selection: DomEditSelection,
  animations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  fetchedAnimations: GsapAnimation[] = [],
  group = false,
): GsapEditOutcome {
  const selector = selectorFromSelection(selection);
  if (!selector) return { status: "blocked", reason: "no-selector" };
  // The fallback API currently represents both a definitive empty parse and an
  // exhausted fetch failure as `[]`. Keep the selected cache in the preflight
  // set as well: ignoring it would let a transient fetch failure bypass helper /
  // runtime-source ownership and reach a destructive split or property write.
  const allKnownAnimations = [...animations, ...fetchedAnimations];
  const reaching = allKnownAnimations.filter(
    (a) => tweenReach(a, selection.element) !== "elsewhere",
  );
  const editability = directEditOutcomeForProperties(reaching, POSITION_CHANNEL_SET);
  if (editability.status === "blocked") return editability;
  if (positionedOnlyBySharedTween(selection, allKnownAnimations)) {
    return { status: "element-offset" };
  }
  const sourceAnimations = tweensForThisElement(
    selection,
    fetchedAnimations.length > 0 ? fetchedAnimations : animations,
  );
  // In a group only a tween naming this member by id or by its own selector counts,
  // so a class tween shared with id-selected members cannot take one member's write.
  const positionSources = group
    ? getAnimationsForElement(sourceAnimations, { id: selection.id ?? null, selector })
    : sourceAnimations;
  const posAnim = findGsapPositionAnimation(positionSources, selector);
  const hasLivePosition = hasNonHoldTweenForElement(iframe, selector, undefined, POSITION_CHANNELS);

  if (hasLivePosition && !posAnim) {
    // GSAP is visibly moving this element but the parser found no position
    // tween for it — a source-match gap, not necessarily computed source.
    return {
      status: "blocked",
      reason: "source-uneditable",
      detail: "live-position-no-source-tween",
    };
  }
  if (!posAnim && !writeTargetSelector(selection)) {
    return { status: "blocked", reason: "no-selector" };
  }
  return { status: "persisted" };
}

let dragGestureCounter = 0;

/** Every write one drag makes (a split, then the move) records as ONE undo step. A
 *  transaction or group commit already owns its key. */
function oneUndoStep(
  commit: GsapDragCommitCallbacks["commitMutation"],
): GsapDragCommitCallbacks["commitMutation"] {
  if (isGestureTransactionCommit(commit)) return commit;
  const coalesceKey = `gsap:drag:${++dragGestureCounter}`;
  return (selection, mutation, options) =>
    commit(selection, mutation, { ...options, coalesceKey, coalesceMs: Number.POSITIVE_INFINITY });
}

const isPositionWriteOf = (selector: string) => (a: GsapAnimation) =>
  a.targetSelector === selector && isXYPositionWrite(a);

/** The one position write a self-heal keeps when holds fight over `selector`, else null. */
function positionWriteKeeper(animations: GsapAnimation[], selector: string): GsapAnimation | null {
  const dupes = animations.filter(isPositionWriteOf(selector));
  // Real tweens one after another are a motion, not a conflict: only holds can fight.
  if (dupes.length < 2 || dupes.filter((a) => !isInstantHold(a)).length > 1) return null;
  return dupes.find((a) => a.keyframes) ?? dupes.find((a) => (a.duration ?? 0) > 0) ?? dupes[0]!;
}

/** Where a drag writes. With no live motion and no keyframed tween (a hold, or a
 *  zero-length keyframed tween) the position belongs in a `tl.set`, never keyframes. */
function dragRoute(
  posAnim: GsapAnimation | null,
  iframe: HTMLIFrameElement | null,
  selector: string,
  altKey?: boolean,
): "static" | "whole-path" | "at-playhead" {
  const hasNonHold = hasNonHoldTweenForElement(iframe, selector, undefined, POSITION_CHANNELS);
  const hasKeyframedPosTween = !!posAnim?.keyframes && resolveTweenDuration(posAnim) > 0;
  if (!hasNonHold && !hasKeyframedPosTween) return "static";
  // Alt-drag shifts the whole path; with auto-keyframe off (#1808) that is the default.
  return altKey || !usePlayerStore.getState().autoKeyframeEnabled ? "whole-path" : "at-playhead";
}

/** The commit's route and keyframe plan, writing nothing, so a group refuses whole. */
async function planDrag(
  selection: DomEditSelection,
  offset: { x: number; y: number },
  allAnimations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  options: { altKey?: boolean },
  moment: EditMoment,
): Promise<GsapEditOutcome> {
  const selector = selectorFromSelection(selection);
  if (!selector) return { status: "blocked", reason: "no-selector" };
  const own = tweensForThisElement(selection, allAnimations);
  const keeper = positionWriteKeeper(own, selector);
  const animations = keeper
    ? own.filter((a) => a === keeper || !isPositionWriteOf(selector)(a))
    : own;
  const resolved = await resolveGroupTween(
    "position",
    animations,
    selection,
    async () => {},
    undefined,
    moment.time,
  );
  const posAnim = resolved?.anim ?? findGsapPositionAnimation(animations, selector, moment.time);
  const route = dragRoute(posAnim, iframe, selector, options.altKey);
  if (route === "static") return { status: "persisted" };
  if (!posAnim) {
    return { status: "blocked", reason: "source-uneditable", detail: "no-position-tween" };
  }
  if (route === "whole-path") {
    const step = stepListBlock(posAnim);
    return step
      ? { status: "blocked", reason: "keyframes-uneditable", detail: step }
      : { status: "persisted" };
  }
  const gsapPos = readGsapPositionFromIframe(iframe, selector) ?? { x: 0, y: 0 };
  return gsapPositionFromDragOutcome(selection, posAnim, offset, gsapPos, iframe, moment);
}

/** Commits a drag through the GSAP script. Callers reject `blocked` (the gesture layer
 *  restores its drafts) and save `element-offset` on the element itself. */
export async function tryGsapDragIntercept(
  selection: DomEditSelection,
  offset: { x: number; y: number },
  allAnimations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  gestureCommit: GsapDragCommitCallbacks["commitMutation"],
  fetchAllAnimations?: () => Promise<GsapAnimation[]>,
  options?: {
    altKey?: boolean;
    preflightOnly?: boolean;
    preflightPassed?: boolean;
    group?: boolean;
    stamp?: DragStamp;
  },
): Promise<GsapEditOutcome> {
  const stamp = options?.stamp ?? readDragStamp(selection.element);
  const moment = editMoment(stamp);
  const time = moment.time;
  if (!options?.preflightPassed) {
    const preflight = await preflightGsapDragIntercept(
      selection,
      allAnimations,
      iframe,
      fetchAllAnimations,
      options?.group,
    );
    if (preflight.status !== "persisted") return preflight;
    if (options?.preflightOnly) {
      return options.group
        ? planDrag(selection, offset, allAnimations, iframe, options, moment)
        : preflight;
    }
  }
  const animations = tweensForThisElement(selection, allAnimations);
  const fetchFallbackAnimations =
    fetchAllAnimations && (async () => tweensForThisElement(selection, await fetchAllAnimations()));
  const selector = selectorFromSelection(selection);
  // The preflight above proves this; retain a defensive result for DOM churn.
  if (!selector) return { status: "blocked", reason: "no-selector" };
  const commitMutation = oneUndoStep(gestureCommit);

  // Self-heal: enforce a single position write BEFORE committing. A corrupted
  // file can carry 2+ conflicting position writes for one selector (e.g. a
  // degenerate `tl.to(...,{duration:0,x,y})` AND a `gsap.set(...,{x,y})`) — the
  // later one silently overrides the earlier, so the element "can't move". Keep
  // the live keyframed/real tween if present (else any), strip the rest, so the
  // commit below updates ONE write instead of fighting duplicates.
  let workingAnimations = animations;
  if (animations.filter(isPositionWriteOf(selector)).length > 1 && fetchFallbackAnimations) {
    const fresh = await fetchFallbackAnimations();
    const keeper = positionWriteKeeper(fresh, selector);
    if (keeper) {
      await commitMutation(
        selection,
        {
          type: "consolidate-position-writes",
          targetSelector: selector,
          keepAnimationId: keeper.id,
        },
        { label: "Consolidate position writes", skipReload: true },
      );
      workingAnimations = await fetchFallbackAnimations();
    } else {
      workingAnimations = fresh;
    }
  }

  const resolved = await resolveGroupTween(
    "position",
    workingAnimations,
    selection,
    commitMutation,
    fetchFallbackAnimations,
    time,
  );

  let posAnim = resolved?.anim ?? null;
  let resolvedAnimations = resolved?.animations ?? workingAnimations;
  if (!posAnim) {
    posAnim = findGsapPositionAnimation(workingAnimations, selector, time);
    if (!posAnim && fetchFallbackAnimations) {
      const fresh = await fetchFallbackAnimations();
      resolvedAnimations = fresh;
      posAnim = findGsapPositionAnimation(fresh, selector, time);
    }
  }

  const gsapPos = readGsapPositionFromIframe(iframe, selector) ?? { x: 0, y: 0 };
  const route = dragRoute(posAnim, iframe, selector, options?.altKey);
  if (route === "static") {
    const existingSet =
      posAnim && isInstantHold(posAnim) && posAnim.targetSelector === selector
        ? posAnim
        : findExistingPositionWrite(resolvedAnimations, selector, selection.element);
    await commitStaticGsapPosition(selection, offset, gsapPos, selector, existingSet, {
      commitMutation,
      fetchAnimations: fetchFallbackAnimations,
      stamp: options?.stamp,
    });
    return { status: "persisted" };
  }

  if (!posAnim) {
    return { status: "blocked", reason: "source-uneditable", detail: "no-position-tween" };
  }

  // Verify the anim ID is still valid in the current file. The React-state
  // `animations` list can lag behind the file after a prior mutation changed
  // the tween's position/method (which changes the ID). Re-fetch to get the
  // current ID and avoid a stale-ID remove that creates duplicate tweens.
  if (fetchFallbackAnimations) {
    const fresh = await fetchFallbackAnimations();
    const freshMatch =
      fresh.find((a) => a.id === posAnim!.id) ??
      pickClosestToPlayhead(
        fresh.filter(
          (a) =>
            a.targetSelector === posAnim!.targetSelector &&
            a.propertyGroup === posAnim!.propertyGroup &&
            isXYPositionWrite(a) === isXYPositionWrite(posAnim!),
        ),
        time,
      );
    if (freshMatch && freshMatch.id !== posAnim.id) {
      posAnim = freshMatch;
    }
  }

  const cbs = { commitMutation, fetchAnimations: fetchFallbackAnimations, stamp };
  if (route === "whole-path") {
    await commitWholePathOffset(selection, posAnim, offset, gsapPos, iframe, selector, cbs);
  } else {
    return commitGsapPositionFromDrag(selection, posAnim, offset, gsapPos, iframe, cbs);
  }
  return { status: "persisted" };
}

// ── Runtime property readers (re-exported for external callers) ───────────

export { readGsapProperty, readAllAnimatedProperties };

// ── Identity-prop synthesis ───────────────────────────────────────────────

/** The rotation commit's refusal rule, also run ahead of time to hide the rotate handle. */
export function preflightGsapRotationIntercept(
  selection: DomEditSelection,
  animations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  fetchedAnimations: GsapAnimation[] = [],
): GsapEditOutcome {
  const liveSelector = selectorFromSelection(selection);
  if (!(liveSelector ?? writeTargetSelector(selection))) {
    return { status: "blocked", reason: "no-selector" };
  }
  const editability = directEditOutcomeForProperties(
    [...animations, ...fetchedAnimations],
    ROTATION_CHANNEL_SET,
  );
  if (editability.status === "blocked") return editability;
  const workingAnimations = animations.length > 0 ? animations : fetchedAnimations;
  const hasSourceTween = workingAnimations.some((a) =>
    animationWritesAnyProperty(a, ROTATION_CHANNEL_SET),
  );
  if (
    !hasSourceTween &&
    liveSelector &&
    hasNonHoldTweenForElement(iframe, liveSelector, undefined, ROTATION_CHANNELS)
  ) {
    // Rotation twin of the position case above: live tween, no source match.
    return {
      status: "blocked",
      reason: "source-uneditable",
      detail: "live-rotation-no-source-tween",
    };
  }
  return { status: "persisted" };
}

export async function tryGsapRotationIntercept(
  selection: DomEditSelection,
  angle: number,
  animations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  commitMutation: GsapDragCommitCallbacks["commitMutation"],
  fetchFallbackAnimations?: () => Promise<GsapAnimation[]>,
  stamp?: DragStamp,
): Promise<GsapEditOutcome> {
  const time = editMoment(stamp).time;
  const fetchedAnimations = fetchFallbackAnimations ? await fetchFallbackAnimations() : [];
  const outcome = preflightGsapRotationIntercept(selection, animations, iframe, fetchedAnimations);
  if (outcome.status === "blocked") return outcome;
  const selector = (selectorFromSelection(selection) ?? writeTargetSelector(selection))!;
  const workingAnimations = animations.length > 0 ? animations : fetchedAnimations;
  const postSplitFetch = workingAnimations.some((animation) => !animation.propertyGroup)
    ? fetchFallbackAnimations
    : undefined;

  // Resolve the rotation-group tween, splitting legacy mixed tweens if needed.
  const resolved = await resolveGroupTween(
    "rotation",
    workingAnimations,
    selection,
    commitMutation,
    postSplitFetch,
    time,
  );
  const resolvedAnimations = resolved?.animations ?? workingAnimations;

  // Fallback: legacy heuristic for hand-written scripts
  let anim =
    resolved?.anim && animationWritesAnyProperty(resolved.anim, ROTATION_CHANNEL_SET)
      ? resolved.anim
      : null;
  if (!anim) {
    anim = pickClosestToPlayhead(
      workingAnimations.filter((a) => animationWritesAnyProperty(a, ROTATION_CHANNEL_SET)),
      time,
    );
  }

  // `angle` is the ABSOLUTE target rotation resolved by the gesture (gsap base +
  // pointer sweep) or the inspector — so it IS the new rotation. No base re-add: the
  // gesture's live preview already gsap.set this value (single source of truth).
  const newRotation = roundTo3(angle);
  // STATIC case (single source of truth = GSAP timeline): no rotation tween, so the
  // angle belongs in a `tl.set("#el",{rotation})`, not a keyframe conversion —
  // mirroring the static position set. Idempotent: re-rotate updates an existing
  // rotation set in place, else add a new one. This replaces the old
  // `--hf-studio-rotation` CSS-var fallback (the same dual-channel bug class).
  if (!anim || isInstantHold(anim)) {
    const existingSet =
      anim ?? findRotationSetAnimation(resolvedAnimations, selector, selection.element);
    await commitStaticGsapRotation(selection, newRotation, selector, existingSet, {
      commitMutation,
      fetchAnimations: fetchFallbackAnimations,
    });
    return { status: "persisted" };
  }

  const pct = computeCurrentPercentage(selection, anim, time);

  // With auto-keyframe off (#1808), a rotation tween already exists for this
  // element (checked above) so nudge it as a whole rather than adding a
  // keyframe at the playhead.
  if (!usePlayerStore.getState().autoKeyframeEnabled) {
    await commitWholePropertyOffset(
      selection,
      anim,
      { rotation: newRotation },
      pct,
      iframe,
      { commitMutation, fetchAnimations: fetchFallbackAnimations },
      "Rotate animation",
    );
    return { status: "persisted" };
  }

  return commitValueAtPlayhead(
    selection,
    anim,
    { rotation: newRotation },
    iframe,
    { commitMutation, fetchAnimations: fetchFallbackAnimations, stamp },
    { label: "Rotate", backfill: { rotation: newRotation }, holdFromStart: true },
  );
}

export { readRuntimeKeyframes, scanAllRuntimeKeyframes } from "./gsapRuntimeKeyframes";
