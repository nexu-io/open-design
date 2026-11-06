/**
 * Resize-gesture GSAP intercept: routes a manual resize on a scale-driven
 * element into scale commits (per-axis longhands for non-uniform drags, with
 * keyframe normalization), then settles position synchronously so the drop
 * frame can't jump. Split from gsapRuntimeBridge, which owns the shared
 * group-tween resolution used by the drag/resize/rotate intercepts.
 */
import type { GsapAnimation, PropertyGroupName } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { clearStudioBoxSize } from "../components/editor/manualEdits";
import {
  STUDIO_ORIGINAL_BOX_HEIGHT_ATTR,
  STUDIO_ORIGINAL_BOX_WIDTH_ATTR,
} from "../components/editor/manualEditsTypes";
import {
  setElementGsapPosition,
  setElementGsapScale,
  setElementGsapSize,
} from "../utils/elementGsap";
import { usePlayerStore } from "../player/store/playerStore";
import { readGsapProperty } from "./gsapRuntimeReaders";
import {
  commitStaticGsapPosition,
  commitStaticGsapSize,
  computeCurrentPercentage,
  findExistingPositionWrite,
  findSizeSetAnimation,
} from "./gsapDragCommit";
import type { GsapDragCommitCallbacks } from "./gsapDragCommit";
import {
  computeDraggedGsapPosition,
  restoreDragOffset,
  type DragStamp,
} from "./draggedGsapPosition";
import { pickClosestToPlayhead, readGsapPositionFromIframe } from "./gsapPositionDetection";
import { editMoment } from "./editMoment";
import { commitWholePropertyOffset } from "./gsapWholePropertyOffsetCommit";
import { commitGsapPositionFromDrag } from "./gsapDragPositionCommit";
import { resolveTweenDuration } from "../utils/globalTimeCompiler";
import { isInstantHold, selectorFromSelection, writeTargetSelector } from "./gsapShared";
import { roundTo3, roundToLayoutPx } from "../utils/rounding";
import { resolveGroupTween } from "./gsapRuntimeBridge";
import { logResize } from "../utils/resizeDebug";
import {
  animationWritesAnyProperty,
  assertGsapEditPersisted,
  type GsapEditOutcome,
} from "./gsapEditOutcome";
import { commitValueAtPlayhead } from "./gsapValueAtPlayhead";
import { preflightGsapResizeIntercept, resizeRoute } from "./gsapResizePreflight";
import { singleKeyTweenMutation } from "./useEnableKeyframes";

const SIZE_PROPS = new Set(["width", "height"]);
const POSITION_XY = new Set(["x", "y"]);
const MOVED_OR_SIZED = new Set(["x", "y", "xPercent", "yPercent", "width", "height"]);

/**
 * The element's box before the resize draft ran, in CSS pixels.
 *
 * Prefers the measurement the draft recorded. Falls back to the inline style it
 * saved for restoring, which is a real value for the elements that carry one,
 * and null when neither says anything.
 */
function originalBoxSize(
  el: HTMLElement | null,
  measuredAttr: string,
  inlineProperty: "width" | "height",
): number | null {
  const measured = Number.parseFloat(el?.getAttribute(measuredAttr) ?? "");
  if (Number.isFinite(measured) && measured > 0) return measured;
  const inline = Number.parseFloat(
    el?.getAttribute(`data-hf-studio-original-${inlineProperty}`) ?? "",
  );
  return Number.isFinite(inline) && inline > 0 ? inline : null;
}

/** The box's width and height before the draft, for a size tween that animates only one. */
function preGestureBoxSize(el: HTMLElement): Record<string, number> {
  const width = originalBoxSize(el, STUDIO_ORIGINAL_BOX_WIDTH_ATTR, "width");
  const height = originalBoxSize(el, STUDIO_ORIGINAL_BOX_HEIGHT_ATTR, "height");
  return { ...(width != null && { width }), ...(height != null && { height }) };
}

/** A size write at the playhead. When the same tween animates position, the resize's anchor move
 *  goes into this one write: a second write to the tween in the same gesture would plan on stale ids. */
export async function commitSizeAtPlayhead(
  selection: DomEditSelection,
  anim: GsapAnimation,
  size: Record<string, number>,
  iframe: HTMLIFrameElement | null,
  dragOffset: { x: number; y: number } | undefined,
  callbacks: GsapDragCommitCallbacks,
): Promise<GsapEditOutcome> {
  const selector = selectorFromSelection(selection);
  const moves = !!dragOffset && (dragOffset.x !== 0 || dragOffset.y !== 0) && !!selector;
  const anchor =
    moves && animationWritesAnyProperty(anim, POSITION_XY)
      ? computeDraggedGsapPosition(
          selection.element,
          dragOffset,
          readGsapPositionFromIframe(iframe, selector) ?? { x: 0, y: 0 },
          callbacks.stamp,
        )
      : null;
  const written = await commitValueAtPlayhead(
    selection,
    anim,
    anchor ? { ...size, x: anchor.newX, y: anchor.newY } : size,
    iframe,
    callbacks,
    {
      label: "Resize",
      backfill: {
        ...preGestureBoxSize(selection.element),
        ...(anchor && { x: anchor.baseGsapX, y: anchor.baseGsapY }),
      },
      ...(anchor && { beforeReload: () => restoreDragOffset(selection.element, callbacks.stamp) }),
    },
  );
  return written.status === "persisted" && anchor ? { ...written, ownsDragOffset: true } : written;
}

/** A keyed size is GSAP's at every time; the gesture's draft, re-applied after each seek, would pin it there. */
function handOverDraftSize(
  selection: DomEditSelection,
  written: GsapEditOutcome,
  size: Record<string, number>,
  draw: <T>(run: () => T) => T,
): GsapEditOutcome {
  const { width, height } = size;
  if (written.status !== "persisted" || width == null || height == null) return written;
  draw(() => {
    clearStudioBoxSize(selection.element);
    setElementGsapSize(selection.element, width, height);
  });
  return written;
}

/** Under auto-record, a keyframed element's first resize is a size key at the playhead, held at all times. */
function firstSizeKey(
  selection: DomEditSelection,
  size: { width: number; height: number },
  resizeGroup: PropertyGroupName,
  animations: GsapAnimation[],
  currentTime: number,
): Record<string, unknown> | null {
  const { autoKeyframeEnabled } = usePlayerStore.getState();
  const keyframed = animations.some(
    (a) => a.keyframes && animationWritesAnyProperty(a, MOVED_OR_SIZED),
  );
  if (resizeGroup !== "size" || !autoKeyframeEnabled || !keyframed) return null;
  return singleKeyTweenMutation(selection, size, currentTime);
}

/**
 * Whether this tween already states scale as `scaleX`/`scaleY`.
 *
 * Both forms are legal, and either alone is fine. A tween holding both is not:
 * GSAP animates each property name independently, so the longhands run
 * alongside the shorthand and win, which silently discards whatever the
 * shorthand was set to.
 */
function tweenUsesScaleLonghands(anim: GsapAnimation | null): boolean {
  const isLonghand = (name: string) => name === "scaleX" || name === "scaleY";
  const inKeyframes = (anim?.keyframes?.keyframes ?? []).some((frame) =>
    Object.keys(frame.properties ?? {}).some(isLonghand),
  );
  return inKeyframes || Object.keys(anim?.properties ?? {}).some(isLonghand);
}

// ── Resize intercept ──────────────────────────────────────────────────────

// The resize is centre-anchored, so a scale that cannot reproduce the dragged size splits the gap evenly.
function rectCentre(rect: DOMRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

// fallow-ignore-next-line complexity
export async function tryGsapResizeIntercept(
  selection: DomEditSelection,
  size: { width: number; height: number },
  animations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  commitMutation: GsapDragCommitCallbacks["commitMutation"],
  fetchFallbackAnimations?: () => Promise<GsapAnimation[]>,
  dragOffset?: { x: number; y: number },
  draw: <T>(run: () => T) => T = (run) => run(),
  stamp?: DragStamp,
): Promise<GsapEditOutcome> {
  const moment = editMoment(stamp);
  const fetchedAnimations = fetchFallbackAnimations ? await fetchFallbackAnimations() : [];
  const outcome = preflightGsapResizeIntercept(selection, animations, iframe, fetchedAnimations);
  if (outcome.status === "blocked") return outcome;
  const { allKnownAnimations, resizeGroup, resizeProperties, workingAnimations } = resizeRoute(
    animations,
    fetchedAnimations,
  );
  // The initial ownership fetch already supplied the complete parse. Only retain
  // the fetch callback when a legacy mixed tween may be split and must then be
  // re-read; otherwise resolveGroupTween would perform the same network read twice.
  const postSplitFetch = workingAnimations.some((animation) => !animation.propertyGroup)
    ? fetchFallbackAnimations
    : undefined;
  const resolved = await resolveGroupTween(
    resizeGroup,
    workingAnimations,
    selection,
    commitMutation,
    postSplitFetch,
    moment.time,
  );

  const anim =
    resolved?.anim && animationWritesAnyProperty(resolved.anim, resizeProperties)
      ? resolved.anim
      : null;
  logResize("intercept-enter", {
    hasScaleGroup: resizeGroup === "scale",
    resizeGroup,
    animMethod: anim?.method ?? null,
    animId: anim?.id ?? null,
    size,
  });
  if (!anim || isInstantHold(anim)) {
    const sized = { width: roundToLayoutPx(size.width), height: roundToLayoutPx(size.height) };
    const scriptWritesSize = allKnownAnimations.some((a) =>
      animationWritesAnyProperty(a, SIZE_PROPS),
    );
    if (!scriptWritesSize) {
      const firstKey = firstSizeKey(selection, sized, resizeGroup, workingAnimations, moment.time);
      if (!firstKey) return { status: "element-size" };
      await commitMutation(selection, firstKey, { label: "Resize", softReload: true });
      return handOverDraftSize(selection, { status: "persisted" }, sized, draw);
    }
    const sel = selectorFromSelection(selection) ?? writeTargetSelector(selection);
    if (!sel) return { status: "blocked", reason: "no-selector" };
    // A scale hold is not a size hold.
    //
    // `anim` is the tween resolved for THIS resize's group, and for a
    // scale-driven element that is the one carrying `scale`. Handing it to the
    // size commit wrote `width` and `height` into it, leaving one tween that
    // spans two property groups — which the parser then classifies as neither,
    // so it loses its group suffix and its id along with it. Every later edit
    // of that element looked for a scale tween and a size tween, found no
    // group at all, and the element became uneditable: "animation not found".
    // Size goes to a size hold of its own, and the scale hold is left alone.
    const sizeSet =
      resizeGroup === "size"
        ? (anim ?? findSizeSetAnimation(workingAnimations, sel, selection.element))
        : findSizeSetAnimation(workingAnimations, sel, selection.element);

    // Keyframe the size when a real tween already animates it; a static size set stays a set.
    if (resizeGroup === "size") {
      const animatedTween = pickClosestToPlayhead(
        workingAnimations.filter(
          (a) =>
            !isInstantHold(a) &&
            resolveTweenDuration(a) > 0 &&
            animationWritesAnyProperty(a, resizeProperties),
        ),
        moment.time,
      );
      if (animatedTween) {
        logResize("intercept-route", { route: "keyframed-size", tweenId: animatedTween.id });
        const written = await commitSizeAtPlayhead(
          selection,
          animatedTween,
          sized,
          iframe,
          dragOffset,
          {
            commitMutation,
            fetchAnimations: fetchFallbackAnimations,
            stamp,
          },
        );
        return handOverDraftSize(selection, written, sized, draw);
      }
    }

    logResize("intercept-route", { route: "static-size-set", hadSizeSet: !!sizeSet, resizeGroup });
    await commitStaticGsapSize(selection, size, sel, sizeSet, {
      commitMutation,
      fetchAnimations: fetchFallbackAnimations,
    });
    return { status: "persisted" };
  }

  const tweenDuration = resolveTweenDuration(anim);
  if (tweenDuration <= 0) {
    // The tween exists in source but has no positive duration, so there is no
    // timeline position at which a resize could land — a different cause from
    // the live-tween-without-a-source-match cases above.
    return { status: "blocked", reason: "source-uneditable", detail: "zero-duration-tween" };
  }

  const { setActiveKeyframePct } = usePlayerStore.getState();
  const activeKeyframePct = moment.keyframePct;
  const pct = activeKeyframePct ?? computeCurrentPercentage(selection, anim, moment.time);
  const selector = selectorFromSelection(selection);

  let resizeProps: Record<string, number>;
  let resizeBackfill: Record<string, number>;
  let scaleDraftEl: HTMLElement | null = null;
  let scaleDraftDropPoint: { x: number; y: number } | null = null;
  /** The scale this commit is putting on the element, for the finalize step. */
  let committedScale: { x: number; y: number } | null = null;
  let nonUniformScale = false;
  /** Whether this commit writes scaleX/scaleY rather than the `scale` shorthand. */
  let useScaleLonghands = false;
  if (resizeGroup === "scale") {
    // Iframe-realm element — instanceof HTMLElement fails across realms; the
    // selector targets composition elements, and every use below is duck-typed.
    const el = iframe?.contentDocument?.querySelector(selector ?? "") as HTMLElement | null;
    // The resize draft modifies el.style.width/height, so read the ORIGINAL
    // dimensions saved by the draft system before it ran.
    //
    // The measured box first, then the inline one. The inline attributes exist
    // to restore an inline style and are empty for anything sized by a
    // stylesheet, which is how compositions are written, so reading them alone
    // sent almost every element to the fallback below: a 630px chip scaled by
    // 630/200, landing over three times the size it was dropped at, and worse
    // on the next drag because the wrong scale then counted as its live one.
    const cssW = originalBoxSize(el, STUDIO_ORIGINAL_BOX_WIDTH_ATTR, "width") ?? 200;
    const cssH = originalBoxSize(el, STUDIO_ORIGINAL_BOX_HEIGHT_ATTR, "height") ?? cssW;
    // `size` is the draft's CSS box; on screen it is multiplied by the element's
    // LIVE scale (the draft divides the cursor delta by it — see
    // resolveDomEditResizeGesture). The committed keyframe REPLACES that live
    // scale, so it must reproduce the rendered intent: css × live / original.
    // Live scale is 1 on a fresh element (first resize), so this is a no-op there.
    const rawLiveScaleX = readGsapProperty(iframe, selector ?? null, "scaleX") ?? 1;
    const rawLiveScaleY = readGsapProperty(iframe, selector ?? null, "scaleY") ?? 1;
    const liveScaleX = rawLiveScaleX > 0 ? rawLiveScaleX : 1;
    const liveScaleY = rawLiveScaleY > 0 ? rawLiveScaleY : 1;
    const newScaleX = roundTo3((size.width * liveScaleX) / cssW);
    const newScaleY = roundTo3((size.height * liveScaleY) / cssH);
    // A free-form corner drag is usually NON-uniform. A single `scale` value
    // can't represent it — committing width-derived scale used to snap the
    // height at drop. Commit scaleX/scaleY longhands instead; keep the uniform
    // shorthand when the two agree (aspect-true drags, shift-drags).
    //
    // Unless the tween already speaks longhands, in which case a uniform drag
    // has to as well. GSAP animates each property name on its own, so a
    // keyframe holding `{ scaleX: 1, scaleY: 1, scale: 0.61 }` runs all three
    // and the longhands win: the resize commits correctly and then does
    // nothing, and the element snaps back to its old size on release. The
    // tween never mixes the two forms in either direction.
    //
    // "Agree" is measured in PIXELS, not in scale. A fixed 0.01 of scale is
    // invisible on a 40px box and two pixels of height on a 408px one, so a
    // free drag whose axes happened to land within it silently gave back a box
    // shorter than the one dropped. The question is only ever whether using one
    // value for both axes would move an edge, so ask that.
    const uniformDrift = Math.abs(newScaleX - newScaleY) * cssH;
    nonUniformScale = uniformDrift > 0.5;
    useScaleLonghands = nonUniformScale || tweenUsesScaleLonghands(anim);
    resizeProps = useScaleLonghands
      ? { scaleX: newScaleX, scaleY: newScaleY }
      : { scale: newScaleX };
    resizeBackfill = { scaleX: liveScaleX, scaleY: liveScaleY };
    logResize("intercept-route", {
      route: "scale-tween",
      cssW,
      cssH,
      liveScaleX,
      liveScaleY,
      newScaleX,
      newScaleY,
      nonUniformScale,
    });
    scaleDraftEl = el;
    // What the commit ACTUALLY writes, which is what the finalize step below
    // has to measure against. A near-uniform drag collapses to the shorthand,
    // so taking the per-axis pair here measured the element at a scaleY the
    // file never gets and tilted the correction by the difference.
    committedScale = useScaleLonghands
      ? { x: newScaleX, y: newScaleY }
      : { x: newScaleX, y: newScaleX };
    // Where the user DROPPED the box: the draft is still applied, so this is what the preview showed
    // at release. The finalize step below moves the committed scale's box onto it.
    if (el) {
      scaleDraftDropPoint = draw(() => rectCentre(el.getBoundingClientRect()));
    }
  } else {
    resizeProps = {
      width: roundToLayoutPx(size.width),
      height: roundToLayoutPx(size.height),
    };
    resizeBackfill = preGestureBoxSize(selection.element);
  }
  // Finalize a scale-route commit: tear down the gesture's inline width/height
  // draft (leaving it applied compounds with the committed scale — the element
  // jumps past the dragged size), then MEASURE where the committed scale
  // actually rendered the box and shift the position hold by the residual so
  // it lands back on the drop point. The compensation only applies to a STATIC
  // position (a `tl.set` hold or none) — a keyframed position path has no
  // single anchor to preserve, so it keeps the plain center-scale behavior.
  // The size route hands its draft to GSAP itself (handOverDraftSize).
  // ponytail: the centre of an AABB is exact for any 2D transform; under
  // perspective it is approximate.
  // fallow-ignore-next-line complexity
  const finalizeScaleResizeCommit = async (): Promise<boolean> => {
    // Only the scale route captures the element, so a null draft means this
    // resize took the size route and never moved anything: the drop point is
    // the drag's to settle, not ours.
    if (!scaleDraftEl) return false;
    const draftEl = scaleDraftEl;
    if (!scaleDraftDropPoint || !selector) {
      draw(() => clearStudioBoxSize(draftEl));
      return false;
    }
    const dropPoint = scaleDraftDropPoint;
    const measured = draw(() => {
      clearStudioBoxSize(draftEl);
      // Draw the committed scale before measuring: on a first resize the timeline has not re-seeked yet,
      // so the box would read at its natural size and the correction would be skipped.
      if (committedScale) {
        setElementGsapScale(draftEl, committedScale.x, committedScale.y);
      }
      // Measure from the pre-gesture position: the scale route never saves the draft's translation, and
      // the position write composes the residual onto that same base.
      const gsapPos = readGsapPositionFromIframe(iframe, selector) ?? { x: 0, y: 0 };
      const { baseGsapX, baseGsapY } = computeDraggedGsapPosition(
        selection.element,
        { x: 0, y: 0 },
        gsapPos,
        stamp,
      );
      const base = { x: baseGsapX, y: baseGsapY };
      setElementGsapPosition(draftEl, base.x, base.y);
      const post = rectCentre(draftEl.getBoundingClientRect());
      const residual = { x: dropPoint.x - post.x, y: dropPoint.y - post.y };
      if (!Number.isFinite(residual.x) || !Number.isFinite(residual.y)) return null;
      // The ONE corrected position — rounded once so the live runtime and the
      // persisted file agree exactly (commitStaticGsapPosition composes the same
      // rounded value from this delta).
      const corrected = {
        x: roundTo3(base.x + residual.x),
        y: roundTo3(base.y + residual.y),
      };
      if (corrected.x === roundTo3(base.x) && corrected.y === roundTo3(base.y)) {
        logResize("scale-finalize", { skipped: "already-on-drop-point", residual, base });
        // Settled, with nothing to write. Still ours: forwarding the drag offset
        // on top would move the box off the point it is already sitting on.
        return "settled" as const;
      }
      logResize("scale-finalize", {
        dropPoint,
        post,
        residual,
        gsapPos,
        base,
        corrected,
      });
      // Correct the live box in the same task as the measurement, so no frame shows it off the drop
      // point while the position write is in flight.
      setElementGsapPosition(draftEl, corrected.x, corrected.y);
      return { base, corrected, residual };
    });
    if (measured === null) return false;
    if (measured === "settled") return true;
    const { base, corrected, residual } = measured;
    // Re-fetch: the scale commit above just rewrote the script, so the caller's
    // animation list (and its ids) may be stale for the position lookup.
    const currentAnimations = fetchFallbackAnimations
      ? await fetchFallbackAnimations()
      : (resolved?.animations ?? animations);
    // Delta chosen so the drag-path math composes back to exactly `corrected`
    // — it adds this onto the same base the measurement above used.
    const delta = { x: corrected.x - base.x, y: corrected.y - base.y };
    // An element whose position is animated needs the correction written into
    // that animation, at the playhead, or the tween renders its own value a
    // frame later and the element leaves the drop point anyway. This used to
    // stand down here instead, on the grounds that a keyframed path has no
    // single anchor to preserve. It has one: the frame the user is looking at.
    // Writing it is the same thing a drag on the same element does, through
    // the same commit.
    const positionTween = pickClosestToPlayhead(
      currentAnimations.filter(
        (a) => a.propertyGroup === "position" && !isInstantHold(a) && resolveTweenDuration(a) > 0,
      ),
      moment.time,
    );
    if (positionTween) {
      // A sub-pixel correction is not worth a keyframe in an authored tween.
      if (Math.abs(residual.x) < 0.5 && Math.abs(residual.y) < 0.5) {
        draw(() => setElementGsapPosition(draftEl, base.x, base.y));
        return true;
      }
      logResize("scale-finalize", { route: "position-keyframe", tweenId: positionTween.id });
      assertGsapEditPersisted(
        await commitGsapPositionFromDrag(selection, positionTween, delta, base, iframe, {
          commitMutation,
          fetchAnimations: fetchFallbackAnimations,
          stamp,
        }),
      );
      return true;
    }
    const existingSet = findExistingPositionWrite(currentAnimations, selector, selection.element);
    await commitStaticGsapPosition(selection, delta, base, selector, existingSet, {
      commitMutation,
      fetchAnimations: fetchFallbackAnimations,
      stamp,
    });
    return true;
  };

  // With auto-keyframe off (#1808), `anim` is already a real (non-"set")
  // tween for this resize group, so nudge it as a whole rather than adding a
  // keyframe at the playhead.
  if (!usePlayerStore.getState().autoKeyframeEnabled) {
    if (activeKeyframePct != null) setActiveKeyframePct(null);
    await commitWholePropertyOffset(
      selection,
      anim,
      resizeProps,
      pct,
      iframe,
      { commitMutation, fetchAnimations: fetchFallbackAnimations },
      "Resize animation",
    );
    return { status: "persisted", ownsDragOffset: await finalizeScaleResizeCommit() };
  }

  const callbacks = { commitMutation, fetchAnimations: fetchFallbackAnimations, stamp };
  if (resizeGroup === "size") {
    const written = await commitSizeAtPlayhead(
      selection,
      anim,
      resizeProps,
      iframe,
      dragOffset,
      callbacks,
    );
    return handOverDraftSize(selection, written, resizeProps, draw);
  }
  const written = await commitValueAtPlayhead(selection, anim, resizeProps, iframe, callbacks, {
    label: "Resize",
    backfill: resizeBackfill,
  });
  if (written.status !== "persisted") return written;
  return { status: "persisted", ownsDragOffset: await finalizeScaleResizeCommit() };
}

// ── Rotation intercept ────────────────────────────────────────────────────
