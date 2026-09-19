// #8230 自由画布 v1 —— `@xyflow/react` 的 vitest 替身。
//
// 真正的 React Flow 依赖浏览器几何（ResizeObserver、getBoundingClientRect、
// 指针事件、d3-zoom transform），在 jsdom 下既跑不动也没有可断言的语义。这里
// 只复刻 ProjectCanvas 实际用到的那层「渲染面」：把传入的 `nodes` 按 `nodeTypes`
// 渲染成可查询的 DOM，把工具条/背景/控件透传出来，并对回调 API 给出可触发的
// 桩，让组件的命令栈接线能在测试里被验证。
//
// 组件身份必须稳定：Background/Controls/Panel/NodeResizer/NodeToolbar/ReactFlow
// 都是模块级函数组件（不是每次 `get` 现造），否则 React 会把整棵子树卸载重挂，
// findBy* 之后 fire 事件会打到已 detached 的节点（motion-mock 踩过的坑）。
import {
  type CSSProperties,
  type ComponentType,
  type DragEvent,
  type ReactNode,
} from 'react';

// ---- 枚举（值导出，组件按枚举成员传参） ----
export enum BackgroundVariant {
  Lines = 'lines',
  Dots = 'dots',
  Cross = 'cross',
}

export enum Position {
  Top = 'top',
  Right = 'right',
  Bottom = 'bottom',
  Left = 'left',
}

export enum PanOnScrollMode {
  Free = 'free',
  Vertical = 'vertical',
  Horizontal = 'horizontal',
}

// ---- 最小类型面（组件用作类型标注，运行时不参与） ----
export type XYPosition = { x: number; y: number };
export type Viewport = { x: number; y: number; zoom: number };
export type Node<
  NodeData extends Record<string, unknown> = Record<string, unknown>,
  NodeType extends string | undefined = string | undefined,
> = {
  id: string;
  type?: NodeType;
  position: XYPosition;
  data: NodeData;
  width?: number;
  height?: number;
  selected?: boolean;
  zIndex?: number;
  draggable?: boolean;
  selectable?: boolean;
  style?: CSSProperties;
  className?: string;
};
export type NodeProps<NodeType extends Node = Node> = {
  id: string;
  data: NodeType['data'];
  selected?: boolean;
  type?: string;
  width?: number;
  height?: number;
  dragging?: boolean;
  zIndex?: number;
};
export type NodeTypes = Record<string, ComponentType<NodeProps>>;
export type NodeChange = { id: string; type: string };
export type OnNodesChange = (changes: NodeChange[]) => void;
export type ReactFlowProps = Record<string, unknown>;

// ---- 装饰件：背景 / 控件 / 面板 / 缩放条 ----
export function Background(props: { variant?: BackgroundVariant; className?: string }) {
  return (
    <div
      data-testid="rf-background"
      data-variant={props.variant ?? BackgroundVariant.Dots}
      className={props.className}
    />
  );
}

export function Controls({ children }: { children?: ReactNode }) {
  return <div data-testid="rf-controls">{children}</div>;
}

export function MiniMap() {
  return <div data-testid="rf-minimap" />;
}

export function Panel({
  children,
  position,
  className,
}: {
  children?: ReactNode;
  position?: string;
  className?: string;
}) {
  return (
    <div data-testid="rf-panel" data-position={position ?? ''} className={className}>
      {children}
    </div>
  );
}

export function Handle() {
  // v1 不连线，句柄不渲染任何东西。
  return null;
}

// 节点内自定义组件用它做缩放把手。真实实现拖动改尺寸；替身只暴露一个可点的
// 桩，`onResizeEnd` 用固定增量回调，验证组件把 resize 接进命令栈。
export function NodeResizer(props: {
  nodeId?: string;
  isVisible?: boolean;
  onResizeEnd?: (
    event: unknown,
    params: { width: number; height: number; x: number; y: number },
  ) => void;
}) {
  if (props.isVisible === false) return null;
  return (
    <button
      type="button"
      data-testid="rf-node-resizer"
      data-node-id={props.nodeId ?? ''}
      onClick={() =>
        props.onResizeEnd?.(null, { width: 640, height: 480, x: 0, y: 0 })
      }
    />
  );
}

export function NodeToolbar({
  children,
  nodeId,
  isVisible,
}: {
  children?: ReactNode;
  nodeId?: string | string[];
  isVisible?: boolean;
}) {
  if (isVisible === false) return null;
  return (
    <div
      data-testid="rf-node-toolbar"
      data-node-id={Array.isArray(nodeId) ? nodeId.join(',') : nodeId ?? ''}
    >
      {children}
    </div>
  );
}

export function ReactFlowProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

// ---- hooks 桩 ----
export function useReactFlow() {
  return {
    fitView: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    setViewport: () => {},
    getViewport: (): Viewport => ({ x: 0, y: 0, zoom: 1 }),
    screenToFlowPosition: (p: XYPosition): XYPosition => p,
  };
}

export function useViewport(): Viewport {
  return { x: 0, y: 0, zoom: 1 };
}

// 纯函数桩：位置变更就地套用，够组件在测试里跑通 onNodesChange 分支。
export function applyNodeChanges<T extends Node>(
  changes: Array<{ id: string; type: string; position?: XYPosition }>,
  nodes: T[],
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  for (const change of changes) {
    if (change.type === 'position' && change.position) {
      const node = byId.get(change.id);
      if (node) byId.set(change.id, { ...node, position: change.position });
    }
  }
  return nodes.map((node) => byId.get(node.id) ?? node);
}

// ---- 画布本体 ----
//
// 只渲染 `nodes`（不管 edges），按 `nodeTypes[node.type]` 找到自定义组件把它
// 渲染出来，外层包一枚可查询的 wrapper（带 node id / ref / selected）。点击
// wrapper 触发 `onNodeClick`，双击触发 `onNodeDoubleClick`，让选中/聚焦接线
// 可被断言。`children`（Background/Controls/Panel/工具条）原样渲染在后面。
interface ReactFlowMockProps {
  nodes?: Node[];
  nodeTypes?: NodeTypes;
  children?: ReactNode;
  onNodeClick?: (event: unknown, node: Node) => void;
  onNodeDoubleClick?: (event: unknown, node: Node) => void;
  onNodeDragStop?: (event: unknown, node: Node) => void;
  onSelectionChange?: (params: { nodes: Node[] }) => void;
  defaultViewport?: Viewport;
  onMoveEnd?: (event: unknown, viewport: Viewport) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  className?: string;
}

export function ReactFlow({
  nodes = [],
  nodeTypes = {},
  children,
  onNodeClick,
  onNodeDoubleClick,
  defaultViewport,
  onMoveEnd,
  onDragOver,
  onDrop,
  className,
}: ReactFlowMockProps) {
  return (
    <div
      data-testid="react-flow"
      data-default-viewport={defaultViewport ? JSON.stringify(defaultViewport) : ''}
      className={className}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div data-testid="rf-viewport">
        {nodes.map((node) => {
          const NodeComponent = node.type ? nodeTypes[node.type] : undefined;
          const ref =
            typeof node.data?.ref === 'string' ? (node.data.ref as string) : '';
          return (
            <div
              key={node.id}
              data-testid="rf-node"
              data-node-id={node.id}
              data-node-ref={ref}
              data-selected={node.selected ? 'true' : 'false'}
              style={{
                position: 'absolute',
                transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                width: node.width,
                height: node.height,
                zIndex: node.zIndex,
              }}
              onClick={(event) => onNodeClick?.(event, node)}
              onDoubleClick={(event) => onNodeDoubleClick?.(event, node)}
            >
              {NodeComponent ? (
                <NodeComponent
                  id={node.id}
                  data={node.data}
                  selected={Boolean(node.selected)}
                  type={node.type}
                  width={node.width}
                  height={node.height}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {children}
      <button
        type="button"
        data-testid="rf-move-end"
        onClick={() => onMoveEnd?.(null, { x: -80, y: 24, zoom: 0.6 })}
      />
    </div>
  );
}

export default ReactFlow;
