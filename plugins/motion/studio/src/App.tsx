import { useOwnPreviewIframe, usePreviewIframeStore } from "./player/store/previewIframeStore";
import { buildProjectApiPath } from "./utils/projectRouting";
import { Fragment, useState, useCallback, useRef, useMemo, type SetStateAction } from "react";
import { useStableHandlers } from "./hooks/useStableHandlers";
import { useHistoryFlags, useToolbarSession } from "./hooks/useShellSlices";
import { useDismissingTabSetter, useRightPanelIntent } from "./hooks/useRightPanelIntents";
import { useRenderQueue } from "./components/renders/useRenderQueue";
import { usePlayerStore } from "./player";
import { StudioOverlays } from "./components/StudioOverlays";
import { SaveQueuePausedBanner } from "./components/SaveQueuePausedBanner";
import { ExternalFileConflictBanner } from "./components/ExternalFileConflictBanner";
import { ProjectUnreachableBanner } from "./components/ProjectUnreachableBanner";
import { CompositionMissingBanner } from "./components/CompositionMissingBanner";
import { useCaptionStore } from "./captions/store";
import { useCaptionSync } from "./captions/hooks/useCaptionSync";
import { usePersistentEditHistory } from "./hooks/usePersistentEditHistory";
import { usePanelLayout } from "./hooks/usePanelLayout";
import { useFileManager } from "./hooks/useFileManager";
import { usePreviewPersistence } from "./hooks/usePreviewPersistence";
import { usePreviewDocumentVersion } from "./hooks/usePreviewDocumentVersion";
import { useTimelineEditing } from "./hooks/useTimelineEditing";
import { useTimelineMoveEditsHandler } from "./hooks/timelineMoveAdapter";
import type { TimelineZIndexReorderCommit } from "./hooks/useTimelineEditingTypes";
import type { BlockPreviewInfo } from "./components/sidebar/BlocksTab";
import { useDomEditSession } from "./hooks/useDomEditSession";
import { useSdkSelectionSync } from "./hooks/useSdkSelectionSync";
import { useStudioSdkSessions } from "./hooks/useStudioSdkSessions";
import { useStudioExternalFileChanges } from "./hooks/useStudioExternalFileChanges";
import { useBlockHandlers } from "./hooks/useBlockHandlers";
import { useAppHotkeys } from "./hooks/useAppHotkeys";
import { trackedStudioEdit } from "./utils/studioPendingEdits";
import { useClipboard } from "./hooks/useClipboard";
import { deleteSelectedKeyframes } from "./hooks/timelineEditingHelpers";
import { useCaptionDetection } from "./hooks/useCaptionDetection";
import { useRenderClipContent } from "./hooks/useRenderClipContent";
import { useConsoleErrorCapture } from "./hooks/useConsoleErrorCapture";
import { useFrameCapture } from "./hooks/useFrameCapture";
import { useLintModal } from "./hooks/useLintModal";
import { useCompositionDimensions } from "./hooks/useCompositionDimensions";
import { useToast } from "./hooks/useToast";
import { useStudioUrlState } from "./hooks/useStudioUrlState";
import { useEffectiveTimelineDuration } from "./hooks/useEffectiveTimelineDuration";
import {
  buildStudioContextValue,
  useGlobalFileDrop,
  useInspectorState,
} from "./hooks/useStudioContextValue";
import type { DomEditSelection } from "./components/editor/domEditing";
import { StudioHeader } from "./components/StudioHeader";
import { useGestureCommit } from "./hooks/useGestureCommit";
import { useGestureTrailOverlay } from "./hooks/useGestureTrailOverlay";
import { EditorShell } from "./components/EditorShell";
import { useStudioSidePanels } from "./hooks/useStudioSidePanels";
import { TimelineToolbar } from "./components/TimelineToolbar";
import { StudioPlaybackProvider, StudioShellProvider } from "./contexts/StudioContext";
import { PanelLayoutProvider } from "./contexts/PanelLayoutContext";
import { FileManagerProvider } from "./contexts/FileManagerContext";
import { DomEditProvider } from "./contexts/DomEditContext";
import { StudioSplash } from "./components/StudioSplash";
import { useServerConnection } from "./hooks/useServerConnection";
import { useStudioSessionStart } from "./hooks/useStudioSessionStart";
import { useTimelineAddAtPlayhead } from "./hooks/useTimelineAddAtPlayhead";
import { readStudioUrlStateFromWindow, resolveMasterCompositionPath } from "./utils/studioUrlState";
import { useActiveComposition } from "./hooks/useActiveComposition";
import { requestPreviewReload } from "./player/previewReloading";
import { useStudioHost } from "./motion/StudioHost";
const getTimelineSelectionSet = () => usePlayerStore.getState().selectedElementIds;

export interface StudioAppProps {
  /** Clicks still select and report; the preview cannot move, edit or delete anything. */
  readOnlyPreview?: boolean;
  /** Short text shown on disabled hand-edit controls while `readOnlyPreview` is set. */
  readOnlyPreviewReason?: string;
}

// fallow-ignore-next-line complexity
export function StudioApp({ readOnlyPreview = false, readOnlyPreviewReason }: StudioAppProps = {}) {
  const AppFrame = useStudioHost()?.AppFrame ?? Fragment;
  const EditorFrame = useStudioHost()?.EditorFrame ?? Fragment;
  const { projectId, resolving, waitingForServer } = useServerConnection();
  const initialUrlStateRef = useRef(readStudioUrlStateFromWindow());
  useStudioSessionStart(projectId, resolving, waitingForServer);
  const [compIdToSrc, setCompIdToSrc] = useState<Map<string, string>>(new Map());
  const previewIframe = useOwnPreviewIframe();
  const [compositionLoading, setCompositionLoading] = useState(true);
  const [refreshKey, setRefreshKeyState] = useState(0);
  const [previewDocumentVersion, refreshPreviewDocumentVersion] = usePreviewDocumentVersion();
  const [blockPreview, setBlockPreview] = useState<BlockPreviewInfo | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const captionEditMode = useCaptionStore((s) => s.isEditMode);
  const captionHasSelection = useCaptionStore((s) => s.selectedSegmentIds.size > 0);
  const captionSync = useCaptionSync(projectId);
  const timelineElements = usePlayerStore((s) => s.elements);
  const setSelectedTimelineElementId = usePlayerStore((s) => s.setSelectedElementId);
  const setTimelineSelectionSet = usePlayerStore((s) => s.setSelectedElementIds);
  const timelineDuration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const effectiveTimelineDuration = useEffectiveTimelineDuration(
    timelineDuration,
    timelineElements,
  );
  const { toasts, showToast, dismissToast } = useToast();
  const panelLayout = usePanelLayout({
    rightCollapsed: initialUrlStateRef.current.rightCollapsed,
    rightPanelTab: initialUrlStateRef.current.rightPanelTab,
  });
  const editHistory = useStableHandlers(usePersistentEditHistory({ projectId }), projectId);
  const handleDomZIndexReorderCommitRef = useRef<TimelineZIndexReorderCommit | null>(null);
  const pendingTimelineEditPathRef = useRef(new Set<string>());
  const isGestureRecordingRef = useRef(false);
  const setRefreshKey = useCallback((next: SetStateAction<number>) => {
    requestPreviewReload();
    setRefreshKeyState(next);
  }, []);
  const reloadPreview = useCallback(() => setRefreshKey((k) => k + 1), [setRefreshKey]);
  const fileManagerResult = useFileManager({
    projectId,
    showToast,
    recordEdit: editHistory.recordEdit,
    setRefreshKey,
  });
  const fileManager = useStableHandlers(fileManagerResult, projectId);
  const masterCompPath = useMemo(
    () => resolveMasterCompositionPath(fileManager.compositions),
    [fileManager.compositions],
  );
  const { activeCompPath, activeCompPathHydrated, setActiveCompPath, handleSelectComposition } =
    useActiveComposition({
      projectId,
      initialUrlStateRef,
      fileTree: fileManager.fileTree,
      fileTreeLoaded: fileManager.fileTreeLoaded,
      masterCompPath,
      setEditingFile: fileManager.setEditingFile,
      showToast,
    });
  const { sdkHandle, editFlowSdkSession } = useStudioSdkSessions(
    projectId,
    activeCompPath,
    masterCompPath,
    fileManager.fileTree,
    fileManager.fileTreeLoaded,
    fileManager.refreshFileTree,
  );
  const activeCompPathRef = useRef(activeCompPath);
  activeCompPathRef.current = activeCompPath;
  const renderQueue = useStableHandlers(useRenderQueue(projectId, activeCompPathRef), projectId);
  const previewPersistenceResult = usePreviewPersistence({
    showToast,
    readOptionalProjectFile: fileManager.readOptionalProjectFile,
    writeProjectFile: fileManager.writeProjectFile,
    recordEdit: editHistory.recordEdit,
    previewIframeRef,
    activeCompPathRef,
    reloadPreview,
  });
  const previewPersistence = useStableHandlers(previewPersistenceResult, projectId);
  const externalFileChanges = useStudioExternalFileChanges({
    projectId,
    activeCompPath,
    masterCompPath,
    fileManager,
    previewPersistence,
    pendingTimelineEditPathRef,
    reloadPreview,
    onOutsideChange: editHistory.noteOutsideChange,
  });
  const invalidateGsapCacheRef = useRef<() => void>(() => {});
  const invalidateGsapCache = useCallback(() => invalidateGsapCacheRef.current(), []);
  const timelineEditing = useTimelineEditing({
    projectId,
    activeCompPath,
    timelineElements,
    showToast,
    writeProjectFile: fileManager.writeProjectFile,
    observeProjectFileVersion: fileManager.observeProjectFileVersion,
    recordEdit: editHistory.recordEdit,
    reloadPreview,
    previewIframeRef,
    pendingTimelineEditPathRef,
    uploadProjectFiles: fileManager.uploadProjectFiles,
    isRecordingRef: isGestureRecordingRef,
    sdkSession: editFlowSdkSession,
    publishSdkSession: sdkHandle.publish,
    forceReloadSdkSession: sdkHandle.forceReload,
    invalidateGsapCache,
    handleDomZIndexReorderCommitRef,
  });
  const handleTimelineElementsMove = useTimelineMoveEditsHandler(
    timelineEditing.handleTimelineGroupMove,
  );
  const {
    addAssetAtPlayhead: handleAddAssetAtPlayhead,
    addCompositionAtPlayhead: handleAddCompositionAtPlayhead,
  } = useTimelineAddAtPlayhead(
    timelineEditing.handleTimelineAssetDrop,
    timelineEditing.handleTimelineCompositionDrop,
    projectId,
  );
  const blockHandlersResult = useBlockHandlers({
    projectId,
    blockCtxDeps: {
      activeCompPath,
      timelineElements,
      readProjectFile: fileManager.readProjectFile,
      writeProjectFile: fileManager.writeProjectFile,
      recordEdit: editHistory.recordEdit,
      refreshFileTree: fileManager.refreshFileTree,
      reloadPreview,
      showToast,
      dismissToast,
    },
    previewIframeRef,
    setRightCollapsed: panelLayout.setRightCollapsed,
    setRightPanelTab: panelLayout.setRightPanelTab,
  });
  const {
    activeBlockParams,
    setActiveBlockParams,
    handleAddBlock,
    handleTimelineBlockDrop,
    handleAddMediaOverlay,
    handlePreviewBlockDrop,
  } = useStableHandlers(blockHandlersResult, projectId);
  const dismissBlockParams = useCallback(() => setActiveBlockParams(null), [setActiveBlockParams]);
  const setRightPanelTab = useDismissingTabSetter(panelLayout.setRightPanelTab, dismissBlockParams);
  const layout = useMemo(
    () => ({ ...panelLayout, setRightPanelTab }),
    [panelLayout, setRightPanelTab],
  );

  const clearDomSelectionRef = useRef<() => void>(() => {});
  const domEditSelectionBridgeRef = useRef<DomEditSelection | null>(null);
  type DomEditDelete = (s: DomEditSelection, o?: { expandGroup?: boolean }) => Promise<void>;
  const handleDomEditElementDeleteRef = useRef<DomEditDelete>(async () => {});
  const domEditDeleteBridge: DomEditDelete = (s, o) => handleDomEditElementDeleteRef.current(s, o);
  const resetKeyframesRef = useRef<() => boolean>(() => false);
  const deleteSelectedKeyframesRef = useRef<() => void>(() => {});
  const { handleCopy, handlePaste, handleCut, handleDuplicate, canPaste } = useClipboard({
    projectId,
    activeCompPath,
    domEditSelectionRef: domEditSelectionBridgeRef,
    showToast,
    writeProjectFile: fileManager.writeProjectFile,
    recordEdit: editHistory.recordEdit,
    reloadPreview,
    handleTimelineElementsDelete: timelineEditing.handleTimelineElementsDelete,
    handleDomEditElementDelete: domEditDeleteBridge,
    previewIframeRef,
    waitForPendingDomEditSaves: previewPersistence.waitForPendingDomEditSaves,
  });
  const appHotkeys = useAppHotkeys({
    projectId,
    handleTimelineElementsDelete: timelineEditing.handleTimelineElementsDelete,
    handleLinkEdit: timelineEditing.handleLinkEdit,
    handleTimelineElementDeleteOnly: timelineEditing.handleTimelineElementDeleteOnly,
    handleTimelineElementSplit: timelineEditing.handleTimelineElementSplit,
    handleDomEditElementDelete: domEditDeleteBridge,
    domEditSelectionRef: domEditSelectionBridgeRef,
    clearDomSelectionRef,
    editHistory,
    readOptionalProjectFile: fileManager.readOptionalProjectFile,
    readProjectFile: fileManager.readProjectFile,
    writeProjectFile: fileManager.writeProjectFile,
    showToast,
    syncHistoryPreviewAfterApply: previewPersistence.syncHistoryPreviewAfterApply,
    showHistoryRestoreNow: previewPersistence.showHistoryRestoreNow,
    settlePendingEdits: previewPersistence.settlePendingEdits,
    handleCopy,
    handlePaste,
    handleCut,
    handleDuplicate,
    onResetKeyframes: () => resetKeyframesRef.current(),
    onDeleteSelectedKeyframes: () => deleteSelectedKeyframesRef.current(),
    onAfterUndoRedo: (restore) => {
      invalidateGsapCacheRef.current();
      timelineEditing.restoreLiveLanes(restore);
    },
    onGroupSelection: () => domEditSessionRef.current.handleGroupSelection(),
    onUngroupSelection: () => domEditSessionRef.current.handleUngroupSelection(),
    activeCompPath,
    forceReloadSdkSession: sdkHandle.forceReload,
    onToggleRecording: () => handleToggleRecordingRef.current("keyboard"),
    readOnlyPreview,
  });
  const domEditSessionResult = useDomEditSession({
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
    setRightCollapsed: panelLayout.setRightCollapsed,
    setRightPanelTab,
    showToast,
    isRecordingRef: isGestureRecordingRef,
    refreshPreviewDocumentVersion,
    queueDomEditSave: previewPersistence.queueDomEditSave,
    readProjectFile: fileManager.readProjectFile,
    writeProjectFile: fileManager.writeProjectFile,
    updateEditingFileContent: fileManager.updateEditingFileContent,
    editHistory: { recordEdit: editHistory.recordEdit },
    fileTree: fileManager.fileTree,
    importedFontAssetsRef: fileManager.importedFontAssetsRef,
    projectDir: fileManager.projectDir,
    projectIdRef: fileManager.projectIdRef,
    previewIframe,
    refreshKey,
    previewDocumentVersion,
    rightPanelTab: panelLayout.rightPanelTab,
    applyStudioManualEditsToPreviewRef: previewPersistence.applyStudioManualEditsToPreviewRef,
    syncPreviewHotkeys: appHotkeys.syncPreviewHotkeys,
    reloadPreview,
    setRefreshKey,
    openSourceForSelection: fileManager.openSourceForSelection,
    sdkSession: editFlowSdkSession,
    publishSdkSession: sdkHandle.publish,
    forceReloadSdkSession: sdkHandle.forceReload,
    handleTimelineElementsDelete: timelineEditing.handleTimelineElementsDelete,
    readOnlyPreview,
  });
  const domEditSession = useStableHandlers(domEditSessionResult, projectId);
  domEditSelectionBridgeRef.current = domEditSession.domEditSelection;
  const { handleDomZIndexReorderCommit: zCommit, handleDomEditElementDelete: del } = domEditSession;
  handleDomZIndexReorderCommitRef.current = trackedStudioEdit(zCommit);
  clearDomSelectionRef.current = domEditSession.clearDomSelection;
  handleDomEditElementDeleteRef.current = trackedStudioEdit(del);
  resetKeyframesRef.current = domEditSession.handleResetSelectedElementKeyframes;
  invalidateGsapCacheRef.current = domEditSession.invalidateGsapCache;
  deleteSelectedKeyframesRef.current = () => deleteSelectedKeyframes(domEditSession);
  useSdkSelectionSync(
    editFlowSdkSession,
    domEditSession.domEditSelection,
    domEditSession.domEditGroupSelections,
  );
  useCaptionDetection({
    projectId,
    activeCompPath,
    compIdToSrc,
    captionEditMode,
    captionHasSelection,
    previewIframeRef,
    captionSync,
    setRightCollapsed: panelLayout.setRightCollapsed,
  });
  const renderClipContent = useRenderClipContent({
    projectIdRef: fileManager.projectIdRef,
    compIdToSrc,
    activePreviewUrl:
      activeCompPath && projectId
        ? buildProjectApiPath(projectId, `/preview/comp/${activeCompPath}`)
        : null,
    effectiveTimelineDuration,
  });
  const compositionDimensions = useCompositionDimensions(previewIframeRef);
  const lint = useStableHandlers(useLintModal(projectId, refreshKey), projectId);
  const frameCaptureResult = useFrameCapture({
    projectId,
    activeCompPath,
    showToast,
    waitForPendingDomEditSaves: previewPersistence.waitForPendingDomEditSaves,
  });
  const frameCapture = useStableHandlers(frameCaptureResult, projectId);
  const { consoleErrors, setConsoleErrors } = useConsoleErrorCapture(previewIframe);
  const fileDrop = useGlobalFileDrop(timelineEditing.handleTimelineFileDrop);
  const handleToggleRecordingRef = useRef<(method?: "button" | "keyboard") => void>(() => {});
  const domEditSessionRef = useRef(domEditSession);
  domEditSessionRef.current = domEditSession;
  const { gestureState, gestureRecording, handleToggleRecording } = useGestureCommit({
    projectId,
    domEditSessionRef,
    previewIframeRef,
    showToast,
    isGestureRecordingRef,
    readOnlyPreview,
  });
  handleToggleRecordingRef.current = handleToggleRecording;
  const gestureOverlay = useGestureTrailOverlay(
    { gestureState, gestureRecording },
    previewIframe,
    compositionDimensions,
  );
  const handlePreviewIframeRef = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      previewIframeRef.current = iframe;
      usePreviewIframeStore.getState().setIframe(iframe);
      appHotkeys.syncPreviewHotkeys(iframe);
      refreshPreviewDocumentVersion();
    },
    [appHotkeys, refreshPreviewDocumentVersion],
  );
  const rightPanel = useRightPanelIntent();
  const { inspectorPanelActive, shouldShowMotionPath, shouldShowSelectedDomBounds } =
    useInspectorState(
      rightPanel,
      isPlaying,
      domEditSession.domEditSelection,
      gestureState === "recording",
    );
  // The dock has no separate "railed by window width" state (it shrinks
  // panels, never auto-hides the group), so rightCollapsed is already the
  // value that decides whether the panel is actually showing.
  const inspectorButtonActive = !panelLayout.rightCollapsed && inspectorPanelActive;
  useStudioUrlState({
    projectId,
    activeCompPath,
    duration: effectiveTimelineDuration,
    isPlaying,
    compositionLoading,
    refreshKey,
    previewIframeRef,
    rightPanelTab: panelLayout.rightPanelTab,
    rightCollapsed: panelLayout.rightCollapsed,
    activeCompPathHydrated,
    domEditSelection: domEditSession.domEditSelection,
    domEditGroupSelections: domEditSession.domEditGroupSelections,
    applyMarqueeSelection: domEditSession.applyMarqueeSelection,
    buildDomSelectionFromTarget: domEditSession.buildDomSelectionFromTarget,
    applyDomSelection: domEditSession.applyDomSelection,
    setRightPanelTab,
    initialState: initialUrlStateRef.current,
  });
  const historyFlags = useHistoryFlags(editHistory);
  const toolbarSession = useToolbarSession(domEditSession);
  const studioCtxValue = buildStudioContextValue({
    projectId: projectId!,
    activeCompPath,
    setActiveCompPath,
    showToast,
    previewIframeRef,
    captionEditMode,
    compositionLoading,
    refreshKey,
    setRefreshKey,
    timelineElements,
    isPlaying,
    editHistory: historyFlags,
    handleUndo: appHotkeys.handleUndo,
    handleRedo: appHotkeys.handleRedo,
    renderQueue,
    compositionDimensions,
    domEditSaveQueuePaused: previewPersistence.domEditSaveQueuePaused,
    externalFileConflict: externalFileChanges.blocked !== null,
    waitForPendingDomEditSaves: previewPersistence.waitForPendingDomEditSaves,
    handlePreviewIframeRef,
    refreshPreviewDocumentVersion,
  });
  const timelineToolbar = useMemo(
    () => (
      <TimelineToolbar
        domEditSession={toolbarSession}
        onSplitElement={timelineEditing.handleTimelineElementSplit}
      />
    ),
    [toolbarSession, timelineEditing.handleTimelineElementSplit],
  );
  const handleExport = useCallback(() => {
    void previewPersistence
      .waitForPendingDomEditSaves()
      .then(() => renderQueue.startRender(undefined));
  }, [previewPersistence, renderQueue]);
  const clearConsoleErrors = useCallback(() => setConsoleErrors(null), [setConsoleErrors]);
  const panels = useStudioSidePanels(
    {
      onSelectComposition: handleSelectComposition,
      onAddBlock: handleAddBlock,
      onPreviewBlock: setBlockPreview,
      onLint: lint.handleLint,
      linting: lint.linting,
      lintFindingCount: lint.lintFindingCount,
      lintFindingsByFile: lint.findingsByFile,
      lintHasError: lint.hasLintError,
      onAddAssetToTimeline: handleAddAssetAtPlayhead,
      onAddCompositionToTimeline: handleAddCompositionAtPlayhead,
    },
    {
      activeBlockParams,
      onDismissBlockParams: dismissBlockParams,
      onCloseBlockParams: () => {
        setActiveBlockParams(null);
        panelLayout.setRightPanelTab("design");
      },
      recordingState: gestureState,
      recordingDuration: gestureRecording.recordingDuration,
      onToggleRecording: handleToggleRecording,
      sdkSession: sdkHandle.session,
      publishSdkSession: sdkHandle.publish,
      forceReloadSdkSession: sdkHandle.forceReload,
      reloadPreview,
      recordEdit: editHistory.recordEdit,
      onToggleElementHidden: timelineEditing.handleToggleElementHidden,
      onAutoGroupCarveSources: timelineEditing.handleAutoGroupCarveSources,
      onAddMediaOverlay: handleAddMediaOverlay,
    },
    projectId,
  );
  if (resolving || waitingForServer || !projectId)
    return <StudioSplash waiting={waitingForServer} />;
  return (
    <StudioShellProvider value={studioCtxValue}>
      <StudioPlaybackProvider value={studioCtxValue}>
        <PanelLayoutProvider value={layout}>
          <FileManagerProvider value={fileManager}>
            <DomEditProvider value={domEditSession}>
              <AppFrame>
              <div
                className="flex flex-col h-full w-full bg-neutral-950 relative"
                onDragOver={fileDrop.onDragOver}
                onDrop={fileDrop.onDrop}
              >
                <StudioHeader
                  captureFrameHref={frameCapture.captureFrameHref}
                  captureFrameFilename={frameCapture.captureFrameFilename}
                  handleCaptureFrameClick={frameCapture.handleCaptureFrameClick}
                  refreshCaptureFrameTime={frameCapture.refreshCaptureFrameTime}
                  capturing={frameCapture.capturing}
                  inspectorButtonActive={inspectorButtonActive}
                  inspectorPanelActive={inspectorPanelActive}
                  onExport={handleExport}
                />
                {previewPersistence.domEditSaveQueuePaused && !externalFileChanges.blocked && (
                  <SaveQueuePausedBanner
                    message={previewPersistence.domEditSaveQueuePaused}
                    onRetry={previewPersistence.resetDomEditSaveQueueBreaker}
                  />
                )}
                <ExternalFileConflictBanner coordinator={externalFileChanges} />
                {sdkHandle.unreachableProject && (
                  <ProjectUnreachableBanner projectId={sdkHandle.unreachableProject} />
                )}
                {sdkHandle.compositionMissing && activeCompPath && (
                  <CompositionMissingBanner path={activeCompPath} />
                )}
                <EditorFrame><EditorShell
                  readOnlyPreview={readOnlyPreview}
                  readOnlyPreviewReason={readOnlyPreviewReason}
                  panels={panels}
                  timelineToolbar={timelineToolbar}
                  renderClipContent={renderClipContent}
                  handleTimelineElementDelete={timelineEditing.handleTimelineElementDelete}
                  handleTimelineAssetDrop={timelineEditing.handleTimelineAssetDrop}
                  handleTimelineBlockDrop={handleTimelineBlockDrop}
                  handleTimelineCompositionDrop={timelineEditing.handleTimelineCompositionDrop}
                  handlePreviewBlockDrop={handlePreviewBlockDrop}
                  handleTimelineFileDrop={timelineEditing.handleTimelineFileDrop}
                  handleTimelineElementMove={timelineEditing.handleTimelineElementMove}
                  handleTimelineElementsMove={handleTimelineElementsMove}
                  handleTimelineElementResize={timelineEditing.handleTimelineElementResize}
                  handleTimelineGroupResize={timelineEditing.handleTimelineGroupResize}
                  handleToggleTrackHidden={timelineEditing.handleToggleTrackHidden}
                  setAudioGroupAttribute={timelineEditing.setAudioGroupAttribute}
                  handleGroupClips={timelineEditing.handleAutoGroupCarveSources}
                  setElementFxAttribute={timelineEditing.setElementFxAttribute}
                  handleBlockedTimelineEdit={timelineEditing.handleBlockedTimelineEdit}
                  handleTimelineElementSplit={timelineEditing.handleTimelineElementSplit}
                  handleRazorSplit={timelineEditing.handleRazorSplit}
                  handleRazorSplitAll={timelineEditing.handleRazorSplitAll}
                  handleFreezeFrame={timelineEditing.handleFreezeFrame}
                  handleLinkEdit={timelineEditing.handleLinkEdit}
                  handleTimelineElementDeleteOnly={timelineEditing.handleTimelineElementDeleteOnly}
                  onCopyClip={handleCopy}
                  onPasteClip={handlePaste}
                  onDuplicateClip={handleDuplicate}
                  canPasteClip={canPaste}
                  setCompIdToSrc={setCompIdToSrc}
                  setCompositionLoading={setCompositionLoading}
                  shouldShowMotionPath={shouldShowMotionPath}
                  shouldShowSelectedDomBounds={shouldShowSelectedDomBounds}
                  isGestureRecording={gestureState === "recording"}
                  recordingState={gestureState}
                  onToggleRecording={handleToggleRecording}
                  blockPreview={blockPreview}
                  gestureOverlay={gestureOverlay}
                /></EditorFrame>
                <StudioOverlays
                  projectId={projectId}
                  projectDir={fileManager.projectDir}
                  lintModal={lint.lintModal}
                  closeLintModal={lint.closeLintModal}
                  consoleErrors={consoleErrors}
                  clearConsoleErrors={clearConsoleErrors}
                  domEditSession={domEditSession}
                  activeCompPath={activeCompPath}
                  toasts={toasts}
                  dismissToast={dismissToast}
                />
              </div>
              </AppFrame>
            </DomEditProvider>
          </FileManagerProvider>
        </PanelLayoutProvider>
      </StudioPlaybackProvider>
    </StudioShellProvider>
  );
}
