// Synthetic `.fig` fixture builder shared by the decoder unit test and the
// HTTP route test. We don't ship a real Figma file; instead we encode a
// minimal Figma-shaped schema + message with kiwi-schema's own encoder and
// wrap it in the `fig-kiwi` container + ZIP exactly like a real export, so the
// full decode path runs deterministically.

import { deflateRawSync } from 'node:zlib';
import * as kiwi from 'kiwi-schema';
import JSZip from 'jszip';

const SCHEMA_TEXT = `
struct GUID {
  uint sessionID;
  uint localID;
}
struct Vector {
  float x;
  float y;
}
struct Matrix {
  float m00;
  float m01;
  float m02;
  float m10;
  float m11;
  float m12;
}
struct Color {
  float r;
  float g;
  float b;
  float a;
}
message Paint {
  string type = 1;
  Color color = 2;
  float opacity = 3;
  bool visible = 4;
}
message ParentIndex {
  GUID guid = 1;
  string position = 2;
}
message TextData {
  string characters = 1;
}
message FontName {
  string family = 1;
  string style = 2;
}
message NodeChange {
  GUID guid = 1;
  ParentIndex parentIndex = 2;
  string type = 3;
  string name = 4;
  Vector size = 5;
  Matrix transform = 6;
  Paint[] fillPaints = 7;
  float cornerRadius = 8;
  TextData textData = 9;
  FontName fontName = 10;
  float fontSize = 11;
  bool visible = 12;
}
message Message {
  NodeChange[] nodeChanges = 1;
}
`;

const IDENT = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };

export interface FigDoc {
  nodeChanges: Array<Record<string, unknown>>;
}

/** A DOCUMENT → CANVAS → FRAME(#3366ff, r8) → TEXT('Click me', Inter Bold) tree. */
export function buildSampleMessage(): FigDoc {
  return {
    nodeChanges: [
      { guid: { sessionID: 0, localID: 0 }, type: 'DOCUMENT', name: 'Document' },
      {
        guid: { sessionID: 0, localID: 1 },
        parentIndex: { guid: { sessionID: 0, localID: 0 }, position: 'a' },
        type: 'CANVAS',
        name: 'Page 1',
      },
      {
        guid: { sessionID: 0, localID: 2 },
        parentIndex: { guid: { sessionID: 0, localID: 1 }, position: 'a' },
        type: 'FRAME',
        name: 'Button/Primary',
        size: { x: 120, y: 40 },
        transform: { ...IDENT, m02: 10, m12: 20 },
        fillPaints: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 1, a: 1 }, visible: true }],
        cornerRadius: 8,
      },
      {
        guid: { sessionID: 0, localID: 3 },
        parentIndex: { guid: { sessionID: 0, localID: 2 }, position: 'a' },
        type: 'TEXT',
        name: 'Click me',
        size: { x: 80, y: 20 },
        transform: { ...IDENT, m02: 20, m12: 30 },
        textData: { characters: 'Click me' },
        fontName: { family: 'Inter', style: 'Bold' },
        fontSize: 14,
      },
    ],
  };
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Encode a Figma message into the `fig-kiwi` canvas binary. */
export function assembleCanvas(message: FigDoc): Uint8Array {
  const schema = kiwi.parseSchema(SCHEMA_TEXT);
  const compiled = kiwi.compileSchema(schema) as { encodeMessage(o: unknown): Uint8Array };
  const schemaBin = kiwi.encodeBinarySchema(schema);
  const messageBin = compiled.encodeMessage(message);
  const schemaC = new Uint8Array(deflateRawSync(schemaBin));
  const messageC = new Uint8Array(deflateRawSync(messageBin));
  return concat([
    new TextEncoder().encode('fig-kiwi'),
    u32le(15),
    u32le(schemaC.length),
    schemaC,
    u32le(messageC.length),
    messageC,
  ]);
}

/** A 1×1 PNG (header is all the decoder's ext-sniffer needs). */
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/** Wrap a canvas blob (+ optional thumbnail/image) into a `.fig` ZIP. */
export async function buildFig(opts: { canvas?: Uint8Array; withThumb?: boolean; withImage?: boolean }): Promise<Uint8Array> {
  const zip = new JSZip();
  if (opts.canvas) zip.file('canvas.fig', opts.canvas);
  if (opts.withThumb) zip.file('thumbnail.png', PNG_BYTES);
  if (opts.withImage) zip.file('images/aabbccddeeff00112233', PNG_BYTES);
  return zip.generateAsync({ type: 'uint8array' });
}

/** Convenience: a complete, decodable sample `.fig` with thumbnail + asset. */
export function buildSampleFig(): Promise<Uint8Array> {
  return buildFig({ canvas: assembleCanvas(buildSampleMessage()), withThumb: true, withImage: true });
}
