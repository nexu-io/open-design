import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { importClaudeDesignZip } from '../src/claude-design-import.js';

// Minimal CRC-32 matching the zip spec.
function crc32(buf: Buffer): number {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(entries: Array<{ name: string; method: 0 | 8; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const { data } = entry;
    const checksum = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralParts.push(central);

    localOffset += local.length + data.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

async function withTmpDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-zip-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('importClaudeDesignZip', () => {
  it('imports a zip containing a 0-byte entry with deflate method (method=8)', async () => {
    // Regression: readEntryBody called inflateRawSync(emptyBuffer, { maxOutputLength: 0 })
    // which throws RangeError. Fix: early-return Buffer.alloc(0) when uncompressedSize === 0.
    await withTmpDir(async (dir) => {
      const zip = buildZip([
        { name: 'index.html', method: 0, data: Buffer.from('<html></html>', 'utf8') },
        { name: 'empty.css', method: 8, data: Buffer.alloc(0) },
      ]);
      const zipPath = path.join(dir, 'test.zip');
      const outDir = path.join(dir, 'out');
      await writeFile(zipPath, zip);

      const result = await importClaudeDesignZip(zipPath, outDir);
      expect(result.entryFile).toBe('index.html');
      expect(result.files).toContain('empty.css');
    });
  });

  it('imports a zip containing a 0-byte stored entry (method=0)', async () => {
    await withTmpDir(async (dir) => {
      const zip = buildZip([
        { name: 'index.html', method: 0, data: Buffer.from('<html></html>', 'utf8') },
        { name: 'reset.css', method: 0, data: Buffer.alloc(0) },
      ]);
      const zipPath = path.join(dir, 'test.zip');
      const outDir = path.join(dir, 'out');
      await writeFile(zipPath, zip);

      const result = await importClaudeDesignZip(zipPath, outDir);
      expect(result.entryFile).toBe('index.html');
      expect(result.files).toContain('reset.css');
    });
  });

  it('resolves index.html as entry file', async () => {
    await withTmpDir(async (dir) => {
      const zip = buildZip([
        { name: 'other.html', method: 0, data: Buffer.from('<html>other</html>', 'utf8') },
        { name: 'index.html', method: 0, data: Buffer.from('<html>index</html>', 'utf8') },
      ]);
      const zipPath = path.join(dir, 'test.zip');
      const outDir = path.join(dir, 'out');
      await writeFile(zipPath, zip);

      const result = await importClaudeDesignZip(zipPath, outDir);
      expect(result.entryFile).toBe('index.html');
    });
  });

  it('rejects a zip with no HTML file', async () => {
    await withTmpDir(async (dir) => {
      const zip = buildZip([
        { name: 'styles.css', method: 0, data: Buffer.from('body{}', 'utf8') },
      ]);
      const zipPath = path.join(dir, 'test.zip');
      const outDir = path.join(dir, 'out');
      await writeFile(zipPath, zip);

      await expect(importClaudeDesignZip(zipPath, outDir)).rejects.toThrow(
        'zip does not contain an HTML file',
      );
    });
  });
});
