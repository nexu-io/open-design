// .fig File Round-trip: decode, modify, re-encode
// Handles zstd compression via zstd-napi.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFig, nodeId, encodeFigParts, assembleCanvasFig, createFigZip } from 'openfig-core';
import * as zstd from 'zstd-napi';

export interface FigModifyOptions {
  rename?: Record<string, string>;
  fillColor?: Record<string, string>;
  cornerRadius?: Record<string, number>;
  position?: Record<string, { x: number; y: number }>;
  size?: Record<string, { w: number; h: number }>;
  text?: Record<string, string>;
  opacity?: Record<string, number>;
  rotation?: Record<string, number>;
  fontSize?: Record<string, number>;
  fontWeight?: Record<string, number>;
  removeNodes?: string[];
}

export function hexToFigColor(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255, a: 1 };
}

export function decodeFigFile(inputPath: string): { doc: any; nodes: any[] } {
  const buffer = readFileSync(resolve(inputPath));
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const doc = parseFig(data);
  for (const node of doc.nodes) {
    const id = nodeId(node);
    if (!id) continue;
    (node as any).children = doc.childrenMap.get(id) ?? [];
  }
  return { doc, nodes: doc.nodes };
}

export function modifyNodes(nodes: any[], opts: FigModifyOptions): void {
  const deleted = new Set(opts.removeNodes ?? []);
  for (const node of nodes) {
    const id = nodeId(node);
    if (!id) continue;
    if (deleted.has(id)) continue;

    if (opts.rename?.[id]) node.name = opts.rename[id];
    if (opts.text?.[id]) {
      if (node.textData) node.textData.characters = opts.text[id];
      if (node.characters != null) node.characters = opts.text[id];
    }
    if (opts.opacity?.[id] != null) node.opacity = opts.opacity[id];
    if (opts.fontSize?.[id] != null) node.fontSize = opts.fontSize[id];
    if (opts.fontWeight?.[id] != null) node.fontWeight = opts.fontWeight[id];

    if (opts.fillColor?.[id]) {
      if (!node.fillPaints) node.fillPaints = [];
      const target = node.fillPaints.length === 0
        ? (node.fillPaints.push({ type: 'SOLID', color: hexToFigColor(opts.fillColor[id]), opacity: 1 }), node.fillPaints[0])
        : node.fillPaints[0];
      if (target) { target.type = 'SOLID'; target.color = hexToFigColor(opts.fillColor[id]); target.opacity = target.opacity ?? 1; }
    }
    if (opts.cornerRadius?.[id] != null) node.cornerRadius = opts.cornerRadius[id];

    // Position: write into transform matrix m02/m12
    if (opts.position?.[id]) {
      const p = opts.position[id];
      if (node.transform) {
        if (Array.isArray(node.transform)) {
          node.transform[0][2] = p.x;
          node.transform[1][2] = p.y;
        } else {
          node.transform.m02 = p.x;
          node.transform.m12 = p.y;
        }
      }
    }
    // Size
    if (opts.size?.[id]) {
      const s = opts.size[id];
      if (node.size) { node.size.x = s.w; node.size.y = s.h; }
    }
    // Rotation: factor out of the 2x2 sub-matrix
    if (opts.rotation?.[id] != null) {
      const rad = opts.rotation[id] * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const apply = (t: any) => {
        if (Array.isArray(t)) { t[0][0] = cos; t[0][1] = -sin; t[1][0] = sin; t[1][1] = cos; }
        else { t.m00 = cos; t.m01 = -sin; t.m10 = sin; t.m11 = cos; }
      };
      if (node.transform) apply(node.transform);
    }
  }
}

export function encodeFigFile(doc: any, opts: { images?: Map<string, Uint8Array> }): Uint8Array {
  const parts = encodeFigParts(doc);
  const messageCompressed = zstd.compress(parts.messageRaw, { compressionLevel: 3 });
  const canvasFig = assembleCanvasFig({
    prelude: parts.prelude, version: parts.version,
    schemaCompressed: parts.schemaCompressed, messageCompressed,
    passThrough: parts.passThrough,
  });
  return createFigZip({ canvasFig, images: opts.images ?? doc.images });
}
