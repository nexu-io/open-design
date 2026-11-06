import type { TimelineElement } from "../player";
import type { CompositionDimensions } from "../components/renders/RenderQueue";
import type { FfmpegStatus } from "../components/renders/useFfmpegStatus";
import { useContext, useMemo, type ReactNode } from "react";
import { createStableContext } from "../utils/hmrStableContext";

export interface StudioShellValue {
  projectId: string;
  activeCompPath: string | null;
  setActiveCompPath: (path: string | null) => void;
  showToast: (message: string, tone?: "error" | "info") => void;
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  editHistory: {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | undefined;
    redoLabel: string | undefined;
  };
  /**
   * Why a composition write would be refused right now, or null when writes
   * are possible. Derived from the paused save queue and the external-file
   * conflict state, both of which are otherwise banners with no lock behind
   * them. One field rather than two, so there is one owner of the question.
   */
  writeBlockedReason: string | null;
  handleUndo: () => Promise<void>;
  handleRedo: () => Promise<void>;
  renderQueue: {
    jobs: unknown[];
    isRendering: boolean;
    loadError: string | null;
    actionError: string | null;
    dismissActionError: () => void;
    reloadRenders: () => void;
    deleteRender: (jobId: string) => void;
    cancelRender: (jobId: string) => void;
    clearCompleted: () => void;
    startRender: (options: unknown) => Promise<void>;
    /** Encoder availability. `null` means "no answer", not "missing". */
    ffmpeg: FfmpegStatus | null;
    /** True only when the server positively reported no usable FFmpeg. */
    ffmpegMissing: boolean;
    ffmpegChecking: boolean;
    recheckFfmpeg: () => void;
  };
  compositionDimensions: CompositionDimensions | null;
  waitForPendingDomEditSaves: () => Promise<void>;
  handlePreviewIframeRef: (iframe: HTMLIFrameElement | null) => void;
}

export interface StudioPlaybackValue {
  captionEditMode: boolean;
  compositionLoading: boolean;
  refreshKey: number;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  timelineElements: TimelineElement[];
  isPlaying: boolean;
  refreshPreviewDocumentVersion: () => void;
}

export type StudioContextValue = StudioShellValue & StudioPlaybackValue;

const StudioShellContext = createStableContext<StudioShellValue | null>("StudioShellContext", null);
const StudioPlaybackContext = createStableContext<StudioPlaybackValue | null>(
  "StudioPlaybackContext",
  null,
);

export function useStudioShellContext(): StudioShellValue {
  const ctx = useContext(StudioShellContext);
  if (!ctx) throw new Error("useStudioShellContext must be used within StudioShellProvider");
  return ctx;
}

/**
 * Optional access — returns null outside a provider. Lets the player-package
 * <Timeline> (a public standalone export) read shell state when embedded in the
 * NLE without hard-requiring the provider in standalone/test mounts.
 */
export function useStudioShellContextOptional(): StudioShellValue | null {
  return useContext(StudioShellContext);
}

export function useStudioPlaybackContext(): StudioPlaybackValue {
  const ctx = useContext(StudioPlaybackContext);
  if (!ctx) throw new Error("useStudioPlaybackContext must be used within StudioPlaybackProvider");
  return ctx;
}

export function useStudioPlaybackContextOptional(): StudioPlaybackValue | null {
  return useContext(StudioPlaybackContext);
}

/** @deprecated Use useStudioShellContext and/or useStudioPlaybackContext instead. */
// fallow-ignore-next-line unused-export
export function useStudioContext(): StudioContextValue {
  const shell = useStudioShellContext();
  const playback = useStudioPlaybackContext();
  return useMemo(() => ({ ...shell, ...playback }), [shell, playback]);
}

export function StudioShellProvider({
  value,
  children,
}: {
  value: StudioShellValue;
  children: ReactNode;
}) {
  const {
    projectId,
    activeCompPath,
    setActiveCompPath,
    showToast,
    previewIframeRef,
    editHistory,
    writeBlockedReason,
    handleUndo,
    handleRedo,
    renderQueue,
    compositionDimensions,
    waitForPendingDomEditSaves,
    handlePreviewIframeRef,
  } = value;

  const stable = useMemo<StudioShellValue>(
    () => ({
      projectId,
      activeCompPath,
      setActiveCompPath,
      showToast,
      previewIframeRef,
      editHistory,
      writeBlockedReason,
      handleUndo,
      handleRedo,
      renderQueue,
      compositionDimensions,
      waitForPendingDomEditSaves,
      handlePreviewIframeRef,
    }),
    [
      projectId,
      activeCompPath,
      compositionDimensions,
      editHistory,
      renderQueue,
      setActiveCompPath,
      showToast,
      previewIframeRef,
      writeBlockedReason,
      handleUndo,
      handleRedo,
      waitForPendingDomEditSaves,
      handlePreviewIframeRef,
    ],
  );
  return <StudioShellContext value={stable}>{children}</StudioShellContext>;
}

export function StudioPlaybackProvider({
  value,
  children,
}: {
  value: StudioPlaybackValue;
  children: ReactNode;
}) {
  const {
    captionEditMode,
    compositionLoading,
    refreshKey,
    setRefreshKey,
    timelineElements,
    isPlaying,
    refreshPreviewDocumentVersion,
  } = value;

  const stable = useMemo<StudioPlaybackValue>(
    () => ({
      captionEditMode,
      compositionLoading,
      refreshKey,
      setRefreshKey,
      timelineElements,
      isPlaying,
      refreshPreviewDocumentVersion,
    }),
    [
      captionEditMode,
      compositionLoading,
      refreshKey,
      timelineElements,
      isPlaying,
      setRefreshKey,
      refreshPreviewDocumentVersion,
    ],
  );
  return <StudioPlaybackContext value={stable}>{children}</StudioPlaybackContext>;
}

/** @deprecated Use StudioShellProvider and StudioPlaybackProvider instead. */
// fallow-ignore-next-line unused-export
export function StudioProvider({
  value,
  children,
}: {
  value: StudioContextValue;
  children: ReactNode;
}) {
  return (
    <StudioShellProvider value={value}>
      <StudioPlaybackProvider value={value}>{children}</StudioPlaybackProvider>
    </StudioShellProvider>
  );
}
