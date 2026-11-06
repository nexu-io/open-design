import type { CommitMutationOptions } from "../../hooks/gsapScriptCommitTypes";
import { trackPreviewFeatureUsed, type PreviewMethod } from "../../utils/previewFeatureUsage";
/**
 * Commit helpers for the motion-path overlay. Each maps a canvas gesture to a
 * GSAP source mutation routed through the (selection-bound) commit facade, which
 * handles the soft reload, undo snapshot, and save-failure feedback.
 */
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { assertGsapEditPersisted } from "../../hooks/gsapEditOutcome";
import { observeGsapGesture } from "../../hooks/gsapGestureOutcome";
import { readGsapPositionFromIframe } from "../../hooks/gsapPositionDetection";
import { commitValueAtPlayhead } from "../../hooks/gsapValueAtPlayhead";
import { commitWholePropertyOffset } from "../../hooks/gsapWholePropertyOffsetCommit";
import { usePlayerStore } from "../../player/store/playerStore";
import { trackPreviewEditResult } from "../../utils/previewFeatureUsage";
import type { DomEditSelection } from "./domEditing";
import type { MotionNodeRef } from "./motionPathGeometry";
import { selectorFor } from "./motionPathSelection";

export type CommitFn = (
  mutation: Record<string, unknown>,
  options: CommitMutationOptions,
) => Promise<void>;

const NEW_PATH_DURATION = 1.5;

function motionPathCommitOptions(label: string, method: PreviewMethod): CommitMutationOptions {
  return {
    label,
    softReload: true,
    onResult: (result) => {
      if (result.ok && result.changed === true) trackPreviewFeatureUsed("motion_path", method);
    },
  };
}

export function commitNode(
  ref: MotionNodeRef,
  x: number,
  y: number,
  animationId: string,
  commit: CommitFn,
): Promise<void> {
  const mutation: Record<string, unknown> =
    ref.type === "keyframe"
      ? { type: "update-keyframe", animationId, percentage: ref.pct, properties: { x, y } }
      : { type: "update-motion-path-point", animationId, pointIndex: ref.index, x, y };
  return commit(
    mutation,
    motionPathCommitOptions(ref.type === "keyframe" ? "Move keyframe" : "Move waypoint", "drag"),
  );
}

type NodeDrop = {
  ref: MotionNodeRef;
  at: { x: number; y: number };
  animId: string;
  anim: GsapAnimation | undefined;
  selection: DomEditSelection | null;
  iframe: HTMLIFrameElement | null;
  commitMutation: CommitFn;
};

/** What a node drop does, for its undo entry and its failure report. */
export function nodeDropLabel(ref: MotionNodeRef): string {
  if (ref.type !== "keyframe") return "Move waypoint";
  return usePlayerStore.getState().autoKeyframeEnabled ? "Move keyframe" : "Move animation path";
}

/** A dropped keyframe goes through the layer drag's writer, GSAP's live values backfilling others
 *  (auto-keyframe off, #1808: the whole path shifts); a waypoint moves in place. */
export function commitNodeDrop(drop: NodeDrop): Promise<void> {
  const { ref, at, anim, selection, iframe, commitMutation } = drop;
  if (ref.type !== "keyframe" || !anim || !selection)
    return commitNode(ref, at.x, at.y, drop.animId, commitMutation);
  const writes = observeGsapGesture((_sel, mutation, options) => commitMutation(mutation, options));
  const callbacks = { commitMutation: writes.commit! };
  let done: Promise<unknown>;
  const store = usePlayerStore.getState();
  const step = ref.step == null ? undefined : anim.keyframes?.keyframes[ref.step];
  const pct = step?.percentage ?? ref.pct;
  if (store.autoKeyframeEnabled) {
    const selected = store.activeKeyframePct;
    store.setActiveKeyframePct(pct);
    const live = readGsapPositionFromIframe(iframe, selectorFor(selection) ?? "");
    done = commitValueAtPlayhead(selection, anim, at, iframe, callbacks, {
      label: nodeDropLabel(ref),
      backfill: live ?? undefined,
    })
      .then(assertGsapEditPersisted)
      .catch((error: unknown) => {
        usePlayerStore.getState().setActiveKeyframePct(selected);
        throw error;
      });
  } else {
    const label = nodeDropLabel(ref);
    done = commitWholePropertyOffset(selection, anim, at, pct, iframe, callbacks, label);
  }
  return done.then(() => trackPreviewEditResult("motion_path", "drag", writes.finish()));
}

export function commitAddWaypoint(
  animationId: string,
  index: number,
  x: number,
  y: number,
  commit: CommitFn,
): Promise<void> {
  return commit(
    { type: "add-motion-path-point", animationId, index, x, y },
    motionPathCommitOptions("Add waypoint", "button"),
  );
}

export function commitAddKeyframe(
  animationId: string,
  percentage: number,
  x: number,
  y: number,
  commit: CommitFn,
): Promise<void> {
  // percentage is tween-relative (matches MotionNodeRef.keyframe.pct). The parser's
  // addKeyframeToScript inserts a new "P%": { x, y } stop (or merges if one exists
  // at that pct) and converts a flat tween to keyframes form when needed.
  return commit(
    { type: "add-keyframe", animationId, percentage, properties: { x, y } },
    motionPathCommitOptions("Add keyframe", "button"),
  );
}

export function commitRemoveWaypoint(
  animationId: string,
  index: number,
  commit: CommitFn,
): Promise<void> {
  return commit(
    { type: "remove-motion-path-point", animationId, index },
    motionPathCommitOptions("Remove waypoint", "button"),
  );
}

export function commitCreatePath(
  targetSelector: string,
  position: number,
  x: number,
  y: number,
  commit: CommitFn,
): Promise<void> {
  return commit(
    { type: "add-motion-path", targetSelector, position, duration: NEW_PATH_DURATION, x, y },
    motionPathCommitOptions("Create motion path", "button"),
  );
}
