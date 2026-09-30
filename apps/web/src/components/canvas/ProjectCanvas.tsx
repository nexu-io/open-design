// #8230 自由画布 v1 —— 画布外壳组件。
//
// 一块能平级塞多个 artifact、能自由摆放对比的画布。底座是 React Flow
// （`@xyflow/react`），但连线/句柄全关，皮成 tldraw 那样的对比板：每个
// artifact 是一枚节点，带 `{ x, y, w, h, z }`。
//
// 两层编辑边界很明确：画布级操作（移动/缩放/层级/增删）作用在外壳，走
// canvas-model 的命令栈做撤销/重做；artifact 内部的编辑仍在各自的沙箱 iframe
// 里，两层不抢同一个手势。
//
// 渲染策略（RFC 拍板）：快照优先。未聚焦的节点只画一张轻量占位，点中某节点才
// 把它升级成真正的沙箱预览（`renderArtifact`）——同时跑 N 个 live 沙箱既重又难
// 管。v1 的闭环是「把已产出的 artifact 拖上板对比」，就地生成留给后续。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  NodeResizer,
  NodeToolbar,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeProps,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';

import { Button } from '@open-design/components';
import type { ProjectCanvasState } from '@open-design/contracts';
import type { ProjectFile } from '../../types';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import {
  addArtifactNode,
  canRedo,
  canUndo,
  commitCanvasState,
  createCanvasHistory,
  hasNodeForRef,
  moveNode,
  nextCanvasNodeId,
  redoCanvas,
  removeNode,
  resizeNode,
  setCanvasViewport,
  undoCanvas,
  type CanvasHistory,
} from './canvas-model';

export const PROJECT_CANVAS_ARTIFACT_DRAG_MIME =
  'application/x-open-design-canvas-artifact';

const DEFAULT_CANVAS_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/** 每枚节点交给自定义组件的数据。`file` 缺失说明 ref 已在项目里被删。 */
interface ArtifactNodeData extends Record<string, unknown> {
  ref: string;
  file: ProjectFile | null;
  focused: boolean;
  renderArtifact: (file: ProjectFile) => React.ReactNode;
  onRemove: (id: string) => void;
  onResize: (id: string, width: number, height: number) => void;
}

type ArtifactFlowNode = Node<ArtifactNodeData, 'artifact'>;

// 节点占位：未聚焦时只画一张标题卡，够看清是哪个 artifact，又不吃沙箱开销。
function ArtifactNode({ id, data, selected }: NodeProps<ArtifactFlowNode>) {
  const t = useT();
  const label = data.file?.name ?? data.ref;
  return (
    <div className={`canvas-node ${data.focused ? 'is-live' : 'is-snapshot'}`}>
      <NodeResizer
        nodeId={id}
        isVisible={selected || data.focused}
        minWidth={160}
        minHeight={120}
        onResizeEnd={(_event, params) => data.onResize(id, params.width, params.height)}
      />
      <NodeToolbar nodeId={id} isVisible={selected || data.focused}>
        <button
          type="button"
          className="canvas-node-action"
          data-testid="canvas-node-remove"
          aria-label={t('common.delete')}
          title={t('common.delete')}
          onClick={() => data.onRemove(id)}
        >
          <Icon name="trash" size={14} />
        </button>
      </NodeToolbar>
      <div className="canvas-node-titlebar">
        <span className="canvas-node-title" title={label}>
          {label}
        </span>
      </div>
      <div className="canvas-node-body">
        {data.focused && data.file ? (
          data.renderArtifact(data.file)
        ) : (
          <div className="canvas-node-snapshot" data-testid="canvas-node-snapshot">
            <span className="canvas-node-snapshot-label">{label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// 稳定引用：React Flow 要求 nodeTypes 身份稳定，否则每次渲染都当成新类型重挂。
const NODE_TYPES: NodeTypes = { artifact: ArtifactNode };

export interface ProjectCanvasProps {
  /** 画布持久化状态（已归一化）。 */
  state: ProjectCanvasState;
  /** 画布级编辑落库入口，参数是新的归一化前状态。 */
  onStateChange: (next: ProjectCanvasState) => void;
  /** 项目可见文件，用来把节点的 ref 解析回 ProjectFile。 */
  files: ProjectFile[];
  /** 把一个 artifact 渲染成沙箱预览（复用 FileViewer）。 */
  renderArtifact: (file: ProjectFile) => React.ReactNode;
}

export function ProjectCanvasInner({
  state,
  onStateChange,
  files,
  renderArtifact,
}: ProjectCanvasProps) {
  const t = useT();
  const { screenToFlowPosition } = useReactFlow();
  const [history, setHistory] = useState<CanvasHistory>(() => createCanvasHistory(state));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [artifactMenuOpen, setArtifactMenuOpen] = useState(false);
  const artifactMenuRef = useRef<HTMLDivElement | null>(null);

  // 只有当父层传入的 `state` prop 换成了另一个对象（切项目/切画布）才重置命令
  // 栈——沿用 FileWorkspace 认 `tabsState` prop 引用的写法。组件自身提交不改这个
  // prop，所以本地 undo/redo 历史不会被自己的落库回灌冲掉。
  const lastStatePropRef = useRef(state);
  if (lastStatePropRef.current !== state) {
    lastStatePropRef.current = state;
    setHistory(createCanvasHistory(state));
  }

  const present = history.present;

  const filesByName = useMemo(() => {
    const map = new Map<string, ProjectFile>();
    for (const file of files) {
      map.set(file.name, file);
      if (file.path) map.set(file.path, file);
    }
    return map;
  }, [files]);

  const availableFiles = useMemo(
    () => files.filter(
      (file) =>
        !hasNodeForRef(present, file.name)
        && (!file.path || !hasNodeForRef(present, file.path)),
    ),
    [files, present],
  );

  useEffect(() => {
    if (!artifactMenuOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!artifactMenuRef.current?.contains(event.target as globalThis.Node)) {
        setArtifactMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setArtifactMenuOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [artifactMenuOpen]);

  // 一次画布级提交：压栈 + 通知父层落库。引用相等（no-op）时命令栈自己会忽略。
  const commit = useCallback(
    (next: ProjectCanvasState) => {
      if (next === present) return;
      setHistory((current) => commitCanvasState(current, next));
      onStateChange(next);
    },
    [onStateChange, present],
  );

  const handleRemove = useCallback(
    (id: string) => {
      setFocusedId((current) => (current === id ? null : current));
      commit(removeNode(present, id));
    },
    [commit, present],
  );

  const handleResize = useCallback(
    (id: string, width: number, height: number) => {
      commit(resizeNode(present, id, width, height));
    },
    [commit, present],
  );

  const handleAddArtifact = useCallback(
    (ref: string, position?: { x: number; y: number }) => {
      if (!filesByName.has(ref) || hasNodeForRef(present, ref)) return;
      const id = nextCanvasNodeId(present);
      const next = addArtifactNode(present, { id, ref, ...position });
      if (next === present) return;
      setFocusedId(id);
      setArtifactMenuOpen(false);
      commit(next);
    },
    [commit, filesByName, present],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(PROJECT_CANVAS_ARTIFACT_DRAG_MIME)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const ref = event.dataTransfer.getData(PROJECT_CANVAS_ARTIFACT_DRAG_MIME).trim();
      if (!ref) return;
      event.preventDefault();
      handleAddArtifact(
        ref,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [handleAddArtifact, screenToFlowPosition],
  );

  const nodes = useMemo<ArtifactFlowNode[]>(
    () =>
      present.nodes.map((node) => ({
        id: node.id,
        type: 'artifact',
        position: { x: node.x, y: node.y },
        width: node.w,
        height: node.h,
        zIndex: node.z,
        selected: focusedId === node.id,
        data: {
          ref: node.ref,
          file: filesByName.get(node.ref) ?? null,
          focused: focusedId === node.id,
          renderArtifact,
          onRemove: handleRemove,
          onResize: handleResize,
        },
      })),
    [filesByName, focusedId, handleRemove, handleResize, present.nodes, renderArtifact],
  );

  const handleUndo = useCallback(() => {
    setHistory((current) => {
      if (!canUndo(current)) return current;
      const next = undoCanvas(current);
      onStateChange(next.present);
      return next;
    });
  }, [onStateChange]);

  const handleRedo = useCallback(() => {
    setHistory((current) => {
      if (!canRedo(current)) return current;
      const next = redoCanvas(current);
      onStateChange(next.present);
      return next;
    });
  }, [onStateChange]);

  const handleNodeClick = useCallback((_event: unknown, node: ArtifactFlowNode) => {
    setFocusedId(node.id);
  }, []);

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: ArtifactFlowNode) => {
      commit(moveNode(present, node.id, node.position.x, node.position.y));
    },
    [commit, present],
  );

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      commit(setCanvasViewport(present, viewport));
    },
    [commit, present],
  );

  const isEmpty = present.nodes.length === 0;

  return (
    <div className="project-canvas" data-testid="project-canvas">
      <ReactFlow
        nodes={nodes}
        nodeTypes={NODE_TYPES}
        defaultViewport={state.viewport ?? DEFAULT_CANVAS_VIEWPORT}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        nodesConnectable={false}
        elementsSelectable
        nodesDraggable
        panOnScroll
        selectionOnDrag
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        className="project-canvas-flow"
      >
        <Background variant={BackgroundVariant.Dots} className="project-canvas-bg" />
        <Controls showInteractive={false} />
        <Panel position="top-left" className="project-canvas-toolbar">
          <div className="canvas-artifact-picker" ref={artifactMenuRef}>
            <Button
              variant="ghost"
              size="icon"
              className="canvas-toolbar-action"
              data-testid="canvas-add-artifact"
              aria-label={t('workspace.canvasAddArtifact')}
              title={t('workspace.canvasAddArtifact')}
              aria-haspopup="menu"
              aria-expanded={artifactMenuOpen}
              disabled={availableFiles.length === 0}
              onClick={() => setArtifactMenuOpen((open) => !open)}
            >
              <Icon name="plus" size={14} />
            </Button>
            {artifactMenuOpen ? (
              <div
                className="canvas-artifact-menu"
                role="menu"
                aria-label={t('workspace.canvasAddArtifact')}
              >
                {availableFiles.map((file) => {
                  const ref = file.path || file.name;
                  return (
                    <Button
                      key={ref}
                      variant="ghost"
                      className="canvas-artifact-menu-item"
                      role="menuitem"
                      onClick={() => handleAddArtifact(ref)}
                    >
                      <Icon name="file" size={14} />
                      <span>{file.name}</span>
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="canvas-toolbar-action"
            data-testid="canvas-undo"
            aria-label={t('manualEdit.undo')}
            title={t('manualEdit.undo')}
            disabled={!canUndo(history)}
            onClick={handleUndo}
          >
            <Icon name="undo" size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar-action"
            data-testid="canvas-redo"
            aria-label={t('manualEdit.redo')}
            title={t('manualEdit.redo')}
            disabled={!canRedo(history)}
            onClick={handleRedo}
          >
            <Icon name="redo" size={14} />
          </button>
        </Panel>
      </ReactFlow>
      {isEmpty ? (
        <div className="project-canvas-empty" data-testid="project-canvas-empty">
          <p className="project-canvas-empty-title">{t('workspace.newCanvas')}</p>
          <p className="project-canvas-empty-hint">{t('workspace.newCanvasDescription')}</p>
        </div>
      ) : null}
    </div>
  );
}

// React Flow 的 hooks 需要 provider 上下文；对外只暴露包好 provider 的组件。
export function ProjectCanvas(props: ProjectCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProjectCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
