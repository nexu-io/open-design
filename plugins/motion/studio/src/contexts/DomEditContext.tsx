// fallow-ignore-file code-duplication
import type { useDomEditSession } from "../hooks/useDomEditSession";
import { useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { createStableContext } from "../utils/hmrStableContext";
import { trackedStudioEdit } from "../utils/studioPendingEdits";

type DomEditValue = ReturnType<typeof useDomEditSession>;

const SAVES_AN_EDIT = {
  handleTimelineElementSelect: false,
  handlePreviewCanvasMouseDown: false,
  handlePreviewCanvasPointerMove: false,
  handlePreviewCanvasPointerLeave: false,
  applyDomSelection: false,
  clearDomSelection: false,
  refreshDomEditSelectionFromPreview: false,
  handleDomStyleCommit: true,
  handleDomStyleCommitForSelection: true,
  handleDomAttributeCommit: true,
  handleDomAttributeLiveCommit: false,
  handleDomAttributeQuietCommit: true,
  handleDomHtmlAttributeCommit: true,
  handleDomAttributesCommit: true,
  handleDomAttributeBatchCommit: true,
  handleDomPathOffsetCommit: true,
  handleDomGroupPathOffsetCommit: true,
  handleDomGroupMoveBy: true,
  handleDomZIndexReorderCommit: true,
  handleDomBoxSizeCommit: true,
  handleDomRotationCommit: true,
  handleDomManualEditsReset: true,
  handleDomTextCommit: true,
  handleDomTextCommitForSelection: true,
  handleDomRichTextCommit: true,
  handleDomTextFieldStyleCommit: true,
  handleDomAddTextField: true,
  handleDomRemoveTextField: true,
  getGsapAnimationsForSelection: false,
  handleAskAgent: false,
  handleAgentModalSubmit: false,
  handleBlockedDomMove: false,
  handleDomManualDragStart: false,
  handleDomEditElementDelete: true,
  handleGroupSelection: true,
  handleUngroupSelection: true,
  setActiveGroupElement: false,
  buildDomSelectionFromTarget: false,
  buildDomSelectionForTimelineElement: false,
  updateDomEditHoverSelection: false,
  resolveImportedFontAsset: false,
  setAgentModalOpen: false,
  setAgentPromptSelectionContext: false,
  setAgentModalAnchorPoint: false,
  handleGsapUpdateProperty: true,
  handleGsapUpdateMeta: true,
  handleGsapDeleteAnimation: true,
  handleGsapDeleteAllForElement: true,
  handleGsapAddAnimation: true,
  handleGsapAddProperty: true,
  handleGsapRemoveProperty: true,
  handleGsapUpdateFromProperty: true,
  handleGsapAddFromProperty: true,
  handleGsapRemoveFromProperty: true,
  handleGsapAddKeyframe: true,
  handleGsapAddKeyframeBatch: true,
  handleGsapRemoveKeyframe: true,
  handleGsapMoveKeyframeToPlayhead: true,
  handleGsapMoveKeyframe: true,
  handleGsapResizeKeyframedTween: true,
  handleGsapConvertToKeyframes: true,
  handleGsapRemoveAllKeyframes: true,
  handleResetSelectedElementKeyframes: true,
  commitAnimatedProperty: true,
  commitAnimatedProperties: true,
  handleSetArcPath: true,
  handleUpdateArcSegment: true,
  handleUnroll: true,
  invalidateGsapCache: false,
  previewIframeRef: false,
  domEditSelectionRef: false,
  commitMutation: true,
  applyMarqueeSelection: false,
  handleUpdateKeyframeEase: true,
  handleUpdateSegmentEase: true,
  handleSetAllKeyframeEases: true,
} as const satisfies Partial<Record<keyof DomEditValue, boolean>>;

export interface DomEditActionsValue extends Pick<DomEditValue, keyof typeof SAVES_AN_EDIT> {}

export interface DomEditSelectionValue extends Pick<
  DomEditValue,
  | "domEditSelection"
  | "domEditGroupSelections"
  | "domEditHoverSelection"
  | "activeGroupElement"
  | "domEditSelectionRef"
  | "selectedGsapAnimations"
  | "gsapMultipleTimelines"
  | "gsapUnsupportedTimelinePattern"
  | "agentModalOpen"
  | "agentModalAnchorPoint"
  | "copiedAgentPrompt"
  | "agentPromptSelectionContext"
> {}

function trackEditCommits(actions: DomEditActionsValue): DomEditActionsValue {
  const tracked: Record<string, unknown> = { ...actions };
  for (const key of Object.keys(SAVES_AN_EDIT) as Array<keyof typeof SAVES_AN_EDIT>) {
    if (!SAVES_AN_EDIT[key]) continue;
    tracked[key] = trackedStudioEdit(actions[key] as (...args: unknown[]) => unknown, {
      afterOlderSaves: true,
    });
  }
  return tracked as unknown as DomEditActionsValue;
}

const DomEditActionsContext = createStableContext<DomEditActionsValue | null>(
  "DomEditActionsContext",
  null,
);
const DomEditSelectionContext = createStableContext<DomEditSelectionValue | null>(
  "DomEditSelectionContext",
  null,
);

export function useDomEditActionsContext(): DomEditActionsValue {
  const ctx = useContext(DomEditActionsContext);
  if (!ctx) throw new Error("useDomEditActionsContext must be used within DomEditProvider");
  return ctx;
}

/**
 * Optional access — returns null outside a provider. Lets the player-package
 * <Timeline> (a public standalone export) reach the z-order persist path when
 * embedded in the NLE without hard-requiring the provider in standalone/test mounts.
 */
export function useDomEditActionsContextOptional(): DomEditActionsValue | null {
  return useContext(DomEditActionsContext);
}

export function useDomEditSelectionContext(): DomEditSelectionValue {
  const ctx = useContext(DomEditSelectionContext);
  if (!ctx) throw new Error("useDomEditSelectionContext must be used within DomEditProvider");
  return ctx;
}

/** Optional counterpart to useDomEditActionsContextOptional — same reason: the
 *  player package's own components mount outside a provider in standalone and
 *  test trees, where "no dom-edit selection" is the correct answer. */
export function useDomEditSelectionContextOptional(): DomEditSelectionValue | null {
  return useContext(DomEditSelectionContext);
}

/** @deprecated Prefer useDomEditActionsContext or useDomEditSelectionContext. */
export function useDomEditContext(): DomEditValue {
  return { ...useDomEditActionsContext(), ...useDomEditSelectionContext() };
}

export function DomEditProvider({
  value: {
    domEditSelection,
    domEditGroupSelections,
    domEditHoverSelection,
    agentModalOpen,
    agentModalAnchorPoint,
    copiedAgentPrompt,
    agentPromptSelectionContext,
    domEditSelectionRef,
    handleTimelineElementSelect,
    handlePreviewCanvasMouseDown,
    handlePreviewCanvasPointerMove,
    handlePreviewCanvasPointerLeave,
    applyDomSelection,
    clearDomSelection,
    refreshDomEditSelectionFromPreview,
    handleDomStyleCommit,
    handleDomStyleCommitForSelection,
    handleDomAttributeCommit,
    handleDomAttributeLiveCommit,
    handleDomAttributeQuietCommit,
    handleDomHtmlAttributeCommit,
    handleDomAttributesCommit,
    handleDomAttributeBatchCommit,
    handleDomPathOffsetCommit,
    handleDomGroupPathOffsetCommit,
    handleDomGroupMoveBy,
    handleDomZIndexReorderCommit,
    handleDomBoxSizeCommit,
    handleDomRotationCommit,
    handleDomManualEditsReset,

    handleDomTextCommit,
    handleDomTextCommitForSelection,
    handleDomRichTextCommit,
    handleDomTextFieldStyleCommit,
    handleDomAddTextField,
    handleDomRemoveTextField,
    getGsapAnimationsForSelection,
    handleAskAgent,
    handleAgentModalSubmit,
    handleBlockedDomMove,
    handleDomManualDragStart,
    handleDomEditElementDelete,
    handleGroupSelection,
    handleUngroupSelection,
    setActiveGroupElement,
    activeGroupElement,
    buildDomSelectionFromTarget,
    buildDomSelectionForTimelineElement,
    updateDomEditHoverSelection,
    resolveImportedFontAsset,
    setAgentModalOpen,
    setAgentPromptSelectionContext,
    setAgentModalAnchorPoint,
    selectedGsapAnimations,
    gsapMultipleTimelines,
    gsapUnsupportedTimelinePattern,
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
    commitAnimatedProperty,
    commitAnimatedProperties,
    handleSetArcPath,
    handleUpdateArcSegment,
    handleUnroll,
    invalidateGsapCache,
    previewIframeRef,
    commitMutation,
    applyMarqueeSelection,
    handleUpdateKeyframeEase,
    handleUpdateSegmentEase,
    handleSetAllKeyframeEases,
  },
  children,
}: {
  value: DomEditValue;
  children: ReactNode;
}) {
  const commitMutationRef = useRef(commitMutation);
  commitMutationRef.current = commitMutation;

  const stableCommitMutation = useCallback<DomEditActionsValue["commitMutation"]>(
    (mutation, options, selection) => commitMutationRef.current(mutation, options, selection),
    [],
  );

  const untrackedActions = useMemo<DomEditActionsValue>(
    () => ({
      handleTimelineElementSelect,
      handlePreviewCanvasMouseDown,
      handlePreviewCanvasPointerMove,
      handlePreviewCanvasPointerLeave,
      applyDomSelection,
      clearDomSelection,
      refreshDomEditSelectionFromPreview,
      handleDomStyleCommit,
      handleDomStyleCommitForSelection,
      handleDomAttributeCommit,
      handleDomAttributeLiveCommit,
      handleDomAttributeQuietCommit,
      handleDomHtmlAttributeCommit,
      handleDomAttributesCommit,
      handleDomAttributeBatchCommit,
      handleDomPathOffsetCommit,
      handleDomGroupPathOffsetCommit,
      handleDomGroupMoveBy,
      handleDomZIndexReorderCommit,
      handleDomBoxSizeCommit,
      handleDomRotationCommit,
      handleDomManualEditsReset,
      handleDomTextCommit,
      handleDomTextCommitForSelection,
      handleDomRichTextCommit,
      handleDomTextFieldStyleCommit,
      handleDomAddTextField,
      handleDomRemoveTextField,
      getGsapAnimationsForSelection,
      handleAskAgent,
      handleAgentModalSubmit,
      handleBlockedDomMove,
      handleDomManualDragStart,
      handleDomEditElementDelete,
      handleGroupSelection,
      handleUngroupSelection,
      setActiveGroupElement,
      buildDomSelectionFromTarget,
      buildDomSelectionForTimelineElement,
      updateDomEditHoverSelection,
      resolveImportedFontAsset,
      setAgentModalOpen,
      setAgentPromptSelectionContext,
      setAgentModalAnchorPoint,
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
      commitAnimatedProperty,
      commitAnimatedProperties,
      handleSetArcPath,
      handleUpdateArcSegment,
      handleUnroll,
      invalidateGsapCache,
      previewIframeRef,
      domEditSelectionRef,
      commitMutation: stableCommitMutation,
      applyMarqueeSelection,
      handleUpdateKeyframeEase,
      handleUpdateSegmentEase,
      handleSetAllKeyframeEases,
    }),
    [
      handleTimelineElementSelect,
      handlePreviewCanvasMouseDown,
      handlePreviewCanvasPointerMove,
      handlePreviewCanvasPointerLeave,
      applyDomSelection,
      clearDomSelection,
      refreshDomEditSelectionFromPreview,
      handleDomStyleCommit,
      handleDomStyleCommitForSelection,
      handleDomAttributeCommit,
      handleDomAttributeLiveCommit,
      handleDomAttributeQuietCommit,
      handleDomHtmlAttributeCommit,
      handleDomAttributesCommit,
      handleDomAttributeBatchCommit,
      handleDomPathOffsetCommit,
      handleDomGroupPathOffsetCommit,
      handleDomGroupMoveBy,
      handleDomZIndexReorderCommit,
      handleDomBoxSizeCommit,
      handleDomRotationCommit,
      handleDomManualEditsReset,
      handleDomTextCommit,
      handleDomTextCommitForSelection,
      handleDomRichTextCommit,
      handleDomTextFieldStyleCommit,
      handleDomAddTextField,
      handleDomRemoveTextField,
      getGsapAnimationsForSelection,
      handleAskAgent,
      handleAgentModalSubmit,
      handleBlockedDomMove,
      handleDomManualDragStart,
      handleDomEditElementDelete,
      handleGroupSelection,
      handleUngroupSelection,
      setActiveGroupElement,
      buildDomSelectionFromTarget,
      buildDomSelectionForTimelineElement,
      updateDomEditHoverSelection,
      resolveImportedFontAsset,
      setAgentModalOpen,
      setAgentPromptSelectionContext,
      setAgentModalAnchorPoint,
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
      commitAnimatedProperty,
      commitAnimatedProperties,
      handleSetArcPath,
      handleUpdateArcSegment,
      handleUnroll,
      invalidateGsapCache,
      previewIframeRef,
      domEditSelectionRef,
      stableCommitMutation,
      applyMarqueeSelection,
      handleUpdateKeyframeEase,
      handleUpdateSegmentEase,
      handleSetAllKeyframeEases,
    ],
  );

  const actions = useMemo(() => trackEditCommits(untrackedActions), [untrackedActions]);

  const selection = useMemo<DomEditSelectionValue>(
    () => ({
      domEditSelection,
      domEditGroupSelections,
      domEditHoverSelection,
      activeGroupElement,
      domEditSelectionRef,
      selectedGsapAnimations,
      gsapMultipleTimelines,
      gsapUnsupportedTimelinePattern,
      agentModalOpen,
      agentModalAnchorPoint,
      copiedAgentPrompt,
      agentPromptSelectionContext,
    }),
    [
      domEditSelection,
      domEditGroupSelections,
      domEditHoverSelection,
      activeGroupElement,
      domEditSelectionRef,
      selectedGsapAnimations,
      gsapMultipleTimelines,
      gsapUnsupportedTimelinePattern,
      agentModalOpen,
      agentModalAnchorPoint,
      copiedAgentPrompt,
      agentPromptSelectionContext,
    ],
  );
  return (
    <DomEditActionsContext value={actions}>
      <DomEditSelectionContext value={selection}>{children}</DomEditSelectionContext>
    </DomEditActionsContext>
  );
}
