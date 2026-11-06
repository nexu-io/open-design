import { useCallback, useMemo, type DragEvent } from "react";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { StudioContextValue } from "../contexts/StudioContext";
import type { PanelId } from "../components/dock/panelRegistry";
import type { TimelineFileDropHandler } from "./useTimelineEditingTypes";
import { usePlayerStore } from "../player";

interface StudioContextInput {
  projectId: string;
  activeCompPath: string | null;
  setActiveCompPath: (path: string | null) => void;
  showToast: (message: string, tone?: "error" | "info") => void;
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  captionEditMode: boolean;
  compositionLoading: boolean;
  refreshKey: number;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  timelineElements: StudioContextValue["timelineElements"];
  isPlaying: boolean;
  editHistory: {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | undefined;
    redoLabel: string | undefined;
  };
  handleUndo: StudioContextValue["handleUndo"];
  handleRedo: StudioContextValue["handleRedo"];
  // Was a second copy of the same shape, which meant every field added to the
  // context had to be added here too or the build broke. Same idiom as the
  // fields around it: the context type owns it.
  renderQueue: StudioContextValue["renderQueue"];
  compositionDimensions: { width: number; height: number } | null;
  /** Message from `usePreviewPersistence` when auto-save is paused. */
  domEditSaveQueuePaused: string | null;
  /** True when an external edit to the open file is awaiting the user's decision. */
  externalFileConflict: boolean;
  waitForPendingDomEditSaves: () => Promise<void>;
  handlePreviewIframeRef: (iframe: HTMLIFrameElement | null) => void;
  refreshPreviewDocumentVersion: () => void;
}

// fallow-ignore-next-line complexity
export function buildStudioContextValue(input: StudioContextInput): StudioContextValue {
  return {
    projectId: input.projectId,
    activeCompPath: input.activeCompPath,
    setActiveCompPath: input.setActiveCompPath,
    showToast: input.showToast,
    previewIframeRef: input.previewIframeRef,
    captionEditMode: input.captionEditMode,
    compositionLoading: input.compositionLoading,
    refreshKey: input.refreshKey,
    setRefreshKey: input.setRefreshKey,

    timelineElements: input.timelineElements,
    isPlaying: input.isPlaying,
    editHistory: input.editHistory,
    // Conflict first: when both are true the conflict is the one the user has
    // been asked to decide, and resolving it is what unblocks the queue.
    writeBlockedReason: input.externalFileConflict
      ? "an external change to this file is waiting to be resolved"
      : input.domEditSaveQueuePaused,
    handleUndo: input.handleUndo,
    handleRedo: input.handleRedo,
    renderQueue: input.renderQueue,
    compositionDimensions: input.compositionDimensions,
    waitForPendingDomEditSaves: input.waitForPendingDomEditSaves,
    handlePreviewIframeRef: input.handlePreviewIframeRef,
    refreshPreviewDocumentVersion: input.refreshPreviewDocumentVersion,
  };
}

export interface InspectorState {
  inspectorPanelActive: boolean;
  shouldShowMotionPath: boolean;
  shouldShowSelectedDomBounds: boolean;
}

export function useInspectorState(
  rightPanel: PanelId | null,
  isPlaying: boolean,
  domEditSelection: DomEditSelection | null,
  isGestureRecording?: boolean,
): InspectorState {
  return useMemo(() => {
    const inspectorPanelActive = rightPanel === "layers" || rightPanel === "design";
    return {
      inspectorPanelActive,
      // Deliberately wider than shouldShowSelectedDomBounds: the on-canvas path
      // handles ARE the arc-drag affordance, so gating them on an open Inspector
      // would make keyframe path editing reachable only from a side panel.
      shouldShowMotionPath: !!domEditSelection && !isPlaying && !isGestureRecording,
      // Keep the selection box drawn even when the Inspector is collapsed —
      // closing the panel shouldn't visually deselect the element.
      // The Variables tab also works against the canvas selection (bind card),
      // so the selection outline stays visible there too.
      shouldShowSelectedDomBounds:
        (inspectorPanelActive || rightPanel === "variables") && !isPlaying && !isGestureRecording,
    };
  }, [rightPanel, isPlaying, isGestureRecording, domEditSelection]);
}

/** Lets an OS file drop reach `onDrop` anywhere in the shell; the timeline shows its own landing preview. */
function useFileDropTarget(onImportFiles: (files: FileList) => void) {
  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer.files.length) onImportFiles(e.dataTransfer.files);
    },
    [onImportFiles],
  );
  return { onDragOver, onDrop };
}

/** Global OS file drop: imports and places at the playhead position. */
export function useGlobalFileDrop(handleTimelineFileDrop: TimelineFileDropHandler) {
  const onDrop = useCallback(
    (files: FileList) => {
      const start = usePlayerStore.getState().currentTime;
      void handleTimelineFileDrop(Array.from(files), { start, track: 0 });
    },
    [handleTimelineFileDrop],
  );
  return useFileDropTarget(onDrop);
}
