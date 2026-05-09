export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchStroke {
  kind: 'pen';
  points: SketchPoint[];
  color: string;
  size: number;
}

export interface SketchRectShape {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  size: number;
}

export interface SketchArrowShape {
  kind: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
}

export interface SketchTextItem {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

export type SketchItem = SketchStroke | SketchRectShape | SketchArrowShape | SketchTextItem;

export interface SketchDocument {
  version: 1;
  items: SketchItem[];
}

const MAX_ABS_COORDINATE = 100_000;
const MAX_ITEM_SIZE = 4_096;

export function parseSketchDocument(text: string | null): SketchItem[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as SketchDocument | { items?: SketchItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export function isSketchJsonFileName(name: string): boolean {
  return name.endsWith('.sketch.json');
}

export function computeSketchBounds(items: SketchItem[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includePoint = (x: number, y: number, padding: number) => {
    minX = Math.min(minX, x - padding);
    minY = Math.min(minY, y - padding);
    maxX = Math.max(maxX, x + padding);
    maxY = Math.max(maxY, y + padding);
  };

  for (const item of items) {
    if (item.kind === 'pen') {
      const padding = Math.max(1, clampSketchSize(item.size) / 2);
      for (const point of item.points) includePoint(clampSketchNumber(point.x), clampSketchNumber(point.y), padding);
      continue;
    }
    if (item.kind === 'rect') {
      const padding = Math.max(1, clampSketchSize(item.size) / 2);
      const x = clampSketchNumber(item.x);
      const y = clampSketchNumber(item.y);
      const w = clampSketchNumber(item.w);
      const h = clampSketchNumber(item.h);
      const left = Math.min(x, x + w);
      const top = Math.min(y, y + h);
      const right = Math.max(x, x + w);
      const bottom = Math.max(y, y + h);
      includePoint(left, top, padding);
      includePoint(right, bottom, padding);
      continue;
    }
    if (item.kind === 'arrow') {
      const padding = Math.max(1, clampSketchSize(item.size) / 2) + 16;
      includePoint(clampSketchNumber(item.x1), clampSketchNumber(item.y1), padding);
      includePoint(clampSketchNumber(item.x2), clampSketchNumber(item.y2), padding);
      continue;
    }
    if (item.kind === 'text') {
      const x = clampSketchNumber(item.x);
      const y = clampSketchNumber(item.y);
      const fontSize = Math.max(12, clampSketchSize(item.size));
      const textWidth = Math.max(fontSize, item.text.length * fontSize * 0.62);
      includePoint(x, y - fontSize, 4);
      includePoint(x + textWidth, y + fontSize * 0.2, 4);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 320, maxY: 200 };
  }

  return { minX, minY, maxX, maxY };
}

export function clampSketchNumber(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-MAX_ABS_COORDINATE, Math.min(MAX_ABS_COORDINATE, numeric));
}

export function clampSketchSize(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 1;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(MAX_ITEM_SIZE, numeric));
}
