// #8230 自由画布 v1 — 画布模型与命令栈（纯逻辑，不碰渲染）。
//
// 画布的持久化形状（`ProjectCanvasState`）由 contracts 定义并归一化；这里只放
// 「在一份已归一化的状态上做一次空间操作」的纯函数，外加一条画布级撤销/重做
// 命令栈。组件把手势翻成这些操作，落库前再由 contracts 归一化兜底，所以这里
// 只关心「合理默认 + 增量变换」，不重复做边界校验。
import {
  MAX_PROJECT_CANVAS_NODES,
  type ProjectCanvasNode,
  type ProjectCanvasState,
  type ProjectCanvasViewport,
} from '@open-design/contracts';

/** 新节点的默认尺寸：够放下一屏 artifact 预览的紧凑卡片。 */
export const DEFAULT_CANVAS_NODE_WIDTH = 480;
export const DEFAULT_CANVAS_NODE_HEIGHT = 360;
// 连续拖上来的 artifact 顺次错开，避免完全叠在一起看不见。
const CASCADE_STEP = 32;
const CASCADE_WRAP = 8;

/** 一块空画布。 */
export function emptyCanvasState(): ProjectCanvasState {
  return { nodes: [] };
}

function maxZ(nodes: readonly ProjectCanvasNode[]): number {
  let z = 0;
  for (const node of nodes) {
    if (node.z > z) z = node.z;
  }
  return z;
}

/** 该 ref 是否已在板上（同一 artifact 默认不重复上板）。 */
export function hasNodeForRef(state: ProjectCanvasState, ref: string): boolean {
  return state.nodes.some((node) => node.ref === ref);
}

export interface AddArtifactNodeInput {
  /** 板上稳定 id，由调用方生成（见 `nextCanvasNodeId`）。 */
  id: string;
  /** 渲染的项目文件（artifact），项目相对名/路径。 */
  ref: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

/**
 * 把一个 artifact 作为新节点加到画布。未给坐标时按已有节点数错开摆放，z 取当前
 * 最高层 +1（新节点默认压在最上面）。达到节点上限时原样返回，不再追加。
 */
export function addArtifactNode(
  state: ProjectCanvasState,
  input: AddArtifactNodeInput,
): ProjectCanvasState {
  if (state.nodes.length >= MAX_PROJECT_CANVAS_NODES) return state;
  if (!input.id.trim() || !input.ref.trim()) return state;
  const cascade = state.nodes.length % CASCADE_WRAP;
  const node: ProjectCanvasNode = {
    id: input.id,
    ref: input.ref,
    x: input.x ?? cascade * CASCADE_STEP,
    y: input.y ?? cascade * CASCADE_STEP,
    w: input.w ?? DEFAULT_CANVAS_NODE_WIDTH,
    h: input.h ?? DEFAULT_CANVAS_NODE_HEIGHT,
    z: maxZ(state.nodes) + 1,
  };
  return { ...state, nodes: [...state.nodes, node] };
}

function replaceNode(
  state: ProjectCanvasState,
  id: string,
  update: (node: ProjectCanvasNode) => ProjectCanvasNode,
): ProjectCanvasState {
  let changed = false;
  const nodes = state.nodes.map((node) => {
    if (node.id !== id) return node;
    const next = update(node);
    if (next !== node) changed = true;
    return next;
  });
  return changed ? { ...state, nodes } : state;
}

/** 移动一个节点到新的画布坐标。 */
export function moveNode(
  state: ProjectCanvasState,
  id: string,
  x: number,
  y: number,
): ProjectCanvasState {
  return replaceNode(state, id, (node) =>
    node.x === x && node.y === y ? node : { ...node, x, y },
  );
}

/** 缩放一个节点的尺寸。非正尺寸按 1 兜底，最终仍由 contracts 归一化。 */
export function resizeNode(
  state: ProjectCanvasState,
  id: string,
  w: number,
  h: number,
): ProjectCanvasState {
  const nextW = w > 0 ? w : 1;
  const nextH = h > 0 ? h : 1;
  return replaceNode(state, id, (node) =>
    node.w === nextW && node.h === nextH ? node : { ...node, w: nextW, h: nextH },
  );
}

/** 把一个节点提到最上层。已在最上层则原样返回。 */
export function bringNodeToFront(state: ProjectCanvasState, id: string): ProjectCanvasState {
  const top = maxZ(state.nodes);
  return replaceNode(state, id, (node) =>
    node.z >= top ? node : { ...node, z: top + 1 },
  );
}

/** 移除一个节点。 */
export function removeNode(state: ProjectCanvasState, id: string): ProjectCanvasState {
  if (!state.nodes.some((node) => node.id === id)) return state;
  return { ...state, nodes: state.nodes.filter((node) => node.id !== id) };
}

/** 设置/更新画布视口。 */
export function setCanvasViewport(
  state: ProjectCanvasState,
  viewport: ProjectCanvasViewport,
): ProjectCanvasState {
  return { ...state, viewport };
}

/**
 * 生成一个板上唯一的节点 id。用 `node-<n>` 递增序，撞到已占用的就继续加，
 * 结果稳定且不依赖随机源，方便测试。
 */
export function nextCanvasNodeId(state: ProjectCanvasState): string {
  const used = new Set(state.nodes.map((node) => node.id));
  let n = state.nodes.length + 1;
  let candidate = `node-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `node-${n}`;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// 画布级撤销/重做命令栈。
//
// React Flow 不带历史。v1 在画布级操作（移动/缩放/层级/增删）上维护一条线性
// 命令栈：每次「提交」把当前态压进 past、清空 redo。范围只到画布外壳，不进
// artifact 内部编辑。
// ---------------------------------------------------------------------------

export interface CanvasHistory {
  present: ProjectCanvasState;
  past: ProjectCanvasState[];
  future: ProjectCanvasState[];
}

/** 单块画布最多回退的步数，挡住无限增长的历史。 */
export const MAX_CANVAS_HISTORY = 100;

export function createCanvasHistory(present: ProjectCanvasState): CanvasHistory {
  return { present, past: [], future: [] };
}

/**
 * 提交一个新状态：把旧的 present 压入 past，清空 future。与当前 present 相等
 * （同一引用）时不产生历史，避免拖拽 no-op 也占一格。
 */
export function commitCanvasState(
  history: CanvasHistory,
  next: ProjectCanvasState,
): CanvasHistory {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  if (past.length > MAX_CANVAS_HISTORY) past.shift();
  return { present: next, past, future: [] };
}

export function canUndo(history: CanvasHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: CanvasHistory): boolean {
  return history.future.length > 0;
}

export function undoCanvas(history: CanvasHistory): CanvasHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  const past = history.past.slice(0, -1);
  return {
    present: previous,
    past,
    future: [history.present, ...history.future],
  };
}

export function redoCanvas(history: CanvasHistory): CanvasHistory {
  const [next, ...future] = history.future;
  if (!next) return history;
  return {
    present: next,
    past: [...history.past, history.present],
    future,
  };
}
