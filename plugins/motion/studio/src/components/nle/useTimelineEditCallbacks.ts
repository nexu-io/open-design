import type { TimelineEditOutcome } from "../../hooks/timelineEditPermission";
import { trackKeyframeUsage } from "../../utils/keyframeUsage";
import { useCallback, useMemo } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { TimelineElement } from "../../player";
import { usePlayerStore } from "../../player/store/playerStore";
import type { BlockedTimelineEditIntent } from "../../player/components/timelineEditing";
import type { TimelineEditCallbacks } from "../../player/components/timelineCallbacks";
import { useStudioShellContext } from "../../contexts/StudioContext";
import {
  useDomEditActionsContext,
  useDomEditSelectionContext,
} from "../../contexts/DomEditContext";
import { resolveTweenStart, resolveTweenDuration } from "../../utils/globalTimeCompiler";
import { runEaseOf } from "../../utils/gsapKeyframeEases";
import { resolveClipTimingBasis } from "../../hooks/useGsapTweenCache";
import { elementCacheKeys } from "../../hooks/gsapKeyframeCacheHelpers";
import { resolveKeyframeRetime } from "../editor/keyframeRetime";
import type { DomEditSelection } from "../editor/domEditingTypes";
import type { TimelineMoveOperation } from "../../hooks/timelineMoveAdapter";
import {
  getTimelineElementIdentity,
  splitTimelineElementKey,
} from "../../player/lib/timelineElementHelpers";
import type { TimelineKeyframeTarget } from "../../player/components/timelineKeyframeIdentity";

export interface TimelineEditCallbackDeps {
  handleTimelineElementMove: (
    element: TimelineElement,
    updates: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  handleTimelineElementsMove: (
    edits: Array<{ element: TimelineElement; updates: Pick<TimelineElement, "start" | "track"> }>,
    coalesceKey?: string,
    operation?: TimelineMoveOperation,
  ) => Promise<void> | void;
  handleTimelineElementResize: (
    element: TimelineElement,
    updates: Pick<TimelineElement, "start" | "duration" | "playbackStart">,
  ) => Promise<void> | void;
  handleTimelineGroupResize: NonNullable<TimelineEditCallbacks["onResizeElements"]>;
  handleToggleTrackHidden: (track: number, hidden: boolean) => Promise<void> | void;
  setAudioGroupAttribute: {
    setLive: (groupId: string, attr: string, value: string | null) => void;
    revertLive?: (groupId: string, attr: string) => void;
    setQuiet: (
      groupId: string,
      attr: string,
      value: string | null,
      label: string,
    ) => Promise<TimelineEditOutcome | void>;
  };
  handleBlockedTimelineEdit: (element: TimelineElement, intent: BlockedTimelineEditIntent) => void;
  handleTimelineElementSplit: (element: TimelineElement, splitTime: number) => Promise<void> | void;
  handleRazorSplit: (element: TimelineElement, splitTime: number) => Promise<void> | void;
  handleRazorSplitAll: (splitTime: number) => Promise<void> | void;
  handleFreezeFrame?: (element: TimelineElement, time: number) => Promise<void> | void;
  handleLinkEdit?: TimelineEditCallbacks["onLinkEdit"];
  handleTimelineElementDeleteOnly?: TimelineEditCallbacks["onDeleteElementOnly"];
  /** C1's ungrouped-track FX pointer — same auto-grouping write B6's carve uses. */
  handleGroupClips?: (
    clipIds: readonly string[],
    groupId: string,
    groupLabel?: string,
  ) => Promise<void>;
  /** C1's single-clip FX write, addressed by the clip itself. */
  setElementFxAttribute?: {
    setLive: (element: TimelineElement, attr: string, value: string | null) => void;
    revertLive?: (element: TimelineElement, attr: string) => void;
    setQuiet: (
      element: TimelineElement,
      attr: string,
      value: string | null,
      label: string,
    ) => Promise<TimelineEditOutcome | void>;
    setMany?: TimelineEditCallbacks["onSetElementsAttributeQuiet"];
  };
}

interface TimelineKeyframeTargetAnimation {
  id: string;
  propertyGroup?: string | null;
  keyframes?: unknown;
}

interface TimelineCachedKeyframe {
  percentage: number;
  tweenPercentage?: number;
  propertyGroup?: string;
  animationId?: string;
}

/**
 * Resolve a rendered timeline diamond back to the animation that authored it.
 * Prefer the animation identity carried by the rendered keyframe. Legacy cache
 * entries without one are safe only when their property group has one candidate;
 * ambiguous candidates remain unresolved rather than retiming an arbitrary tween.
 */
export function resolveTimelineKeyframeTarget(
  pct: number,
  keyframes: ReadonlyArray<TimelineCachedKeyframe>,
  animations: ReadonlyArray<TimelineKeyframeTargetAnimation>,
): { animId: string; tweenPct: number } | null {
  const kf = keyframes.find((item) => Math.abs(item.percentage - pct) < 0.2);
  if (!kf) return null;
  const identifiedAnimation = kf.animationId
    ? animations.find((animation) => animation.id === kf.animationId)
    : undefined;
  if (kf.animationId) {
    return identifiedAnimation
      ? { animId: identifiedAnimation.id, tweenPct: kf.tweenPercentage ?? pct }
      : null;
  }
  const group = kf?.propertyGroup;
  const candidates = group
    ? animations.filter((animation) => animation.propertyGroup === group)
    : animations.filter((animation) => !animation.propertyGroup);
  const animation = candidates.length === 1 ? candidates[0] : undefined;
  return animation ? { animId: animation.id, tweenPct: kf.tweenPercentage ?? pct } : null;
}

/**
 * Builds the timeline edit callback bag (move/resize/split/razor plus the
 * keyframe-diamond callbacks) provided to `<Timeline>` via TimelineEditProvider.
 * The keyframe callbacks resolve the dragged diamond back to its GSAP anim id +
 * tween-relative percentage, reading DOM-edit selection state from context.
 */
// fallow-ignore-next-line complexity
export function useTimelineEditCallbacks({
  handleTimelineElementMove,
  handleTimelineElementsMove,
  handleTimelineElementResize,
  handleTimelineGroupResize,
  handleToggleTrackHidden,
  setAudioGroupAttribute,
  handleBlockedTimelineEdit,
  handleTimelineElementSplit,
  handleRazorSplit,
  handleRazorSplitAll,
  handleFreezeFrame,
  handleLinkEdit,
  handleTimelineElementDeleteOnly,
  handleGroupClips,
  setElementFxAttribute,
}: TimelineEditCallbackDeps): TimelineEditCallbacks {
  const { projectId, activeCompPath } = useStudioShellContext();
  const { domEditSelection, selectedGsapAnimations } = useDomEditSelectionContext();
  const {
    handleGsapRemoveKeyframe,
    handleGsapMoveKeyframeToPlayhead,
    handleGsapMoveKeyframe,
    handleGsapResizeKeyframedTween,
    handleGsapUpdateMeta,
    handleGsapAddKeyframe,
    handleGsapAddKeyframeBatch,
    handleGsapConvertToKeyframes,
    handleGsapRemoveAllKeyframes,
    buildDomSelectionForTimelineElement,
  } = useDomEditActionsContext();

  const resolveElementAnimations = useCallback(
    (elementKey: string): GsapAnimation[] => {
      const { gsapAnimations } = usePlayerStore.getState();
      const { sourceFile, domId } = splitTimelineElementKey(elementKey);
      const scope = sourceFile ?? activeCompPath ?? "index.html";
      // elementCacheKeys owns the key-variant list the writers use; reading it
      // back by hand here is how the two sides drift.
      for (const key of elementCacheKeys(scope, domId)) {
        const animations = gsapAnimations.get(key);
        if (animations) return animations;
      }
      return [];
    },
    [activeCompPath],
  );

  // Resolve a timeline-diamond callback's clip-% to the keyframe's anim id + its
  // tween-relative percentage (shared by the delete/move keyframe callbacks): the
  // diamond reports a clip-% but the script ops key on the tween-%. Prefers the
  // anim in the keyframe's property group, falling back to the first keyframed one.
  const resolveKeyframeTarget = useCallback(
    (
      elementKey: string,
      target: TimelineKeyframeTarget,
      animations: GsapAnimation[] = selectedGsapAnimations,
    ): { animId: string; tweenPct: number } | null => {
      const carriesIdentity =
        target.propertyGroup !== undefined ||
        target.tweenPercentage !== undefined ||
        target.animationId !== undefined;
      // The clicked element's own cache: the diamond context menu can open on an
      // element that is not the selected one, and reading the selection's cache
      // there resolves against the wrong element.
      const keyframeCache = usePlayerStore.getState().keyframeCache;
      const cached =
        keyframeCache.get(elementKey) ??
        keyframeCache.get(splitTimelineElementKey(elementKey).domId);
      return resolveTimelineKeyframeTarget(
        target.percentage,
        carriesIdentity ? [target] : (cached?.keyframes ?? []),
        animations,
      );
    },
    [selectedGsapAnimations],
  );

  const removeKeyframeTarget = useCallback(
    (animationId: string, percentage: number, selectionOverride?: DomEditSelection | null) => {
      // A flat tween's two diamonds are SYNTHESIZED endpoints, not authored
      // keyframes, so "remove keyframe" has nothing to remove. Escalating to a
      // whole-animation delete here destroyed the authored tween and its source
      // comment on a single click, with no undo beyond the editor's own stack.
      // Always post remove-keyframe: the writer refuses it for a flat tween
      // (`changed:false`, file untouched), which is the correct no-op.
      handleGsapRemoveKeyframe(animationId, percentage, undefined, selectionOverride);
    },
    [handleGsapRemoveKeyframe],
  );

  return useMemo(
    () => ({
      onMoveElement: handleTimelineElementMove,
      onMoveElements: handleTimelineElementsMove,
      onResizeElement: handleTimelineElementResize,
      onResizeElements: handleTimelineGroupResize,
      onToggleTrackHidden: handleToggleTrackHidden,
      onSetAudioGroupAttributeLive: setAudioGroupAttribute.setLive,
      onSetAudioGroupAttributeQuiet: setAudioGroupAttribute.setQuiet,
      onRevertAudioGroupAttributeLive: setAudioGroupAttribute.revertLive,
      onGroupClips: handleGroupClips,
      onSetElementAttributeLive: setElementFxAttribute?.setLive,
      onSetElementAttributeQuiet: setElementFxAttribute?.setQuiet,
      onSetElementsAttributeQuiet: setElementFxAttribute?.setMany,
      onRevertElementAttributeLive: setElementFxAttribute?.revertLive,
      onBlockedEditAttempt: handleBlockedTimelineEdit,
      onSplitElement: handleTimelineElementSplit,
      onRazorSplit: handleRazorSplit,
      onRazorSplitAll: handleRazorSplitAll,
      onFreezeFrame: handleFreezeFrame,
      onLinkEdit: handleLinkEdit,
      onDeleteElementOnly: handleTimelineElementDeleteOnly,
      onDeleteAllKeyframes: (element, animationId) => {
        // Hold the element where it is (collapse keyframes to a static set) rather
        // than deleting the whole animation — deleting strands a stale GSAP base
        // that the next drag adds to, flinging the element off-screen.
        const elementKey = getTimelineElementIdentity(element);
        // An explicit animation id scopes the delete to the lane whose menu was
        // opened; without one this is the layer-wide action, and that means
        // EVERY keyframed tween, not just the first. A layer with position AND
        // opacity keyframes used to leave the second one keyframed, so "Delete
        // All Keyframes" visibly did half the job. A stale id matches nothing
        // and deletes nothing, which is the point: it never falls back to a
        // lane the user did not click.
        const animations = resolveElementAnimations(elementKey);
        const anims = animationId
          ? animations.filter((animation) => animation.id === animationId)
          : animations.filter((animation) => animation.keyframes);
        if (anims.length === 0) return;
        void buildDomSelectionForTimelineElement(element).then(async (selection) => {
          if (!selection) return;
          // Serial: each removal rewrites the same source file, so dispatching
          // them together would have the later writes read a pre-edit document.
          let changed = false;
          for (const anim of anims) {
            const result = await handleGsapRemoveAllKeyframes(anim.id, selection, false);
            changed = result || changed;
          }
          if (changed) trackKeyframeUsage("remove_all");
        });
      },
      onDeleteKeyframe: (elId, keyframe) => {
        const animations = resolveElementAnimations(elId);
        const target = resolveKeyframeTarget(elId, keyframe, animations);
        if (!target) return;
        const element = usePlayerStore.getState().elements.find((el) => (el.key ?? el.id) === elId);
        if (!element) {
          removeKeyframeTarget(target.animId, target.tweenPct);
          return;
        }
        // Persist through the CLICKED element's own selection so a deletion on a
        // non-selected element (especially one in a different source file) commits
        // against the right element instead of the current domEditSelection.
        void buildDomSelectionForTimelineElement(element).then((selection) => {
          if (selection) removeKeyframeTarget(target.animId, target.tweenPct, selection);
        });
      },
      // Retime the keyframe to the playhead, preserving its value + ease. The
      // clicked element owns the whole write: its animations resolve the target,
      // its selection commits it, and its animation computes the playhead
      // percentage. Mixing frames here retimed against the selected element's
      // tween and wrote the result into the clicked element's file.
      onMoveKeyframeToPlayhead: (element, keyframe) => {
        const elementKey = getTimelineElementIdentity(element);
        const animations = resolveElementAnimations(elementKey);
        const target = resolveKeyframeTarget(elementKey, keyframe, animations);
        const animation = target
          ? animations.find((candidate) => candidate.id === target.animId)
          : undefined;
        if (!target || !animation) return;
        void buildDomSelectionForTimelineElement(element).then((selection) => {
          if (selection) {
            handleGsapMoveKeyframeToPlayhead(target.animId, target.tweenPct, selection, animation);
          }
        });
      },
      // Drag-to-retime. The diamond reports clip-%s; resolveKeyframeTarget gives
      // the dragged keyframe's anim + tween-%. We convert the clip-% drop to an
      // absolute time (via the clip's timing basis) and let resolveKeyframeRetime
      // decide: a drop inside the tween window is a plain move (re-key tween-%); a
      // drop past the boundary (last keyframe past the end, first before the start)
      // resizes the tween — position/duration grow so the dragged keyframe lands at
      // the drop while every other keyframe keeps its absolute time (value+ease too).
      // fallow-ignore-next-line complexity
      onMoveKeyframe: async (elId, keyframe, toClipPct) => {
        const animations = resolveElementAnimations(elId);
        const target = resolveKeyframeTarget(elId, keyframe, animations);
        if (!target) return false;
        // The dragged diamond's OWN element, not the selected one: a drag on a
        // non-selected clip has to read that clip's animations and commit
        // through that clip's selection, or it retimes whatever is selected.
        const element = usePlayerStore.getState().elements.find((el) => (el.key ?? el.id) === elId);
        const sel = element ? await buildDomSelectionForTimelineElement(element) : domEditSelection;
        if (!sel) return false;
        const anim = animations.find((a) => a.id === target.animId);
        const tweenStart = anim ? resolveTweenStart(anim) : null;
        if (!anim || tweenStart === null) return Promise.resolve(false);
        const sourceFile = sel.sourceFile || activeCompPath || "index.html";
        const { elements, domClipChildren } = usePlayerStore.getState();
        const { elStart, elDuration } = resolveClipTimingBasis(
          sel.id ?? "",
          sourceFile,
          elements,
          domClipChildren,
        );
        const tweenDuration = resolveTweenDuration(anim);
        const dropAbsTime = elStart + (toClipPct / 100) * elDuration;
        const decision = resolveKeyframeRetime({
          keyframes: anim.keyframes?.keyframes ?? [],
          draggedTweenPct: target.tweenPct,
          tweenStart,
          tweenDuration,
          dropAbsTime,
          runEase: runEaseOf(anim),
        });
        if (decision.kind === "move" && decision.toTweenPct != null) {
          return handleGsapMoveKeyframe(target.animId, target.tweenPct, decision.toTweenPct, sel);
        } else if (
          decision.kind === "resize" &&
          decision.pctRemap &&
          decision.position != null &&
          decision.duration != null
        ) {
          // An empty remap means a FLAT tween's synthesized boundary: there is no
          // keyframe node to re-key, only the window to move. Sending it through
          // the keyframed-resize writer would rewrite the authored flat tween into
          // keyframes form as a side effect of a pure position/duration change, so
          // dispatch update-meta and leave the tween as the author wrote it.
          if (decision.pctRemap.length === 0) {
            // Report the write's real settlement, like every other branch here:
            // answering `true` while the meta update is still in flight tells the
            // diamond the retime landed, so a rejected write never snaps back.
            return handleGsapUpdateMeta(
              target.animId,
              { position: decision.position, duration: decision.duration },
              sel,
            );
          }
          return handleGsapResizeKeyframedTween(
            target.animId,
            decision.position,
            decision.duration,
            decision.pctRemap,
            sel,
          );
        }
        return Promise.resolve(false);
      },
      // fallow-ignore-next-line complexity
      onToggleKeyframeAtPlayhead: (el: TimelineElement) => {
        const currentTime = usePlayerStore.getState().currentTime;
        const pct =
          el.duration > 0
            ? Math.max(0, Math.min(100, Math.round(((currentTime - el.start) / el.duration) * 100)))
            : 0;
        // Same frame for read and write: the toggled element's animations decide
        // add-vs-remove, and its selection is what the mutation commits through.
        const animations = resolveElementAnimations(getTimelineElementIdentity(el));
        void buildDomSelectionForTimelineElement(el).then((selection) => {
          if (!selection) return;
          const anim = animations.find((a) => a.keyframes);
          if (anim?.keyframes) {
            const existing = anim.keyframes.keyframes.find(
              (k) => Math.abs(k.percentage - pct) <= 1,
            );
            if (existing) {
              handleGsapRemoveKeyframe(anim.id, existing.percentage, undefined, selection);
            } else {
              handleGsapAddKeyframe(anim.id, pct, "x", 0, selection);
            }
          } else {
            const flatAnim = animations.find((a) => !a.keyframes);
            if (flatAnim) {
              void handleGsapConvertToKeyframes(
                flatAnim.id,
                undefined,
                undefined,
                undefined,
                selection,
              );
            }
          }
        });
      },
      onTogglePropertyGroupKeyframe: async (element, target) => {
        const selection = await buildDomSelectionForTimelineElement(element);
        if (!selection) return;
        if (target.remove) {
          removeKeyframeTarget(target.animationId, target.tweenPercentage, selection);
          return;
        }
        await handleGsapAddKeyframeBatch(
          target.animationId,
          target.tweenPercentage,
          target.properties,
          undefined,
          selection,
        );
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      handleTimelineElementMove,
      handleTimelineElementsMove,
      handleTimelineElementResize,
      handleTimelineGroupResize,
      handleToggleTrackHidden,
      setAudioGroupAttribute,
      handleGroupClips,
      setElementFxAttribute,
      handleBlockedTimelineEdit,
      handleTimelineElementSplit,
      handleRazorSplit,
      handleRazorSplitAll,
      handleFreezeFrame,
      handleLinkEdit,
      handleTimelineElementDeleteOnly,
      handleGsapRemoveAllKeyframes,
      resolveElementAnimations,
      resolveKeyframeTarget,
      removeKeyframeTarget,
      selectedGsapAnimations,
      handleGsapMoveKeyframeToPlayhead,
      handleGsapMoveKeyframe,
      handleGsapResizeKeyframedTween,
      handleGsapUpdateMeta,
      handleGsapAddKeyframe,
      handleGsapAddKeyframeBatch,
      handleGsapConvertToKeyframes,
      buildDomSelectionForTimelineElement,
      projectId,
      activeCompPath,
      domEditSelection,
    ],
  );
}
