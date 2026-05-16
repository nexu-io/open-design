/**
 * Tests for the SHIP <ARTIFACT> writer module.
 *
 * The writer is the daemon's only path for turning a parser-side payload
 * into bytes on disk; the artifact endpoint serves whatever this module
 * produced, so the mime → extension contract and the size cap matter for
 * production correctness, not just developer ergonomics.
 *
 * @see specs/current/critique-theater.md § rerun endpoint (Task 6.2)
 */
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARTIFACT_WRITER_INTERNALS,
  ArtifactEmptyError,
  ArtifactTooLargeError,
  extensionForMime,
  mimeForExtension,
  writeShipArtifact,
} from '../src/critique/artifact-writer.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'od-artifact-writer-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeShipArtifact', () => {
  it('writes the body verbatim and resolves the canonical mime + extension', async () => {
    const result = await writeShipArtifact(
      dir,
      '<html><body>final</body></html>',
      'text/html',
    );

    expect(result.mime).toBe('text/html');
    expect(result.extension).toBe('html');
    expect(result.filename).toBe('artifact.html');
    expect(result.absPath).toBe(join(dir, 'artifact.html'));
    expect(result.sizeBytes).toBe(31);
    expect(readFileSync(result.absPath, 'utf8')).toBe('<html><body>final</body></html>');
  });

  it('strips charset parameters and case before mime lookup', async () => {
    const result = await writeShipArtifact(
      dir,
      '/* css */',
      'Text/CSS; charset=utf-8',
    );

    expect(result.mime).toBe('text/css');
    expect(result.extension).toBe('css');
    expect(readFileSync(result.absPath, 'utf8')).toBe('/* css */');
  });

  it('falls back to application/octet-stream + .bin for unknown mime types', async () => {
    const result = await writeShipArtifact(dir, 'binary-ish', 'application/x-zip');

    expect(result.mime).toBe('application/octet-stream');
    expect(result.extension).toBe('bin');
    expect(result.filename).toBe('artifact.bin');
    expect(readFileSync(result.absPath, 'utf8')).toBe('binary-ish');
  });

  it('falls back to the binary extension for empty / whitespace-only mime input', async () => {
    const result = await writeShipArtifact(dir, 'something', '');

    expect(result.mime).toBe('application/octet-stream');
    expect(result.extension).toBe('bin');
  });

  it('refuses zero-byte bodies with ArtifactEmptyError', async () => {
    await expect(writeShipArtifact(dir, '', 'text/html'))
      .rejects.toBeInstanceOf(ArtifactEmptyError);
  });

  it('throws ArtifactTooLargeError when the body exceeds the configured cap', async () => {
    const body = 'a'.repeat(2048);
    await expect(
      writeShipArtifact(dir, body, 'text/html', { maxBytes: 1024 }),
    ).rejects.toBeInstanceOf(ArtifactTooLargeError);
  });

  it('rejects via UTF-8 byte length, not JS string length, for multi-byte payloads', async () => {
    // Each Unicode emoji is 4 bytes in UTF-8 but 2 chars in JS string length.
    // Cap of 5 bytes must reject a string whose JS .length is 2 but byte
    // length is 8.
    const body = '🎨🎨';
    expect(body.length).toBe(4);
    expect(Buffer.byteLength(body, 'utf8')).toBe(8);
    await expect(
      writeShipArtifact(dir, body, 'text/html', { maxBytes: 5 }),
    ).rejects.toBeInstanceOf(ArtifactTooLargeError);
  });

  it('does not leave a tmp sibling when the write succeeds', async () => {
    await writeShipArtifact(dir, '<html></html>', 'text/html');

    const entries = await readdir(dir);
    expect(entries).toEqual(['artifact.html']);
  });

  it('overwrites a previous artifact in the same directory atomically', async () => {
    const first = await writeShipArtifact(dir, '<html>v1</html>', 'text/html');
    const second = await writeShipArtifact(dir, '<html>v2</html>', 'text/html');

    expect(second.absPath).toBe(first.absPath);
    expect(readFileSync(second.absPath, 'utf8')).toBe('<html>v2</html>');
    const entries = await readdir(dir);
    expect(entries).toEqual(['artifact.html']);
  });

  it('writes deterministic file size that matches the byte-length reported on the result', async () => {
    const body = 'a'.repeat(123);
    const result = await writeShipArtifact(dir, body, 'text/plain');

    expect(result.sizeBytes).toBe(123);
    expect(statSync(result.absPath).size).toBe(123);
  });
});

describe('extensionForMime / mimeForExtension', () => {
  it('round-trips every known mime', () => {
    for (const [mime, ext] of Object.entries(
      ARTIFACT_WRITER_INTERNALS.ARTIFACT_MIME_EXTENSIONS,
    )) {
      expect(extensionForMime(mime)).toBe(ext);
      expect(mimeForExtension(ext)).toBe(mime);
    }
  });

  it('returns the binary fallback for unknown extensions and mimes', () => {
    expect(extensionForMime('application/x-foo')).toBe(
      ARTIFACT_WRITER_INTERNALS.FALLBACK_EXTENSION,
    );
    expect(mimeForExtension('xyz')).toBe(ARTIFACT_WRITER_INTERNALS.FALLBACK_MIME);
  });

  it('strips a leading dot from extension lookups', () => {
    expect(mimeForExtension('.html')).toBe('text/html');
    expect(mimeForExtension('html')).toBe('text/html');
  });
});
