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

  it('preserves the real payload when the central directory under-reports size to 0', async () => {
    // Streaming zips (data descriptor, flag bit 3) legitimately leave central
    // uncompressedSize = 0 while the payload carries real bytes. Earlier
    // attempts to "fast-path" those entries silently truncated valid files;
    // verify the actual deflated content is decoded and written through.
    const realBody = Buffer.from(
      '# streamed entry\n\n' + 'x'.repeat(4096) + '\n',
      'utf8',
    );
    const zip = buildZip([
      { name: 'index.html', body: Buffer.from('<html></html>') },
      {
        name: 'docs/streamed.md',
        body: realBody,
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
      const written = readFileSync(path.join(projectDir, 'docs/streamed.md'));
      expect(written.equals(realBody)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects entries that decode larger than MAX_FILE_BYTES even when central size is 0', async () => {
    // The central directory cannot be trusted to enforce the per-file ceiling
    // for streaming zips. Build a fixture whose decoded payload is just barely
    // beyond the limit and confirm we still fail closed.
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 1, 0x61);
    const zip = buildZip([
      { name: 'index.html', body: Buffer.from('<html></html>') },
      {
        name: 'docs/oversize.bin',
        body: oversized,
        falsifyCentralUncompressed: true,
      },
    ]);
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'cd-import-'));
    const zipPath = path.join(tmp, 'in.zip');
    const projectDir = path.join(tmp, 'proj');
    writeFileSync(zipPath, zip);
    try {
      await expect(importClaudeDesignZip(zipPath, projectDir)).rejects.toThrow();
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
