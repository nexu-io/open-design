import { useRef, useState, useCallback } from "react";
import type { DomEditLayerItem } from "./domEditingTypes";

const DRAG_THRESHOLD_PX = 4;

interface DragState {
  pointerId: number;
  startY: number;
  dragLayerIndex: number;
  siblingIndices: number[];
  fromSiblingPos: number;
  insertSiblingPos: number;
  siblingRects: DOMRect[];
  activated: boolean;
}

export interface LayerReorderEvent {
  siblingLayers: DomEditLayerItem[];
  fromIndex: number;
  toIndex: number;
}

export interface UseLayerDragOptions {
  visibleLayers: DomEditLayerItem[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onReorder: (event: LayerReorderEvent) => void;
  onSingleSibling?: () => void;
}

export interface UseLayerDragReturn {
  dragKey: string | null;
  insertionLineY: number | null;
  handleRowPointerDown: (layerIndex: number, e: React.PointerEvent) => void;
  handleContainerPointerMove: (e: React.PointerEvent) => void;
  handleContainerPointerUp: () => void;
}

export function isLayerDraggable(layer: DomEditLayerItem): boolean {
  if (!(layer.selector || layer.id)) return false;
  let el: HTMLElement | null = layer.element;
  while (el) {
    if (el.hasAttribute("data-timeline-locked")) return false;
    el = el.parentElement;
  }
  return true;
}

function findSiblingIndices(visibleLayers: DomEditLayerItem[], layerIndex: number): number[] {
  const depth = visibleLayers[layerIndex].depth;
  const indices: number[] = [];

  let start = layerIndex;
  while (start > 0) {
    start--;
    if (visibleLayers[start].depth < depth) {
      start++;
      break;
    }
  }

  for (let i = start; i < visibleLayers.length; i++) {
    const d = visibleLayers[i].depth;
    if (d < depth) break;
    if (d === depth) indices.push(i);
  }

  return indices;
}

function measureSiblingRects(container: HTMLDivElement, siblingIndices: number[]): DOMRect[] {
  const rows = container.querySelectorAll<HTMLElement>("[data-layer-index]");
  const rects: DOMRect[] = [];
  for (const idx of siblingIndices) {
    for (const row of rows) {
      if (row.dataset.layerIndex === String(idx)) {
        rects.push(row.getBoundingClientRect());
        break;
      }
    }
  }
  return rects;
}

function computeInsertionPos(clientY: number, siblingRects: DOMRect[]): number {
  if (siblingRects.length === 0) return 0;

  if (clientY <= siblingRects[0].top + siblingRects[0].height / 2) return 0;

  for (let i = 0; i < siblingRects.length - 1; i++) {
    const midpoint = (siblingRects[i].bottom + siblingRects[i + 1].top) / 2;
    if (clientY <= midpoint) return i + 1;
  }

  const last = siblingRects[siblingRects.length - 1];
  if (clientY <= last.top + last.height / 2) return siblingRects.length - 1;

  return siblingRects.length;
}

function computeInsertionLineY(
  insertPos: number,
  siblingRects: DOMRect[],
  containerRect: DOMRect,
): number | null {
  if (siblingRects.length === 0) return null;
  if (insertPos <= 0) return siblingRects[0].top - containerRect.top;
  if (insertPos >= siblingRects.length) {
    return siblingRects[siblingRects.length - 1].bottom - containerRect.top;
  }
  return siblingRects[insertPos].top - containerRect.top;
}

export function useLayerDrag({
  visibleLayers,
  scrollContainerRef,
  onReorder,
  onSingleSibling,
}: UseLayerDragOptions): UseLayerDragReturn {
  const dragRef = useRef<DragState | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [insertionLineY, setInsertionLineY] = useState<number | null>(null);

  const handleRowPointerDown = useCallback(
    (layerIndex: number, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const layer = visibleLayers[layerIndex];
      if (!layer || !isLayerDraggable(layer)) return;

      const siblingIndices = findSiblingIndices(visibleLayers, layerIndex);
      if (siblingIndices.length <= 1) {
        onSingleSibling?.();
        return;
      }

      const fromSiblingPos = siblingIndices.indexOf(layerIndex);
      if (fromSiblingPos === -1) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        dragLayerIndex: layerIndex,
        siblingIndices,
        fromSiblingPos,
        insertSiblingPos: fromSiblingPos,
        siblingRects: measureSiblingRects(container, siblingIndices),
        activated: false,
      };
    },
    [visibleLayers, scrollContainerRef, onSingleSibling],
  );

  const handleContainerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (!drag.activated) {
        if (Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
        drag.activated = true;
        const container = scrollContainerRef.current;
        if (container && drag.pointerId != null) {
          try {
            container.setPointerCapture(drag.pointerId);
          } catch {}
        }
        setDragKey(visibleLayers[drag.dragLayerIndex]?.key ?? null);
      }

      const insertPos = computeInsertionPos(e.clientY, drag.siblingRects);
      drag.insertSiblingPos = insertPos;

      const container = scrollContainerRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        setInsertionLineY(computeInsertionLineY(insertPos, drag.siblingRects, containerRect));
      }
    },
    [visibleLayers, scrollContainerRef],
  );

  const handleContainerPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragKey(null);
    setInsertionLineY(null);

    if (!drag || !drag.activated) return;

    const container = scrollContainerRef.current;
    if (container) {
      try {
        container.releasePointerCapture(drag.pointerId);
      } catch {
        // already released
      }
    }

    let toPos = drag.insertSiblingPos;
    if (toPos > drag.fromSiblingPos) toPos--;
    if (toPos === drag.fromSiblingPos) return;

    const siblingLayers = drag.siblingIndices.map((i) => visibleLayers[i]);
    onReorder({ siblingLayers, fromIndex: drag.fromSiblingPos, toIndex: toPos });
  }, [visibleLayers, scrollContainerRef, onReorder]);

  return {
    dragKey,
    insertionLineY,
    handleRowPointerDown,
    handleContainerPointerMove,
    handleContainerPointerUp,
  };
}
