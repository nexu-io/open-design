import { useI18n } from "../../i18n/I18n";
import type { ReactNode } from "react";
import { Timeline } from "../../player";
import type { TimelineElement, TimelineTimeRange } from "../../player";
import type { TimelineProps } from "../../player/components/TimelineTypes";
import type { BlockedTimelineEditIntent } from "../../player/components/timelineEditing";
import { AudioMeterStrip } from "./AudioMeterStrip";
import { useTimelineEditContext } from "../../contexts/TimelineEditContext";
import { useNLEContext } from "./NLEContext";
import { MotionTimelineMedia } from "../../motion/MotionTimelineMedia";

export interface TimelinePaneProps {
  /** Slot rendered above the timeline tracks (toolbar with split, delete, zoom) */
  timelineToolbar?: ReactNode;
  /** Slot rendered below the timeline tracks */
  timelineFooter?: ReactNode;
  /** Slot for a host's own overlay spanning the whole timeline area (e.g. a draft/ghost
   *  clip), positioned absolutely the same way PreviewPane's previewOverlay is. */
  timelineOverlay?: ReactNode;
  /** Custom clip content renderer for timeline (thumbnails, waveforms, etc.) */
  renderClipContent?: (
    element: TimelineElement,
    style: { clip: string; label: string },
  ) => ReactNode;
  onFileDrop?: (
    files: File[],
    placement?: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  onDeleteElement?: (element: TimelineElement) => Promise<void> | void;
  onAssetDrop?: (
    assetPath: string,
    placement: Pick<TimelineElement, "start" | "track">,
    duration?: number,
    reportFailure?: boolean,
  ) => Promise<void> | void;
  onBlockDrop?: (
    blockName: string,
    placement: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  onCompositionDrop?: (
    sourcePath: string,
    placement: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  onBlockedEditAttempt?: (element: TimelineElement, intent: BlockedTimelineEditIntent) => void;
  onSelectTimelineElement?: (element: TimelineElement | null) => void;
  onRangeSelect?: (range: TimelineTimeRange | null) => void;
  /** Copy/paste/duplicate act on the store's own selection, not a passed
   *  element, so unlike onDeleteElement they need no composition-basis wrapper. */
  onCopyClip?: () => boolean;
  onPasteClip?: () => Promise<void>;
  onDuplicateClip?: () => Promise<boolean>;
  canPasteClip?: () => boolean;
  clipMenuItems?: TimelineProps["clipMenuItems"];
  splitShortcut?: TimelineProps["splitShortcut"];
}

export function TimelinePane({
  timelineToolbar,
  timelineFooter,
  timelineOverlay,
  renderClipContent,
  onFileDrop,
  onDeleteElement,
  onAssetDrop,
  onBlockDrop,
  onCompositionDrop,
  onBlockedEditAttempt,
  onSelectTimelineElement,
  onRangeSelect,
  onCopyClip,
  onPasteClip,
  onDuplicateClip,
  canPasteClip,
  clipMenuItems,
  splitShortcut,
}: TimelinePaneProps) {
  const { t } = useI18n();
  const {
    projectId,
    seek,
    handleDrillDown,
    compositionStack,
    updateCompositionStack,
    timelineDisabled,
    timelineSessionEpoch,
  } = useNLEContext();

  // Move/resize/split come from the timeline edit context, not props.
  const { onMoveElement, onMoveElements, onResizeElement, onResizeElements, onSplitElement } =
    useTimelineEditContext();

  return (
    <div
      className="relative flex h-full flex-col"
      data-studio-timeline="true"
      aria-disabled={timelineDisabled || undefined}
    >
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-clip]")) return;
          if (timelineDisabled) return;
          if (compositionStack.length > 1) {
            updateCompositionStack((prev) => prev.slice(0, -1));
          }
        }}
      >
        <div className="shrink-0 motion-timeline-toolbar">{timelineToolbar}<MotionTimelineMedia projectId={projectId} compositionId={compositionStack.at(-1)?.id ?? 'master'} disabled={timelineDisabled || !onAssetDrop} onFileDrop={onFileDrop} onAssetDrop={onAssetDrop} /></div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <Timeline
              sessionEpoch={timelineSessionEpoch}
              onSeek={seek}
              onDrillDown={handleDrillDown}
              renderClipContent={renderClipContent}
              onFileDrop={onFileDrop}
              onDeleteElement={onDeleteElement}
              onAssetDrop={onAssetDrop}
              onBlockDrop={onBlockDrop}
              onCompositionDrop={onCompositionDrop}
              onMoveElement={onMoveElement}
              onMoveElements={onMoveElements}
              onResizeElement={onResizeElement}
              onResizeElements={onResizeElements}
              onBlockedEditAttempt={onBlockedEditAttempt}
              onSplitElement={onSplitElement}
              onSelectElement={onSelectTimelineElement}
              onRangeSelect={onRangeSelect}
              onCopyClip={onCopyClip}
              onPasteClip={onPasteClip}
              onDuplicateClip={onDuplicateClip}
              canPasteClip={canPasteClip}
              clipMenuItems={clipMenuItems}
              splitShortcut={splitShortcut}
            />
          </div>
          <AudioMeterStrip />
        </div>
      </div>
      {timelineFooter && <div className="shrink-0">{timelineFooter}</div>}
      {timelineOverlay && (
        <div className="pointer-events-none absolute inset-0 z-20">{timelineOverlay}</div>
      )}
      {timelineDisabled && (
        <div
          className="absolute inset-0 z-30 cursor-not-allowed bg-black/18 flex items-center justify-center"
          data-testid="timeline-loading-disabled-overlay"
          role="status"
          onPointerDown={(event) => event.preventDefault()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
        >
          <span className="rounded-md bg-neutral-900/90 px-2.5 py-1 text-[11px] text-neutral-400">
            {t("Loading composition…")}</span>
        </div>
      )}
    </div>
  );
}
