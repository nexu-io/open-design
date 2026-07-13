import { readFileSync } from 'node:fs';
import { inflateRaw } from 'pako';
import { compileSchema, decodeBinarySchema } from 'kiwi-schema';

// ── KWZ Archive parser (inlined from fig-kiwi, which has broken npm exports) ──
// ponytail: .fig is KWZ container → 2× inflate → kiwi decode → node tree

const FIG_KIWI_PRELUDE = 'fig-kiwi';

class KwzArchiveParser {
  buffer: Uint8Array;
  data: DataView;
  offset: number;

  constructor(data: Uint8Array) {
    this.buffer = data;
    this.data = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.offset = 0;
  }

  private readUint32(): number {
    const v = this.data.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  private readString(length: number): string {
    const decoder = new TextDecoder();
    const s = decoder.decode(this.buffer.slice(this.offset, this.offset + length));
    this.offset += length;
    return s;
  }

  private readHeader(): { prelude: string; version: number } {
    const prelude = this.readString(FIG_KIWI_PRELUDE.length);
    const version = this.readUint32();
    return { prelude, version };
  }

  private readData(): Uint8Array {
    const length = this.readUint32();
    const data = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return data;
  }

  static parseArchive(data: Uint8Array): { header: { prelude: string; version: number }; files: Uint8Array[] } {
    const parser = new KwzArchiveParser(data);
    const header = parser.readHeader();
    const files: Uint8Array[] = [];
    while (parser.offset < parser.buffer.byteLength) {
      files.push(parser.readData());
    }
    return { header, files };
  }
}

// ── Types ──

export interface ParsedPaint {
  type: string;
  color?: { r: number; g: number; b: number; a: number };
  opacity?: number;
  gradientStops?: Array<{ color: { r: number; g: number; b: number; a: number } }>;
}

export interface ParsedNode {
  guid?: Uint8Array;
  type?: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: ParsedPaint[];
  strokes?: ParsedPaint[];
  effects?: Array<{ type: string; color?: { r: number; g: number; b: number; a: number }; offset?: { x: number; y: number }; radius?: number; spread?: number }>;
  cornerRadius?: number;
  rectangleTopLeftCornerRadius?: number;
  rectangleTopRightCornerRadius?: number;
  rectangleBottomLeftCornerRadius?: number;
  rectangleBottomRightCornerRadius?: number;
  strokeWeight?: number;
  children?: ParsedNode[];
  fontName?: { family: string; style?: string };
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: { value: number; units: string };
  letterSpacing?: { value: number; units: string };
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textCase?: string;
  text?: string;
  stackMode?: string;
  stackPaddingLeft?: number;
  stackPaddingRight?: number;
  stackPaddingTop?: number;
  stackPaddingBottom?: number;
  stackSpacing?: number;
  componentId?: string;
  componentKey?: string;
  styleIdForFill?: string;
  styleIdForStrokeFill?: string;
  styleIdForText?: string;
  constraints?: { horizontal?: string; vertical?: string };
  clipsContent?: boolean;
}

function guidToString(guid?: Uint8Array): string {
  if (!guid) return '';
  const hex = Array.from(guid).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function walkNodes(nodes: ParsedNode[] | undefined, parent: ParsedNode | null, fn: (node: ParsedNode, parent: ParsedNode | null) => void): void {
  if (!nodes) return;
  for (const node of nodes) {
    fn(node, parent);
    if (node.children) walkNodes(node.children, node, fn);
  }
}

export interface FigmaFileData {
  nodes: ParsedNode[];
  nodeCount: number;
  pageCount: number;
}

export function parseFigmaFile(filePath: string): FigmaFileData {
  const buffer = readFileSync(filePath);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Check for fig-kiwi header (KWZ archive format)
  const prelude = new TextDecoder().decode(data.slice(0, FIG_KIWI_PRELUDE.length));
  if (prelude !== FIG_KIWI_PRELUDE) {
    throw new Error(`Not a valid .fig file: expected "${FIG_KIWI_PRELUDE}" header, got "${prelude}"`);
  }

  const archive = KwzArchiveParser.parseArchive(data);
  if (archive.files.length < 2) {
    throw new Error('KWZ archive has fewer than 2 data blobs');
  }

  // Decompress: schema blob and data blob
  const schemaBinary = inflateRaw(archive.files[0]!);
  const dataBinary = inflateRaw(archive.files[1]!);

  // Decode kiwi schema and decompile
  const schema = decodeBinarySchema(schemaBinary);
  const compiled = compileSchema(schema);
  const message: Record<string, unknown> = compiled.decodeMessage(dataBinary) as Record<string, unknown>;

  return buildResult(message);
}

function buildResult(message: Record<string, unknown>): FigmaFileData {
  const nodeChanges: ParsedNode[] = Array.isArray(message.nodeChanges) ? message.nodeChanges as ParsedNode[] : [];

  // Build parent-child tree reassembly
  const rootNodes: ParsedNode[] = [];

  for (const nc of nodeChanges) {
    const parentIdx = (nc as any).parentIndex;
    if (parentIdx === undefined || parentIdx === -1 || parentIdx >= nodeChanges.length) {
      rootNodes.push(nc);
    }
    // Normalize SYMBOL → COMPONENT
    if (nc.type === 'SYMBOL') (nc as any).type = 'COMPONENT';
    // Normalize null strokes/fills to arrays
    if (nc.strokes && !Array.isArray(nc.strokes)) (nc as any).strokes = [];
    if (nc.fills && !Array.isArray(nc.fills)) (nc as any).fills = [];
  }

  // Rebuild tree structure
  for (const nc of nodeChanges) {
    const parentIdx = (nc as any).parentIndex;
    if (parentIdx != null && parentIdx >= 0 && parentIdx < nodeChanges.length) {
      const parent = nodeChanges[parentIdx];
      if (!parent.children) parent.children = [];
      if (!parent.children.includes(nc)) parent.children.push(nc);
    }
  }

  const pageCount = rootNodes.filter((n) => n.type === 'CANVAS').length;

  return {
    nodes: rootNodes,
    nodeCount: nodeChanges.length,
    pageCount,
  };
}

export function walkAllNodes(file: FigmaFileData, fn: (node: ParsedNode, parent: ParsedNode | null) => void): void {
  for (const root of file.nodes) {
    walkNodes([root], null, fn);
  }
}
