import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { importClaudeDesignZip } from '../src/claude-design-import.js';

function buildZip(
  entries: { name: string; body: Buffer; method?: 0 | 8; falsifyCentralUncompressed?: boolean }[],
): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 8;
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compressed = method === 0 ? entry.body : deflateRawSync(entry.body);
    const crcBuf = Buffer.alloc(4);
    // CRC isn't validated by the importer; zero is fine for this test fixture.
    crcBuf.writeUInt32LE(0, 0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    crcBuf.copy(local, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.body.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    localChunks.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    crcBuf.copy(central, 16);
    central.writeUInt32LE(compressed.length, 20);
    // The central directory may legitimately advertise uncompressedSize=0 even when
    // the local header has the real length (streaming zips with data descriptors).
    // Reproduce that case explicitly when requested.
    central.writeUInt32LE(
      entry.falsifyCentralUncompressed ? 0 : entry.body.length,
      24,
    );
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const localBlob = Buffer.concat(localChunks);
  const centralBlob = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBlob, centralBlob, eocd]);
}

describe('importClaudeDesignZip', () => {
  it('imports zips that contain a zero-byte deflate entry without crashing on Node 24', async () => {
    // Regression: inflateRawSync rejects { maxOutputLength: 0 } on Node 24.
    const zip = buildZip([
      { name: 'index.html', body: Buffer.from('<html></html>') },
      { name: 'docs/empty.md', body: Buffer.alloc(0) },
    ]);
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'cd-import-'));
    const zipPath = path.join(tmp, 'in.zip');
    const projectDir = path.join(tmp, 'proj');
    writeFileSync(zipPath, zip);
    try {
      const result = await importClaudeDesignZip(zipPath, projectDir);
      expect(result.entryFile).toBe('index.html');
      expect(result.files.sort()).toEqual(['docs/empty.md', 'index.html']);
      const empty = readFileSync(path.join(projectDir, 'docs/empty.md'));
      expect(empty.length).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('handles entries whose central directory advertises uncompressedSize=0', async () => {
    const zip = buildZip([
      { name: 'index.html', body: Buffer.from('<html></html>') },
      {
        name: 'docs/streamed.md',
        body: Buffer.alloc(0),
        falsifyCentralUncompressed: true,
      },
    ]);
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'cd-import-'));
    const zipPath = path.join(tmp, 'in.zip');
    const projectDir = path.join(tmp, 'proj');
    writeFileSync(zipPath, zip);
    try {
      const result = await importClaudeDesignZip(zipPath, projectDir);
      expect(result.files).toContain('docs/streamed.md');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('accepts zips with more than the previous 500-file ceiling', async () => {
    // Regression: design-system exports commonly exceed 500 files.
    const entries = [{ name: 'index.html', body: Buffer.from('<html></html>') }];
    for (let i = 0; i < 600; i += 1) {
      entries.push({ name: `assets/icon-${i}.svg`, body: Buffer.from(`<svg>${i}</svg>`) });
    }
    const zip = buildZip(entries);
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'cd-import-'));
    const zipPath = path.join(tmp, 'in.zip');
    const projectDir = path.join(tmp, 'proj');
    writeFileSync(zipPath, zip);
    try {
      const result = await importClaudeDesignZip(zipPath, projectDir);
      expect(result.entryFile).toBe('index.html');
      expect(readdirSync(path.join(projectDir, 'assets')).length).toBe(600);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
