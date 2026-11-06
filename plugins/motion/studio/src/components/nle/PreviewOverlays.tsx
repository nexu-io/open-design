import { useI18n } from "../../i18n/I18n";
import { useCallback } from "react";
import { CaptionOverlay } from "../../captions/components/CaptionOverlay";
import { useCaptionStore } from "../../captions/store";
import { ConnectedDomEditOverlay } from "../editor/ConnectedDomEditOverlay";
import { TopologyLens } from "../editor/TopologyLens";
import { MotionPathOverlay } from "../editor/MotionPathOverlay";
import { SnapToolbar } from "../editor/SnapToolbar";
import { GridOverlay } from "../editor/GridOverlay";
import { usePreviewReadOnly } from "../editor/previewReadOnlyContext";
import { useCompositionDimensions } from "../../hooks/useCompositionDimensions";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import { useDomEditSelectionContext } from "../../contexts/DomEditContext";
import type { BlockPreviewInfo } from "../sidebar/BlocksTab";
import type { GestureRecordingState } from "../editor/GestureRecordControl";
import type { ReactNode } from "react";

export interface PreviewOverlaysProps {
  shouldShowMotionPath: boolean;
  shouldShowSelectedDomBounds: boolean;
  blockPreview?: BlockPreviewInfo | null;
  isGestureRecording?: boolean;
  recordingState?: GestureRecordingState;
  onToggleRecording?: () => void;
  gestureOverlay?: ReactNode;
}

// fallow-ignore-next-line complexity
export function PreviewOverlays({
  shouldShowMotionPath,
  shouldShowSelectedDomBounds,
  blockPreview,
  isGestureRecording,
  gestureOverlay,
}: PreviewOverlaysProps) {
  const { t } = useI18n();
  const { activeCompPath, previewIframeRef } = useStudioShellContext();
  const { captionEditMode, compositionLoading, isPlaying } = useStudioPlaybackContext();
  const compositionDimensions = useCompositionDimensions(previewIframeRef);
  const readOnly = usePreviewReadOnly();
  const previewCaptionEditMode = captionEditMode && !readOnly;

  // Caption edit mode is entered automatically when captions are detected;
  // these give the author an explicit way OUT (and back in). Without them the
  // caption overlay permanently replaces normal element editing.
  const captionModelPresent = useCaptionStore((state) => state.model !== null);
  const captionDismissed = useCaptionStore((state) => state.dismissed);
  const captionSyncError = useCaptionStore((state) => state.syncError);
  const exitCaptionMode = useCallback(() => {
    const store = useCaptionStore.getState();
    store.clearSelection();
    store.setDismissed(true);
    store.setEditMode(false);
  }, []);
  const enterCaptionMode = useCallback(() => {
    const store = useCaptionStore.getState();
    store.setDismissed(false);
    store.setEditMode(true);
  }, []);

  const { domEditSelection } = useDomEditSelectionContext();

  if (blockPreview) {
    return (
      <>
        <TopologyLens iframeRef={previewIframeRef} activeCompositionPath={activeCompPath} />
        <div className="absolute inset-0 z-30 bg-black pointer-events-none">
          {blockPreview.videoUrl ? (
            <video
              src={blockPreview.videoUrl}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-contain"
            />
          ) : blockPreview.posterUrl ? (
            <img
              src={blockPreview.posterUrl}
              alt={blockPreview.title}
              className="w-full h-full object-contain"
            />
          ) : null}
        </div>
      </>
    );
  }

  if (previewCaptionEditMode) {
    return (
      <>
        <TopologyLens iframeRef={previewIframeRef} activeCompositionPath={activeCompPath} />
        <CaptionOverlay iframeRef={previewIframeRef} />
        {/* Mode indicator + explicit exit */}
        <div className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2 z-60 flex items-center gap-2 rounded-full border border-studio-accent/40 bg-black/70 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-studio-accent" aria-hidden="true" />
          <span className="text-2xs text-neutral-200">{t("Editing captions")}</span>
          <button
            type="button"
            onClick={exitCaptionMode}
            className="rounded-sm text-2xs text-neutral-400 underline underline-offset-2 hover:text-neutral-100 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-studio-accent"
          >
            {t("Exit")}</button>
        </div>
        {captionSyncError && (
          <div
            role="alert"
            className="pointer-events-auto absolute top-10 left-1/2 -translate-x-1/2 z-60 flex items-center gap-2 rounded-full border border-red-500/50 bg-red-950/90 px-2.5 py-1"
          >
            <span className="text-2xs text-red-200">{captionSyncError}</span>
            <button
              type="button"
              onClick={() => useCaptionStore.getState().retrySave?.()}
              className="rounded-sm text-2xs text-red-100 underline underline-offset-2 hover:text-white"
            >
              {t("Retry")}</button>
            <button
              type="button"
              onClick={() => useCaptionStore.getState().setSyncError(null)}
              aria-label={t("Dismiss")}
              className="rounded-sm px-0.5 text-2xs text-red-300/70 hover:text-red-100"
            >
              ✕
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <TopologyLens iframeRef={previewIframeRef} activeCompositionPath={activeCompPath} />
      <GridOverlay />
      <ConnectedDomEditOverlay
        activeCompositionPath={activeCompPath}
        showHoverSelection={!previewCaptionEditMode && !compositionLoading && !isPlaying}
        shouldShowSelectedDomBounds={shouldShowSelectedDomBounds}
        isGestureRecording={isGestureRecording}
      />
      <SnapToolbar />
      {!readOnly && (
        <MotionPathOverlay
          iframeRef={previewIframeRef}
          selection={shouldShowMotionPath ? domEditSelection : null}
          compositionSize={compositionDimensions}
          isPlaying={isPlaying}
        />
      )}
      {gestureOverlay}
      {captionModelPresent && captionDismissed && (
        <button
          type="button"
          onClick={enterCaptionMode}
          className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2 z-60 rounded-full border border-neutral-700 bg-black/60 px-2.5 py-1 text-2xs text-neutral-300 transition-colors hover:border-studio-accent/50 hover:text-accent-ink focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-studio-accent"
        >
          {t("Edit captions")}</button>
      )}
    </>
  );
}
