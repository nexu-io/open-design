// Offline `.fig` decoder — no Figma account, API token, or MCP server.
//
// A `.fig` file is a ZIP archive wrapping `canvas.fig` (Figma's "fig-kiwi"
// binary), `thumbnail.png`, `meta.json`, and `images/<hex-hash>` blobs.
// `canvas.fig` itself is: 8-byte magic "fig-kiwi", a little-endian u32
// version, then length-prefixed chunks `[u32 len][data]` — chunk 0 is a
// kiwi *schema*, chunk 1 is the kiwi-encoded *message* (`nodeChanges` +
// `blobs`). Both chunks are raw-deflate; newer files zstd-compress the
// message chunk.
//
// We decode the embedded schema with the official `kiwi-schema` package
// (the genuinely hard binary part), rebuild a `FigmaApiNode` document from
// the flat node list, and hand it to the shared `walkNode` + `liftTokens`
// pipeline so the offline path produces the exact same `figma/` snapshot as
// the REST `figma-extract` atom.
//
// Layering + graceful degradation: the ZIP layer (thumbnail + images +
// meta) always works; the kiwi layer is wrapped so any decode failure
// downgrades to a ZIP-only result instead of throwing. The flow never hard
// fails on a `.fig` we can't fully parse.

import * as zlib from 'node:zlib';
import JSZip from 'jszip';
import * as kiwi from 'kiwi-schema';
import type { FigmaApiNode } from '../plugins/atoms/figma-extract.js';

export interface FigDecodeResult {
  /** Rebuilt document tree (REST `FigmaApiNode` shape), or null if the
   *  kiwi layer could not be decoded (ZIP-only degraded result). */
  document: FigmaApiNode | null;
  /** Embedded raster/vector assets, keyed by lowercase hex hash. */
  images: Map<string, Uint8Array>;
  /** `thumbnail.png` bytes, when the archive ships one. */
  thumbnail: Uint8Array | null;
  /** Parsed `meta.json`, when present. */
  meta: Record<string, unknown> | null;
  /** Distinct (family, styles) pairs referenced by TEXT nodes. */
  fonts: Array<{ family: string; styles: string[] }>;
  /** Non-fatal notes (degradation reasons, skipped chunks). */
  warnings: string[];
  /** True when the kiwi node-tree decoded (Layer 2 succeeded). */
  decoded: boolean;
  /** Whether the input was a ZIP container or a raw `canvas.fig`. */
  source: 'zip' | 'raw';
  /** Number of nodes in the rebuilt tree (0 when undecoded). */
  nodeCount: number;
}

const FIG_MAGIC = 'fig-kiwi';
const JAM_MAGIC = 'fig-jam.';

/**
 * Decode a `.fig` file (ZIP-wrapped or raw `canvas.fig`) fully offline.
 * Never throws on a malformed kiwi payload — it degrades to whatever the
 * ZIP layer recovered.
 */
export async function decodeFigFile(input: Uint8Array): Promise<FigDecodeResult> {
  const warnings: string[] = [];
  let canvas: Uint8Array | null = null;
  let thumbnail: Uint8Array | null = null;
  let meta: Record<string, unknown> | null = null;
  const images = new Map<string, Uint8Array>();
  let source: 'zip' | 'raw' = 'raw';

  if (isZip(input)) {
    source = 'zip';
    try {
      const zip = await JSZip.loadAsync(input);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const name = entry.name;
        if (name === 'canvas.fig' || name.endsWith('/canvas.fig')) {
          canvas = await entry.async('uint8array');
        } else if (name === 'thumbnail.png' || name.endsWith('/thumbnail.png')) {
          thumbnail = await entry.async('uint8array');
        } else if (name === 'meta.json' || name.endsWith('/meta.json')) {
          meta = await readJson(entry);
        } else if (/(^|\/)images\//.test(name)) {
          const hash = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
          if (hash) images.set(hash, await entry.async('uint8array'));
        }
      }
    } catch (err) {
      warnings.push(`zip: ${errMsg(err)}`);
    }
  } else if (hasFigPrelude(input)) {
    canvas = input;
  } else {
    warnings.push('input is neither a ZIP nor a fig-kiwi canvas; nothing decoded');
  }

  let document: FigmaApiNode | null = null;
  let fonts: Array<{ family: string; styles: string[] }> = [];
  let nodeCount = 0;

  if (canvas) {
    try {
      const message = decodeCanvas(canvas);
      const built = buildDocument(message, images);
      document = built.document;
      fonts = built.fonts;
      nodeCount = built.nodeCount;
      for (const w of built.warnings) warnings.push(w);
    } catch (err) {
      warnings.push(`kiwi: ${errMsg(err)} (degraded to assets-only)`);
    }
  }

  return {
    document,
    images,
    thumbnail,
    meta,
    fonts,
    warnings,
    decoded: document != null,
    source,
    nodeCount,
  };
}

// ---------------------------------------------------------------------------
// Container parsing
// ---------------------------------------------------------------------------

function isZip(bytes: Uint8Array): boolean {
  // Local file header "PK\x03\x04" or empty-archive "PK\x05\x06".
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

function hasFigPrelude(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const prelude = asciiAt(bytes, 0, 8);
  return prelude === FIG_MAGIC || prelude === JAM_MAGIC;
}

interface CompiledFigSchema {
  decodeMessage(bytes: Uint8Array): FigMessage;
}

interface FigMessage {
  nodeChanges?: FigNodeChange[];
  blobs?: Array<{ bytes?: Uint8Array }>;
}

function decodeCanvas(bytes: Uint8Array): FigMessage {
  const prelude = asciiAt(bytes, 0, 8);
  if (prelude !== FIG_MAGIC && prelude !== JAM_MAGIC) {
    throw new Error(`unexpected prelude "${prelude}"`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // bytes 8..11: u32 version (unused). Chunks begin at offset 12.
  let offset = 12;
  const chunks: Uint8Array[] = [];
  while (offset + 4 <= bytes.length && chunks.length < 2) {
    const len = view.getUint32(offset, true);
    offset += 4;
    if (len === 0 || offset + len > bytes.length) break;
    chunks.push(bytes.subarray(offset, offset + len));
    offset += len;
  }
  const schemaChunk = chunks[0];
  const messageChunk = chunks[1];
  if (!schemaChunk || !messageChunk) {
    throw new Error('expected schema + message chunks');
  }
  const schemaBytes = decompressChunk(schemaChunk);
  const messageBytes = decompressChunk(messageChunk);
  const schema = kiwi.decodeBinarySchema(schemaBytes);
  const compiled = kiwi.compileSchema(schema) as unknown as CompiledFigSchema;
  if (typeof compiled.decodeMessage !== 'function') {
    throw new Error('compiled schema has no Message root');
  }
  return compiled.decodeMessage(messageBytes);
}

// Node 24 ships `zlib.zstdDecompressSync`, but the daemon's pinned
// `@types/node` predates it, so reach the method through a narrow cast
// rather than a hard type dependency.
const zstdDecompressSync = (zlib as unknown as {
  zstdDecompressSync?: (buf: Uint8Array) => Buffer;
}).zstdDecompressSync;

function decompressChunk(data: Uint8Array): Uint8Array {
  // Zstandard frame magic 0x28 0xB5 0x2F 0xFD (newer message chunks).
  if (data.length >= 4 && data[0] === 0x28 && data[1] === 0xb5 && data[2] === 0x2f && data[3] === 0xfd) {
    if (typeof zstdDecompressSync !== 'function') {
      throw new Error('zstd-compressed chunk requires Node >= 22.15 (zlib.zstdDecompressSync)');
    }
    return zstdDecompressSync(data);
  }
  try {
    return zlib.inflateRawSync(data);
  } catch {
    return zlib.inflateSync(data);
  }
}

// ---------------------------------------------------------------------------
// Node-tree reconstruction
// ---------------------------------------------------------------------------

interface FigGuid { sessionID?: number; localID?: number }

interface FigVector { x?: number; y?: number }

interface FigMatrix {
  m00?: number; m01?: number; m02?: number;
  m10?: number; m11?: number; m12?: number;
}

interface FigColor { r?: number; g?: number; b?: number; a?: number }

interface FigPaint {
  type?: string;
  color?: FigColor;
  opacity?: number;
  visible?: boolean;
  image?: { hash?: Uint8Array | number[] };
}

interface FigNodeChange {
  guid?: FigGuid;
  parentIndex?: { guid?: FigGuid; position?: string };
  type?: string;
  name?: string;
  size?: FigVector;
  transform?: FigMatrix;
  fillPaints?: FigPaint[];
  strokePaints?: FigPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleTopLeftCornerRadius?: number;
  opacity?: number;
  visible?: boolean;
  fontName?: { family?: string; style?: string };
  fontSize?: number;
  textData?: { characters?: string };
  componentPropDefs?: unknown;
}

interface BuiltDocument {
  document: FigmaApiNode | null;
  fonts: Array<{ family: string; styles: string[] }>;
  nodeCount: number;
  warnings: string[];
}

const IDENTITY: Required<FigMatrix> = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };

// Figma's internal node types → the REST-API type names `walkNode`/`liftTokens`
// and downstream atoms already understand.
const TYPE_MAP: Record<string, string> = {
  ROUNDED_RECTANGLE: 'RECTANGLE',
  SYMBOL: 'COMPONENT',
};

function buildDocument(message: FigMessage, images: Map<string, Uint8Array>): BuiltDocument {
  const warnings: string[] = [];
  const changes = Array.isArray(message.nodeChanges) ? message.nodeChanges : [];
  if (changes.length === 0) {
    return { document: null, fonts: [], nodeCount: 0, warnings: ['no nodeChanges in message'] };
  }

  const byGuid = new Map<string, FigNodeChange>();
  const childrenOf = new Map<string, Array<{ key: string; position: string }>>();
  let rootKey: string | null = null;

  for (const change of changes) {
    const key = guidKey(change.guid);
    if (!key) continue;
    byGuid.set(key, change);
    const parentKey = guidKey(change.parentIndex?.guid);
    if (parentKey) {
      const list = childrenOf.get(parentKey) ?? [];
      list.push({ key, position: change.parentIndex?.position ?? '' });
      childrenOf.set(parentKey, list);
    } else if (change.type === 'DOCUMENT' || rootKey == null) {
      // The DOCUMENT node is parentless; fall back to the first parentless node.
      if (change.type === 'DOCUMENT' || rootKey == null) rootKey = key;
    }
  }

  if (!rootKey) {
    return { document: null, fonts: [], nodeCount: 0, warnings: ['no root node found'] };
  }

  const fontSet = new Map<string, Set<string>>();
  const counter = { n: 0 };
  const visiting = new Set<string>();

  const build = (key: string, parentMatrix: Required<FigMatrix>): FigmaApiNode | null => {
    if (visiting.has(key)) return null; // cycle guard
    const change = byGuid.get(key);
    if (!change) return null;
    if (change.visible === false) return null;
    visiting.add(key);
    counter.n += 1;

    const local = withDefaults(change.transform);
    const abs = compose(parentMatrix, local);
    const node: FigmaApiNode = {
      id: key,
      name: change.name ?? change.type ?? 'node',
      type: TYPE_MAP[change.type ?? ''] ?? change.type ?? 'FRAME',
    };

    const size = change.size;
    if (size && (typeof size.x === 'number' || typeof size.y === 'number')) {
      node.absoluteBoundingBox = {
        x: round(abs.m02),
        y: round(abs.m12),
        width: round(size.x ?? 0),
        height: round(size.y ?? 0),
      };
    }

    const fills = mapPaints(change.fillPaints, images);
    if (fills.length) node.fills = fills;
    const strokes = mapPaints(change.strokePaints, images);
    if (strokes.length) node.strokes = strokes;

    const radius = change.cornerRadius ?? change.rectangleTopLeftCornerRadius;
    if (typeof radius === 'number') node.cornerRadius = radius;

    if (change.type === 'TEXT') {
      const characters = change.textData?.characters;
      if (typeof characters === 'string' && characters.length) node.characters = characters;
      const family = change.fontName?.family;
      if (family) {
        const set = fontSet.get(family) ?? new Set<string>();
        set.add(change.fontName?.style ?? 'Regular');
        fontSet.set(family, set);
      }
    }

    const kids = childrenOf.get(key);
    if (kids && kids.length) {
      kids.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
      const childNodes: FigmaApiNode[] = [];
      for (const kid of kids) {
        const built = build(kid.key, abs);
        if (built) childNodes.push(built);
      }
      if (childNodes.length) node.children = childNodes;
    }

    visiting.delete(key);
    return node;
  };

  const document = build(rootKey, IDENTITY);
  const fonts = [...fontSet.entries()].map(([family, styles]) => ({ family, styles: [...styles] }));
  return { document, fonts, nodeCount: counter.n, warnings };
}

function mapPaints(
  paints: FigPaint[] | undefined,
  images: Map<string, Uint8Array>,
): NonNullable<FigmaApiNode['fills']> {
  if (!Array.isArray(paints)) return [];
  const out: NonNullable<FigmaApiNode['fills']> = [];
  for (const paint of paints) {
    if (!paint || paint.visible === false) continue;
    const type = paint.type ?? 'SOLID';
    const entry: NonNullable<FigmaApiNode['fills']>[number] = { type };
    if (paint.color) {
      entry.color = {
        r: paint.color.r ?? 0,
        g: paint.color.g ?? 0,
        b: paint.color.b ?? 0,
        a: paint.color.a ?? 1,
      };
    }
    if (typeof paint.opacity === 'number') entry.opacity = paint.opacity;
    // Touch the image registry so callers can correlate image fills with
    // unzipped assets later; we keep the hash out of the REST shape.
    if (type === 'IMAGE' && paint.image?.hash) {
      const hex = hashHex(paint.image.hash);
      if (hex && images.has(hex)) entry.opacity = entry.opacity ?? 1;
    }
    out.push(entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function guidKey(guid: FigGuid | undefined): string | null {
  if (!guid) return null;
  if (typeof guid.sessionID !== 'number' || typeof guid.localID !== 'number') return null;
  return `${guid.sessionID}:${guid.localID}`;
}

function withDefaults(m: FigMatrix | undefined): Required<FigMatrix> {
  if (!m) return IDENTITY;
  return {
    m00: m.m00 ?? 1, m01: m.m01 ?? 0, m02: m.m02 ?? 0,
    m10: m.m10 ?? 0, m11: m.m11 ?? 1, m12: m.m12 ?? 0,
  };
}

// Absolute = parent ∘ local for 2×3 affine matrices (row form
// [a c e; b d f] with a=m00, b=m10, c=m01, d=m11, e=m02, f=m12).
function compose(p: Required<FigMatrix>, n: Required<FigMatrix>): Required<FigMatrix> {
  return {
    m00: p.m00 * n.m00 + p.m01 * n.m10,
    m01: p.m00 * n.m01 + p.m01 * n.m11,
    m02: p.m00 * n.m02 + p.m01 * n.m12 + p.m02,
    m10: p.m10 * n.m00 + p.m11 * n.m10,
    m11: p.m10 * n.m01 + p.m11 * n.m11,
    m12: p.m10 * n.m02 + p.m11 * n.m12 + p.m12,
  };
}

function hashHex(hash: Uint8Array | number[]): string | null {
  const arr = hash instanceof Uint8Array ? hash : Uint8Array.from(hash);
  if (arr.length === 0) return null;
  let out = '';
  for (const b of arr) out += b.toString(16).padStart(2, '0');
  return out.toLowerCase();
}

function asciiAt(bytes: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < start + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function readJson(entry: JSZip.JSZipObject): Promise<Record<string, unknown> | null> {
  try {
    const text = await entry.async('string');
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
