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
  version: number;
  items: unknown[];
}

export interface ExcalidrawSketchScene {
  elements: readonly unknown[];
  appState: Record<string, unknown> | null;
  files: Record<string, unknown>;
}

export interface ParsedSketchWorkspaceDocument {
  version: number;
  items: SketchItem[];
  rawItems: unknown[];
  scene: ExcalidrawSketchScene;
  format: 'legacy' | 'excalidraw' | 'empty';
}

const MAX_ABS_COORDINATE = 100_000;
const MAX_ITEM_SIZE = 4_096;
const DEFAULT_SKETCH_COLOR = '#1c1b1a';
const DEFAULT_SKETCH_SHAPE_SIZE = 2;
const DEFAULT_SKETCH_TEXT_SIZE = 16;
const DEFAULT_SKETCH_VERSION = 1;
const EXCALIDRAW_DOCUMENT_VERSION = 2;
const OPEN_DESIGN_EXCALIDRAW_SOURCE = 'https://open-design.ai/sketch';

export function parseSketchDocument(text: string | null): SketchItem[] {
  return parseSketchWorkspaceDocument(text).items;
}

export function parseSketchWorkspaceDocument(
  text: string | null,
): ParsedSketchWorkspaceDocument {
  if (!text) return emptyParsedSketchWorkspaceDocument();
  try {
    const parsed: unknown = JSON.parse(text);
    const scene = normalizeExcalidrawSketchScene(parsed);
    if (scene) {
      return {
        version: normalizeSketchVersion(isSketchRecord(parsed) ? parsed['version'] : undefined),
        rawItems: [],
        items: [],
        scene,
        format: 'excalidraw',
      };
    }
    if (!isSketchRecord(parsed) || !Array.isArray(parsed.items)) {
      return emptyParsedSketchWorkspaceDocument();
    }
    const rawItems = parsed.items.slice();
    return {
      version: normalizeSketchVersion(parsed['version']),
      rawItems,
      items: rawItems.flatMap((item) => {
        const normalized = normalizeSketchItem(item);
        return normalized ? [normalized] : [];
      }),
      scene: emptySketchScene(),
      format: rawItems.length > 0 ? 'legacy' : 'empty',
    };
  } catch {
    return emptyParsedSketchWorkspaceDocument();
  }
}

export function buildSketchDocument(
  version: number,
  rawItems: readonly unknown[],
  items: SketchItem[],
): SketchDocument {
  const mergedItems: unknown[] = [];
  let nextKnownItem = 0;

  for (const rawItem of rawItems) {
    if (normalizeSketchItem(rawItem)) {
      if (nextKnownItem < items.length) {
        mergedItems.push(items[nextKnownItem]!);
      }
      nextKnownItem += 1;
      continue;
    }
    mergedItems.push(rawItem);
  }

  while (nextKnownItem < items.length) {
    mergedItems.push(items[nextKnownItem]!);
    nextKnownItem += 1;
  }

  return {
    version: normalizeSketchVersion(version),
    items: mergedItems,
  };
}

function emptyParsedSketchWorkspaceDocument(): ParsedSketchWorkspaceDocument {
  return {
    version: DEFAULT_SKETCH_VERSION,
    items: [],
    rawItems: [],
    scene: emptySketchScene(),
    format: 'empty',
  };
}

function normalizeSketchVersion(value: unknown): number {
  const numeric = readSketchNumber(value);
  if (numeric === null || numeric < DEFAULT_SKETCH_VERSION) return DEFAULT_SKETCH_VERSION;
  return Math.trunc(numeric);
}

export function isSketchJsonFileName(name: string): boolean {
  return name.endsWith('.sketch.json');
}

export function emptySketchScene(name?: string): ExcalidrawSketchScene {
  return {
    elements: [],
    appState: {
      name: name ?? null,
      viewBackgroundColor: '#ffffff',
      gridSize: null,
    },
    files: {},
  };
}

export function sketchSceneHasContent(scene: ExcalidrawSketchScene | null | undefined): boolean {
  return Boolean(scene?.elements.some((element) => {
    if (!isSketchRecord(element)) return false;
    return element.isDeleted !== true;
  }));
}

export function serializeExcalidrawSketchScene(
  scene: ExcalidrawSketchScene,
  name?: string,
): string {
  return JSON.stringify(buildExcalidrawSketchDocument(scene, name), null, 2);
}

export function buildExcalidrawSketchDocument(
  scene: ExcalidrawSketchScene,
  name?: string,
): Record<string, unknown> {
  const appState = sanitizeExcalidrawAppState(scene.appState);
  if (name && typeof appState.name !== 'string') appState.name = name;
  return {
    type: 'excalidraw',
    version: EXCALIDRAW_DOCUMENT_VERSION,
    source: OPEN_DESIGN_EXCALIDRAW_SOURCE,
    elements: cloneJsonArray(scene.elements),
    appState,
    files: cloneJsonRecord(scene.files),
  };
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
      const text = normalizeSketchText(item.text);
      const textWidth = Math.max(fontSize, text.length * fontSize * 0.62);
      includePoint(x, y - fontSize, 4);
      includePoint(x + textWidth, y + fontSize * 0.2, 4);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 320, maxY: 200 };
  }

  return { minX, minY, maxX, maxY };
}

function normalizeExcalidrawSketchScene(value: unknown): ExcalidrawSketchScene | null {
  if (!isSketchRecord(value) || !Array.isArray(value.elements)) return null;
  return {
    elements: cloneJsonArray(value.elements),
    appState: isSketchRecord(value.appState) ? sanitizeExcalidrawAppState(value.appState) : null,
    files: isSketchRecord(value.files) ? cloneJsonRecord(value.files) : {},
  };
}

export function sanitizeExcalidrawAppState(value: Record<string, unknown> | null): Record<string, unknown> {
  const appState = value ? cloneJsonRecord(value) : {};
  delete appState.collaborators;
  delete appState.contextMenu;
  delete appState.draggingElement;
  delete appState.editingElement;
  delete appState.editingTextElement;
  delete appState.frameToHighlight;
  delete appState.newElement;
  delete appState.openDialog;
  delete appState.openMenu;
  delete appState.openPopup;
  // The library is disabled in the sketch editor; never persist or rehydrate an
  // open sidebar so a saved scene cannot re-open the (now hidden) library panel.
  delete appState.openSidebar;
  delete appState.defaultSidebarDockedPreference;
  delete appState.pendingImageElementId;
  delete appState.resizingElement;
  delete appState.selectionElement;
  delete appState.suggestedBindings;
  return appState;
}

function cloneJsonArray(value: readonly unknown[]): unknown[] {
  return cloneJson(value, []);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneJson(value, {});
}

function cloneJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return fallback;
  }
}

export function clampSketchNumber(value: unknown): number {
  const numeric = readSketchNumber(value);
  if (numeric === null) return 0;
  return Math.max(-MAX_ABS_COORDINATE, Math.min(MAX_ABS_COORDINATE, numeric));
}

export function clampSketchSize(value: unknown): number {
  const numeric = readSketchNumber(value);
  if (numeric === null) return 1;
  return Math.max(1, Math.min(MAX_ITEM_SIZE, numeric));
}

export function normalizeSketchText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isSketchRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readSketchNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSketchCoordinate(value: unknown): number | null {
  const numeric = readSketchNumber(value);
  return numeric === null ? null : clampSketchNumber(numeric);
}

function normalizeSketchShapeSize(value: unknown): number {
  const numeric = readSketchNumber(value);
  return numeric === null ? DEFAULT_SKETCH_SHAPE_SIZE : clampSketchSize(numeric);
}

function normalizeSketchTextSize(value: unknown): number {
  const numeric = readSketchNumber(value);
  return numeric === null ? DEFAULT_SKETCH_TEXT_SIZE : clampSketchSize(numeric);
}

function normalizeSketchColor(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : DEFAULT_SKETCH_COLOR;
}

function normalizeSketchPoint(value: unknown): SketchPoint | null {
  if (!isSketchRecord(value)) return null;
  const x = normalizeSketchCoordinate(value.x);
  const y = normalizeSketchCoordinate(value.y);
  if (x === null || y === null) return null;
  return { x, y };
}

function normalizeSketchItem(value: unknown): SketchItem | null {
  if (!isSketchRecord(value) || typeof value.kind !== 'string') return null;
  if (value.kind === 'pen') return normalizeSketchPen(value);
  if (value.kind === 'rect') return normalizeSketchRect(value);
  if (value.kind === 'arrow') return normalizeSketchArrow(value);
  if (value.kind === 'text') return normalizeSketchTextItem(value);
  return null;
}

function normalizeSketchPen(value: Record<string, unknown>): SketchStroke | null {
  if (!Array.isArray(value.points)) return null;
  const points = value.points.flatMap((point) => {
    const normalized = normalizeSketchPoint(point);
    return normalized ? [normalized] : [];
  });
  if (points.length === 0) return null;
  return {
    kind: 'pen',
    points,
    color: normalizeSketchColor(value.color),
    size: normalizeSketchShapeSize(value.size),
  };
}

function normalizeSketchRect(value: Record<string, unknown>): SketchRectShape | null {
  const x = normalizeSketchCoordinate(value.x);
  const y = normalizeSketchCoordinate(value.y);
  const w = normalizeSketchCoordinate(value.w);
  const h = normalizeSketchCoordinate(value.h);
  if (x === null || y === null || w === null || h === null) return null;
  return {
    kind: 'rect',
    x,
    y,
    w,
    h,
    color: normalizeSketchColor(value.color),
    size: normalizeSketchShapeSize(value.size),
  };
}

function normalizeSketchArrow(value: Record<string, unknown>): SketchArrowShape | null {
  const x1 = normalizeSketchCoordinate(value.x1);
  const y1 = normalizeSketchCoordinate(value.y1);
  const x2 = normalizeSketchCoordinate(value.x2);
  const y2 = normalizeSketchCoordinate(value.y2);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  return {
    kind: 'arrow',
    x1,
    y1,
    x2,
    y2,
    color: normalizeSketchColor(value.color),
    size: normalizeSketchShapeSize(value.size),
  };
}

function normalizeSketchTextItem(value: Record<string, unknown>): SketchTextItem | null {
  const x = normalizeSketchCoordinate(value.x);
  const y = normalizeSketchCoordinate(value.y);
  if (x === null || y === null) return null;
  return {
    kind: 'text',
    x,
    y,
    text: normalizeSketchText(value.text),
    color: normalizeSketchColor(value.color),
    size: normalizeSketchTextSize(value.size),
  };
}
