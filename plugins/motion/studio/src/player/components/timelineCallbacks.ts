// fallow-ignore-file code-duplication
import type { TimelineEditOutcome } from "../../hooks/timelineEditPermission";
import type { TimelineElement } from "../store/playerStore";
import type {
  TimelineMoveOperation,
  TimelineAtomicMoveUpdates,
} from "../../hooks/timelineMoveAdapter";
import type { BlockedTimelineEditIntent } from "./timelineEditing";
import type { PropertyGroupName } from "@hyperframes/core/gsap-parser";
import type { TimelineKeyframeTarget } from "./timelineKeyframeIdentity";

export interface TimelinePropertyGroupKeyframeToggle {
  animationId: string;
  propertyGroup: PropertyGroupName;
  tweenPercentage: number;
  properties: Record<string, number | string>;
  remove: boolean;
}

/** Where an outside drop lands; `insertRow` opens a new track at that row boundary of `trackOrder`. */
export type TimelineDropPlacement = { start: number; track: number } & (
  | { insertRow?: null; trackOrder?: undefined }
  | { insertRow: number; trackOrder: readonly number[] }
);

/**
 * Shared callback signatures for timeline editing operations.
 * Used by NLELayout, Timeline, and any component that passes through
 * the standard set of timeline mutation handlers.
 */
export interface TimelineDropCallbacks {
  onFileDrop?: (files: File[], placement?: TimelineDropPlacement) => Promise<void> | void;
  onAssetDrop?: (assetPath: string, placement: TimelineDropPlacement) => Promise<void> | void;
  onBlockDrop?: (
    blockName: string,
    placement: { start: number; track: number },
  ) => Promise<void> | void;
  onCompositionDrop?: (
    sourcePath: string,
    placement: { start: number; track: number },
  ) => Promise<void> | void;
}

export type TimelineLinkEdit =
  | { kind: "unlink"; elements: readonly TimelineElement[] }
  | { kind: "link"; elements: readonly TimelineElement[] }
  | { kind: "detach"; element: TimelineElement }
  | { kind: "merge"; video: TimelineElement; audio: TimelineElement }
  | { kind: "move-into-sync"; element: TimelineElement; start: number }
  | { kind: "slip-into-sync"; element: TimelineElement; mediaStart: number };

export interface TimelineEditCallbacks {
  onMoveElement?: (
    element: TimelineElement,
    updates: TimelineAtomicMoveUpdates,
  ) => Promise<void> | void;
  /** Atomic multi-clip move (single undo) for main-track ripple + track-insert.
   *  `coalesceKey` (drag-commit gesture id) merges the move history entry with a
   *  lane change's follow-up z-reorder entry into one undo step. */
  onMoveElements?: (
    edits: Array<{ element: TimelineElement; updates: TimelineAtomicMoveUpdates }>,
    coalesceKey?: string,
    operation?: TimelineMoveOperation,
  ) => Promise<void> | void;
  onResizeElement?: (
    element: TimelineElement,
    updates: Pick<TimelineElement, "start" | "duration" | "playbackStart">,
  ) => Promise<void> | void;
  onResizeElements?: (
    changes: Array<{
      element: TimelineElement;
      start: number;
      duration: number;
      playbackStart?: number;
    }>,
    options?: { coalesceKey?: string },
  ) => Promise<void> | void;
  /**
   * `displayNumber` is the row the CLICKED control announced. It travels with
   * the click because the header and the undo-history label derive the row from
   * two different orderings: the header's comes from the group-aware row list
   * (synthetic anchor rows, members pulled contiguous), the history's from a
   * plain ascending sort of element-bearing keys. Once a group exists those
   * disagree, so the same click said "Hide track 2" and recorded "Hide track 1".
   * Passing the rendered number keeps one answer instead of two derivations.
   */
  onToggleTrackHidden?: (
    track: number,
    hidden: boolean,
    displayNumber?: number | null,
  ) => Promise<void> | void;
  /** B7's bus strip: live-write the group's own attribute while dragging. */
  onSetAudioGroupAttributeLive?: (groupId: string, attr: string, value: string | null) => void;
  onRevertAudioGroupAttributeLive?: (groupId: string, attr: string) => void;
  /** ...and persist one undo entry on release. */
  onSetAudioGroupAttributeQuiet?: (
    groupId: string,
    attr: string,
    value: string | null,
    label: string,
  ) => Promise<TimelineEditOutcome | void>;
  /** C1's ungrouped-track FX pointer: "Group these clips" — write
   *  `data-audio-group` on every one of them, atomically. Same shape B6's
   *  carve auto-grouping uses. */
  onGroupClips?: (
    clipIds: readonly string[],
    groupId: string,
    groupLabel?: string,
  ) => Promise<void>;
  /** C1's single-clip FX write: addressed by the clip itself rather than the
   *  current selection, mirroring `onSetAudioGroupAttributeLive/Quiet`. */
  onSetElementAttributeLive?: (
    element: TimelineElement,
    attr: string,
    value: string | null,
  ) => void;
  onRevertElementAttributeLive?: (element: TimelineElement, attr: string) => void;
  onSetElementAttributeQuiet?: (
    element: TimelineElement,
    attr: string,
    value: string | null,
    label: string,
  ) => Promise<TimelineEditOutcome | void>;
  /** One attribute on several clips, saved as one undo step. */
  onSetElementsAttributeQuiet?: (
    edits: ReadonlyArray<{ element: TimelineElement; value: string | null }>,
    attr: string,
    label: string,
  ) => Promise<TimelineEditOutcome | void>;
  onBlockedEditAttempt?: (element: TimelineElement, intent: BlockedTimelineEditIntent) => void;
  onLinkEdit?: (edit: TimelineLinkEdit) => Promise<void> | void;
  onDeleteElementOnly?: (element: TimelineElement) => Promise<void> | void;
  onSplitElement?: (element: TimelineElement, splitTime: number) => Promise<void> | void;
  onRazorSplit?: (element: TimelineElement, splitTime: number) => Promise<void> | void;
  onRazorSplitAll?: (splitTime: number) => Promise<void> | void;
  onFreezeFrame?: (element: TimelineElement, time: number) => Promise<void> | void;
  clipMenuTools?: boolean;
  onNotice?: (message: string, tone?: "error" | "info") => void;
  onDeleteKeyframe?: (elementId: string, keyframe: TimelineKeyframeTarget) => void;
  onDeleteAllKeyframes?: (element: TimelineElement, animationId?: string) => void;
  onMoveKeyframeToPlayhead?: (element: TimelineElement, keyframe: TimelineKeyframeTarget) => void;
  /** Drag-to-retime: `keyframe` identifies the dragged keyframe (its percentage
   *  is clip-relative), `toClipPercentage` is the neighbour-clamped drop. */
  onMoveKeyframe?: (
    elementId: string,
    keyframe: TimelineKeyframeTarget,
    toClipPercentage: number,
  ) => Promise<boolean>;
  onToggleKeyframeAtPlayhead?: (element: TimelineElement) => void;
  onTogglePropertyGroupKeyframe?: (
    element: TimelineElement,
    target: TimelinePropertyGroupKeyframeToggle,
  ) => Promise<void> | void;
}
