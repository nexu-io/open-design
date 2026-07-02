import { Fragment, useEffect, useMemo, useState } from 'react';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, NonDeleted } from '@excalidraw/excalidraw/element/types';
import { fetchProjectFileText } from '../providers/registry';
import type { ProjectFile } from '../types';
import {
  clampSketchNumber,
  clampSketchSize,
  computeSketchBounds,
  isSketchJsonFileName,
  normalizeSketchText,
  parseSketchWorkspaceDocument,
  sketchSceneHasContent,
  type ExcalidrawSketchScene,
  type SketchItem,
} from './sketch-model';

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 200;
const VIEWBOX_PADDING = 24;
const MAX_PREVIEW_CACHE_ENTRIES = 64;
const MAX_EXCALIDRAW_EXPORT_ELEMENTS = 200;
const MAX_EXCALIDRAW_EXPORT_FILE_BYTES = 2_000_000;
const MAX_LIGHTWEIGHT_EXCALIDRAW_PREVIEW_ITEMS = 120;
const MAX_LIGHTWEIGHT_FREEDRAW_POINTS = 80;
const DEFAULT_EXCALIDRAW_PREVIEW_COLOR = '#1c1b1a';
const DEFAULT_EXCALIDRAW_PREVIEW_STROKE = 2;

interface SketchPreviewState {
  items: SketchItem[];
  svgMarkup: string | null;
}

const previewCache = new Map<string, SketchPreviewState>();

export function computeSketchPreviewGeometry(items: SketchItem[]) {
  const { minX, minY, maxX, maxY } = computeSketchBounds(items);
  const viewBoxX = Math.min(0, minX - VIEWBOX_PADDING);
  const viewBoxY = Math.min(0, minY - VIEWBOX_PADDING);
  return {
    items,
    viewBoxX,
    viewBoxY,
    viewBoxWidth: Math.max(DEFAULT_WIDTH, maxX + VIEWBOX_PADDING - viewBoxX),
    viewBoxHeight: Math.max(DEFAULT_HEIGHT, maxY + VIEWBOX_PADDING - viewBoxY),
  };
}

export function isRenderableSketchJson(file: Pick<ProjectFile, 'kind' | 'name'>): boolean {
  return file.kind === 'sketch' && isSketchJsonFileName(file.name);
}

export function SketchPreview({
  projectId,
  file,
  className,
}: {
  projectId: string;
  file: Pick<ProjectFile, 'kind' | 'name' | 'mtime'>;
  className?: string;
}) {
  const cacheKey = isRenderableSketchJson(file)
    ? sketchPreviewCacheKey(projectId, file.name, file.mtime)
    : null;
  const [preview, setPreview] = useState<SketchPreviewState | null>(() => (
    cacheKey ? previewCache.get(cacheKey) ?? null : null
  ));

  useEffect(() => {
    let cancelled = false;
    if (!isRenderableSketchJson(file)) return;
    const nextCacheKey = sketchPreviewCacheKey(projectId, file.name, file.mtime);
    const cached = previewCache.get(nextCacheKey);
    if (cached) {
      setPreview(cached);
      return;
    }
    setPreview(null);
    void fetchProjectFileText(projectId, file.name, { cache: 'no-store' }).then(async (text) => {
      if (cancelled) return;
      const nextPreview = await buildSketchPreviewState(text);
      if (cancelled) return;
      rememberSketchPreview(nextCacheKey, nextPreview);
      setPreview(nextPreview);
    });
    return () => {
      cancelled = true;
    };
  }, [file.kind, file.name, file.mtime, projectId]);

  const geometry = useMemo(() => {
    const resolvedItems = preview?.items ?? [];
    return computeSketchPreviewGeometry(resolvedItems);
  }, [preview]);

  if (!isRenderableSketchJson(file)) return null;
  return (
    <div
      className={`sketch-preview${preview === null ? ' loading' : ''}${className ? ` ${className}` : ''}`}
      data-testid="sketch-preview-svg"
    >
      {preview?.svgMarkup ? (
        <div
          className="sketch-preview-svg-inner"
          role="img"
          aria-label="Sketch preview"
          dangerouslySetInnerHTML={{ __html: preview.svgMarkup }}
        />
      ) : (
        <svg
          viewBox={`${geometry.viewBoxX} ${geometry.viewBoxY} ${geometry.viewBoxWidth} ${geometry.viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          width={DEFAULT_WIDTH}
          height={DEFAULT_HEIGHT}
          role="img"
          aria-label="Sketch preview"
        >
          <defs>
            <pattern id="sketch-preview-grid" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="1" fill="#d7d4ce" />
            </pattern>
          </defs>
          <rect
            x={geometry.viewBoxX}
            y={geometry.viewBoxY}
            width={geometry.viewBoxWidth}
            height={geometry.viewBoxHeight}
            fill="#f7f5f1"
          />
          <rect
            x={geometry.viewBoxX}
            y={geometry.viewBoxY}
            width={geometry.viewBoxWidth}
            height={geometry.viewBoxHeight}
            fill="url(#sketch-preview-grid)"
          />
          {geometry.items.length > 0 ? (
            geometry.items.map((item, index) => (
              <Fragment key={`${item.kind}-${index}`}>
                {renderSketchSvgItem(item, index)}
              </Fragment>
            ))
          ) : (
            <g className="sketch-preview-empty-mark">
              <path d="M80 80h160M80 120h120" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

async function buildSketchPreviewState(text: string | null): Promise<SketchPreviewState> {
  const parsed = parseSketchWorkspaceDocument(text);
  if (!sketchSceneHasContent(parsed.scene)) {
    return { items: parsed.items, svgMarkup: null };
  }

  const lightweightItems = excalidrawSceneToSketchItems(parsed.scene);
  const svgMarkup = await renderExcalidrawScenePreview(parsed.scene);
  return {
    items: svgMarkup ? [] : lightweightItems,
    svgMarkup,
  };
}

async function renderExcalidrawScenePreview(scene: ExcalidrawSketchScene): Promise<string | null> {
  try {
    if (
      countVisibleExcalidrawElements(scene) > MAX_EXCALIDRAW_EXPORT_ELEMENTS
      || totalExcalidrawFileBytes(scene.files) > MAX_EXCALIDRAW_EXPORT_FILE_BYTES
    ) {
      return null;
    }
    const { exportToSvg, restore } = await import('@excalidraw/excalidraw');
    const restored = restore({
      elements: scene.elements as readonly ExcalidrawElement[],
      appState: scene.appState as Partial<AppState> | null,
      files: scene.files as BinaryFiles,
    }, null, null);
    const elements = restored.elements.filter((element) => !element.isDeleted) as NonDeleted<ExcalidrawElement>[];
    if (elements.length === 0) return null;
    const svg = await exportToSvg({
      elements,
      appState: restored.appState,
      files: restored.files,
      exportPadding: 16,
      skipInliningFonts: true,
    });
    return svg.outerHTML;
  } catch {
    return null;
  }
}

function excalidrawSceneToSketchItems(scene: ExcalidrawSketchScene): SketchItem[] {
  const items: SketchItem[] = [];
  for (const element of scene.elements) {
    if (items.length >= MAX_LIGHTWEIGHT_EXCALIDRAW_PREVIEW_ITEMS) break;
    const item = excalidrawElementToSketchItem(element);
    if (item) items.push(item);
  }
  return items;
}

function excalidrawElementToSketchItem(value: unknown): SketchItem | null {
  if (!isRecord(value) || value.isDeleted === true) return null;
  const type = typeof value.type === 'string' ? value.type : '';
  const x = readFiniteNumber(value.x, 0);
  const y = readFiniteNumber(value.y, 0);
  const color = readString(value.strokeColor, DEFAULT_EXCALIDRAW_PREVIEW_COLOR);
  const size = readFiniteNumber(value.strokeWidth, DEFAULT_EXCALIDRAW_PREVIEW_STROKE);

  if (type === 'rectangle' || type === 'diamond' || type === 'ellipse' || type === 'image' || type === 'frame') {
    const w = readFiniteNumber(value.width, 0);
    const h = readFiniteNumber(value.height, 0);
    if (w === 0 && h === 0) return null;
    return { kind: 'rect', x, y, w, h, color, size };
  }

  if (type === 'arrow' || type === 'line') {
    const points = readExcalidrawPoints(value.points, x, y, 2);
    if (points.length < 2) return null;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (type === 'arrow') {
      return {
        kind: 'arrow',
        x1: first.x,
        y1: first.y,
        x2: last.x,
        y2: last.y,
        color,
        size,
      };
    }
    return { kind: 'pen', points, color, size };
  }

  if (type === 'freedraw') {
    const points = readExcalidrawPoints(value.points, x, y, MAX_LIGHTWEIGHT_FREEDRAW_POINTS);
    return points.length > 0 ? { kind: 'pen', points, color, size } : null;
  }

  if (type === 'text') {
    return {
      kind: 'text',
      x,
      y,
      text: readString(value.text, ''),
      color,
      size: readFiniteNumber(value.fontSize, 16),
    };
  }

  return null;
}

function readExcalidrawPoints(value: unknown, offsetX: number, offsetY: number, limit: number) {
  if (!Array.isArray(value)) return [];
  const step = Math.max(1, Math.ceil(value.length / limit));
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < value.length; index += step) {
    const point = value[index];
    if (!Array.isArray(point)) continue;
    points.push({
      x: offsetX + readFiniteNumber(point[0], 0),
      y: offsetY + readFiniteNumber(point[1], 0),
    });
  }
  const last = value[value.length - 1];
  if (Array.isArray(last)) {
    const lastPoint = {
      x: offsetX + readFiniteNumber(last[0], 0),
      y: offsetY + readFiniteNumber(last[1], 0),
    };
    const currentLast = points[points.length - 1];
    if (!currentLast || currentLast.x !== lastPoint.x || currentLast.y !== lastPoint.y) {
      points.push(lastPoint);
    }
  }
  return points;
}

function countVisibleExcalidrawElements(scene: ExcalidrawSketchScene): number {
  let count = 0;
  for (const element of scene.elements) {
    if (isRecord(element) && element.isDeleted !== true) count += 1;
  }
  return count;
}

function totalExcalidrawFileBytes(files: Record<string, unknown>): number {
  let total = 0;
  for (const file of Object.values(files)) {
    if (!isRecord(file)) continue;
    if (typeof file.dataURL === 'string') total += file.dataURL.length;
  }
  return total;
}

function sketchPreviewCacheKey(projectId: string, name: string, mtime: number): string {
  return `${projectId}\n${name}\n${mtime}`;
}

function rememberSketchPreview(key: string, preview: SketchPreviewState): void {
  if (previewCache.has(key)) previewCache.delete(key);
  previewCache.set(key, preview);
  while (previewCache.size > MAX_PREVIEW_CACHE_ENTRIES) {
    const oldest = previewCache.keys().next().value;
    if (!oldest) break;
    previewCache.delete(oldest);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' || typeof value === 'string'
    ? Number(value)
    : Number.NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function renderSketchSvgItem(item: SketchItem, index: number) {
  const stroke = {
    stroke: item.color,
    strokeWidth: clampSketchSize(item.size),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  if (item.kind === 'pen') {
    if (item.points.length === 0) return null;
    if (item.points.length === 1) {
      const point = item.points[0]!;
      return (
        <circle
          data-sketch-item={index}
          cx={clampSketchNumber(point.x)}
          cy={clampSketchNumber(point.y)}
          r={Math.max(1, clampSketchSize(item.size) / 2)}
          fill={item.color}
        />
      );
    }
    const path = item.points
      .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${clampSketchNumber(point.x)} ${clampSketchNumber(point.y)}`)
      .join(' ');
    return <path data-sketch-item={index} d={path} {...stroke} />;
  }
  if (item.kind === 'rect') {
    const x = clampSketchNumber(item.x);
    const y = clampSketchNumber(item.y);
    const w = clampSketchNumber(item.w);
    const h = clampSketchNumber(item.h);
    return (
      <rect
        data-sketch-item={index}
        x={Math.min(x, x + w)}
        y={Math.min(y, y + h)}
        width={Math.abs(w)}
        height={Math.abs(h)}
        {...stroke}
      />
    );
  }
  if (item.kind === 'arrow') {
    const x1 = clampSketchNumber(item.x1);
    const y1 = clampSketchNumber(item.y1);
    const x2 = clampSketchNumber(item.x2);
    const y2 = clampSketchNumber(item.y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 10 + clampSketchSize(item.size) * 2;
    const leftX = x2 - head * Math.cos(angle - Math.PI / 6);
    const leftY = y2 - head * Math.sin(angle - Math.PI / 6);
    const rightX = x2 - head * Math.cos(angle + Math.PI / 6);
    const rightY = y2 - head * Math.sin(angle + Math.PI / 6);
    return (
      <>
        <path data-sketch-item={index} d={`M ${x1} ${y1} L ${x2} ${y2}`} {...stroke} />
        <path d={`M ${x2} ${y2} L ${leftX} ${leftY} M ${x2} ${y2} L ${rightX} ${rightY}`} {...stroke} />
      </>
    );
  }
  return (
    <text
      data-sketch-item={index}
      x={clampSketchNumber(item.x)}
      y={clampSketchNumber(item.y)}
      fill={item.color}
      fontSize={Math.max(12, clampSketchSize(item.size))}
      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    >
      {normalizeSketchText(item.text)}
    </text>
  );
}
