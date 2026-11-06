// fallow-ignore-file complexity
import { useRef } from "react";
import { useStableHandlers } from "./useStableHandlers";
import { usePlayerStore, type TimelineElement } from "../player";
import { useRazorSplit } from "./useRazorSplit";
import { selectSplittableElements } from "../utils/timelineElementSplit";
import { useTimelineAssetDropOps } from "./useTimelineAssetDropOps";
import { useSetAudioGroupAttribute } from "./timelineAudioGroupVolume";
import { useSetElementAttribute } from "./timelineElementFxAttribute";
import { useSetElementsAttribute } from "./timelineElementsAttribute";
import { useTimelineDeleteOps } from "./useTimelineDeleteOps";
import { useTimelineEditGuard } from "./useTimelineEditGuard";
import {
  linkEditTargets,
  useTimelineLinkEditing,
  withLinkPartners,
} from "./useTimelineLinkEditing";
import { useTrackPendingTimelineEdit } from "./useTrackPendingTimelineEdit";
import { useAudioGroupCarveAssignment } from "./timelineAudioGroupCreate";
import {
  useTimelineElementVisibilityEditing,
  useTimelineTrackVisibilityEditing,
} from "./timelineTrackVisibility";
import { useTimelineGroupEditing } from "./useTimelineGroupEditing";
import { useTimelineClipTimingEditing } from "./useTimelineClipTimingEditing";
import { useBlockedTimelineEditToast } from "./useBlockedTimelineEditToast";
import { useTimelineEditGate, type TimelineEditOutcome } from "./timelineEditPermission";
import type { UseTimelineEditingOptions } from "./useTimelineEditingTypes";

export function useTimelineEditing({
  projectId,
  activeCompPath,
  timelineElements,
  showToast,
  writeProjectFile,
  observeProjectFileVersion,
  recordEdit,
  reloadPreview,
  previewIframeRef,
  pendingTimelineEditPathRef,
  uploadProjectFiles,
  isRecordingRef,
  sdkSession,
  publishSdkSession,
  forceReloadSdkSession,
  invalidateGsapCache,
  handleDomZIndexReorderCommitRef,
  canEdit,
}: UseTimelineEditingOptions) {
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const editQueueRef = useRef(Promise.resolve());
  const track = useTrackPendingTimelineEdit();
  const checkEditable = useTimelineEditGate(canEdit, showToast);
  const guard = useTimelineEditGuard(canEdit, showToast);

  const groupEditing = useTimelineGroupEditing({
    activeCompPath,
    editQueueRef,
    forceReloadSdkSession,
    invalidateGsapCache,
    isRecordingRef,
    pendingTimelineEditPathRef,
    previewIframeRef,
    projectIdRef,
    recordEdit,
    reloadPreview,
    sdkSession,
    publishSdkSession,
    showToast,
    writeProjectFile,
  });
  const { handleTimelineElementMove, handleTimelineElementResize } = useTimelineClipTimingEditing({
    activeCompPath,
    timelineElements,
    showToast,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    previewIframeRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
    sdkSession,
    publishSdkSession,
    forceReloadSdkSession,
    invalidateGsapCache,
    handleDomZIndexReorderCommitRef,
    editQueueRef,
    projectIdRef,
  });

  const handleToggleTrackHidden = useTimelineTrackVisibilityEditing({
    projectIdRef,
    activeCompPath,
    timelineElements,
    showToast,
    writeProjectFile,
    recordEdit,
    previewIframeRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
    forceReloadSdkSession,
  });

  const handleToggleElementHidden = useTimelineElementVisibilityEditing({
    projectIdRef,
    activeCompPath,
    showToast,
    writeProjectFile,
    recordEdit,
    previewIframeRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
    forceReloadSdkSession,
  });

  const handleAutoGroupCarveSources = useAudioGroupCarveAssignment({
    projectIdRef,
    activeCompPath,
    showToast,
    writeProjectFile,
    recordEdit,
    previewIframeRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
    checkEditable,
  });

  const setElementFxAttribute = useSetElementAttribute({
    projectIdRef,
    activeCompPath,
    showToast,
    writeProjectFile,
    recordEdit,
    previewIframeRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
  });

  const setElementsAttribute = useSetElementsAttribute({
    projectIdRef,
    activeCompPath,
    showToast,
    writeProjectFile,
    recordEdit,
    previewIframeRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
  });

  const setAudioGroupAttribute = useSetAudioGroupAttribute({
    projectIdRef,
    activeCompPath,
    showToast,
    writeProjectFile,
    recordEdit,
    previewIframeRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
  });

  const { handleTimelineElementsDelete } = useTimelineDeleteOps({
    projectIdRef,
    activeCompPath,
    timelineElements,
    showToast,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    isRecordingRef,
    forceReloadSdkSession,
    previewIframeRef,
    handleTimelineGroupMove: groupEditing.handleTimelineGroupMove,
  });

  const { handleTimelineAssetDrop, handleTimelineFileDrop, handleTimelineCompositionDrop } =
    useTimelineAssetDropOps({
      projectIdRef,
      activeCompPath,
      timelineElements,
      showToast,
      writeProjectFile,
      recordEdit,
      reloadPreview,
      uploadProjectFiles,
      isRecordingRef,
      forceReloadSdkSession,
      observeProjectFileVersion,
      checkEditable,
    });

  const linkEditing = useTimelineLinkEditing({
    projectIdRef,
    activeCompPath,
    editQueueRef,
    pendingTimelineEditPathRef,
    isRecordingRef,
    showToast,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    forceReloadSdkSession,
    handleTimelineElementsDelete,
  });

  const handleBlockedTimelineEdit = useBlockedTimelineEditToast(showToast);
  const { handleRazorSplit, handleRazorSplitAll, handleFreezeFrame } = useRazorSplit({
    projectId,
    activeCompPath,
    showToast,
    writeProjectFile,
    observeProjectFileVersion,
    recordEdit,
    reloadPreview,
    isRecordingRef,
    forceReloadSdkSession,
  });

  const refused = (reason: string): TimelineEditOutcome => ({ status: "refused", reason });
  const audioGroupMembers = (groupId: string): TimelineElement[] => {
    const state = usePlayerStore.getState();
    const flatMembers = state.elements.filter((el) => el.audioGroup === groupId);
    const domMembers = state.domClipChildren
      .filter((child) => child.audioGroup === groupId)
      .map(
        (child): TimelineElement => ({
          id: child.id,
          domId: child.id,
          tag: "div",
          start: 0,
          duration: 0,
          track: -1,
        }),
      );
    return [...flatMembers, ...domMembers];
  };

  const audioGroupAttribute = {
    ...setAudioGroupAttribute,
    // Same two-array member lookup syncStoredGroupAttribute mirrors into
    // (timelineAudioGroupVolume.ts): a sub-composition's group members have
    // no flat twin, only a domClipChildren entry, so both are checked.
    setQuiet: track(
      guard(audioGroupMembers, setAudioGroupAttribute.setQuiet, (reason, groupId, attr) => {
        setAudioGroupAttribute.revertLive(groupId, attr);
        return refused(reason);
      }),
    ),
  };
  const stableAudioGroupAttribute = useStableHandlers(audioGroupAttribute, projectId);
  const elementFxAttribute = {
    ...setElementFxAttribute,
    setMany: track(guard((edits) => edits.map((edit) => edit.element), setElementsAttribute)),
    setQuiet: track(
      guard(
        (element) => [element],
        setElementFxAttribute.setQuiet,
        (reason, element, attr) => {
          setElementFxAttribute.revertLive(element, attr);
          return refused(reason);
        },
      ),
    ),
  };
  const stableElementFxAttribute = useStableHandlers(elementFxAttribute, projectId);
  // Every write-handler is tracked here, the one place all hand edits
  // converge, so undo never races a write; canEdit gates the same point.
  // Coverage boundary: see the PR body, not every kind resolves an element.
  const trackedRazorSplit = track(
    guard((element) => withLinkPartners([element]), handleRazorSplit),
  );
  const editing = {
    handleTimelineElementMove: track(guard((element) => [element], handleTimelineElementMove)),
    handleTimelineElementResize: track(guard((element) => [element], handleTimelineElementResize)),
    handleToggleTrackHidden: track(
      guard(
        (trackIndex) => timelineElements.filter((el) => el.track === trackIndex),
        handleToggleTrackHidden,
      ),
    ),
    handleToggleElementHidden: track(
      guard((elementKey) => {
        const keys = new Set(Array.isArray(elementKey) ? elementKey : [elementKey]);
        return timelineElements.filter((el) => keys.has(el.key ?? el.id));
      }, handleToggleElementHidden),
    ),
    handleAutoGroupCarveSources: track(handleAutoGroupCarveSources),
    setAudioGroupAttribute: stableAudioGroupAttribute,
    setElementFxAttribute: stableElementFxAttribute,
    handleTimelineElementDelete: track(
      guard((element) => withLinkPartners([element]), linkEditing.handleLinkedElementDelete),
    ),
    handleTimelineElementsDelete: track(
      guard(withLinkPartners, linkEditing.handleLinkedElementsDelete),
    ),
    handleTimelineElementDeleteOnly: track(
      guard((element) => [element], linkEditing.handleDeleteElementOnly),
    ),
    handleLinkEdit: track(guard(linkEditTargets, linkEditing.handleLinkEdit)),
    handleTimelineElementSplit: trackedRazorSplit,
    handleRazorSplit: trackedRazorSplit,
    handleFreezeFrame: track(guard((element) => [element], handleFreezeFrame)),
    // Same selection the handler itself splits (useRazorSplit.ts).
    handleRazorSplitAll: track(
      guard(
        (splitTime) => selectSplittableElements(usePlayerStore.getState().elements, splitTime),
        handleRazorSplitAll,
      ),
    ),
    handleTimelineAssetDrop: track(handleTimelineAssetDrop),
    handleTimelineFileDrop: track(handleTimelineFileDrop),
    handleTimelineCompositionDrop: track(handleTimelineCompositionDrop),
    handleBlockedTimelineEdit,
    handleTimelineGroupMove: track(
      guard((changes) => changes.map((c) => c.element), groupEditing.handleTimelineGroupMove),
    ),
    handleTimelineGroupResize: track(
      guard((changes) => changes.map((c) => c.element), groupEditing.handleTimelineGroupResize),
    ),
    restoreLiveLanes: (restore: Parameters<typeof setElementFxAttribute.restoreLive>[0]) => {
      setElementFxAttribute.restoreLive(restore);
      setAudioGroupAttribute.restoreLive(restore);
    },
  };
  return useStableHandlers(editing, projectId);
}
