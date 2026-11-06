import { useCallback, useRef } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player";
import { computeCurrentPercentage } from "./gsapDragCommit";
import {
  getStudioSaveErrorMessage,
  isStudioSaveErrorAlreadyToasted,
  trackStudioSaveFailure,
} from "../utils/studioSaveDiagnostics";
import { trackStudioEvent } from "../utils/studioTelemetry";
import type { CommitMutationOptions } from "./gsapScriptCommitTypes";

/**
 * Thin useCallback wrappers that guard on `domEditSelection` before
 * delegating to the underlying GSAP script-commit functions. Extracted
 * from useDomEditSession to keep that file under the 600-line limit.
 */
// fallow-ignore-next-line complexity
export function useGsapSelectionHandlers({
  domEditSelection,
  updateGsapProperty,
  updateGsapMeta,
  deleteGsapAnimation,
  deleteAllForSelector,
  addGsapAnimation,
  addGsapProperty,
  removeGsapProperty,
  updateGsapFromProperty,
  addGsapFromProperty,
  removeGsapFromProperty,
  addKeyframe,
  addKeyframeBatch,
  removeKeyframe,
  moveKeyframe,
  resizeKeyframedTween,
  convertToKeyframes,
  removeAllKeyframes,
  handleDomManualEditsReset,
  selectedGsapAnimations,
  showToast,
}: {
  domEditSelection: DomEditSelection | null;
  updateGsapProperty: (
    sel: DomEditSelection,
    animId: string,
    prop: string,
    value: number | string,
  ) => void;
  updateGsapMeta: (
    sel: DomEditSelection,
    animId: string,
    updates: { duration?: number; ease?: string; position?: number },
  ) => Promise<void>;
  deleteGsapAnimation: (sel: DomEditSelection, animId: string) => Promise<void>;
  deleteAllForSelector: (sel: DomEditSelection, targetSelector: string) => Promise<void>;
  addGsapAnimation: (
    sel: DomEditSelection,
    method: "to" | "from" | "set" | "fromTo",
    time: number,
  ) => Promise<void>;
  addGsapProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  removeGsapProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  updateGsapFromProperty: (
    sel: DomEditSelection,
    animId: string,
    prop: string,
    value: number | string,
  ) => Promise<void>;
  addGsapFromProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  removeGsapFromProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  addKeyframe: (
    sel: DomEditSelection,
    animId: string,
    percentage: number,
    property: string,
    value: number | string,
  ) => void;
  addKeyframeBatch: (
    sel: DomEditSelection,
    animId: string,
    percentage: number,
    properties: Record<string, number | string>,
    commitOverrides?: Partial<CommitMutationOptions>,
  ) => Promise<void>;
  removeKeyframe: (
    sel: DomEditSelection,
    animId: string,
    percentage: number,
    commitOverrides?: Partial<CommitMutationOptions>,
  ) => void;
  moveKeyframe: (
    sel: DomEditSelection,
    animId: string,
    fromPercentage: number,
    toPercentage: number,
  ) => Promise<boolean>;
  resizeKeyframedTween: (
    sel: DomEditSelection,
    animId: string,
    position: number,
    duration: number,
    pctRemap: Array<{ from: number; to: number }>,
  ) => Promise<boolean>;
  convertToKeyframes: (
    sel: DomEditSelection,
    animId: string,
    resolvedFromValues?: Record<string, number | string>,
    duration?: number,
    commitOverrides?: Partial<CommitMutationOptions>,
  ) => Promise<void>;
  removeAllKeyframes: (
    sel: DomEditSelection,
    animId: string,
    action?: "remove_all" | "reset",
    telemetry?: boolean,
  ) => Promise<boolean>;

  handleDomManualEditsReset: (
    sel: DomEditSelection,
  ) => Promise<void | import("./domEditCommitTypes").DomEditPersistOutcome>;
  selectedGsapAnimations: GsapAnimation[];
  showToast: (message: string, tone?: "error" | "info") => void;
}) {
  const lastSelectionRef = useRef<DomEditSelection | null>(null);
  if (domEditSelection) lastSelectionRef.current = domEditSelection;

  // `undefined` means the caller passed no override and accepts the current
  // selection. An explicit `null` means the caller RESOLVED a selection for the
  // element it is editing and there is none: falling back to domEditSelection
  // there commits the edit onto whichever element happens to be selected, which
  // is a different element's file. Only `undefined` may fall back.
  const resolveWriteSelection = useCallback(
    (selectionOverride?: DomEditSelection | null): DomEditSelection | null =>
      selectionOverride === undefined
        ? (domEditSelection ?? lastSelectionRef.current)
        : selectionOverride,
    [domEditSelection],
  );

  const trackGsapHandlerFailure = useCallback(
    (error: unknown, selection: DomEditSelection, mutationType: string, label: string) => {
      trackStudioSaveFailure({
        source: "gsap_commit",
        error,
        filePath: selection.sourceFile ?? undefined,
        mutationType,
        label,
        targetId: selection.id,
        targetSelector: selection.selector,
        targetSourceFile: selection.sourceFile,
      });
      if (!isStudioSaveErrorAlreadyToasted(error)) {
        showToast(`Couldn't save animation: ${getStudioSaveErrorMessage(error)}`, "error");
      }
    },
    [showToast],
  );

  // Resolves to whether the mutation landed. Callers that only fire-and-forget
  // can ignore it (the rejection is always handled here), but a caller that
  // reports a commit result to the UI has to await the real settlement instead
  // of assuming success the moment it dispatched.
  const observeGsapMutation = useCallback(
    (
      mutation: Promise<void>,
      selection: DomEditSelection,
      mutationType: string,
      label: string,
    ): Promise<boolean> =>
      mutation.then(
        () => true,
        (error: unknown) => {
          trackGsapHandlerFailure(error, selection, mutationType, label);
          return false;
        },
      ),
    [trackGsapHandlerFailure],
  );

  const handleGsapUpdateProperty = useCallback(
    (animId: string, prop: string, value: number | string) => {
      if (!domEditSelection) return;
      updateGsapProperty(domEditSelection, animId, prop, value);
    },
    [domEditSelection, updateGsapProperty],
  );

  const handleGsapUpdateMeta = useCallback(
    (
      animId: string,
      updates: { duration?: number; ease?: string; position?: number },
      selectionOverride?: DomEditSelection | null,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return Promise.resolve(false);
      return observeGsapMutation(
        updateGsapMeta(sel, animId, updates),
        sel,
        "update-meta",
        "Edit GSAP animation",
      );
    },
    [resolveWriteSelection, observeGsapMutation, updateGsapMeta],
  );

  const handleGsapDeleteAnimation = useCallback(
    (animId: string, selectionOverride?: DomEditSelection | null) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return Promise.resolve(false);
      return observeGsapMutation(
        deleteGsapAnimation(sel, animId),
        sel,
        "delete",
        "Delete GSAP animation",
      );
    },
    [resolveWriteSelection, deleteGsapAnimation, observeGsapMutation],
  );

  const handleGsapDeleteAllForElement = useCallback(
    (targetSelector: string) => {
      const sel = domEditSelection ?? lastSelectionRef.current;
      if (!sel) return;
      trackStudioEvent("keyframe", { action: "delete_all" });
      observeGsapMutation(
        deleteAllForSelector(sel, targetSelector),
        sel,
        "delete-all-for-selector",
        "Delete all animations for element",
      );
    },
    [domEditSelection, deleteAllForSelector, observeGsapMutation],
  );

  const handleGsapAddAnimation = useCallback(
    (method: "to" | "from" | "set" | "fromTo", selectionOverride?: DomEditSelection | null) => {
      const selection = resolveWriteSelection(selectionOverride);
      if (!selection) return Promise.resolve(false);
      const landed = observeGsapMutation(
        addGsapAnimation(selection, method, usePlayerStore.getState().currentTime),
        selection,
        "add",
        `Add GSAP ${method} animation`,
      );
      if (selection.element.hasAttribute("data-hf-studio-path-offset")) {
        // The reset owns rollback and the position commit already owns user and
        // telemetry reporting. This is only the fire-and-forget UI boundary.
        void landed.then((didLand) => {
          if (didLand) void handleDomManualEditsReset(selection).catch(() => undefined);
        });
      }
      return landed;
    },
    [resolveWriteSelection, addGsapAnimation, handleDomManualEditsReset, observeGsapMutation],
  );

  const handleGsapAddProperty = useCallback(
    (animId: string, prop: string) => {
      if (!domEditSelection) return;
      observeGsapMutation(
        addGsapProperty(domEditSelection, animId, prop),
        domEditSelection,
        "add-property",
        `Add GSAP ${prop}`,
      );
    },
    [domEditSelection, addGsapProperty, observeGsapMutation],
  );

  const handleGsapRemoveProperty = useCallback(
    (animId: string, prop: string) => {
      if (!domEditSelection) return;
      observeGsapMutation(
        removeGsapProperty(domEditSelection, animId, prop),
        domEditSelection,
        "remove-property",
        `Remove GSAP ${prop}`,
      );
    },
    [domEditSelection, observeGsapMutation, removeGsapProperty],
  );

  const handleGsapUpdateFromProperty = useCallback(
    (animId: string, prop: string, value: number | string) => {
      if (!domEditSelection) return;
      observeGsapMutation(
        updateGsapFromProperty(domEditSelection, animId, prop, value),
        domEditSelection,
        "update-from-property",
        `Edit GSAP from-${prop}`,
      );
    },
    [domEditSelection, observeGsapMutation, updateGsapFromProperty],
  );

  const handleGsapAddFromProperty = useCallback(
    (animId: string, prop: string) => {
      if (!domEditSelection) return;
      observeGsapMutation(
        addGsapFromProperty(domEditSelection, animId, prop),
        domEditSelection,
        "add-from-property",
        `Add GSAP from-${prop}`,
      );
    },
    [domEditSelection, addGsapFromProperty, observeGsapMutation],
  );

  const handleGsapRemoveFromProperty = useCallback(
    (animId: string, prop: string) => {
      if (!domEditSelection) return;
      observeGsapMutation(
        removeGsapFromProperty(domEditSelection, animId, prop),
        domEditSelection,
        "remove-from-property",
        `Remove GSAP from-${prop}`,
      );
    },
    [domEditSelection, observeGsapMutation, removeGsapFromProperty],
  );

  const handleGsapAddKeyframe = useCallback(
    (
      animId: string,
      percentage: number,
      property: string,
      value: number | string,
      selectionOverride?: DomEditSelection | null,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return;
      addKeyframe(sel, animId, percentage, property, value);
    },
    [resolveWriteSelection, addKeyframe],
  );

  const handleGsapAddKeyframeBatch = useCallback(
    (
      animId: string,
      percentage: number,
      properties: Record<string, number | string>,
      commitOverrides?: Partial<CommitMutationOptions>,
      selectionOverride?: DomEditSelection | null,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return Promise.resolve();
      return addKeyframeBatch(sel, animId, percentage, properties, commitOverrides).catch(
        (error) => {
          trackGsapHandlerFailure(error, sel, "add-keyframe", "Add keyframe");
        },
      );
    },
    [resolveWriteSelection, addKeyframeBatch, trackGsapHandlerFailure],
  );
  const handleGsapRemoveKeyframe = useCallback(
    (
      animId: string,
      percentage: number,
      commitOverrides?: Partial<CommitMutationOptions>,
      selectionOverride?: DomEditSelection | null,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return;
      trackStudioEvent("keyframe", { action: "remove" });
      removeKeyframe(sel, animId, percentage, commitOverrides);
    },
    [resolveWriteSelection, removeKeyframe],
  );

  const handleGsapMoveKeyframeToPlayhead = useCallback(
    (
      animId: string,
      fromPercentage: number,
      selectionOverride?: DomEditSelection | null,
      animationOverride?: GsapAnimation,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return;
      // Retime the keyframe to the playhead, preserving its value + ease. The
      // playhead's tween-relative percentage is the move target, and it has to
      // come from the SAME element the write lands on: reading the animation off
      // the current selection while the percentage came from the clicked element
      // computes the target against one tween and writes it into another.
      const anim = animationOverride ?? selectedGsapAnimations.find((a) => a.id === animId);
      const toPercentage = computeCurrentPercentage(sel, anim);
      trackStudioEvent("keyframe", { action: "move_to_playhead" });
      void moveKeyframe(sel, animId, fromPercentage, toPercentage);
    },
    [resolveWriteSelection, selectedGsapAnimations, moveKeyframe],
  );

  const handleGsapMoveKeyframe = useCallback(
    (
      animId: string,
      fromPercentage: number,
      toPercentage: number,
      selectionOverride?: DomEditSelection | null,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return Promise.resolve(false);
      // Atomic retime: preserves the keyframe's value + per-keyframe ease. Both
      // percentages are tween-relative (the drag handler converts the drop
      // position before calling). No optimistic runtime hold — the soft-reload
      // re-keys the diamond from source.
      trackStudioEvent("keyframe", { action: "retime" });
      return moveKeyframe(sel, animId, fromPercentage, toPercentage);
    },
    [resolveWriteSelection, moveKeyframe],
  );

  const handleGsapResizeKeyframedTween = useCallback(
    (
      animId: string,
      position: number,
      duration: number,
      pctRemap: Array<{ from: number; to: number }>,
      selectionOverride?: DomEditSelection | null,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return Promise.resolve(false);
      // Boundary drag-to-retime: grows/shifts the tween window + re-keys keyframes
      // in place. Distinct telemetry action so resize is separable from in-window move.
      trackStudioEvent("keyframe", { action: "retime_resize" });
      return resizeKeyframedTween(sel, animId, position, duration, pctRemap);
    },
    [resolveWriteSelection, resizeKeyframedTween],
  );

  const handleGsapConvertToKeyframes = useCallback(
    (
      animId: string,
      resolvedFromValues?: Record<string, number | string>,
      duration?: number,
      commitOverrides?: Partial<CommitMutationOptions>,
      selectionOverride?: DomEditSelection | null,
    ) => {
      const sel = resolveWriteSelection(selectionOverride);
      if (!sel) return Promise.resolve();
      return convertToKeyframes(sel, animId, resolvedFromValues, duration, commitOverrides).catch(
        (error) => {
          trackGsapHandlerFailure(error, sel, "convert-to-keyframes", "Convert to keyframes");
        },
      );
    },
    [resolveWriteSelection, convertToKeyframes, trackGsapHandlerFailure],
  );

  const handleGsapRemoveAllKeyframes = useCallback(
    (animId: string, selectionOverride?: DomEditSelection | null, telemetry = true) => {
      const selection = resolveWriteSelection(selectionOverride);
      if (!selection) return Promise.resolve(false);
      return removeAllKeyframes(selection, animId, "remove_all", telemetry).catch((error) => {
        trackGsapHandlerFailure(error, selection, "remove-all-keyframes", "Remove all keyframes");
        return false;
      });
    },
    [resolveWriteSelection, trackGsapHandlerFailure, removeAllKeyframes],
  );

  const handleResetSelectedElementKeyframes = useCallback((): boolean => {
    if (!domEditSelection) return false;
    const withKeyframes = selectedGsapAnimations.find((a) => a.keyframes);
    if (!withKeyframes) return false;
    void removeAllKeyframes(domEditSelection, withKeyframes.id, "reset").catch((error) => {
      trackGsapHandlerFailure(
        error,
        domEditSelection,
        "remove-all-keyframes",
        "Remove all keyframes",
      );
    });
    return true;
  }, [domEditSelection, trackGsapHandlerFailure, removeAllKeyframes, selectedGsapAnimations]);

  return {
    handleGsapUpdateProperty,
    handleGsapUpdateMeta,
    handleGsapDeleteAnimation,
    handleGsapDeleteAllForElement,
    handleGsapAddAnimation,
    handleGsapAddProperty,
    handleGsapRemoveProperty,
    handleGsapUpdateFromProperty,
    handleGsapAddFromProperty,
    handleGsapRemoveFromProperty,
    handleGsapAddKeyframe,
    handleGsapAddKeyframeBatch,
    handleGsapRemoveKeyframe,
    handleGsapMoveKeyframeToPlayhead,
    handleGsapMoveKeyframe,
    handleGsapResizeKeyframedTween,
    handleGsapConvertToKeyframes,
    handleGsapRemoveAllKeyframes,
    handleResetSelectedElementKeyframes,
  };
}
