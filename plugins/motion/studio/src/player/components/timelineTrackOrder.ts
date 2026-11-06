import { type TimelineElement } from "../store/playerStore";
import { resolveContextOrder, resolveStackingContextKey } from "../lib/layerOrdering";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import { toStackingOrderItem, type TimelineStackingOrderItem } from "./timelineStacking";

export type TimelineLayerId = string;

export interface StackingTimelineLayer {
  id: TimelineLayerId;
  kind: "visual" | "audio";
  contextKey: string;
  zIndex: number;
  placementTrack: number;
  elements: TimelineElement[];
}

export interface StackingTimelineLayerGroups {
  visualLayers: StackingTimelineLayer[];
  audioLayers: StackingTimelineLayer[];
  rows: StackingTimelineLayer[];
}

type TimelineLayerOrderItem = TimelineStackingOrderItem & {
  start: number;
  duration: number;
  index: number;
  element: TimelineElement;
};

type BuildLayer = Omit<StackingTimelineLayer, "id">;

function toTimelineLayerOrderItem(element: TimelineElement, index: number): TimelineLayerOrderItem {
  return {
    ...toStackingOrderItem(element),
    start: element.start,
    duration: element.duration,
    index,
    element,
  };
}

export function timelineElementsOverlap(
  a: Pick<TimelineElement, "start" | "duration">,
  b: Pick<TimelineElement, "start" | "duration">,
): boolean {
  return a.start < b.start + b.duration && b.start < a.start + a.duration;
}

function compareLayerItems(a: TimelineLayerOrderItem, b: TimelineLayerOrderItem): number {
  if (a.zIndex !== b.zIndex) return b.zIndex - a.zIndex;
  return a.index - b.index;
}

function buildElementLayerId(
  prefix: string,
  contextKey: string,
  element: TimelineElement,
): TimelineLayerId {
  return `${prefix}:${contextKey}:${getTimelineElementIdentity(element)}`;
}

function buildLaneId(
  prefix: string,
  contextKey: string,
  elements: TimelineElement[],
): TimelineLayerId {
  const memberKey = elements.map(getTimelineElementIdentity).sort().join("|");
  return `${prefix}:${contextKey}:${memberKey}`;
}

function getOrderedContextKeys(items: readonly TimelineLayerOrderItem[]): string[] {
  const keys: string[] = [];
  for (const item of resolveContextOrder(items)) {
    const key = resolveStackingContextKey(item);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function canJoinLayer(layer: BuildLayer, item: TimelineLayerOrderItem): boolean {
  // A row IS a z-band: clips only share a lane when they carry the same z-index
  // (and don't overlap in time). Without the z-index gate a non-overlapping clip
  // greedily packs into the first time-compatible row — the topmost one — so a
  // vertical restack changes z but the row never follows it.
  return (
    layer.contextKey === resolveStackingContextKey(item) &&
    layer.zIndex === item.zIndex &&
    layer.elements.every((element) => !timelineElementsOverlap(element, item.element))
  );
}

function compareElementsByStart(a: TimelineElement, b: TimelineElement): number {
  if (a.start !== b.start) return a.start - b.start;
  return getTimelineElementIdentity(a).localeCompare(getTimelineElementIdentity(b));
}

function buildVisualLayerRows(items: readonly TimelineLayerOrderItem[]): StackingTimelineLayer[] {
  const byContext = new Map<string, TimelineLayerOrderItem[]>();
  for (const item of items) {
    const key = resolveStackingContextKey(item);
    const list = byContext.get(key);
    if (list) list.push(item);
    else byContext.set(key, [item]);
  }

  const rows: StackingTimelineLayer[] = [];
  for (const contextKey of getOrderedContextKeys(items)) {
    const contextRows: BuildLayer[] = [];
    const contextItems = [...(byContext.get(contextKey) ?? [])].sort(compareLayerItems);
    for (const item of contextItems) {
      const existing = contextRows.find((row) => canJoinLayer(row, item));
      if (existing) {
        existing.elements.push(item.element);
        existing.zIndex = Math.max(existing.zIndex, item.zIndex);
        continue;
      }
      contextRows.push({
        kind: "visual",
        contextKey,
        zIndex: item.zIndex,
        placementTrack: item.element.track,
        elements: [item.element],
      });
    }
    rows.push(
      ...contextRows.map((row) => {
        const elements = [...row.elements].sort(compareElementsByStart);
        return {
          ...row,
          id: buildLaneId("lane", contextKey, elements),
          elements,
        };
      }),
    );
  }
  return rows;
}

function buildAudioLayerRows(items: readonly TimelineLayerOrderItem[]): StackingTimelineLayer[] {
  return items.map((item) => ({
    id: buildElementLayerId("audio", resolveStackingContextKey(item), item.element),
    kind: "audio",
    contextKey: resolveStackingContextKey(item),
    zIndex: item.zIndex,
    placementTrack: item.element.track,
    elements: [item.element],
  }));
}

export function buildStackingTimelineLayers(
  elements: readonly TimelineElement[],
): StackingTimelineLayerGroups {
  const items = elements.map(toTimelineLayerOrderItem);
  const visualItems = items.filter((item) => item.element.tag !== "audio");
  const audioItems = items.filter((item) => item.element.tag === "audio");
  const visualLayers = buildVisualLayerRows(visualItems);
  const audioLayers = buildAudioLayerRows(audioItems);
  return {
    visualLayers,
    audioLayers,
    rows: [...visualLayers, ...audioLayers],
  };
}

export function insertPreviewTrackOrder(
  layerOrder: readonly TimelineLayerId[],
  previewLayerId: TimelineLayerId,
  previewIndex: number,
): TimelineLayerId[] {
  if (layerOrder.includes(previewLayerId)) return [...layerOrder];
  const index = Math.max(0, Math.min(layerOrder.length, Math.round(previewIndex)));
  return [...layerOrder.slice(0, index), previewLayerId, ...layerOrder.slice(index)];
}
