// #8230 自由画布 v1 — 画布布局契约。
//
// 一个项目在自由画布上平级持有 N 个 artifact，每个 artifact 是一枚节点，
// 带一份 `{ x, y, w, h, z }` 的位置与层级。布局跟着 `ProjectTabsState` 一起
// 存进同一块 tabs JSON，所以这里只定义「纯数据契约 + 归一化」，不碰渲染。
//
// 归一化是不可信输入边界：daemon 落库前、web 读缓存后都过这一道。它沿用
// browserTabs 既有范式——坏节点整枚丢掉、不影响同批的好节点，整体形状不对
// 才返回 null——而不是就地修复出一个似是而非的布局。

/** 单枚画布节点：一个 artifact 在板上的位置、尺寸与层级。 */
export interface ProjectCanvasNode {
  /** 板上稳定的节点 id。 */
  id: string;
  /** 该节点渲染的项目文件（artifact），项目相对名/路径。 */
  ref: string;
  x: number;
  y: number;
  /** 宽，必须为正。 */
  w: number;
  /** 高，必须为正。 */
  h: number;
  /** 层级，越大越靠上。 */
  z: number;
}

/** 画布视口：平移与缩放，用于重载后恢复取景。 */
export interface ProjectCanvasViewport {
  x: number;
  y: number;
  /** 缩放，必须为正。 */
  zoom: number;
}

/** 画布持久化状态：节点集合 + 可选视口。 */
export interface ProjectCanvasState {
  nodes: ProjectCanvasNode[];
  viewport?: ProjectCanvasViewport;
}

/** 单个项目画布最多持有的节点数，挡住异常膨胀的 JSON。 */
export const MAX_PROJECT_CANVAS_NODES = 200;

// 坐标绝对值上限：越界的钳到边界而不是丢节点。
const MAX_CANVAS_COORD = 1_000_000;
// 尺寸上限；下限是「> 0」，非正尺寸直接丢节点。
const MAX_CANVAS_SIZE = 100_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeCanvasNode(value: unknown): ProjectCanvasNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.ref !== 'string' || !record.ref.trim()) return null;
  if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
  if (!isFiniteNumber(record.w) || record.w <= 0) return null;
  if (!isFiniteNumber(record.h) || record.h <= 0) return null;
  return {
    id: record.id,
    ref: record.ref,
    x: clamp(record.x, -MAX_CANVAS_COORD, MAX_CANVAS_COORD),
    y: clamp(record.y, -MAX_CANVAS_COORD, MAX_CANVAS_COORD),
    w: clamp(record.w, 1, MAX_CANVAS_SIZE),
    h: clamp(record.h, 1, MAX_CANVAS_SIZE),
    z: isFiniteNumber(record.z) ? record.z : 0,
  };
}

function normalizeCanvasViewport(value: unknown): ProjectCanvasViewport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
  if (!isFiniteNumber(record.zoom) || record.zoom <= 0) return null;
  return {
    x: clamp(record.x, -MAX_CANVAS_COORD, MAX_CANVAS_COORD),
    y: clamp(record.y, -MAX_CANVAS_COORD, MAX_CANVAS_COORD),
    zoom: record.zoom,
  };
}

export function normalizeProjectCanvasState(value: unknown): ProjectCanvasState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const seen = new Set<string>();
  const nodes: ProjectCanvasNode[] = [];
  if (Array.isArray(record.nodes)) {
    for (const raw of record.nodes) {
      const node = normalizeCanvasNode(raw);
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      nodes.push(node);
      if (nodes.length >= MAX_PROJECT_CANVAS_NODES) break;
    }
  }

  const viewport = normalizeCanvasViewport(record.viewport);
  if (nodes.length === 0 && !viewport) return null;

  const state: ProjectCanvasState = { nodes };
  if (viewport) state.viewport = viewport;
  return state;
}
