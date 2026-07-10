import { useEffect, useMemo, useRef, useState } from 'react';

type CanvasNodeId = 'script' | 'voice' | 'storyboard' | 'threeD' | 'assets' | 'output';

interface CanvasNode {
  id: CanvasNodeId;
  title: string;
  description: string;
  x: number;
  y: number;
}

interface CanvasEdge {
  from: CanvasNodeId;
  to: CanvasNodeId;
}

const INITIAL_NODES: CanvasNode[] = [
  {
    id: 'script',
    title: 'Script',
    description: 'Start with a clear, editable script backbone.',
    x: 36,
    y: 44,
  },
  {
    id: 'voice',
    title: 'Voice',
    description: 'Generate a voiceover from the script in one click.',
    x: 280,
    y: 24,
  },
  {
    id: 'storyboard',
    title: 'Storyboard',
    description: 'Turn beats into shots when you are ready.',
    x: 548,
    y: 86,
  },
  {
    id: 'threeD',
    title: '3D',
    description: 'Plan camera moves, viewpoint changes, and scene depth.',
    x: 802,
    y: 128,
  },
  {
    id: 'assets',
    title: 'Assets',
    description: 'Collect generated and uploaded media in one place.',
    x: 1052,
    y: 26,
  },
  {
    id: 'output',
    title: 'Output',
    description: 'Export the assembled video when the sequence is complete.',
    x: 1320,
    y: 66,
  },
];

const INITIAL_EDGES: CanvasEdge[] = [
  { from: 'script', to: 'voice' },
  { from: 'voice', to: 'storyboard' },
  { from: 'storyboard', to: 'threeD' },
  { from: 'threeD', to: 'assets' },
  { from: 'storyboard', to: 'assets' },
  { from: 'assets', to: 'output' },
];

interface DragState {
  id: CanvasNodeId;
  offsetX: number;
  offsetY: number;
}

export function ProductionCanvasBoard() {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<CanvasEdge[]>(INITIAL_EDGES);
  const [pendingConnection, setPendingConnection] = useState<CanvasNodeId | null>(null);

  const nodeLookup = useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);

  const addEdge = (from: CanvasNodeId, to: CanvasNodeId) => {
    if (from === to) return;
    setEdges((current) =>
      current.some((edge) => edge.from === from && edge.to === to) ? current : [...current, { from, to }],
    );
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const nextX = Math.max(16, event.clientX - rect.left - dragState.offsetX);
      const nextY = Math.max(16, event.clientY - rect.top - dragState.offsetY);
      setNodes((current) =>
        current.map((node) =>
          node.id === dragState.id ? { ...node, x: nextX, y: nextY } : node,
        ),
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

  const pendingConnectionTitle = pendingConnection ? nodeLookup.get(pendingConnection)?.title : null;

  return (
    <section className="production-canvas-board" aria-label="Production canvas" data-testid="production-canvas-board">
      <div className="production-canvas-board__header">
        <div>
          <p className="production-canvas-board__eyebrow">Canvas draft</p>
          <h3>Move the production cards around</h3>
        </div>
        <p className="production-canvas-board__hint">
          Drag cards to reshape the flow. Click Out on one card, then In on another to create a connection.
        </p>
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
          minHeight: 320,
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
            <marker id="production-canvas-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L10,5 L0,10 z" fill="rgba(148, 163, 184, 0.95)" />
            </marker>
          </defs>
          {edges.map(({ from, to }) => {
            const fromNode = nodeLookup.get(from);
            const toNode = nodeLookup.get(to);
            if (!fromNode || !toNode) return null;
            const startX = fromNode.x + 220;
            const startY = fromNode.y + 92;
            const endX = toNode.x;
            const endY = toNode.y + 92;
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
        {nodes.map((node) => (
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
              width: 220,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
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
              const board = boardRef.current;
              const rect = board?.getBoundingClientRect();
              const current = nodeLookup.get(node.id);
              if (!board || !rect || !current) return;
              dragStateRef.current = {
                id: node.id,
                offsetX: event.clientX - rect.left - current.x,
                offsetY: event.clientY - rect.top - current.y,
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
              <span className="production-canvas-board__node-title">{node.title}</span>
              <div
                className="production-canvas-board__node-actions"
                style={{
                  display: 'flex',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="production-canvas-board__link-button"
                  style={{
                    borderRadius: 999,
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    background: pendingConnection === node.id ? 'rgba(96, 165, 250, 0.28)' : 'rgba(30, 41, 59, 0.96)',
                    color: '#e2e8f0',
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  aria-label={
                    pendingConnection === node.id ? `Cancel outgoing link from ${node.title}` : `Start outgoing link from ${node.title}`
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
                  className="production-canvas-board__link-button"
                  style={{
                    borderRadius: 999,
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    background: !pendingConnection || pendingConnection === node.id ? 'rgba(15, 23, 42, 0.82)' : 'rgba(34, 197, 94, 0.18)',
                    color: '#e2e8f0',
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: pendingConnection && pendingConnection !== node.id ? 'pointer' : 'not-allowed',
                  }}
                  aria-label={pendingConnection ? `Complete link to ${node.title}` : `Choose a source node first for ${node.title}`}
                  disabled={!pendingConnection || pendingConnection === node.id}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    if (!pendingConnection || pendingConnection === node.id) return;
                    addEdge(pendingConnection, node.id);
                    setPendingConnection(null);
                  }}
                >
                  In
                </button>
              </div>
            </div>
            <span className="production-canvas-board__node-desc">{node.description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
