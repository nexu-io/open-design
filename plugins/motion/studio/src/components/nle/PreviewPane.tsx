import { useCallback, useRef, useSyncExternalStore, type ReactNode } from "react";
import { PlayerControls } from "../../player";
import type { TimelineElement } from "../../player";
import { NLEPreview } from "./NLEPreview";
import { CompositionBreadcrumb } from "./CompositionBreadcrumb";
import { usePreviewBlockDrop } from "./usePreviewBlockDrop";
import { useNLEContext } from "./NLEContext";
import { AssetPreviewOverlay } from "./AssetPreviewOverlay";
import { PreviewGuides } from "../editor/PreviewGuides";
import { PreviewOverlayProvider } from "../editor/PreviewOverlayProvider";

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

function getFullscreenElement() {
  return document.fullscreenElement;
}

// Clear the timeline selection when a pointer lands outside the composition
// frame (clicks *inside* the frame are handled by the DOM-edit overlay).
// fallow-ignore-next-line complexity
function deselectIfPointerOutsideFrame(
  e: React.PointerEvent,
  iframe: HTMLIFrameElement | null,
  onDeselect?: (element: null) => void,
): void {
  const el = iframe?.parentElement ?? iframe;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const outside =
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom;
  if (outside) onDeselect?.(null);
}

export interface PreviewPaneProps {
  portrait?: boolean;
  /** Slot for overlays rendered on top of the preview (cursors, highlights, etc.) */
  previewOverlay?: ReactNode;
  onSelectTimelineElement?: (element: TimelineElement | null) => void;
  onPreviewBlockDrop?: (
    blockName: string,
    position: { left: number; top: number },
  ) => Promise<void> | void;
}

// fallow-ignore-next-line complexity
export function PreviewPane({
  portrait,
  previewOverlay,
  onSelectTimelineElement,
  onPreviewBlockDrop,
}: PreviewPaneProps) {
  const {
    projectId,
    iframeRef,
    togglePlay,
    seek,
    onIframeLoad,
    previewSlots,
    onShadowIframeLoad,
    onShadowReadyChange,
    onShadowError,
    setShadowIframeNode,
    resetPreviewSlots,
    compositionStack,
    handleNavigateComposition,
    setCompositionLoading,
    timelineDisabled,
    hasLoadedOnceRef,
    previewCompositionSize,
    setPreviewCompositionSize,
  } = useNLEContext();

  const stageRefForDrop = useRef<HTMLDivElement | null>(null);
  const handleStageRef = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    stageRefForDrop.current = ref.current;
  }, []);

  const {
    isDragOver: previewDragOver,
    handleDragEnter: handlePreviewDragEnter,
    handleDragOver: handlePreviewDragOver,
    handleDragLeave: handlePreviewDragLeave,
    handleDrop: handlePreviewDrop,
  } = usePreviewBlockDrop({
    portrait,
    compositionSize: previewCompositionSize,
    stageRef: stageRefForDrop as React.RefObject<HTMLDivElement | null>,
    onBlockDrop: onPreviewBlockDrop,
  });

  // Preview-only fullscreen: fullscreen targets THIS pane's container, so the
  // browser shows only the preview (sidebars + timeline are excluded naturally).
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenElement = useSyncExternalStore(subscribeFullscreen, getFullscreenElement);
  const isFullscreen = fullscreenElement === containerRef.current && fullscreenElement != null;

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current.requestFullscreen();
    }
  }, []);

  const currentLevel = compositionStack[compositionStack.length - 1];
  const directUrl = compositionStack.length > 1 ? currentLevel.previewUrl : undefined;

  return (
    <div
      ref={containerRef}
      // A recessed well inset in its dock card; dropped in fullscreen so the
      // preview fills the screen edge-to-edge. The player stays dark in both themes.
      className={`scheme-dark flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--studio-preview-bg,var(--color-neutral-950))] ${
        isFullscreen ? "" : "m-3 rounded-md border border-border"
      }`}
      data-studio-fullscreen-target=""
    >
      <div
        className="flex-1 min-h-0 relative overflow-hidden"
        data-preview-pan-surface="true"
        onPointerDown={(e) =>
          deselectIfPointerOutsideFrame(e, iframeRef.current, onSelectTimelineElement)
        }
        onDragEnter={handlePreviewDragEnter}
        onDragOver={handlePreviewDragOver}
        onDragLeave={handlePreviewDragLeave}
        onDrop={handlePreviewDrop}
      >
        <div className="absolute inset-0 overflow-hidden">
          <NLEPreview
            projectId={projectId}
            iframeRef={iframeRef}
            onIframeLoad={onIframeLoad}
            previewSlots={previewSlots}
            onShadowIframeLoad={onShadowIframeLoad}
            onShadowReadyChange={onShadowReadyChange}
            onShadowError={onShadowError}
            setShadowIframeNode={setShadowIframeNode}
            resetPreviewSlots={resetPreviewSlots}
            onCompositionLoadingChange={setCompositionLoading}
            portrait={portrait}
            directUrl={directUrl}
            suppressLoadingOverlay={hasLoadedOnceRef.current}
            onStageRef={handleStageRef}
            onCompositionSizeChange={setPreviewCompositionSize}
          />
          {previewDragOver && (
            <div className="absolute inset-2 z-40 rounded-lg border-2 border-dashed border-studio-accent/50 bg-studio-accent/4 pointer-events-none" />
          )}
          <AssetPreviewOverlay />
        </div>
        <PreviewOverlayProvider>
          <PreviewGuides />
          {!isFullscreen && previewOverlay}
        </PreviewOverlayProvider>
      </div>
      {/* Transport row: no own background or border — the controls sit flat on
          the preview panel's surface (CapCut-style). */}
      <div className="shrink-0">
        {!isFullscreen && compositionStack.length > 1 && (
          <CompositionBreadcrumb stack={compositionStack} onNavigate={handleNavigateComposition} />
        )}
        <PlayerControls
          onTogglePlay={togglePlay}
          onSeek={seek}
          disabled={timelineDisabled}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
    </div>
  );
}
