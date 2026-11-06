import { useMemo } from "react";
import type { EnableKeyframesSession } from "./useEnableKeyframes";

interface HistoryFlags {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  redoLabel: string | undefined;
}

/** The four history fields the shell context carries, as one object that changes only when they do. */
export function useHistoryFlags({ canUndo, canRedo, undoLabel, redoLabel }: HistoryFlags) {
  return useMemo(
    () => ({ canUndo, canRedo, undoLabel, redoLabel }),
    [canUndo, canRedo, undoLabel, redoLabel],
  );
}

/** The session fields the timeline toolbar reads, so a hover or any other session change leaves it alone. */
export function useToolbarSession(session: EnableKeyframesSession): EnableKeyframesSession {
  const {
    domEditSelection,
    selectedGsapAnimations,
    previewIframeRef,
    commitMutation,
    handleGsapAddAnimation,
    handleGsapAddKeyframeBatch,
    handleGsapConvertToKeyframes,
    handleGsapRemoveKeyframe,
  } = session;
  return useMemo(
    () => ({
      domEditSelection,
      selectedGsapAnimations,
      previewIframeRef,
      commitMutation,
      handleGsapAddAnimation,
      handleGsapAddKeyframeBatch,
      handleGsapConvertToKeyframes,
      handleGsapRemoveKeyframe,
    }),
    [
      domEditSelection,
      selectedGsapAnimations,
      previewIframeRef,
      commitMutation,
      handleGsapAddAnimation,
      handleGsapAddKeyframeBatch,
      handleGsapConvertToKeyframes,
      handleGsapRemoveKeyframe,
    ],
  );
}
