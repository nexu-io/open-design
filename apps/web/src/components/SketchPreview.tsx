import { Fragment, useEffect, useMemo, useState } from 'react';
import { fetchProjectFileText } from '../providers/registry';
import type { ProjectFile } from '../types';
import {
  clampSketchNumber,
  clampSketchSize,
  computeSketchBounds,
  isSketchJsonFileName,
  normalizeSketchText,
  parseSketchDocument,
  type SketchItem,
} from './sketch-model';

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 200;
const VIEWBOX_PADDING = 24;

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
  const [items, setItems] = useState<SketchItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    if (!isRenderableSketchJson(file)) return;
    void fetchProjectFileText(projectId, file.name, { cache: 'no-store' }).then((text) => {
      if (cancelled) return;
      setItems(parseSketchDocument(text));
    });
    return () => {
      cancelled = true;
    };
  }, [file, projectId]);

  const geometry = useMemo(() => {
    const resolvedItems = items ?? [];
    return computeSketchPreviewGeometry(resolvedItems);
  }, [items]);

  if (!isRenderableSketchJson(file)) return null;
  return (
    <div
      className={`sketch-preview${items === null ? ' loading' : ''}${className ? ` ${className}` : ''}`}
      data-testid="sketch-preview-svg"
    >
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
    </div>
  );
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
