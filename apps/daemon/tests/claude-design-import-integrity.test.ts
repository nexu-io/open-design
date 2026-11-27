import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import { describe, it } from 'vitest';

import { importClaudeDesignZip } from '../src/design/claude-design-import.js';

const html = '<!doctype html><html><body>Original design — 设计 🌿</body></html>';
const asset = '<svg xmlns="http://www.w3.org/2000/svg"><text>Original artwork</text></svg>';

async function buildZip(compression: 'STORE' | 'DEFLATE', streamFiles = false): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('assets/icon.svg', asset, { createFolders: false });
  return zip.generateAsync({ type: 'nodebuffer', compression, streamFiles });
}

function entryOffsets(zip: Buffer, name: string) {
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50);
  let central = zip.readUInt32LE(eocd + 16);
  for (let index = 0; index < zip.readUInt16LE(eocd + 10); index += 1) {
    assert.equal(zip.readUInt32LE(central), 0x02014b50);
    const nameLength = zip.readUInt16LE(central + 28);
    const entryName = zip.subarray(central + 46, central + 46 + nameLength).toString('utf8');
    if (entryName === name) {
      const local = zip.readUInt32LE(central + 42);
      const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      return {
        central,
        local,
        dataStart,
        dataEnd: dataStart + zip.readUInt32LE(central + 20),
        method: zip.readUInt16LE(central + 10),
      };
    }
    central += 46 + nameLength + zip.readUInt16LE(central + 30) + zip.readUInt16LE(central + 32);
  }
  throw new Error(`fixture entry not found: ${name}`);
}

function corruptPayload(zip: Buffer, name: string): Buffer {
  const result = Buffer.from(zip);
  const entry = entryOffsets(result, name);
  if (entry.method === 0) {
    result[entry.dataStart] = (result[entry.dataStart] ?? 0) ^ 1;
    return result;
  }

  const original = inflateRawSync(result.subarray(entry.dataStart, entry.dataEnd));
  // Keep the raw DEFLATE stream decodable and its output length unchanged,
  // demonstrating corruption that the existing inflate/size checks miss.
  for (let offset = entry.dataStart; offset < entry.dataEnd; offset += 1) {
    const byte = result[offset] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      result[offset] = byte ^ (1 << bit);
      try {
        const decoded = inflateRawSync(result.subarray(entry.dataStart, entry.dataEnd), {
          maxOutputLength: original.length,
        });
        if (decoded.length === original.length && !decoded.equals(original)) return result;
      } catch {
        // Try a different payload bit; malformed DEFLATE is not this regression.
      }
    }
    result[offset] = byte;
  }
  throw new Error('could not construct a same-length corrupted payload');
}

async function withArchive(zip: Buffer, check: (zipPath: string, projectDir: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cd-import-integrity-'));
  try {
    const zipPath = path.join(root, 'input.zip');
    await writeFile(zipPath, zip);
    await check(zipPath, path.join(root, 'project'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('Claude Design ZIP entry integrity', () => {
  for (const compression of ['STORE', 'DEFLATE'] as const) {
    it(`imports valid ${compression} payloads with their exact bytes`, async () => {
      await withArchive(await buildZip(compression), async (zipPath, projectDir) => {
        const result = await importClaudeDesignZip(zipPath, projectDir);
        assert.equal(result.entryFile, 'index.html');
        assert.equal(await readFile(path.join(projectDir, 'index.html'), 'utf8'), html);
        assert.equal(await readFile(path.join(projectDir, 'assets/icon.svg'), 'utf8'), asset);
      });
    });

    it(`uses the central checksum for streaming ${compression} archives`, async () => {
      const zip = await buildZip(compression, true);
      const { central, local } = entryOffsets(zip, 'index.html');
      assert.equal(zip.readUInt16LE(local + 6) & 8, 8);
      assert.equal(zip.readUInt32LE(local + 14), 0);
      assert.notEqual(zip.readUInt32LE(central + 16), 0);
      await withArchive(zip, async (zipPath, projectDir) => {
        await importClaudeDesignZip(zipPath, projectDir);
        assert.equal(await readFile(path.join(projectDir, 'index.html'), 'utf8'), html);
      });
    });

    it(`rejects same-length ${compression} payload corruption before creating the project`, async () => {
      const corrupted = corruptPayload(await buildZip(compression), 'index.html');
      await assert.rejects(JSZip.loadAsync(corrupted, { checkCRC32: true }), /CRC32/);
      await withArchive(corrupted, async (zipPath, projectDir) => {
        await assert.rejects(importClaudeDesignZip(zipPath, projectDir), /CRC-32 mismatch: index\.html/);
        await assert.rejects(stat(projectDir), { code: 'ENOENT' });
      });
    });

    it(`does not treat a zero central checksum as missing for ${compression} content`, async () => {
      const zip = await buildZip(compression);
      const { central } = entryOffsets(zip, 'index.html');
      zip.writeUInt32LE(0, central + 16);
      await withArchive(zip, async (zipPath, projectDir) => {
        await assert.rejects(importClaudeDesignZip(zipPath, projectDir), /CRC-32 mismatch: index\.html/);
        await assert.rejects(stat(projectDir), { code: 'ENOENT' });
      });
    });

    it(`preserves an existing destination when a later ${compression} entry is corrupt`, async () => {
      const corrupted = corruptPayload(await buildZip(compression), 'assets/icon.svg');
      await withArchive(corrupted, async (zipPath, projectDir) => {
        await mkdir(projectDir);
        await writeFile(path.join(projectDir, 'index.html'), 'existing project');
        await assert.rejects(importClaudeDesignZip(zipPath, projectDir), /CRC-32 mismatch: assets\/icon\.svg/);
        assert.deepEqual(await readdir(projectDir), ['index.html']);
        assert.equal(await readFile(path.join(projectDir, 'index.html'), 'utf8'), 'existing project');
      });
    });
  }

  it('accepts the valid zero checksum of empty entries', async () => {
    const zip = new JSZip();
    zip.file('index.html', html);
    zip.file('empty.txt', Buffer.alloc(0));
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    assert.equal(bytes.readUInt32LE(entryOffsets(bytes, 'empty.txt').central + 16), 0);
    await withArchive(bytes, async (zipPath, projectDir) => {
      await importClaudeDesignZip(zipPath, projectDir);
      assert.equal((await readFile(path.join(projectDir, 'empty.txt'))).length, 0);
    });
  });
});
