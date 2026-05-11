import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { parseByteRange, resolveProjectFilePath } from '../src/projects.js';
import { startServer } from '../src/server.js';

// ---------------------------------------------------------------------------
// parseByteRange — RFC 7233 unit tests
// ---------------------------------------------------------------------------

describe('parseByteRange', () => {
  it('returns null when header is undefined', () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
  });

  it('returns null when header is an empty string', () => {
    expect(parseByteRange('', 1000)).toBeNull();
  });

  it('returns null for non-bytes unit', () => {
    expect(parseByteRange('none=0-100', 1000)).toBeNull();
  });

  it('returns null for multi-range (caller falls back to full 200)', () => {
    expect(parseByteRange('bytes=0-100, 200-300', 1000)).toBeNull();
  });

  it('parses a standard start-end range', () => {
    expect(parseByteRange('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 });
  });

  it('clamps an over-long end to fileSize - 1', () => {
    expect(parseByteRange('bytes=0-9999', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('parses an open-ended range (bytes=N-)', () => {
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('parses a suffix range (bytes=-N)', () => {
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
  });

  it('clamps suffix larger than fileSize to the whole file', () => {
    expect(parseByteRange('bytes=-9999', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('returns unsatisfiable when start equals fileSize', () => {
    expect(parseByteRange('bytes=1000-1999', 1000)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable when start exceeds fileSize', () => {
    expect(parseByteRange('bytes=5000-5999', 1000)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable for a zero-length suffix range (bytes=-0)', () => {
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable for a negative suffix', () => {
    expect(parseByteRange('bytes=--1', 1000)).toBe('unsatisfiable');
  });

  it('returns null for non-integer start', () => {
    expect(parseByteRange('bytes=1.5-499', 1000)).toBeNull();
  });

  it('returns null for non-integer end', () => {
    expect(parseByteRange('bytes=0-499.9', 1000)).toBeNull();
  });

  it('returns null when end < start', () => {
    expect(parseByteRange('bytes=500-100', 1000)).toBeNull();
  });

  it('returns null for alphabetic range values', () => {
    expect(parseByteRange('bytes=abc-xyz', 1000)).toBeNull();
  });

  it('handles a single-byte range (bytes=0-0)', () => {
    expect(parseByteRange('bytes=0-0', 1000)).toEqual({ start: 0, end: 0 });
  });

  it('handles a range that exactly covers the last byte', () => {
    expect(parseByteRange('bytes=999-999', 1000)).toEqual({ start: 999, end: 999 });
  });
});

// ---------------------------------------------------------------------------
// resolveProjectFilePath — integration test (real temp files)
// ---------------------------------------------------------------------------

describe('resolveProjectFilePath', () => {
  let projectsRoot = '';
  const projectId = 'proj-range-test';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-range-'));
    const dir = path.join(projectsRoot, projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'clip.mp4'), Buffer.alloc(2048));
    await writeFile(path.join(dir, 'index.html'), '<html/>');
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('returns the correct size and mime for a video file', async () => {
    const result = await resolveProjectFilePath(projectsRoot, projectId, 'clip.mp4');
    expect(result.size).toBe(2048);
    expect(result.mime).toBe('video/mp4');
    expect(result.kind).toBe('video');
    expect(path.isAbsolute(result.filePath)).toBe(true);
  });

  it('returns the correct mime for an html file', async () => {
    const result = await resolveProjectFilePath(projectsRoot, projectId, 'index.html');
    expect(result.mime).toBe('text/html; charset=utf-8');
  });

  it('throws ENOENT for a missing file', async () => {
    await expect(
      resolveProjectFilePath(projectsRoot, projectId, 'missing.mp4'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects path traversal attempts', async () => {
    await expect(
      resolveProjectFilePath(projectsRoot, projectId, '../other-project/secret.mp4'),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id/raw/* — HTTP route-level tests
// Exercises the actual endpoint the VideoViewer and AudioViewer components
// call, confirming 206 / Accept-Ranges / Content-Range behaviour end-to-end.
// ---------------------------------------------------------------------------

describe('GET /api/projects/:id/raw/* range request route', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectsRoot: string;
  const projectId = 'proj-raw-range-test';
  const FILE_SIZE = 512;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    // Write a test video file into the daemon's projects root.
    // OD_DATA_DIR is set by tests/setup.ts so we can derive the path.
    projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const dir = path.join(projectsRoot, projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'clip.mp4'), Buffer.alloc(FILE_SIZE, 0x42));
    await writeFile(path.join(dir, 'audio.mp3'), Buffer.alloc(FILE_SIZE, 0x43));
    await writeFile(path.join(dir, 'page.html'), Buffer.from('<html/>'));
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const rawUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/raw/${name}`;

  it('advertises Accept-Ranges: bytes for a video file with no Range header', async () => {
    const res = await fetch(rawUrl('clip.mp4'));
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toContain('video/mp4');
    expect(Number(res.headers.get('content-length'))).toBe(FILE_SIZE);
  });

  it('returns 206 with correct Content-Range for a partial video request', async () => {
    const res = await fetch(rawUrl('clip.mp4'), {
      headers: { Range: 'bytes=0-99' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-99/${FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe('100');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBe(100);
    expect(buf[0]).toBe(0x42);
  });

  it('returns 206 for an open-ended range on an audio file', async () => {
    const res = await fetch(rawUrl('audio.mp3'), {
      headers: { Range: 'bytes=256-' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 256-${FILE_SIZE - 1}/${FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe(String(FILE_SIZE - 256));
  });

  it('returns 206 for a suffix range', async () => {
    const res = await fetch(rawUrl('clip.mp4'), {
      headers: { Range: 'bytes=-128' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes ${FILE_SIZE - 128}-${FILE_SIZE - 1}/${FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe('128');
  });

  it('returns 416 for an out-of-bounds range', async () => {
    const res = await fetch(rawUrl('clip.mp4'), {
      headers: { Range: 'bytes=9999-99999' },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe(`bytes */${FILE_SIZE}`);
  });

  it('does not stream non-media files (HTML returns full 200 without Accept-Ranges)', async () => {
    const res = await fetch(rawUrl('page.html'));
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBeNull();
    const text = await res.text();
    expect(text).toBe('<html/>');
  });

  it('returns 404 for a missing file', async () => {
    const res = await fetch(rawUrl('missing.mp4'));
    expect(res.status).toBe(404);
  });
});
