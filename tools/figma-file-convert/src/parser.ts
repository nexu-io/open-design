import { readFileSync } from 'node:fs';
import { parseFig, nodeId } from 'openfig-core';

export interface ParsedPaint {
  type?: string;
  color?: { r: number; g: number; b: number; a: number };
  opacity?: number;
}

export interface ParsedNode {
  guid?: { sessionID: number; localID: number };
  type?: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  fillPaints?: ParsedPaint[];
  strokePaints?: ParsedPaint[];
  effects?: Array<{ type?: string; color?: { r: number; g: number; b: number; a: number }; radius?: number }>;
  cornerRadius?: number;
  strokeWeight?: number;
  children?: ParsedNode[];
  fontName?: { family?: string; style?: string; postscript?: string };
  fontSize?: number;
  fontWeight?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textData?: { characters?: string };
  stackMode?: string;
  stackPaddingLeft?: number;
  stackPaddingRight?: number;
  stackPaddingTop?: number;
  stackPaddingBottom?: number;
  stackSpacing?: number;
  componentId?: string;
  size?: { x?: number; y?: number };
  transform?: { m00: number; m01: number; m02: number; m10: number; m11: number; m12: number };
}

export interface FigmaFileData {
  nodes: ParsedNode[];
  nodeCount: number;
  pageCount: number;
}

export function parseFigmaFile(filePath: string): FigmaFileData {
  const buffer = readFileSync(filePath);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const doc = parseFig(data);
  const nodes: ParsedNode[] = doc.nodes as unknown as ParsedNode[];
  const pageCount = nodes.filter((n) => n.type === 'CANVAS').length;

  // Rebuild in-memory children tree using childrenMap
  for (const node of nodes) {
    const id = nodeId(node as Parameters<typeof nodeId>[0]);
    if (!id) continue;
    const children = doc.childrenMap.get(id) ?? [];
    node.children = children as unknown as ParsedNode[];
  }

  return { nodes, nodeCount: nodes.length, pageCount };
}

export function walkAllNodes(file: FigmaFileData, fn: (node: ParsedNode, parent: ParsedNode | null) => void): void {
  // Walk root-level nodes (DOCUMENTs, unparented CANVAS nodes)
  for (const root of file.nodes) {
    // Skip non-root nodes (nodes that have parents)
    if (!root.children || root.children.length === 0) continue;
    for (const child of root.children) {
      walkNodesWithChildren(child, root, fn);
    }
  }
}

function walkNodesWithChildren(
  node: ParsedNode,
  parent: ParsedNode | null,
  fn: (node: ParsedNode, parent: ParsedNode | null) => void
): void {
  fn(node, parent);
  if (node.children) {
    for (const child of node.children) {
      walkNodesWithChildren(child, node, fn);
    }
  }
}
