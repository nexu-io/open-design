// Phase 6 entry slice / spec §10 / §21.3.1 — figma-extract atom.
//
// SKILL.md fragment ships at plugins/_official/atoms/figma-extract/.
// The runner pulls a Figma file's node tree via the Figma REST API
// and writes the deterministic on-disk snapshot subsequent stages
// (`token-map`, `generate`, `critique`) operate on:
//
//   <cwd>/figma/tree.json    canonical node tree
//                            (id / name / type / parent / children /
//                             box / fills / text / componentRef)
//   <cwd>/figma/tokens.json  design-extract-shaped token bag
//                            (colors / typography / spacing /
//                             radius / shadow) so token-map can
//                            consume the figma flow with the same
//                            crosswalk it uses for code-migration.
//   <cwd>/figma/assets/      rasterised exports per leaf node (the
//                            REST GET /v1/images call); when the
//                            atom runs in offline mode the directory
//                            stays empty.
//   <cwd>/figma/meta.json    { fileUrl, fileKey, version,
//                              lastModified, exportedAt,
//                              atomDigest, unsupportedNodes[] }
//
// Network is pluggable: callers pass `fetchFn` (defaults to
// `globalThis.fetch`). Tests + offline mode pass a fixture-backed
// stub. The atom never stores the OAuth token; it accepts the
// token as a parameter and forgets it after the call returns.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import type { DesignExtractReport, DesignTokenEntry } from './design-extract.js';

export interface FigmaNode {
  id:         string;
  name:       string;
  type:       string;
  parent?:    string;
  children?:  string[];
  // Bounding box in absolute Figma coords (px).
  box?:       { x: number; y: number; w: number; h: number };
  // Concatenated text run for TEXT nodes; otherwise undefined.
  text?:      string;
  // First fill colour as #RRGGBB(AA), if any. We only lift solid
  // fills here; gradients / images stay on the raw node and surface
  // through `unsupportedNodes` when we can't represent them.
  fill?:      string;
  // Stroke colour as #RRGGBB(AA), if any.
  stroke?:    string;
  cornerRadius?: number;
  // Component instance pointer (so `token-map` can de-duplicate at
  // the right boundary, per the SKILL.md fragment).
  componentRef?: string;
}

export interface FigmaExtractReport {
  tree:    FigmaNode[];
  tokens:  DesignExtractReport;
  meta: {
    fileUrl:           string;
    fileKey:           string;
    version?:          string;
    lastModified?:     string;
    exportedAt:        string;
    atomDigest:        string;
    unsupportedNodes:  Array<{ id: string; type: string; reason: string }>;
    nodeCount:         number;
  };
}

export interface FigmaExtractOptions {
  cwd: string;
  // Either fileUrl or fileKey is required.
  fileUrl?: string;
  fileKey?: string;
  // OAuth bearer token. Forwarded as 'Authorization: Bearer <t>'.
  // The atom never persists it.
  token: string;
  // Optional pluggable fetch — tests pass a stub that returns
  // canned JSON. Defaults to globalThis.fetch.
  fetchFn?: typeof fetch;
  // Offline mode: skip the GET /v1/images call (assets/ stays empty).
  // Default true; the daemon flips it off when the run has
  // network capability granted.
  offlineAssets?: boolean;
  // Asset format for the GET /v1/images call. Default 'svg'; the
  // Figma REST API also accepts 'png' / 'jpg' / 'pdf'. Spec §10.3.1
  // recommends 'svg' for fidelity + replay; binary fixtures only
  // when an asset's source is rasterised in Figma to begin with.
  assetFormat?: 'svg' | 'png' | 'jpg' | 'pdf';
  // Per-asset download size cap (bytes). Default 5 MiB. Above the cap
  // the asset is skipped + listed in meta.unsupportedNodes[] with
  // reason='asset-too-large' so the human can audit.
  assetMaxBytes?: number;
}

const FILE_URL_RE = /^https:\/\/(?:www\.)?figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/;

export async function runFigmaExtract(opts: FigmaExtractOptions): Promise<FigmaExtractReport> {
  const cwd = path.resolve(opts.cwd);
  const fileKey = opts.fileKey ?? extractFileKey(opts.fileUrl);
  if (!fileKey) {
    throw new Error('figma-extract: missing fileKey or fileUrl (Figma file URL must match https://figma.com/file/<KEY>)');
  }
  if (!opts.token) {
    throw new Error('figma-extract: missing OAuth token (route through oauth-prompt with connectorId=figma)');
  }
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  if (!fetchFn) throw new Error('figma-extract: no fetch implementation available');

  // 1. GET /v1/files/<key> — full document tree.
  const url = `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`;
  const res = await fetchFn(url, {
    headers: { 'Authorization': `Bearer ${opts.token}` },
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`figma-extract: ${res.status} ${res.statusText} from ${url}: ${text}`);
  }
  const body = await res.json() as FigmaApiFileResponse;

  const unsupportedNodes: FigmaExtractReport['meta']['unsupportedNodes'] = [];
  const tree: FigmaNode[] = [];
  walkNode(body.document, undefined, tree, unsupportedNodes);

  const tokens = liftTokens(tree);
  const meta: FigmaExtractReport['meta'] = {
    fileUrl:          opts.fileUrl ?? `https://figma.com/file/${fileKey}`,
    fileKey,
    exportedAt:       new Date().toISOString(),
    atomDigest:       digestObject({ tree, tokens }),
    unsupportedNodes,
    nodeCount:        tree.length,
  };
  if (body.version)      meta.version      = body.version;
  if (body.lastModified) meta.lastModified = body.lastModified;

  // 2. Persist.
  const figmaDir = path.join(cwd, 'figma');
  const assetsDir = path.join(figmaDir, 'assets');
  await fsp.mkdir(figmaDir,  { recursive: true });
  await fsp.mkdir(assetsDir, { recursive: true });
  await fsp.writeFile(path.join(figmaDir, 'tree.json'),   JSON.stringify(tree,   null, 2) + '\n', 'utf8');
  await fsp.writeFile(path.join(figmaDir, 'tokens.json'), JSON.stringify(tokens, null, 2) + '\n', 'utf8');

  // 3. Asset rasterisation pass — GET /v1/images/<key>?ids=<ids>&format=<fmt>.
  //
  // Honoured only when offlineAssets !== true. Spec §10.3.1: asset
  // exports cover every leaf node the file marks for export; v1
  // lifts every leaf node we have a box for and lets the human
  // prune from `figma/assets/<id>.<ext>` later.
  const assetCandidates = pickAssetCandidates(tree);
  if (opts.offlineAssets !== true && assetCandidates.length > 0) {
    const assetFormat = opts.assetFormat ?? 'svg';
    const assetMaxBytes = opts.assetMaxBytes ?? 5 * 1024 * 1024;
    const assetIssues = await downloadAssets({
      fileKey,
      nodeIds: assetCandidates.map((c) => c.id),
      token: opts.token,
      fetchFn,
      assetsDir,
      assetFormat,
      assetMaxBytes,
    });
    for (const issue of assetIssues) unsupportedNodes.push(issue);
    meta.unsupportedNodes = unsupportedNodes;
    // Re-derive atomDigest now that assets/ has settled (the digest
    // is over the JSON shape, not the binary blobs, so this stays
    // pure even with the on-disk side effects above).
    meta.atomDigest = digestObject({ tree, tokens, assetIssues });
  }

  await fsp.writeFile(path.join(figmaDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  return { tree, tokens, meta };
}

interface AssetCandidate { id: string; type: string }

function pickAssetCandidates(tree: FigmaNode[]): AssetCandidate[] {
  const out: AssetCandidate[] = [];
  // We pick visible TEXT-less leaf nodes (no children) that have a
  // bounding box and aren't the document / canvas root. The daemon
  // already filtered out invisible nodes upstream.
  for (const n of tree) {
    if (n.type === 'DOCUMENT' || n.type === 'CANVAS') continue;
    if (n.children && n.children.length > 0) continue;
    if (!n.box) continue;
    if (n.text) continue; // skip pure text nodes; the agent renders text natively
    out.push({ id: n.id, type: n.type });
  }
  return out;
}

interface FigmaApiImagesResponse {
  err?:    string | null;
  images?: Record<string, string | null>;
}

async function downloadAssets(args: {
  fileKey: string;
  nodeIds: string[];
  token: string;
  fetchFn: typeof fetch;
  assetsDir: string;
  assetFormat: 'svg' | 'png' | 'jpg' | 'pdf';
  assetMaxBytes: number;
}): Promise<FigmaExtractReport['meta']['unsupportedNodes']> {
  const issues: FigmaExtractReport['meta']['unsupportedNodes'] = [];
  // Figma API caps at ~100 ids per call; chunk for safety.
  const chunkSize = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < args.nodeIds.length; i += chunkSize) {
    chunks.push(args.nodeIds.slice(i, i + chunkSize));
  }
  for (const chunk of chunks) {
    const url = `https://api.figma.com/v1/images/${encodeURIComponent(args.fileKey)}?ids=${encodeURIComponent(chunk.join(','))}&format=${args.assetFormat}`;
    let res: Response;
    try {
      res = await args.fetchFn(url, { headers: { 'Authorization': `Bearer ${args.token}` } });
    } catch (err) {
      for (const id of chunk) {
        issues.push({ id, type: 'asset', reason: `image fetch error: ${(err as Error).message}` });
      }
      continue;
    }
    if (!res.ok) {
      const text = await safeText(res);
      for (const id of chunk) {
        issues.push({ id, type: 'asset', reason: `${res.status} ${res.statusText} ${text}`.trim() });
      }
      continue;
    }
    const body = await res.json() as FigmaApiImagesResponse;
    if (body.err) {
      for (const id of chunk) issues.push({ id, type: 'asset', reason: `figma error: ${body.err}` });
      continue;
    }
    const images = body.images ?? {};
    for (const id of chunk) {
      const downloadUrl = images[id];
      if (typeof downloadUrl !== 'string' || !downloadUrl) {
        issues.push({ id, type: 'asset', reason: 'no download URL returned' });
        continue;
      }
      try {
        const dl = await args.fetchFn(downloadUrl);
        if (!dl.ok) {
          issues.push({ id, type: 'asset', reason: `download ${dl.status} ${dl.statusText}` });
          continue;
        }
        const buf = Buffer.from(await dl.arrayBuffer());
        if (buf.byteLength > args.assetMaxBytes) {
          issues.push({ id, type: 'asset', reason: `asset-too-large (${buf.byteLength} bytes)` });
          continue;
        }
        const ext = args.assetFormat === 'jpg' ? 'jpg' : args.assetFormat;
        const safeId = id.replace(/[^A-Za-z0-9_:-]+/g, '-');
        await fsp.writeFile(path.join(args.assetsDir, `${safeId}.${ext}`), buf);
      } catch (err) {
        issues.push({ id, type: 'asset', reason: `download error: ${(err as Error).message}` });
      }
    }
  }
  return issues;
}

function extractFileKey(fileUrl: string | undefined): string | undefined {
  if (!fileUrl) return undefined;
  const m = FILE_URL_RE.exec(fileUrl);
  return m ? m[1] : undefined;
}

interface FigmaApiFileResponse {
  document:       FigmaApiNode;
  version?:       string;
  lastModified?:  string;
  components?:    Record<string, { name: string }>;
}

interface FigmaApiNode {
  id:        string;
  name:      string;
  type:      string;
  children?: FigmaApiNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?:    Array<{ type: string; color?: { r: number; g: number; b: number; a?: number }; opacity?: number; visible?: boolean }>;
  strokes?:  Array<{ type: string; color?: { r: number; g: number; b: number; a?: number }; opacity?: number }>;
  cornerRadius?: number;
  characters?: string;
  componentId?: string;
  visible?: boolean;
}

function walkNode(
  node: FigmaApiNode,
  parent: string | undefined,
  out: FigmaNode[],
  unsupported: FigmaExtractReport['meta']['unsupportedNodes'],
): void {
  const entry: FigmaNode = {
    id:   node.id,
    name: node.name,
    type: node.type,
  };
  if (parent) entry.parent = parent;
  if (node.absoluteBoundingBox) {
    entry.box = {
      x: node.absoluteBoundingBox.x,
      y: node.absoluteBoundingBox.y,
      w: node.absoluteBoundingBox.width,
      h: node.absoluteBoundingBox.height,
    };
  }
  const fill = pickSolidColor(node.fills);
  if (fill) entry.fill = fill;
  const stroke = pickSolidColor(node.strokes);
  if (stroke) entry.stroke = stroke;
  if (typeof node.cornerRadius === 'number') entry.cornerRadius = node.cornerRadius;
  if (node.type === 'TEXT' && typeof node.characters === 'string') entry.text = node.characters;
  if (node.componentId) entry.componentRef = node.componentId;

  // Capture unsupported node types (gradients / image fills / vector
  // boolean ops). We mark the node id but still include it on the
  // tree so downstream atoms see the structure.
  if (Array.isArray(node.fills)) {
    for (const f of node.fills) {
      if (f.type !== 'SOLID' && (f.visible ?? true)) {
        unsupported.push({ id: node.id, type: node.type, reason: `unsupported fill type: ${f.type}` });
        break;
      }
    }
  }

  if (Array.isArray(node.children) && node.children.length > 0) {
    entry.children = node.children.map((c) => c.id);
  }
  out.push(entry);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if ((child as FigmaApiNode).visible === false) continue;
      walkNode(child, node.id, out, unsupported);
    }
  }
}

function pickSolidColor(fills: FigmaApiNode['fills']): string | undefined {
  if (!Array.isArray(fills) || fills.length === 0) return undefined;
  for (const f of fills) {
    if (f.type !== 'SOLID') continue;
    if ((f.visible ?? true) === false) continue;
    if (!f.color) continue;
    const r = clamp255(f.color.r);
    const g = clamp255(f.color.g);
    const b = clamp255(f.color.b);
    const aRaw = (f.color.a ?? 1) * (f.opacity ?? 1);
    const a = Math.max(0, Math.min(1, aRaw));
    return a < 1
      ? `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(Math.round(a * 255))}`
      : `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return undefined;
}

function clamp255(v: number): number { return Math.max(0, Math.min(255, Math.round(v * 255))); }
function toHex(v: number): string { return v.toString(16).padStart(2, '0'); }

function liftTokens(tree: FigmaNode[]): DesignExtractReport {
  const colors:  Map<string, DesignTokenEntry> = new Map();
  const radius:  Map<string, DesignTokenEntry> = new Map();
  const spacing: Map<string, DesignTokenEntry> = new Map();
  const typography: Map<string, DesignTokenEntry> = new Map();

  for (const n of tree) {
    if (n.fill)   pushToken(colors,  'color',   n.fill,   `${n.id}:fill`,   n.name);
    if (n.stroke) pushToken(colors,  'color',   n.stroke, `${n.id}:stroke`, n.name);
    if (typeof n.cornerRadius === 'number') {
      const value = `${n.cornerRadius}px`;
      pushToken(radius, 'radius', value, `${n.id}:cornerRadius`, n.name);
    }
    if (n.box && (n.type === 'FRAME' || n.type === 'GROUP')) {
      // Surface frame width/height as spacing candidates the agent
      // can audit. We tag with a hash so the source pointer is
      // stable across runs.
      const h = `${n.box.h}px`;
      pushToken(spacing, 'spacing', h, `${n.id}:height`, n.name);
    }
  }

  const out: DesignExtractReport = {
    colors:     [...colors.values()].sort(byNameOrValue),
    typography: [...typography.values()].sort(byNameOrValue),
    spacing:    [...spacing.values()].sort(byNameOrValue),
    radius:     [...radius.values()].sort(byNameOrValue),
    shadow:     [],
    scannedFiles: [],
    warnings:     [],
    endedAt:      new Date().toISOString(),
  };
  return out;
}

function pushToken(map: Map<string, DesignTokenEntry>, kind: DesignTokenEntry['kind'], value: string, source: string, name?: string): void {
  const key = `${kind}:${value.toLowerCase()}`;
  let entry = map.get(key);
  if (!entry) {
    entry = { kind, value, sources: [], usage: [] };
    if (name) entry.name = name;
    map.set(key, entry);
  }
  if (!entry.sources.includes(source)) entry.sources.push(source);
  if (name && !entry.usage.includes(name)) entry.usage.push(name);
}

function byNameOrValue(a: DesignTokenEntry, b: DesignTokenEntry): number {
  if (a.name && b.name && a.name !== b.name) return a.name.localeCompare(b.name);
  return a.value.localeCompare(b.value);
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 256); } catch { return ''; }
}

function digestObject(obj: unknown): string {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}
