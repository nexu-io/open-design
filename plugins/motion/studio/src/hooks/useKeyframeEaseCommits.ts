import { useCallback, type RefObject } from "react";
import type { CommitMutation } from "./gsapScriptCommitTypes";
import type { AnimationKeyframeTarget } from "./gsapTweenSynth";
import type { DomEditSelection } from "../components/editor/domEditing";

interface KeyframeEaseCommitsInput {
  gsapCommitMutation: CommitMutation;
  domEditSelectionRef: RefObject<DomEditSelection | null>;
}

export function useKeyframeEaseCommits({
  gsapCommitMutation,
  domEditSelectionRef,
}: KeyframeEaseCommitsInput) {
  const handleUpdateSegmentEase = useCallback(
    (targets: AnimationKeyframeTarget[], ease: string) => {
      const selection = domEditSelectionRef.current;
      if (!selection || targets.length === 0) return;
      const options = {
        label: targets.length === 1 ? "Update keyframe ease" : "Update segment ease",
        softReload: true,
      };
      const calls = targets.map(({ animationId, tweenPercentage }) => ({
        selection,
        mutation: {
          type: "update-keyframe",
          animationId,
          percentage: tweenPercentage,
          properties: {},
          ease,
        },
        options,
      }));
      if (calls.length === 1) {
        const call = calls[0];
        if (call) void gsapCommitMutation(call.selection, call.mutation, call.options);
        return;
      }
      const batch = gsapCommitMutation.batch;
      if (batch) {
        void batch(calls, options);
        return;
      }
      // A wrapped commit (a gesture transaction, say) carries no batch
      // transport. Serial keeps the edit correct at the cost of one round trip
      // per tween and one undo entry per tween; an optional-chained call here
      // would silently drop the whole edit instead.
      for (const call of calls)
        void gsapCommitMutation(call.selection, call.mutation, call.options);
    },
    [gsapCommitMutation, domEditSelectionRef],
  );

  const handleUpdateKeyframeEase = useCallback(
    (animationId: string, percentage: number, ease: string) =>
      handleUpdateSegmentEase([{ animationId, tweenPercentage: percentage }], ease),
    [handleUpdateSegmentEase],
  );

  const handleSetAllKeyframeEases = useCallback(
    (animationId: string, ease: string) => {
      const sel = domEditSelectionRef.current;
      if (!sel) return;
      gsapCommitMutation(
        sel,
        {
          type: "update-meta",
          animationId,
          updates: { easeEach: ease, resetKeyframeEases: true },
        },
        { label: "Apply ease to all segments", softReload: true },
      );
    },
    [gsapCommitMutation, domEditSelectionRef],
  );

  return { handleUpdateSegmentEase, handleUpdateKeyframeEase, handleSetAllKeyframeEases };
}
