import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  CHAT_VIRTUAL_DEFAULT_VIEWPORT_PX,
  CHAT_VIRTUAL_MIN_ROW_HEIGHT,
} from '../constants';
import { includeVirtualRowByKey } from '../rules';

export function useMeasuredVirtualWindow<T extends { key: string }>(
  items: T[],
  {
    enabled,
    containerRef,
    estimateSize,
    overscanPx,
    resetKey,
    initialTailRows,
    alwaysIncludeKey,
  }: {
    enabled: boolean;
    containerRef: MutableRefObject<HTMLDivElement | null>;
    estimateSize: (item: T) => number;
    overscanPx: number;
    resetKey: string;
    initialTailRows: number;
    alwaysIncludeKey?: string;
  },
) {
  const measuredHeightsRef = useRef<Map<string, number>>(new Map());
  const [measureVersion, setMeasureVersion] = useState(0);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  useEffect(() => {
    measuredHeightsRef.current.clear();
    setMeasureVersion((version) => version + 1);
    setViewport({ scrollTop: 0, height: 0 });
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;
    let frame: number | null = null;
    const readViewport = () => {
      frame = null;
      setViewport((current) => {
        const next = {
          scrollTop: el.scrollTop,
          height: el.clientHeight || CHAT_VIRTUAL_DEFAULT_VIEWPORT_PX,
        };
        return current.scrollTop === next.scrollTop && current.height === next.height
          ? current
          : next;
      });
    };
    const scheduleRead = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(readViewport);
    };
    scheduleRead();
    el.addEventListener('scroll', scheduleRead, { passive: true });
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleRead)
        : null;
    observer?.observe(el);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', scheduleRead);
      observer?.disconnect();
    };
  }, [containerRef, enabled]);

  const layout = useMemo(() => {
    const offsets: number[] = [];
    const sizes: number[] = [];
    let cursor = 0;
    for (const item of items) {
      offsets.push(cursor);
      const measured = measuredHeightsRef.current.get(item.key);
      const size = Math.max(
        CHAT_VIRTUAL_MIN_ROW_HEIGHT,
        measured ?? estimateSize(item),
      );
      sizes.push(size);
      cursor += size;
    }
    return { offsets, sizes, totalHeight: cursor };
  }, [estimateSize, items, measureVersion]);

  const rows = useMemo(() => {
    if (!enabled || items.length === 0) return [];
    const height = viewport.height || CHAT_VIRTUAL_DEFAULT_VIEWPORT_PX;
    if (viewport.scrollTop === 0 && viewport.height === 0) {
      const start = Math.max(0, items.length - initialTailRows);
      const rows = items.slice(start).map((item, offset) => {
        const index = start + offset;
        return { item, index, top: layout.offsets[index] ?? 0 };
      });
      return includeVirtualRowByKey(rows, items, layout.offsets, alwaysIncludeKey);
    }
    const startTarget = Math.max(0, viewport.scrollTop - overscanPx);
    const endTarget = viewport.scrollTop + height + overscanPx;
    let start = 0;
    while (
      start < items.length - 1
      && (layout.offsets[start] ?? 0) + (layout.sizes[start] ?? 0) < startTarget
    ) {
      start += 1;
    }
    let end = start;
    while (end < items.length && (layout.offsets[end] ?? 0) <= endTarget) {
      end += 1;
    }
    const rows = items.slice(start, end).map((item, offset) => {
      const index = start + offset;
      return { item, index, top: layout.offsets[index] ?? 0 };
    });
    return includeVirtualRowByKey(rows, items, layout.offsets, alwaysIncludeKey);
  }, [
    alwaysIncludeKey,
    enabled,
    initialTailRows,
    items,
    layout.offsets,
    layout.sizes,
    overscanPx,
    viewport.height,
    viewport.scrollTop,
  ]);

  const onMeasure = useCallback((key: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const next = Math.max(CHAT_VIRTUAL_MIN_ROW_HEIGHT, Math.ceil(height));
    const previous = measuredHeightsRef.current.get(key);
    if (previous !== undefined && Math.abs(previous - next) < 2) return;
    measuredHeightsRef.current.set(key, next);
    setMeasureVersion((version) => version + 1);
  }, []);

  return {
    rows,
    totalHeight: layout.totalHeight,
    onMeasure,
  };
}
