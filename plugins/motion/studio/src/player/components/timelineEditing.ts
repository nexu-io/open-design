import { formatTime } from "../lib/time";
import { roundToCenti } from "../../utils/rounding";
import type { StackingTimelineLayer, TimelineLayerId } from "./timelineTrackOrder";
import { resolveTimelineLayerStackingMove } from "./timelineLayerDrag";
import { shouldShowTimelineLayerGroupHeader } from "./TimelineLayerGroupHeader";
import type { TimelineStackingElement, TimelineStackingReorderIntent } from "./timelineStacking";
import type { TimelineEditCapabilities } from "./timelineEditCapabilities";

export {
  getTimelineEditCapabilities,
  hasPatchableTimelineTarget,
} from "./timelineEditCapabilities";
export type { TimelineEditCapabilities } from "./timelineEditCapabilities";

import {
  applyClipStartTrimDelta,
  clipStartTrimDeltaBounds,
  resolveTimelineMinDuration,
} from "./timelineGroupEditing";

export {
  clampTimelineGroupResizeDelta,
  resolveTimelineGroupMove,
  resolveTimelineGroupResize,
  type TimelineGroupResizeEdge,
  type TimelineGroupTimingMember,
} from "./timelineGroupEditing";

export {
  type TimelineStackingElement,
  type TimelineStackingReorderIntent,
} from "./timelineStacking";

const roundToCentiseconds = roundToCenti;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const EDGE_TRACK_CREATE_THRESHOLD = 0.55;
const AUTO_SCROLL_EDGE_ZONE = 40;
const AUTO_SCROLL_MAX_SPEED = 12;

export interface TimelineMoveInput {
  start: number;
  track: number;
  duration: number;
  originClientX: number;
  /** Vertical position as a track-row index, not pixels: rows vary in height. */
  originRow: number;
  originScrollLeft?: number;
  currentScrollLeft?: number;
  pixelsPerSecond: number;
  minStart?: number;
  maxStart: number;
  trackOrder: number[];
  layerOrder?: TimelineLayerId[];
  timelineLayers?: StackingTimelineLayer[];
  /** When provided, vertical movement is resolved as a z-index stacking reorder
   *  within `stackingElement`'s context instead of a raw track change. */
  stackingElement?: TimelineStackingElement;
  stackingElements?: TimelineStackingElement[];
}

export interface TimelineResizeInput {
  start: number;
  duration: number;
  originClientX: number;
  pixelsPerSecond: number;
  minStart: number;
  maxEnd: number;
  minDuration?: number;
  playbackStart?: number;
  playbackRate?: number;
}

export interface TimelineAutoScrollBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function resolveTimelineAutoScroll(
  bounds: TimelineAutoScrollBounds,
  clientX: number,
  clientY: number,
  leftInset = 0,
): { x: number; y: number } {
  const getAxisDelta = (start: number, end: number, pointer: number) => {
    if (pointer < start + AUTO_SCROLL_EDGE_ZONE) {
      const proximity = Math.min(1, Math.max(0, 1 - (pointer - start) / AUTO_SCROLL_EDGE_ZONE));
      return -Math.round(AUTO_SCROLL_MAX_SPEED * proximity);
    }
    if (pointer > end - AUTO_SCROLL_EDGE_ZONE) {
      const proximity = Math.min(1, Math.max(0, 1 - (end - pointer) / AUTO_SCROLL_EDGE_ZONE));
      return Math.round(AUTO_SCROLL_MAX_SPEED * proximity);
    }
    return 0;
  };

  const horizontalStart = Math.min(bounds.right, bounds.left + Math.max(0, leftInset));

  return {
    x: getAxisDelta(horizontalStart, bounds.right, clientX),
    y: getAxisDelta(bounds.top, bounds.bottom, clientY),
  };
}

export function resolveTimelineMove(
  input: TimelineMoveInput,
  clientX: number,
  currentRow: number,
): {
  start: number;
  track: number;
  previewLayerId?: TimelineLayerId;
  previewLayerIndex?: number;
  stackingReorder?: TimelineStackingReorderIntent | null;
} {
  const scrollDeltaX = (input.currentScrollLeft ?? 0) - (input.originScrollLeft ?? 0);
  const deltaTime =
    (clientX - input.originClientX + scrollDeltaX) / Math.max(input.pixelsPerSecond, 1);
  // Rows, so vertical scroll and per-row heights are the caller's problem: rows
  // have varied in height since lanes expand, and a single trackHeight can't
  // describe them.
  const trackDeltaRaw = currentRow - input.originRow;
  const deltaTrack = Math.round(trackDeltaRaw);
  const nextStart = clamp(
    roundToCentiseconds(input.start + deltaTime),
    input.minStart ?? 0,
    Math.max(0, input.maxStart),
  );

  // Stacking mode: the two axes never fight. Horizontal movement writes time
  // (nextStart); vertical movement writes z-index. Lane/overlap resolution
  // uses the clip's authored time span, NOT the dragged start, otherwise a
  // diagonal drag that drifts the clip out of overlap silently flips the
  // placement from "restack" to "join lane" and cancels the reorder.
  if (input.stackingElement) {
    const layerMove =
      input.timelineLayers && input.layerOrder
        ? resolveTimelineLayerStackingMove({
            element: { ...input.stackingElement, duration: input.duration },
            layers: input.timelineLayers,
            layerOrder: input.layerOrder,
            trackDeltaRaw,
          })
        : null;
    return {
      start: nextStart,
      track: input.track,
      previewLayerId: layerMove?.previewLayerId,
      previewLayerIndex: layerMove?.previewLayerIndex,
      stackingReorder: layerMove?.stackingReorder ?? null,
    };
  }

  const currentTrackIndex = Math.max(0, input.trackOrder.indexOf(input.track));
  const desiredTrackIndex = currentTrackIndex + deltaTrack;
  const nextTrackIndex = clamp(desiredTrackIndex, 0, Math.max(0, input.trackOrder.length - 1));
  const minTrack = Math.min(...input.trackOrder);
  const maxTrack = Math.max(...input.trackOrder);
  let nextTrack = input.trackOrder[nextTrackIndex] ?? input.track;

  const startedOnFirstTrack = currentTrackIndex === 0;
  const startedOnLastTrack = currentTrackIndex === input.trackOrder.length - 1;

  if (
    startedOnFirstTrack &&
    desiredTrackIndex < 0 &&
    currentTrackIndex + trackDeltaRaw <= -EDGE_TRACK_CREATE_THRESHOLD
  ) {
    nextTrack = minTrack - 1;
  } else if (
    startedOnLastTrack &&
    desiredTrackIndex > input.trackOrder.length - 1 &&
    currentTrackIndex + trackDeltaRaw >= input.trackOrder.length - 1 + EDGE_TRACK_CREATE_THRESHOLD
  ) {
    nextTrack = maxTrack + 1;
  }

  return {
    start: nextStart,
    track: nextTrack,
  };
}

/**
 * Snap a keyframe's clip-relative percentage to the nearest beat within ~8px,
 * mapping through composition time (pct → time → nearest beat → pct). Returns
 * the percentage unchanged when no beat is in range, so dragging stays free
 * between beats.
 */
export function snapKeyframePctToBeat(
  el: { start: number; duration: number },
  pct: number,
  beatTimes: number[] | undefined,
  pixelsPerSecond: number,
): number {
  if (!beatTimes || beatTimes.length === 0 || el.duration <= 0) return pct;
  const t = el.start + (pct / 100) * el.duration;
  const snapSecs = 8 / Math.max(pixelsPerSecond, 1);
  let best = t;
  let bestDist = snapSecs;
  for (const bt of beatTimes) {
    const d = Math.abs(bt - t);
    if (d < bestDist) {
      bestDist = d;
      best = bt;
    }
  }
  if (best === t) return pct;
  return Math.max(0, Math.min(100, ((best - el.start) / el.duration) * 100));
}

export function resolveTimelineResize(
  input: TimelineResizeInput,
  edge: "start" | "end",
  clientX: number,
): { start: number; duration: number; playbackStart?: number } {
  const minDuration = resolveTimelineMinDuration(input.minDuration);
  const deltaTime = (clientX - input.originClientX) / Math.max(input.pixelsPerSecond, 1);

  if (edge === "end") {
    const nextDuration = clamp(
      roundToCentiseconds(input.duration + deltaTime),
      minDuration,
      Math.max(minDuration, input.maxEnd - input.start),
    );
    return {
      start: input.start,
      duration: nextDuration,
      playbackStart: input.playbackStart,
    };
  }

  const { minDelta, maxDelta } = clipStartTrimDeltaBounds(input, input.minStart, minDuration);
  const clampedDelta = clamp(deltaTime, minDelta, maxDelta);
  return applyClipStartTrimDelta(input, clampedDelta);
}

export interface TimelinePromptElement {
  id: string;
  tag: string;
  start: number;
  duration: number;
  track: number;
}

export type BlockedTimelineEditIntent = "move" | "resize-start" | "resize-end";

export interface TimelineRangeSelection {
  start: number;
  end: number;
  anchorX: number;
  anchorY: number;
}

export interface TimelineMarqueeSelectionRect {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
}

export interface TimelineMarqueeSelectionInput {
  rect: TimelineMarqueeSelectionRect;
  layers: readonly StackingTimelineLayer[];
  layerOrder: readonly TimelineLayerId[];
  rulerHeight: number;
  trackHeight: number;
  groupHeaderHeight?: number;
}

interface NormalizedTimelineMarqueeRect {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
}

function timelineIntervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

function normalizeTimelineMarqueeRect(
  rect: TimelineMarqueeSelectionRect,
): NormalizedTimelineMarqueeRect | null {
  const normalized = {
    startTime: Math.max(0, Math.min(rect.startTime, rect.endTime)),
    endTime: Math.max(0, Math.max(rect.startTime, rect.endTime)),
    top: Math.min(rect.top, rect.bottom),
    bottom: Math.max(rect.top, rect.bottom),
  };
  if (normalized.endTime <= normalized.startTime || normalized.bottom <= normalized.top) {
    return null;
  }
  return normalized;
}

function buildTimelineLayerMap(layers: readonly StackingTimelineLayer[]) {
  const layerById = new Map<TimelineLayerId, StackingTimelineLayer>();
  for (const layer of layers) layerById.set(layer.id, layer);
  return layerById;
}

function appendMarqueeLayerSelection(
  selected: string[],
  layer: StackingTimelineLayer,
  rect: NormalizedTimelineMarqueeRect,
) {
  for (const element of layer.elements) {
    if (
      timelineIntervalsOverlap(
        rect.startTime,
        rect.endTime,
        element.start,
        element.start + element.duration,
      )
    ) {
      selected.push(element.key ?? element.id);
    }
  }
}

export function selectTimelineElementsInMarquee({
  rect,
  layers,
  layerOrder,
  rulerHeight,
  trackHeight,
  groupHeaderHeight = 0,
}: TimelineMarqueeSelectionInput): string[] {
  const normalized = normalizeTimelineMarqueeRect(rect);
  if (!normalized) return [];
  const layerById = buildTimelineLayerMap(layers);
  const selected: string[] = [];
  let previousContextKey = "";
  let rowTop = rulerHeight;
  for (const layerId of layerOrder) {
    const layer = layerById.get(layerId);
    if (!layer) continue;
    if (shouldShowTimelineLayerGroupHeader(layer.contextKey, previousContextKey)) {
      rowTop += groupHeaderHeight;
    }
    const rowBottom = rowTop + trackHeight;
    if (timelineIntervalsOverlap(normalized.top, normalized.bottom, rowTop, rowBottom)) {
      appendMarqueeLayerSelection(selected, layer, normalized);
    }
    previousContextKey = layer.contextKey;
    rowTop = rowBottom;
  }
  return selected;
}

export function resolveBlockedTimelineEditIntent(input: {
  width: number;
  offsetX: number;
  handleWidth: number;
  capabilities: TimelineEditCapabilities;
}): BlockedTimelineEditIntent | null {
  if (input.capabilities.canMove) {
    return null;
  }

  const safeWidth = Math.max(0, input.width);
  const safeOffsetX = clamp(input.offsetX, 0, safeWidth);
  const safeHandleWidth = Math.max(0, input.handleWidth);

  if (safeOffsetX <= safeHandleWidth && !input.capabilities.canTrimStart) {
    return "resize-start";
  }
  if (safeOffsetX >= Math.max(0, safeWidth - safeHandleWidth) && !input.capabilities.canTrimEnd) {
    return "resize-end";
  }
  return "move";
}

export function buildTimelineAgentPrompt({
  rangeStart,
  rangeEnd,
  elements,
  prompt,
}: {
  rangeStart: number;
  rangeEnd: number;
  elements: TimelinePromptElement[];
  prompt: string;
}): string {
  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  const elementLines = elements
    .map(
      (el) =>
        `- #${el.id} (${el.tag}) - ${formatTime(el.start)} to ${formatTime(el.start + el.duration)}, track ${el.track}`,
    )
    .join("\n");

  return `Edit the following HyperFrames composition:

Time range: ${formatTime(start)} - ${formatTime(end)}

Elements in range:
${elementLines || "(none)"}

User request:
${prompt.trim() || "(no prompt provided)"}

Instructions:
Modify only the elements listed above within the specified time range.
The composition uses HyperFrames data attributes (data-start, data-duration, data-track-index) and GSAP for animations.
Preserve all other elements and timing outside this range.`;
}

export function buildPromptCopyText(prompt: string): string {
  return prompt.trim();
}

export function buildTimelineElementAgentPrompt(element: {
  id: string;
  tag: string;
  start: number;
  duration: number;
  track: number;
  sourceFile?: string;
  selector?: string;
  compositionSrc?: string;
}): string {
  const lines = [
    "Studio cannot directly move or resize this timeline clip because its visible timing is not fully controlled by patchable HTML timing attributes.",
    "",
    "Please update the source so the clip's actual visible timing stays consistent with the authored timeline.",
    "",
    "Clip:",
    `- id: ${element.id}`,
    `- tag: ${element.tag}`,
    `- time: ${formatTime(element.start)} to ${formatTime(element.start + element.duration)}`,
    `- track: ${element.track}`,
  ];

  if (element.sourceFile) lines.push(`- source file: ${element.sourceFile}`);
  if (element.selector) lines.push(`- selector: ${element.selector}`);
  if (element.compositionSrc) lines.push(`- composition src: ${element.compositionSrc}`);

  lines.push(
    "",
    "If this clip is animated with GSAP or another JS timeline, update the authored animation timing there as well instead of only changing data-start/data-duration.",
  );

  return lines.join("\n");
}
export function formatTimelineAttributeNumber(value: number): string {
  return Number(roundToCentiseconds(value).toFixed(2)).toString();
}

export function formatTimelineMediaOffset(value: number): string {
  return Number(value.toFixed(6)).toString();
}

/**
 * Apply one edge auto-scroll step: scroll `scroll` toward the edge zone the
 * pointer is in, clamped to the scrollable range. Returns true when the
 * container actually moved (the caller keeps its RAF running and re-runs its
 * live preview), false when the pointer is outside the edge zones or the scroll
 * is already clamped (the caller stops).
 */
export function applyTimelineAutoScrollStep(
  scroll: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  return applyTimelineAutoScrollDelta(
    scroll,
    resolveTimelineAutoScroll(
      scroll.getBoundingClientRect(),
      clientX,
      clientY,
      getTimelineAutoScrollLeftInset(scroll),
    ),
  );
}

/** Apply one horizontal edge-scroll step while scrubbing the ruler/playhead. */
export function applyTimelineHorizontalAutoScrollStep(
  scroll: HTMLElement,
  clientX: number,
): boolean {
  const bounds = scroll.getBoundingClientRect();
  const delta = resolveTimelineAutoScroll(
    bounds,
    clientX,
    bounds.top + (bounds.bottom - bounds.top) / 2,
    getTimelineAutoScrollLeftInset(scroll),
  );
  return applyTimelineAutoScrollDelta(scroll, { x: delta.x, y: 0 });
}

function getTimelineAutoScrollLeftInset(scroll: HTMLElement): number {
  const inset = Number(scroll.dataset.timelineAutoScrollLeftInset);
  return Number.isFinite(inset) ? Math.max(0, inset) : 0;
}

function applyTimelineAutoScrollDelta(
  scroll: HTMLElement,
  delta: { x: number; y: number },
): boolean {
  if (delta.x === 0 && delta.y === 0) return false;
  const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, scroll.scrollLeft + delta.x));
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scroll.scrollTop + delta.y));
  if (nextScrollLeft === scroll.scrollLeft && nextScrollTop === scroll.scrollTop) return false;
  scroll.scrollLeft = nextScrollLeft;
  scroll.scrollTop = nextScrollTop;
  return true;
}

/**
 * Decide whether an edge auto-scroll RAF loop should start, stop, or stay as-is
 * for the current pointer: "start" when the pointer is in an edge zone and no
 * loop is running, "stop" when it left the zones while a loop is running,
 * "none" otherwise.
 */
export function resolveTimelineAutoScrollLoopAction(
  scroll: HTMLElement | null,
  clientX: number,
  clientY: number,
  rafActive: boolean,
): "start" | "stop" | "none" {
  if (!scroll) return "none";
  const delta = resolveTimelineAutoScroll(
    scroll.getBoundingClientRect(),
    clientX,
    clientY,
    getTimelineAutoScrollLeftInset(scroll),
  );
  if (delta.x === 0 && delta.y === 0) return rafActive ? "stop" : "none";
  return rafActive ? "none" : "start";
}

/**
 * Escape cancels an in-progress clip drag / resize / blocked-drag: no commit,
 * no undo entry — the previews live only in the gesture state, so clearing it
 * restores the pre-drag timeline. `suppressClick` arms the click suppressor
 * only when the gesture actually started, so the click generated by the
 * eventual pointerup can't reselect or split the clip.
 */
export function resolveTimelineDragEscape(input: TimelineDragEscapeInput): {
  cancel: boolean;
  suppressClick: boolean;
} {
  if (!input.cancelPressed || (!input.drag && !input.resize && !input.blocked)) {
    return { cancel: false, suppressClick: false };
  }
  return {
    cancel: true,
    suppressClick: Boolean(input.drag?.started || input.resize?.started || input.blocked?.started),
  };
}

export interface TimelineDragEscapeInput {
  cancelPressed: boolean;
  drag: { started: boolean } | null;
  resize: { started: boolean } | null;
  blocked: { started: boolean } | null;
}
