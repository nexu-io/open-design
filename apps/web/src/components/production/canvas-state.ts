export interface ProductionCanvasNode {
  id: string;
  title: string;
  description: string;
  x: number;
  y: number;
}

export interface ProductionCanvasEdge {
  from: string;
  to: string;
}

export interface ProductionCanvasSnapshot {
  version: 1;
  nextNodeNumber: number;
  nodes: ProductionCanvasNode[];
  edges: ProductionCanvasEdge[];
}

const DEFAULT_NODE_LAYOUT: readonly ProductionCanvasNode[] = [
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

const DEFAULT_EDGE_LAYOUT: readonly ProductionCanvasEdge[] = [
  { from: 'script', to: 'voice' },
  { from: 'voice', to: 'storyboard' },
  { from: 'storyboard', to: 'threeD' },
  { from: 'threeD', to: 'assets' },
  { from: 'storyboard', to: 'assets' },
  { from: 'assets', to: 'output' },
];

export function canvasStorageKey(projectId: string) {
  return `open-design:production-canvas:${projectId}`;
}

function cloneCanvasNodes(nodes: readonly ProductionCanvasNode[]): ProductionCanvasNode[] {
  return nodes.map((node) => ({ ...node }));
}

function defaultNodePosition(index: number): Pick<ProductionCanvasNode, 'x' | 'y'> {
  const columns = 3;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: 36 + column * 268,
    y: 36 + row * 176,
  };
}

export function createDefaultCanvasSnapshot(): ProductionCanvasSnapshot {
  return {
    version: 1,
    nextNodeNumber: 1,
    nodes: cloneCanvasNodes(DEFAULT_NODE_LAYOUT),
    edges: [...DEFAULT_EDGE_LAYOUT],
  };
}

export function readCanvasSnapshot(projectId: string): ProductionCanvasSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(canvasStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductionCanvasSnapshot>;
    if (parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return {
      version: 1,
      nextNodeNumber: typeof parsed.nextNodeNumber === 'number' && parsed.nextNodeNumber > 0
        ? Math.floor(parsed.nextNodeNumber)
        : 1,
      nodes: parsed.nodes
        .filter((node) => node && typeof node.id === 'string')
        .map((node, index) => {
          const fallback = defaultNodePosition(index);
          return {
            id: String(node.id),
            title: typeof node.title === 'string' && node.title.trim() ? node.title : `Node ${index + 1}`,
            description: typeof node.description === 'string' ? node.description : '',
            x: typeof node.x === 'number' ? node.x : fallback.x,
            y: typeof node.y === 'number' ? node.y : fallback.y,
          };
        }),
      edges: parsed.edges
        .filter((edge) => edge && typeof edge.from === 'string' && typeof edge.to === 'string')
        .map((edge) => ({ from: String(edge.from), to: String(edge.to) })),
    };
  } catch {
    return null;
  }
}

export function writeCanvasSnapshot(projectId: string, snapshot: ProductionCanvasSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(canvasStorageKey(projectId), JSON.stringify(snapshot));
  } catch {
    // Best effort only.
  }
}

export function normalizeCanvasSnapshot(
  snapshot: ProductionCanvasSnapshot,
): ProductionCanvasSnapshot {
  const seen = new Set<string>();
  const nodes = snapshot.nodes
    .filter((node) => node.id.trim())
    .map((node, index) => {
      const fallback = defaultNodePosition(index);
      seen.add(node.id);
      return {
        id: node.id,
        title: node.title.trim() || `Node ${index + 1}`,
        description: node.description,
        x: Number.isFinite(node.x) ? node.x : fallback.x,
        y: Number.isFinite(node.y) ? node.y : fallback.y,
      };
    });

  const edges = snapshot.edges.filter((edge) => edge.from !== edge.to && seen.has(edge.from) && seen.has(edge.to));
  return {
    version: 1,
    nextNodeNumber: Math.max(1, Math.floor(snapshot.nextNodeNumber)),
    nodes,
    edges: dedupeEdges(edges),
  };
}

function dedupeEdges(edges: readonly ProductionCanvasEdge[]): ProductionCanvasEdge[] {
  const seen = new Set<string>();
  const deduped: ProductionCanvasEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...edge });
  }
  return deduped;
}

export function createCustomCanvasNode(snapshot: ProductionCanvasSnapshot): ProductionCanvasNode {
  const index = snapshot.nodes.length;
  const nextNumber = snapshot.nextNodeNumber;
  const position = defaultNodePosition(index);
  return {
    id: `custom-${nextNumber}`,
    title: `Node ${nextNumber}`,
    description: 'Describe this step...',
    x: position.x + 64,
    y: position.y + 48,
  };
}

export function updateCanvasNode(
  snapshot: ProductionCanvasSnapshot,
  nodeId: string,
  updater: (node: ProductionCanvasNode) => ProductionCanvasNode,
): ProductionCanvasSnapshot {
  return normalizeCanvasSnapshot({
    ...snapshot,
    nodes: snapshot.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  });
}

export function removeCanvasNode(
  snapshot: ProductionCanvasSnapshot,
  nodeId: string,
): ProductionCanvasSnapshot {
  return normalizeCanvasSnapshot({
    ...snapshot,
    nodes: snapshot.nodes.filter((node) => node.id !== nodeId),
    edges: snapshot.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
  });
}

export function addCanvasEdge(
  snapshot: ProductionCanvasSnapshot,
  from: string,
  to: string,
): ProductionCanvasSnapshot {
  return normalizeCanvasSnapshot({
    ...snapshot,
    edges: [...snapshot.edges, { from, to }],
  });
}

export function removeCanvasEdge(
  snapshot: ProductionCanvasSnapshot,
  from: string,
  to: string,
): ProductionCanvasSnapshot {
  return normalizeCanvasSnapshot({
    ...snapshot,
    edges: snapshot.edges.filter((edge) => !(edge.from === from && edge.to === to)),
  });
}

export function pruneCanvasStateForNodes(
  snapshot: ProductionCanvasSnapshot,
  activeNodeIds: readonly string[],
): ProductionCanvasSnapshot {
  const active = new Set(activeNodeIds);
  return {
    ...snapshot,
    nodes: snapshot.nodes.filter((node) => active.has(node.id)),
    edges: snapshot.edges.filter((edge) => active.has(edge.from) && active.has(edge.to)),
  };
}
