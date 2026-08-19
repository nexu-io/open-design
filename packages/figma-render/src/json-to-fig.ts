// JSON layout description → .fig file via openfig-core
// Takes a flat or nested JSON array of UI elements and produces a valid .fig

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEmptyFigDoc, encodeFigParts, assembleCanvasFig, createFigZip } from 'openfig-core';
import * as zstd from 'zstd-napi';
import { hexToFigColor } from './convert-to-fig';

interface UiElement {
  type: string;
  name?: string;
  x?: number; y?: number;
  width?: number; height?: number;
  fill?: string;
  strokeColor?: string;
  strokeWeight?: number;
  cornerRadius?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  children?: UiElement[];
}

interface FigDoc {
  message: { nodeChanges: any[] };
  images: Map<string, Uint8Array>;
}

function addElement(doc: FigDoc, el: UiElement, parentGuid: { sessionID: number; localID: number }, nextId: { val: number }): void {
  const guid = { sessionID: 0, localID: nextId.val++ };
  const figType = mapType(el.type);
  const name = el.name || el.type;

  const node: Record<string, unknown> = {
    guid,
    type: figType,
    name,
    parentIndex: { guid: parentGuid, position: 'LAST' },
    visible: true,
    opacity: el.opacity ?? 1,
  };

  // Size
  if (el.width != null || el.height != null) {
    node.size = { x: el.width ?? 0, y: el.height ?? 0 };
  }

  // Position (via transform)
  if (el.x != null || el.y != null) {
    node.transform = { m00: 1, m01: 0, m02: el.x ?? 0, m10: 0, m11: 1, m12: el.y ?? 0 };
  }

  // Fill
  if (el.fill) {
    (node as any).fillPaints = [{ type: 'SOLID', color: hexToFigColor(el.fill), opacity: 1 }];
  }

  // Stroke
  if (el.strokeColor) {
    (node as any).strokePaints = [{ type: 'SOLID', color: hexToFigColor(el.strokeColor), opacity: 1 }];
    (node as any).strokeWeight = el.strokeWeight ?? 1;
  }

  // Corner radius
  if (el.cornerRadius != null && el.cornerRadius > 0) {
    (node as any).cornerRadius = el.cornerRadius;
  }

  // Text
  if (figType === 'TEXT') {
    node.characters = el.text || name;
    if (el.fontSize) (node as any).fontSize = el.fontSize;
    if (el.fontWeight) (node as any).fontWeight = el.fontWeight;
    if (el.fontFamily) (node as any).fontName = { family: el.fontFamily, style: el.fontWeight && el.fontWeight >= 600 ? 'Bold' : 'Regular', postscript: `${el.fontFamily}-${el.fontWeight && el.fontWeight >= 600 ? 'Bold' : 'Regular'}` };
  }

  doc.message.nodeChanges.push(node);

  // Recursively add children
  if (el.children) {
    for (const child of el.children) {
      addElement(doc, child, guid, nextId);
    }
  }
}

function mapType(type: string): string {
  switch (type.toLowerCase()) {
    case 'text': return 'TEXT';
    case 'rectangle': return 'RECTANGLE';
    case 'ellipse': case 'circle': return 'ELLIPSE';
    case 'line': return 'LINE';
    case 'vector': return 'VECTOR';
    case 'frame': case 'group': case 'section': return 'FRAME';
    default: return 'FRAME';
  }
}

export function jsonToFig(json: UiElement[], opts: { images?: Map<string, Uint8Array> }): Uint8Array {
  const doc = createEmptyFigDoc();
  const canvasNode = doc.message.nodeChanges.find((n: any) => n.type === 'CANVAS');
  let nextId = (doc.message.nodeChanges.length + 10);

  // Process root elements as children of the first canvas
  for (const el of json) {
    addElement(doc, el, canvasNode.guid, { val: nextId });
  }

  // Update nextId after all additions
  const parts = encodeFigParts(doc);
  const messageCompressed = zstd.compress(parts.messageRaw, { compressionLevel: 3 });
  const canvasFig = assembleCanvasFig({
    prelude: parts.prelude, version: parts.version,
    schemaCompressed: parts.schemaCompressed, messageCompressed,
    passThrough: parts.passThrough,
  });
  return createFigZip({ canvasFig, images: opts.images ?? doc.images });
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  let input = '';
  let output = '';
  let jsonStr = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') input = args[++i] || '';
    else if (args[i] === '--output' || args[i] === '-o') output = args[++i] || '';
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('json-to-fig: Convert UI layout JSON to .fig file');
      console.log('  node dist/json-to-fig.js -i layout.json -o output.fig');
      console.log('  echo \'[{...}]\' | node dist/json-to-fig.js -o output.fig');
      process.exit(0);
    }
  }

  // Read JSON from file or stdin
  if (input) {
    jsonStr = readFileSync(resolve(input), 'utf-8');
  } else {
    // Read from stdin
    jsonStr = readFileSync(process.stdin.fd, 'utf-8');
  }

  if (!output) { console.error('Error: --output required.'); process.exit(1); }

  let json: UiElement[];
  try {
    json = JSON.parse(jsonStr);
    if (!Array.isArray(json)) json = [json];
  } catch (e) {
    console.error('Error: Invalid JSON input.');
    process.exit(1);
  }

  console.log(`Building .fig from ${json.length} root elements...`);
  // Count total elements recursively
  const countNodes = (els: UiElement[]): number => {
    let n = 0;
    for (const el of els) { n += 1 + countNodes(el.children ?? []); }
    return n;
  };
  console.log(`  ${countNodes(json)} total nodes`);

  const bytes = jsonToFig(json, {});
  writeFileSync(resolve(output), bytes);
  console.log(`Wrote: ${output} (${(bytes.length / 1024).toFixed(1)} KB)`);
}
