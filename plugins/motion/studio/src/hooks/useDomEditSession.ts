import { useCallback } from "react";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { isAudioDomElement } from "../utils/timelineInspector";
import type { TimelineElement } from "../player";
import type { ImportedFontAsset } from "../components/editor/fontAssets";
import type { RightPanelTab } from "../utils/studioHelpers";
import type { PatchTarget } from "../utils/sourcePatcher";
import type { Composition } from "@hyperframes/sdk";
import { sdkCutoverPersist, sdkDeletePersist, type PublishSdkSession } from "../utils/sdkCutover";
import { runResolverShadow, recordResolverParity } from "../utils/sdkResolverShadow";
import { useAskAgentModal } from "./useAskAgentModal";
import { useDomSelection } from "./useDomSelection";
import { usePreviewInteraction } from "./usePreviewInteraction";
import { useDomEditCommits } from "./useDomEditCommits";
import { useGroupCommits } from "./useGroupCommits";
import { useGsapScriptCommits } from "./useGsapScriptCommits";
import { useGsapCacheVersion } from "./useGsapTweenCache";
import { useDomEditWiring } from "./useDomEditWiring";
import { useGsapAwareEditing } from "./useGsapAwareEditing";
import { useStudioSelectionPublisher } from "./useStudioSelectionPublisher";
import { useKeyframeEaseCommits } from "./useKeyframeEaseCommits";
import { useCommitPreflightCapabilities } from "./useCommitPreflightCapabilities";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { membersForDelete, timelineElementsForDelete } from "./domEditDeleteMembers";
import type { RecordEditInput } from "./domEditDeleteMembers";
import type { DomEditTimelineParams } from "./useDomSelectionTypes";
import { useLivePreviewIframe } from "./useLivePreviewIframe";
import { moveDomGroupBy, type DomGroupMove } from "../components/editor/domGroupMoveBy";
// Re-exported: the delete rule lives in its own module; callers and its test import it from here.
export { membersForDelete };

export interface UseDomEditSessionParams extends DomEditTimelineParams {
  compositionLoading: boolean;
  showToast: (message: string, tone?: "error" | "info") => void;
  isRecordingRef?: React.RefObject<boolean>;
  refreshPreviewDocumentVersion: () => void;
  queueDomEditSave: <T>(save: () => Promise<T>) => Promise<T>;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  updateEditingFileContent: (path: string, content: string) => void;
  editHistory: { recordEdit: (entry: RecordEditInput) => Promise<void> };
  fileTree: string[];
  importedFontAssetsRef: React.MutableRefObject<ImportedFontAsset[]>;
  projectDir: string | null;
  projectIdRef: React.MutableRefObject<string | null>;
  previewIframe: HTMLIFrameElement | null;
  refreshKey: number;
  previewDocumentVersion: number;
  rightPanelTab: RightPanelTab;
  applyStudioManualEditsToPreviewRef: React.MutableRefObject<
    (iframe: HTMLIFrameElement) => Promise<void>
  >;
  syncPreviewHotkeys: (iframe: HTMLIFrameElement | null) => void;
  reloadPreview: () => void;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  openSourceForSelection?: (sourceFile: string, target: PatchTarget) => void;
  sdkSession?: Composition | null;
  publishSdkSession?: PublishSdkSession;
  forceReloadSdkSession?: () => void;
  /** The timeline context menu's delete op — a canvas selection that IS a
   *  timeline row hands off here instead of the REST remove-elements path. */
  handleTimelineElementsDelete: (elements: TimelineElement[]) => Promise<void>;
  readOnlyPreview: boolean;
}

export function useDomEditSession({
  projectId,
  activeCompPath,
  compIdToSrc,
  captionEditMode,
  compositionLoading,
  previewIframeRef,
  timelineElements,
  getTimelineSelectionSet,
  setSelectedTimelineElementId,
  setTimelineSelectionSet,
  setRightCollapsed,
  setRightPanelTab,
  showToast,
  isRecordingRef,
  refreshPreviewDocumentVersion,
  queueDomEditSave,
  readProjectFile,
  writeProjectFile,
  updateEditingFileContent,
  editHistory,
  fileTree,
  importedFontAssetsRef,
  projectDir,
  projectIdRef,
  previewIframe: hostPreviewIframe,
  refreshKey,
  previewDocumentVersion,
  rightPanelTab,
  applyStudioManualEditsToPreviewRef,
  syncPreviewHotkeys,
  reloadPreview,
  openSourceForSelection,
  sdkSession,
  publishSdkSession,
  forceReloadSdkSession,
  handleTimelineElementsDelete,
  readOnlyPreview,
}: UseDomEditSessionParams) {
  const isMasterView = !activeCompPath || activeCompPath === "index.html";
  const previewCaptionEditMode = captionEditMode && !readOnlyPreview;
  const previewIframe = useLivePreviewIframe(hostPreviewIframe);
  const {
    domEditSelection,
    domEditGroupSelections,
    domEditHoverSelection,
    activeGroupElement,
    domEditSelectionRef,
    domEditGroupSelectionsRef,
    setActiveGroupElement,
    applyDomSelection,
    clearDomSelection,
    buildDomSelectionFromTarget,
    resolveDomSelectionFromPreviewPoint,
    resolveAllDomSelectionsFromPreviewPoint,
    updateDomEditHoverSelection,
    buildDomSelectionForTimelineElement,
    handleTimelineElementSelect,
    refreshDomEditSelectionFromPreview,
    applyMarqueeSelection,
  } = useDomSelection({
    projectId,
    activeCompPath,
    isMasterView,
    compIdToSrc,
    captionEditMode: previewCaptionEditMode,
    previewIframeRef,
    timelineElements,
    getTimelineSelectionSet,
    setSelectedTimelineElementId,
    setTimelineSelectionSet,
    setRightCollapsed,
    setRightPanelTab,
    previewIframe,
    refreshKey,
    rightPanelTab,
  });

  const {
    agentModalOpen,
    agentModalAnchorPoint,
    copiedAgentPrompt,
    agentPromptSelectionContext,
    setAgentModalOpen,
    setAgentPromptSelectionContext,
    setAgentModalAnchorPoint,
    handleAskAgent,
    handleAgentModalSubmit,
  } = useAskAgentModal({
    projectId,
    activeCompPath,
    projectDir,
    projectIdRef,
    showToast,
    domEditSelectionRef,
    domEditSelection,
  });

  useStudioSelectionPublisher({
    projectId,
    domEditSelection,
    domEditSelectionRef,
    refreshKey,
    previewDocumentVersion,
    refreshDomEditSelectionFromPreview,
  });
  // ── GSAP cache (hoisted so both useGsapScriptCommits and useDomEditWiring share the same instance) ──
  const { version: gsapCacheVersion, bump: bumpGsapCache } = useGsapCacheVersion();

  const {
    commitMutation: gsapCommitMutation,
    setArcPath,
    updateArcSegment,
    ...gsapScriptEdits
  } = useGsapScriptCommits({
    projectIdRef,
    activeCompPath,
    previewIframeRef,
    editHistory,
    reloadPreview,
    onCacheInvalidate: bumpGsapCache,
    onFileContentChanged: updateEditingFileContent,
    showToast,
    sdkSession,
    publishSdkSession,
    writeProjectFile,
    forceReloadSdkSession,
  });

  const {
    resolveImportedFontAsset,
    handleDomStyleCommit,
    handleDomStyleCommitForSelection,
    handleDomAttributeCommit,
    handleDomAttributeLiveCommit,
    handleDomAttributeQuietCommit,
    handleDomHtmlAttributeCommit,
    handleDomAttributesCommit,
    handleDomAttributeBatchCommit,
    handleDomTextCommit,
    handleDomTextCommitForSelection,
    handleDomRichTextCommit,
    handleDomTextFieldStyleCommit,
    handleDomAddTextField,
    handleDomRemoveTextField,
    stageElementPositionOffset,
    commitPositionPatchToHtml,
    handleDomBoxSizeCommit,
    handleDomRotationCommit: handleDomCssRotationCommit,
    handleDomManualEditsReset,
    handleDomEditElementsDelete,
    handleDomZIndexReorderCommit,
  } = useDomEditCommits({
    activeCompPath,
    previewIframeRef,
    showToast,
    queueDomEditSave,
    writeProjectFile,
    editHistory,
    fileTree,
    importedFontAssetsRef,
    projectId,
    projectIdRef,
    reloadPreview,
    domEditSelection,
    applyDomSelection,
    clearDomSelection,
    refreshDomEditSelectionFromPreview,
    buildDomSelectionFromTarget,
    forceReloadSdkSession,
    readOnlyPreview,
    onTrySdkPersist: sdkSession
      ? (selection, operations, originalContent, targetPath, options) => {
          // Decoupled tripwire, regardless of the cutover flag. originalContent lets the runtime-node
          // filter drop hf-ids absent from source; the paths skip a cross-file edit, not a not-found.
          runResolverShadow(sdkSession, selection.hfId, operations, originalContent, {
            targetPath,
            compositionPath: activeCompPath,
          });
          return sdkCutoverPersist(
            selection,
            operations,
            originalContent,
            targetPath,
            sdkSession,
            {
              editHistory,
              writeProjectFile,
              reloadPreview,
              compositionPath: activeCompPath,
              readProjectFile,
              publishSession: publishSdkSession,
            },
            options,
          );
        }
      : undefined,
    onTrySdkDelete: sdkSession
      ? (hfId, originalContent, targetPath) =>
          sdkDeletePersist(hfId, originalContent, targetPath, sdkSession, {
            editHistory,
            writeProjectFile,
            reloadPreview,
            compositionPath: activeCompPath,
            readProjectFile,
            publishSession: publishSdkSession,
          })
      : undefined,
    // Z-index reorder takes the server path (no SDK persist); this decoupled
    // tripwire still records whether the SDK resolves each reordered target.
    onReorderShadow: sdkSession
      ? (targets: string[]) => {
          // Single-flight: every target in one reorder batch shares the same file, so
          // memoize the read instead of firing one fetch per unresolved target.
          let reorderSrcPromise: Promise<string> | undefined;
          const reorderSrc = activeCompPath
            ? () => (reorderSrcPromise ??= readProjectFile(activeCompPath))
            : undefined;
          for (const target of targets)
            void recordResolverParity(sdkSession, target, "reorderElements", reorderSrc);
        }
      : undefined,
  });

  // ── Element groups (wrap selected elements in a data-hf-group div) ──
  const { groupSelection, ungroupSelection } = useGroupCommits({
    activeCompPath,
    showToast,
    writeProjectFile,
    editHistory,
    projectIdRef,
    reloadPreview,
    clearDomSelection,
    forceReloadSdkSession,
    timelineElements,
  });

  const handleDomEditElementDelete = useCallback(
    async (selection: DomEditSelection, options?: { expandGroup?: boolean }) => {
      // Same structural edit the timeline delete refuses mid-recording.
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const members = membersForDelete(selection, domEditGroupSelectionsRef.current, options);
      // A selection that is itself timeline rows shares the context menu's delete op.
      const timelineTargets = timelineElementsForDelete(members, timelineElements);
      if (timelineTargets) {
        await handleTimelineElementsDelete(timelineTargets);
        return;
      }
      await handleDomEditElementsDelete(members);
    },
    [
      domEditGroupSelectionsRef,
      handleDomEditElementsDelete,
      handleTimelineElementsDelete,
      isRecordingRef,
      showToast,
      timelineElements,
    ],
  );

  const handleGroupSelection = useCallback(() => {
    const group = domEditGroupSelectionsRef.current;
    const single = domEditSelectionRef.current;
    const members = group.length > 0 ? group : single ? [single] : [];
    if (members.length < 2) {
      showToast("Select at least 2 elements to group", "info");
      return;
    }
    // A layout group takes the members' bounding box; audio has no box (0x0),
    // so it groups into an <hf-audio-group> bus via the track's FX pointer instead.
    if (members.some((m) => isAudioDomElement(m.element))) {
      showToast(
        members.every((m) => isAudioDomElement(m.element))
          ? "Audio clips group into a bus. Use FX on the track header"
          : "Can't group audio clips with layout elements",
        "info",
      );
      return;
    }
    trackStudioEvent("group", { action: "create", count: members.length });
    void groupSelection(members);
  }, [domEditGroupSelectionsRef, domEditSelectionRef, groupSelection, showToast]);

  const handleUngroupSelection = useCallback(() => {
    const sel = domEditSelectionRef.current;
    if (!sel?.element.hasAttribute("data-hf-group")) {
      showToast("Select a group to ungroup", "info");
      return;
    }
    // Dissolving the group exits any drill-in (the wrapper is about to vanish).
    trackStudioEvent("group", { action: "ungroup" });
    setActiveGroupElement(null);
    void ungroupSelection(sel);
  }, [domEditSelectionRef, ungroupSelection, setActiveGroupElement, showToast]);

  // ── Wiring: selection sync, GSAP cache, preview sync, selection handlers ──
  const {
    onClickToSource,
    selectedGsapAnimations,
    gsapMultipleTimelines,
    gsapUnsupportedTimelinePattern,
    trackGsapInteractionFailure,
    makeFetchFallback,
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
  } = useDomEditWiring({
    projectId,
    activeCompPath,
    domEditSelection,
    domEditSelectionRef,
    refreshDomEditSelectionFromPreview,
    previewIframeRef,
    previewIframe,
    captionEditMode: previewCaptionEditMode,
    refreshKey,
    gsapCacheVersion,
    bumpGsapCache,
    showToast,
    refreshPreviewDocumentVersion,
    syncPreviewHotkeys,
    applyStudioManualEditsToPreviewRef,
    openSourceForSelection,
    ...gsapScriptEdits,
    handleDomManualEditsReset,
  });
  const {
    handlePreviewCanvasMouseDown,
    handlePreviewCanvasPointerMove,
    handlePreviewCanvasPointerLeave,
    handleBlockedDomMove,
    handleDomManualDragStart,
  } = usePreviewInteraction({
    captionEditMode: previewCaptionEditMode,
    compositionLoading,
    previewIframeRef,
    showToast,
    applyDomSelection,
    resolveDomSelectionFromPreviewPoint,
    resolveAllDomSelectionsFromPreviewPoint,
    updateDomEditHoverSelection,
    setActiveGroupElement,
    onClickToSource,
  });
  const {
    getGsapAnimationsForSelection,
    handleGsapAwarePathOffsetCommit,
    handleGsapAwareGroupPathOffsetCommit,
    handleGsapAwareBoxSizeCommit,
    handleGsapAwareRotationCommit,
    commitAnimatedProperty,
    commitAnimatedProperties,
    handleSetArcPath,
    handleUpdateArcSegment,
    handleUnroll,
    commitMutation,
  } = useGsapAwareEditing({
    domEditSelection,
    selectedGsapAnimations,
    gsapCommitMutation,
    activeCompPath,
    previewIframeRef,
    showToast,
    bumpGsapCache,
    makeFetchFallback,
    trackGsapInteractionFailure,
    stageElementPositionOffset,
    handleDomBoxSizeCommit,
    handleDomRotationCommit: handleDomCssRotationCommit,
    commitPositionPatchToHtml,
    addGsapAnimation: gsapScriptEdits.addGsapAnimation,
    convertToKeyframes: gsapScriptEdits.convertToKeyframes,
    setArcPath,
    updateArcSegment,
  });
  const handleDomGroupMoveBy = useCallback(
    (moves: DomGroupMove[]) =>
      moveDomGroupBy(moves, (updates) =>
        handleGsapAwareGroupPathOffsetCommit(updates, { refusalToast: false }),
      ),
    [handleGsapAwareGroupPathOffsetCommit],
  );
  const { handleUpdateSegmentEase, handleUpdateKeyframeEase, handleSetAllKeyframeEases } =
    useKeyframeEaseCommits({ gsapCommitMutation, domEditSelectionRef });
  const committable = useCommitPreflightCapabilities({
    projectId,
    enabled: gsapCommitMutation !== null,
    selection: domEditSelection,
    groupSelections: domEditGroupSelections,
    previewIframeRef,
    version: gsapCacheVersion,
  });
  return {
    domEditSelection: committable.selection,
    domEditGroupSelections: committable.groupSelections,
    domEditHoverSelection,
    activeGroupElement,
    agentModalOpen,
    agentModalAnchorPoint,
    copiedAgentPrompt,
    agentPromptSelectionContext,
    domEditSelectionRef,
    // Callbacks
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
    handleDomPathOffsetCommit: handleGsapAwarePathOffsetCommit,
    handleDomGroupPathOffsetCommit: handleGsapAwareGroupPathOffsetCommit,
    handleDomGroupMoveBy,
    handleDomZIndexReorderCommit,
    handleDomBoxSizeCommit: handleGsapAwareBoxSizeCommit,
    handleDomRotationCommit: handleGsapAwareRotationCommit,
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
    applyMarqueeSelection,
    resolveImportedFontAsset,
    setAgentModalOpen,
    setAgentPromptSelectionContext,
    setAgentModalAnchorPoint,

    // GSAP script editing
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
    handleUpdateKeyframeEase,
    handleUpdateSegmentEase,
    handleSetAllKeyframeEases,
    commitAnimatedProperty,
    commitAnimatedProperties,
    handleSetArcPath,
    handleUpdateArcSegment,
    handleUnroll,
    invalidateGsapCache: bumpGsapCache,
    previewIframeRef,
    commitMutation,
  };
}
