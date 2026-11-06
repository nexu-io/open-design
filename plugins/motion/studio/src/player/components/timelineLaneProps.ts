import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { MusicBeatAnalysis } from "@hyperframes/core/beats";
import type { TimelineElement, KeyframeCacheEntry } from "../store/playerStore";
import type { TimelineKeyframeTarget } from "./timelineKeyframeIdentity";
import type { TimelineTheme } from "./timelineTheme";
import type { TrackVisualStyle } from "./timelineIcons";
import type { DraggedClipState, ResizingClipState, BlockedClipState } from "./useTimelineClipDrag";
import type { TimelineClipIndex, TimelineTimeRange } from "../lib/timelineClipIndex";
import type { TimelineRowGeometry } from "./timelineLayout";
import type { TimelineSnapTarget } from "./timelineSnapping";
import type { TimelineVirtualRow } from "./useTimelineVirtualRows";
import type { MultiDragPreviewInput } from "./timelineMultiDragPreview";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";
import type { TimelineProps } from "./TimelineTypes";
import type { TimelineTrackGroupInfo } from "./useTimelineTrackDerivations";

/**
 * Props shared by the scroll container ({@link import("./TimelineCanvas")}) and
 * the lane renderer ({@link import("./TimelineLanes")}). TimelineCanvas passes
 * these straight through via spread, so they are declared once here and both
 * prop types compose from this base — no duplicated prop list. Kept in its own
 * module so neither side has to import the other just to name the contract.
 */
export interface TimelineLaneBaseProps {
  pps: number;
  contentOrigin: number;
  contentGutter: number;
  trackContentWidth: number;
  theme: TimelineTheme;
  showAudioEffects?: boolean;
  displayTrackOrder: number[];
  rowHeights: readonly number[];
  rowGeometry: TimelineRowGeometry;
  virtualRows: readonly TimelineVirtualRow[];
  logicalRows: readonly TimelineLogicalRow[];
  focusedTargetId: string | null;
  rowsVirtualized: boolean;
  clipIndex: TimelineClipIndex;
  renderTimeRange: TimelineTimeRange;
  visibleTimeRange: TimelineTimeRange;
  pinnedClipIdentities: ReadonlySet<string>;
  trackOrder: number[];
  tracks: [number, TimelineElement[]][];
  trackStyles: Map<number, TrackVisualStyle>;
  laneCounts: ReadonlyMap<string, number>;
  selectedElementId: string | null;
  selectedElementIds: Set<string>;
  hoveredClip: string | null;
  draggedClip: DraggedClipState | null;
  blockedClipRef: React.RefObject<BlockedClipState | null>;
  suppressClickRef: React.RefObject<boolean>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  renderClipContent?: TimelineProps["renderClipContent"];
  renderClipOverlay?: TimelineProps["renderClipOverlay"];
  onDrillDown?: (element: TimelineElement) => void;
  onSelectElement?: (element: TimelineElement | null) => void;
  setHoveredClip: (key: string | null) => void;
  setShowPopover: (v: boolean) => void;
  setRangeSelection: (v: null) => void;
  setResizingClip: (v: ResizingClipState | null) => void;
  setDraggedClip: (v: DraggedClipState | null) => void;
  setSelectedElementId: (id: string | null) => void;
  getPreviewElement: (element: TimelineElement) => TimelineElement;
  getTrackStyle: (tag: string) => TrackVisualStyle;
  keyframeCache?: Map<string, KeyframeCacheEntry>;
  gsapAnimations: Map<string, GsapAnimation[]>;
  selectedKeyframes: Set<string>;
  currentTime: number;
  onSeek?: (time: number) => void;
  onSelectSegment?: (elementId: string, target: TimelineKeyframeTarget) => void;
  onClickKeyframe?: (element: TimelineElement, target: TimelineKeyframeTarget) => void;
  onShiftClickKeyframe?: (elementId: string, target: TimelineKeyframeTarget) => void;
  onContextMenuKeyframe?: (
    e: React.MouseEvent,
    elementId: string,
    target: TimelineKeyframeTarget,
  ) => void;
  onMoveKeyframe?: (
    elementId: string,
    keyframe: TimelineKeyframeTarget,
    toClipPercentage: number,
    propertyGroup?: string,
    tweenPercentage?: number,
    animationId?: string,
  ) => Promise<boolean>;
  onContextMenuClip?: (e: React.MouseEvent, element: TimelineElement) => void;
  /**
   * Right-click on EMPTY lane space (not on a clip — those preventDefault
   * before this fires — not the gutter/ruler, not below the lanes). `time` is
   * the timeline time (seconds) under the pointer on that lane.
   */
  onContextMenuLane?: (e: React.MouseEvent, track: number, time: number) => void;
  beatAnalysis?: MusicBeatAnalysis | null;
  /** Resolved audio groups, positioned in row order — see useTimelineTrackDerivations. */
  groups: readonly TimelineTrackGroupInfo[];
}

/**
 * {@link TimelineLaneBaseProps} plus the handful of props only the lane
 * renderer ({@link import("./TimelineLanes")}) itself needs — the drag-preview
 * state and the edit callbacks TimelineCanvas does not otherwise touch.
 */
export interface TimelineLanesProps extends TimelineLaneBaseProps {
  /** Live-derived by TimelineCanvas from {@link TimelineLaneBaseProps.draggedClip}. */
  draggedElement: TimelineElement | null;
  /** Live move or trim snap target, resolved once by TimelineCanvas. */
  snapGuide: TimelineSnapTarget | null;
  multiDragPreview: MultiDragPreviewInput | null;
  onToggleTrackHidden: TimelineEditCallbacks["onToggleTrackHidden"];
  onTogglePropertyGroupKeyframe: TimelineEditCallbacks["onTogglePropertyGroupKeyframe"];
  onResizeElement: TimelineEditCallbacks["onResizeElement"];
  onMoveElement: TimelineEditCallbacks["onMoveElement"];
  onRazorSplit: TimelineEditCallbacks["onRazorSplit"];
  onRazorSplitAll: TimelineEditCallbacks["onRazorSplitAll"];
}
