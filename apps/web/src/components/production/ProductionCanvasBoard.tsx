import { useEffect, useMemo, useRef, useState } from 'react';

import {
  addCanvasEdge,
  createCustomCanvasNode,
  createDefaultCanvasSnapshot,
  normalizeCanvasSnapshot,
  readCanvasSnapshot,
  removeCanvasEdge,
  removeCanvasNode,
  type ProductionCanvasNode,
  type ProductionCanvasSnapshot,
  updateCanvasNode,
  writeCanvasSnapshot,
} from './canvas-state';

interface Props {
  projectId: string;
}

interface DragState {
  id: string;
  offsetX: number;
  offsetY: number;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 216;
const CORE_NODE_IDS = new Set(['script', 'voice', 'storyboard', 'threeD', 'assets', 'output']);

function isCoreNode(nodeId: string) {
  return CORE_NODE_IDS.has(nodeId);
}

export function ProductionCanvasBoard({ projectId }: Props) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const loadedSnapshot = useMemo(
    () => readCanvasSnapshot(projectId) ?? createDefaultCanvasSnapshot(),
    [projectId],
  );
  const [snapshot, setSnapshot] = useState<ProductionCanvasSnapshot>(() => loadedSnapshot);
  const [pendingConnection, setPendingConnection] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(loadedSnapshot);
    setPendingConnection(null);
  }, [loadedSnapshot]);

  useEffect(() => {
    writeCanvasSnapshot(projectId, normalizeCanvasSnapshot(snapshot));
  }, [projectId, snapshot]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const nextX = Math.max(16, event.clientX - rect.left - dragState.offsetX);
      const nextY = Math.max(16, event.clientY - rect.top - dragState.offsetY);
      setSnapshot((current) =>
        updateCanvasNode(current, dragState.id, (node) => ({
          ...node,
          x: nextX,
          y: nextY,
        })),
      );
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const nodeLookup = useMemo(
    () => new Map(snapshot.nodes.map((node) => [node.id, node] as const)),
    [snapshot.nodes],
  );

  const pendingConnectionTitle = pendingConnection ? nodeLookup.get(pendingConnection)?.title : null;

  const addCustomNode = () => {
    setSnapshot((current) => {
      const nextNode = createCustomCanvasNode(current);
      return normalizeCanvasSnapshot({
        ...current,
        nextNodeNumber: current.nextNodeNumber + 1,
        nodes: [...current.nodes, nextNode],
      });
    });
  };

  const updateNode = (nodeId: string, updater: (node: ProductionCanvasNode) => ProductionCanvasNode) => {
    setSnapshot((current) => updateCanvasNode(current, nodeId, updater));
  };

  const deleteNode = (nodeId: string) => {
    if (isCoreNode(nodeId)) {
      return;
    }
    setSnapshot((current) => removeCanvasNode(current, nodeId));
    setPendingConnection((current) => (current === nodeId ? null : current));
  };

  const connectNodes = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    setSnapshot((current) => addCanvasEdge(current, from, to));
    setPendingConnection(null);
  };

  const removeConnection = (from: string, to: string) => {
    setSnapshot((current) => removeCanvasEdge(current, from, to));
  };

  return (
    <section className="production-canvas-board" aria-label="Production canvas" data-testid="production-canvas-board">
      <div className="production-canvas-board__header">
        <div>
          <p className="production-canvas-board__eyebrow">Canvas draft</p>
          <h3>Move, edit, and connect the production cards</h3>
        </div>
        <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
          <button type="button" className="production-workspace__secondary-action" onClick={addCustomNode}>
            新增節點
          </button>
          <p className="production-canvas-board__hint" style={{ maxWidth: 360, margin: 0 }}>
            Core nodes stay fixed for the workflow backbone. Custom nodes can be added, renamed, and deleted.
          </p>
        </div>
      </div>
      <p className="production-canvas-board__status" aria-live="polite" data-testid="production-canvas-status">
        {pendingConnectionTitle
          ? `Connecting from ${pendingConnectionTitle}. Choose a target card to finish the link.`
          : 'No active connection. Start with any card that should drive the next step.'}
      </p>

      <div
        ref={boardRef}
        className="production-canvas-board__surface"
        role="group"
        aria-label="Production canvas surface"
        style={{
          position: 'relative',
          minHeight: 520,
          overflow: 'hidden',
          borderRadius: 24,
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background:
            'linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.82))',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        <svg
          aria-hidden="true"
          className="production-canvas-board__edges"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          <defs>
            <marker
              id="production-canvas-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="rgba(148, 163, 184, 0.95)" />
            </marker>
          </defs>
          {snapshot.edges.map(({ from, to }) => {
            const fromNode = nodeLookup.get(from);
            const toNode = nodeLookup.get(to);
            if (!fromNode || !toNode) return null;
            const startX = fromNode.x + NODE_WIDTH;
            const startY = fromNode.y + NODE_HEIGHT / 2;
            const endX = toNode.x;
            const endY = toNode.y + NODE_HEIGHT / 2;
            const curveOffset = Math.max(72, Math.abs(endX - startX) * 0.35);
            const controlX1 = startX + curveOffset;
            const controlX2 = endX - curveOffset;
            return (
              <path
                key={`${from}-${to}`}
                data-testid={`production-canvas-edge-${from}-${to}`}
                d={`M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`}
                fill="none"
                stroke="rgba(148, 163, 184, 0.9)"
                strokeWidth="2"
                strokeDasharray="8 8"
                markerEnd="url(#production-canvas-arrow)"
              />
            );
          })}
        </svg>
        {snapshot.nodes.map((node) => {
          const outgoingEdges = snapshot.edges.filter((edge) => edge.from === node.id);
          const outgoingTitles = outgoingEdges.map((edge) => ({
            ...edge,
            title: nodeLookup.get(edge.to)?.title ?? edge.to,
          }));

          return (
            <div
              key={node.id}
              className="production-canvas-board__node"
              data-testid={`production-canvas-node-${node.id}`}
              role="group"
              aria-label={`${node.title} node`}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: NODE_WIDTH,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '16px 18px',
                textAlign: 'left',
                borderRadius: 20,
                border: '1px solid rgba(226, 232, 240, 0.16)',
                background: 'rgba(15, 23, 42, 0.88)',
                color: '#e2e8f0',
                boxShadow: '0 16px 40px rgba(15, 23, 42, 0.24)',
                cursor: 'grab',
                transform: `translate(${node.x}px, ${node.y}px)`,
              }}
              onPointerDown={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest('button, input, textarea, select, label')) return;
                const board = boardRef.current;
                const rect = board?.getBoundingClientRect();
                if (!board || !rect) return;
                dragStateRef.current = {
                  id: node.id,
                  offsetX: event.clientX - rect.left - node.x,
                  offsetY: event.clientY - rect.top - node.y,
                };
              }}
            >
              <div
                className="production-canvas-board__node-topline"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 6, flex: 1 }}>
                  <span className="production-canvas-board__node-title">Title</span>
                  <input
                    aria-label={`${node.title} 標題`}
                    value={node.title}
                    onChange={(event) =>
                      updateNode(node.id, (current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                    style={{
                      width: '100%',
                      borderRadius: 14,
                      border: '1px solid rgba(148, 163, 184, 0.28)',
                      background: 'rgba(2, 6, 23, 0.72)',
                      color: '#e2e8f0',
                      padding: '8px 12px',
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="production-workspace__secondary-action"
                  aria-label={`刪除 ${node.title} 節點`}
                  disabled={isCoreNode(node.id)}
                  title={isCoreNode(node.id) ? 'Core nodes are kept as the workflow backbone.' : 'Remove this custom node.'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => deleteNode(node.id)}
                  style={{
                    minWidth: 64,
                    opacity: isCoreNode(node.id) ? 0.55 : 1,
                  }}
                >
                  刪除
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="production-workspace__secondary-action"
                  style={{
                    borderRadius: 999,
                    paddingInline: 12,
                  }}
                  aria-label={
                    pendingConnection === node.id ? `取消 ${node.title} 的輸出連線` : `Start outgoing link from ${node.title}`
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setPendingConnection((current) => (current === node.id ? null : node.id));
                  }}
                >
                  {pendingConnection === node.id ? 'Cancel' : 'Out'}
                </button>
                <button
                  type="button"
                  className="production-workspace__secondary-action"
                  style={{
                    borderRadius: 999,
                    paddingInline: 12,
                  }}
                  aria-label={pendingConnection ? `Complete link to ${node.title}` : `Choose a source node first for ${node.title}`}
                  disabled={!pendingConnection || pendingConnection === node.id}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    if (!pendingConnection || pendingConnection === node.id) return;
                    connectNodes(pendingConnection, node.id);
                  }}
                >
                  In
                </button>
              </div>

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="production-canvas-board__node-title">Description</span>
                <textarea
                  aria-label={`${node.title} 說明`}
                  value={node.description}
                  rows={3}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderRadius: 14,
                    border: '1px solid rgba(148, 163, 184, 0.28)',
                    background: 'rgba(2, 6, 23, 0.72)',
                    color: '#e2e8f0',
                    padding: '10px 12px',
                    lineHeight: 1.5,
                  }}
                />
              </label>

              <div style={{ display: 'grid', gap: 6 }}>
                <span className="production-canvas-board__node-title">Outgoing links</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {outgoingTitles.length > 0 ? (
                    outgoingTitles.map((edge) => (
                      <button
                        key={`${edge.from}-${edge.to}`}
                        type="button"
                        className="production-workspace__secondary-action"
                        aria-label={`移除 ${node.title} 到 ${edge.title} 的連線`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => removeConnection(edge.from, edge.to)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          borderRadius: 999,
                          paddingInline: 12,
                        }}
                      >
                        <span>{edge.title}</span>
                        <span aria-hidden="true">×</span>
                      </button>
                    ))
                  ) : (
                    <span style={{ color: '#94a3b8' }}>No outgoing links yet.</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
