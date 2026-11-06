import { resolveStackingContextKey } from "../lib/layerOrdering";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import {
  timelineElementsOverlap,
  type StackingTimelineLayer,
  type TimelineLayerId,
} from "./timelineTrackOrder";
import {
  toStackingOrderItem,
  type TimelineLayerDropPlacement,
  type TimelineStackingElement,
  type TimelineStackingReorderIntent,
  type TimelineStackingZIndexChange,
} from "./timelineStacking";

const ONTO_ROW_THRESHOLD = 0.35;

export interface TimelineLayerStackingMoveResolution {
  previewLayerId: TimelineLayerId;
  previewLayerIndex: number;
  stackingReorder: TimelineStackingReorderIntent | null;
}

function isAudioElement(element: TimelineStackingElement): boolean {
  return element.tag?.toLowerCase() === "audio";
}

function layerContainsElement(layer: StackingTimelineLayer, key: string): boolean {
  return layer.elements.some((element) => getTimelineElementIdentity(element) === key);
}

function layerConflictsWithElement(
  layer: StackingTimelineLayer,
  element: TimelineStackingElement,
  draggedKey: string,
): boolean {
  return layer.elements.some(
    (candidate) =>
      getTimelineElementIdentity(candidate) !== draggedKey &&
      timelineElementsOverlap(candidate, element),
  );
}

function addElementChange(
  changes: TimelineStackingZIndexChange[],
  element: TimelineStackingElement,
  zIndex: number,
): void {
  if ((element.zIndex ?? 0) === zIndex) return;
  changes.push({
    key: getTimelineElementIdentity(element),
    zIndex,
    domId: element.domId,
    selector: element.selector,
    selectorIndex: element.selectorIndex,
    sourceFile: element.sourceFile,
  });
}

function addLayerChanges(
  changes: TimelineStackingZIndexChange[],
  layer: StackingTimelineLayer,
  zIndex: number,
  excludedKey: string,
): number {
  let count = 0;
  for (const element of layer.elements) {
    const key = getTimelineElementIdentity(element);
    if (key === excludedKey) continue;
    const before = changes.length;
    addElementChange(changes, element, zIndex);
    if (changes.length > before) count += 1;
  }
  return count;
}

function getContextLayers(
  layers: readonly StackingTimelineLayer[],
  contextKey: string,
): StackingTimelineLayer[] {
  return layers.filter((layer) => layer.kind === "visual" && layer.contextKey === contextKey);
}

function findLayer(
  layers: readonly StackingTimelineLayer[],
  id: string,
): StackingTimelineLayer | null {
  return layers.find((layer) => layer.id === id) ?? null;
}

function resolvePlacementZIndexChanges(input: {
  element: TimelineStackingElement;
  targetZIndex: number;
}): TimelineStackingZIndexChange[] {
  const changes: TimelineStackingZIndexChange[] = [];
  addElementChange(changes, input.element, input.targetZIndex);
  return changes;
}

function buildPushUpCandidate(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  beforeIndex: number;
  bottomZIndex: number;
}): { changes: TimelineStackingZIndexChange[]; siblingChanges: number } {
  const draggedKey = getTimelineElementIdentity(input.element);
  const draggedZIndex = input.bottomZIndex + 1;
  const changes = resolvePlacementZIndexChanges({
    element: input.element,
    targetZIndex: draggedZIndex,
  });
  let siblingChanges = 0;
  let requiredZIndex = draggedZIndex + 1;
  for (let index = input.beforeIndex; index >= 0; index -= 1) {
    const layer = input.layers[index];
    if (!layer) continue;
    const nextZIndex = layer.zIndex >= requiredZIndex ? layer.zIndex : requiredZIndex;
    siblingChanges += addLayerChanges(changes, layer, nextZIndex, draggedKey);
    requiredZIndex = nextZIndex + 1;
  }
  return { changes, siblingChanges };
}

function buildPushDownCandidate(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  afterIndex: number;
  topZIndex: number;
}): { changes: TimelineStackingZIndexChange[]; siblingChanges: number } {
  const draggedKey = getTimelineElementIdentity(input.element);
  const draggedZIndex = input.topZIndex - 1;
  const changes = resolvePlacementZIndexChanges({
    element: input.element,
    targetZIndex: draggedZIndex,
  });
  let siblingChanges = 0;
  let requiredZIndex = draggedZIndex - 1;
  for (let index = input.afterIndex; index < input.layers.length; index += 1) {
    const layer = input.layers[index];
    if (!layer) continue;
    const nextZIndex = layer.zIndex <= requiredZIndex ? layer.zIndex : requiredZIndex;
    siblingChanges += addLayerChanges(changes, layer, nextZIndex, draggedKey);
    requiredZIndex = nextZIndex - 1;
  }
  return { changes, siblingChanges };
}

function resolveBetweenChanges(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  beforeLayer: StackingTimelineLayer;
  afterLayer: StackingTimelineLayer;
}): TimelineStackingZIndexChange[] {
  const topZIndex = input.beforeLayer.zIndex;
  const bottomZIndex = input.afterLayer.zIndex;
  if (topZIndex - bottomZIndex > 1) {
    return resolvePlacementZIndexChanges({
      element: input.element,
      targetZIndex: Math.floor((topZIndex + bottomZIndex) / 2),
    });
  }

  const beforeIndex = input.layers.findIndex((layer) => layer.id === input.beforeLayer.id);
  const afterIndex = input.layers.findIndex((layer) => layer.id === input.afterLayer.id);
  const pushUp = buildPushUpCandidate({
    element: input.element,
    layers: input.layers,
    beforeIndex,
    bottomZIndex,
  });
  const pushDown = buildPushDownCandidate({
    element: input.element,
    layers: input.layers,
    afterIndex,
    topZIndex,
  });
  return pushUp.siblingChanges <= pushDown.siblingChanges ? pushUp.changes : pushDown.changes;
}

function resolveOntoChanges(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  layerId: string;
}): TimelineStackingZIndexChange[] | null {
  const target = findLayer(input.layers, input.layerId);
  if (!target) return null;
  if (layerConflictsWithElement(target, input.element, getTimelineElementIdentity(input.element))) {
    return null;
  }
  return resolvePlacementZIndexChanges({
    element: input.element,
    targetZIndex: target.zIndex,
  });
}

function resolveEdgeChanges(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  layerId: string;
  offset: number;
}): TimelineStackingZIndexChange[] | null {
  const target = findLayer(input.layers, input.layerId);
  if (!target) return null;
  return resolvePlacementZIndexChanges({
    element: input.element,
    targetZIndex: target.zIndex + input.offset,
  });
}

function resolvePlacementChanges(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  placement: TimelineLayerDropPlacement;
}): TimelineStackingZIndexChange[] | null {
  switch (input.placement.type) {
    case "onto":
      return resolveOntoChanges({
        element: input.element,
        layers: input.layers,
        layerId: input.placement.layerId,
      });
    case "above":
      return resolveEdgeChanges({
        element: input.element,
        layers: input.layers,
        layerId: input.placement.layerId,
        offset: 1,
      });
    case "below":
      return resolveEdgeChanges({
        element: input.element,
        layers: input.layers,
        layerId: input.placement.layerId,
        offset: -1,
      });
    case "between": {
      const beforeLayer = findLayer(input.layers, input.placement.beforeLayerId);
      const afterLayer = findLayer(input.layers, input.placement.afterLayerId);
      return beforeLayer && afterLayer
        ? resolveBetweenChanges({
            element: input.element,
            layers: input.layers,
            beforeLayer,
            afterLayer,
          })
        : null;
    }
  }
}

export function resolveTimelineLayerZIndexChanges(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  placement: TimelineLayerDropPlacement;
}): TimelineStackingReorderIntent | null {
  if (isAudioElement(input.element)) return null;
  const contextKey = resolveStackingContextKey(toStackingOrderItem(input.element));
  const layers = getContextLayers(input.layers, contextKey);
  const changes = resolvePlacementChanges({
    element: input.element,
    layers,
    placement: input.placement,
  });

  return changes && changes.length > 0
    ? { contextKey, placement: input.placement, zIndexChanges: changes }
    : null;
}

// fallow-ignore-next-line complexity
function resolveDragPlacement(
  layers: readonly StackingTimelineLayer[],
  targetPosition: number,
): TimelineLayerDropPlacement | null {
  const first = layers[0];
  const last = layers[layers.length - 1];
  if (!first || !last) return null;
  if (targetPosition < -ONTO_ROW_THRESHOLD) return { type: "above", layerId: first.id };
  if (targetPosition > layers.length - 1 + ONTO_ROW_THRESHOLD) {
    return { type: "below", layerId: last.id };
  }

  const nearestIndex = Math.round(targetPosition);
  const nearest = layers[nearestIndex];
  if (nearest && Math.abs(targetPosition - nearestIndex) <= ONTO_ROW_THRESHOLD) {
    return { type: "onto", layerId: nearest.id };
  }

  const insertionIndex = Math.max(0, Math.min(layers.length, Math.ceil(targetPosition)));
  if (insertionIndex <= 0) return { type: "above", layerId: first.id };
  if (insertionIndex >= layers.length) return { type: "below", layerId: last.id };
  const before = layers[insertionIndex - 1];
  const after = layers[insertionIndex];
  return before && after
    ? { type: "between", beforeLayerId: before.id, afterLayerId: after.id }
    : null;
}

function resolveLaneAwareDragPlacement(input: {
  layers: readonly StackingTimelineLayer[];
  element: TimelineStackingElement;
  draggedKey: string;
  placement: TimelineLayerDropPlacement;
  targetPosition: number;
  currentIndex: number;
}): TimelineLayerDropPlacement | null {
  if (input.placement.type !== "onto") return input.placement;
  const target = findLayer(input.layers, input.placement.layerId);
  if (!target) return null;
  if (!layerConflictsWithElement(target, input.element, input.draggedKey)) return input.placement;
  if (input.targetPosition < input.currentIndex) {
    return { type: "above", layerId: target.id };
  }
  if (input.targetPosition > input.currentIndex) {
    return { type: "below", layerId: target.id };
  }
  return input.placement;
}

function getPreviewLayerId(
  draggedKey: string,
  placement: TimelineLayerDropPlacement,
): TimelineLayerId {
  if (placement.type === "onto") return placement.layerId;
  if (placement.type === "between") {
    return `preview:${draggedKey}:between:${placement.beforeLayerId}:${placement.afterLayerId}`;
  }
  return `preview:${draggedKey}:${placement.type}:${placement.layerId}`;
}

function getPreviewLayerIndex(
  layerOrder: readonly TimelineLayerId[],
  placement: TimelineLayerDropPlacement,
): number {
  if (placement.type === "onto") return Math.max(0, layerOrder.indexOf(placement.layerId));
  if (placement.type === "between") {
    return Math.max(0, layerOrder.indexOf(placement.afterLayerId));
  }
  const targetIndex = Math.max(0, layerOrder.indexOf(placement.layerId));
  return placement.type === "above" ? targetIndex : targetIndex + 1;
}

export function resolveTimelineLayerStackingMove(input: {
  element: TimelineStackingElement;
  layers: readonly StackingTimelineLayer[];
  layerOrder: readonly TimelineLayerId[];
  trackDeltaRaw: number;
}): TimelineLayerStackingMoveResolution | null {
  if (isAudioElement(input.element)) return null;
  const contextKey = resolveStackingContextKey(toStackingOrderItem(input.element));
  const layerById = new Map(input.layers.map((layer) => [layer.id, layer]));
  const contextLayers = input.layerOrder
    .map((id) => layerById.get(id) ?? null)
    .filter(
      (layer): layer is StackingTimelineLayer =>
        layer != null && layer.kind === "visual" && layer.contextKey === contextKey,
    );
  const draggedKey = getTimelineElementIdentity(input.element);
  const currentIndex = contextLayers.findIndex((layer) => layerContainsElement(layer, draggedKey));
  if (currentIndex < 0) return null;

  const targetPosition = currentIndex + input.trackDeltaRaw;
  const rawPlacement = resolveDragPlacement(contextLayers, targetPosition);
  if (!rawPlacement) return null;
  const placement = resolveLaneAwareDragPlacement({
    layers: contextLayers,
    element: input.element,
    draggedKey,
    placement: rawPlacement,
    targetPosition,
    currentIndex,
  });
  if (!placement) return null;
  return {
    previewLayerId: getPreviewLayerId(draggedKey, placement),
    previewLayerIndex: getPreviewLayerIndex(input.layerOrder, placement),
    stackingReorder: resolveTimelineLayerZIndexChanges({
      element: input.element,
      layers: contextLayers,
      placement,
    }),
  };
}
