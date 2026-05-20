import { describe, expect, it } from 'vitest';

import { buildZip } from '../../src/runtime/zip';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

function crc32(bytes: Uint8Array): number {
  const table: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = table[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function findEocd(bytes: Uint8Array): number {
  for (let i = bytes.length - 22; i >= 0; i--) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + i, 4);
    if (view.getUint32(0, true) === EOCD_SIG) return i;
  }
  return -1;
}

describe('buildZip', () => {
  it('produces a stored-mode archive whose CRC matches the entry bytes', async () => {
    const content = 'hello world';
    const blob = await readBytes(buildZip([{ path: 'a.txt', content }]));
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    expect(view.getUint32(0, true)).toBe(LOCAL_SIG);
    expect(view.getUint16(8, true)).toBe(0);
    const expectedCrc = crc32(new TextEncoder().encode(content));
    expect(view.getUint32(14, true)).toBe(expectedCrc);
    const size = new TextEncoder().encode(content).length;
    expect(view.getUint32(18, true)).toBe(size);
    expect(view.getUint32(22, true)).toBe(size);
    expect(view.getUint16(26, true)).toBe(5);
    const nameStart = 30;
    const name = new TextDecoder().decode(blob.slice(nameStart, nameStart + 5));
    expect(name).toBe('a.txt');
    const stored = new TextDecoder().decode(blob.slice(nameStart + 5, nameStart + 5 + size));
    expect(stored).toBe(content);
  });

  it('writes one central directory entry per file and points EOCD at it', async () => {
    const bytes = await readBytes(
      buildZip([
        { path: 'one.txt', content: 'one' },
        { path: 'two.md', content: 'two two' },
      ]),
    );
    const eocdOffset = findEocd(bytes);
    expect(eocdOffset).toBeGreaterThan(0);
    const eocd = new DataView(bytes.buffer, bytes.byteOffset + eocdOffset, 22);
    expect(eocd.getUint32(0, true)).toBe(EOCD_SIG);
    expect(eocd.getUint16(8, true)).toBe(2);
    expect(eocd.getUint16(10, true)).toBe(2);
    const centralSize = eocd.getUint32(12, true);
    const centralOffset = eocd.getUint32(16, true);
    expect(centralOffset + centralSize).toBe(eocdOffset);
    const firstCentral = new DataView(bytes.buffer, bytes.byteOffset + centralOffset, 4);
    expect(firstCentral.getUint32(0, true)).toBe(CENTRAL_SIG);
  });

  it('encodes non-ASCII file names as UTF-8 in the local and central headers', async () => {
    const bytes = await readBytes(buildZip([{ path: '日本.md', content: 'x' }]));
    const localView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nameLen = localView.getUint16(26, true);
    const expectedName = new TextEncoder().encode('日本.md');
    expect(nameLen).toBe(expectedName.length);
    const nameBytes = bytes.slice(30, 30 + nameLen);
    expect(Array.from(nameBytes)).toEqual(Array.from(expectedName));
  });

  it('emits an empty-but-valid archive when given no entries', async () => {
    const bytes = await readBytes(buildZip([]));
    expect(bytes.length).toBe(22);
    const view = new DataView(bytes.buffer, bytes.byteOffset, 22);
    expect(view.getUint32(0, true)).toBe(EOCD_SIG);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint16(10, true)).toBe(0);
    expect(view.getUint32(12, true)).toBe(0);
    expect(view.getUint32(16, true)).toBe(0);
  });
});
