import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
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

  it('rejects symlink escapes inside managed projects', async () => {
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'od-range-outside-'));
    try {
      await writeFile(path.join(outsideRoot, 'secret.txt'), 'secret');
      await symlink(
        path.join(outsideRoot, 'secret.txt'),
        path.join(projectsRoot, projectId, 'linked-secret.txt'),
      );

      await expect(
        resolveProjectFilePath(projectsRoot, projectId, 'linked-secret.txt'),
      ).rejects.toMatchObject({ code: 'EPATHESCAPE' });
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
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
    await writeFile(
      path.join(dir, 'large.html'),
      Buffer.from(`<!doctype html><html><body><main>Large Preview</main>${'x'.repeat((2 * 1024 * 1024) + 256)}</body></html>`),
    );
    await writeFile(
      path.join(dir, 'large-powered.html'),
      Buffer.from(`<!doctype html><html><body>${'x'.repeat((2 * 1024 * 1024) + 256)}<script>new Worker("worker.js")</script></body></html>`),
    );
    await writeFile(path.join(dir, 'body.html'), Buffer.from('<html><body><main>Preview</main></body></html>'));
    await writeFile(
      path.join(dir, 'bridged.html'),
      Buffer.from('<html><body><script data-od-url-scroll-bridge></script><main>Preview</main></body></html>'),
    );
    await writeFile(
      path.join(dir, 'selection-bridged.html'),
      Buffer.from('<html><body><script data-od-url-selection-bridge></script><main>Preview</main></body></html>'),
    );
    await writeFile(
      path.join(dir, 'snapshot-bridged.html'),
      Buffer.from('<html><body><script data-od-url-snapshot-bridge></script><main>Preview</main></body></html>'),
    );
    await mkdir(path.join(dir, 'dist', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'vite-entry.html'),
      Buffer.from('<!doctype html><html><head><script type="module" src="/src/main.tsx"></script></head><body><div id="root"></div></body></html>'),
    );
    await writeFile(
      path.join(dir, 'dist', 'index.html'),
      Buffer.from(
        '<!doctype html><html><head>' +
          '<script type="module" crossorigin src="/assets/app.js"></script>' +
          '<link rel="stylesheet" crossorigin href="/assets/app.css">' +
          '</head><body><div id="root"></div></body></html>',
      ),
    );
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const rawUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/raw/${name}`;
  const poweredUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/powered/${name}`;
  const poweredOrigin = () => {
    const url = new URL(baseUrl);
    url.hostname = url.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
    return url.origin;
  };

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

  it('does not stream small transformed HTML files (HTML returns full 200 without Accept-Ranges)', async () => {
    const res = await fetch(rawUrl('page.html'));
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBeNull();
    const text = await res.text();
    expect(text).toBe('<html/>');
  });

  it('returns a truncated text preview for large HTML without reading the full file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/text-preview/large.html?limit=64`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      text: string;
      truncated: boolean;
      size: number;
      limit: number;
      mime: string;
      poweredPreview: {
        required: boolean;
        scannedBytes: number;
        complete: boolean;
      };
    };
    expect(body.text).toContain('<!doctype html>');
    expect(body.text.length).toBeLessThanOrEqual(1024);
    expect(body.truncated).toBe(true);
    expect(body.size).toBeGreaterThan(2 * 1024 * 1024);
    expect(body.limit).toBe(1024);
    expect(body.mime).toContain('text/html');
    expect(body.poweredPreview.required).toBe(false);
    expect(body.poweredPreview.complete).toBe(true);
  });

  it('returns powered-preview hints even when the Worker/WASM signal is late in a large HTML file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/text-preview/large-powered.html?limit=64`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      text: string;
      poweredPreview: {
        required: boolean;
        scannedBytes: number;
        complete: boolean;
      };
    };
    expect(body.text.length).toBeLessThanOrEqual(1024);
    expect(body.text).not.toContain('new Worker');
    expect(body.poweredPreview.required).toBe(true);
    expect(body.poweredPreview.scannedBytes).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('skips URL preview bridge injection for large HTML so first paint can stream', async () => {
    const res = await fetch(`${rawUrl('large.html')}?odPreviewBridge=scroll&odPreviewBridge=selection&odPreviewBridge=snapshot`, {
      headers: { Range: 'bytes=0-127' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-range')).toMatch(/^bytes 0-127\//);
    const html = await res.text();
    expect(html).toContain('Large Preview');
    expect(html).not.toContain('data-od-url-scroll-bridge');
    expect(html).not.toContain('data-od-url-selection-bridge');
    expect(html).not.toContain('data-od-url-snapshot-bridge');
  });

  it('injects the URL preview scroll bridge only when requested', async () => {
    const plain = await fetch(rawUrl('page.html'));
    expect(await plain.text()).toBe('<html/>');

    const bridged = await fetch(`${rawUrl('page.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).toContain("type: 'od:preview-scroll'");
    expect(html).toContain("type: 'od:preview-content-size'");
    expect(html).toContain('od:preview-content-size-request');
  });

  it('injects the URL preview scroll bridge before the closing body tag', async () => {
    const bridged = await fetch(`${rawUrl('body.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.indexOf('data-od-url-scroll-bridge')).toBeGreaterThan(-1);
    expect(html.indexOf('data-od-url-scroll-bridge')).toBeLessThan(html.indexOf('</body>'));
  });

  it('injects the URL preview selection bridge only when requested', async () => {
    const plain = await fetch(rawUrl('page.html'));
    expect(await plain.text()).toBe('<html/>');

    const bridged = await fetch(`${rawUrl('page.html')}?odPreviewBridge=selection`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-selection-bridge');
    expect(html).toContain("type: 'od:comment-target'");
    expect(html).not.toContain('data-od-url-scroll-bridge');
  });

  it('injects the URL preview snapshot bridge only when requested', async () => {
    const plain = await fetch(rawUrl('page.html'));
    expect(await plain.text()).toBe('<html/>');

    const bridged = await fetch(`${rawUrl('page.html')}?odPreviewBridge=snapshot`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-snapshot-bridge');
    expect(html).toContain("type: 'od:snapshot:result'");
    expect(html).not.toContain('data-od-url-scroll-bridge');
    expect(html).not.toContain('data-od-url-selection-bridge');
  });

  it('serves built dist HTML for Vite dev entries so previews do not load /src from daemon root', async () => {
    const res = await fetch(rawUrl('vite-entry.html'));
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).not.toContain('/src/main.tsx');
    expect(html).not.toContain('src="/assets/app.js"');
    expect(html).not.toContain('href="/assets/app.css"');
    expect(html).toContain('src="dist/assets/app.js"');
    expect(html).toContain('href="dist/assets/app.css"');
  });

  it('does not expose powered preview project files to foreign browser origins through CORS', async () => {
    const browserOrigin = new URL(baseUrl);
    browserOrigin.hostname = browserOrigin.hostname === '127.0.0.1'
      ? 'localhost'
      : '127.0.0.1';

    const res = await fetch(poweredUrl('page.html'), {
      headers: { Origin: browserOrigin.origin },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('document-isolation-policy')).toBe('isolate-and-credentialless');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await res.text()).toBe('<html/>');

    const foreign = await fetch(poweredUrl('page.html'), {
      headers: { Origin: 'https://foreign.example' },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch(poweredUrl('page.html'), {
      method: 'OPTIONS',
      headers: {
        Origin: browserOrigin.origin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('injects the URL preview scroll bridge for powered previews when requested', async () => {
    const bridged = await fetch(`${poweredUrl('page.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    expect(bridged.headers.get('document-isolation-policy')).toBe('isolate-and-credentialless');
    const html = await bridged.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).toContain("type: 'od:preview-content-size'");
    expect(html).toContain('od:preview-content-size-request');
  });

  it('does not let the powered preview origin call normal daemon APIs', async () => {
    const origin = poweredOrigin();
    const poweredReferer = `${origin}/api/projects/${projectId}/powered/page.html`;

    const poweredFile = await fetch(`${origin}/api/projects/${projectId}/powered/page.html`, {
      headers: {
        Referer: poweredReferer,
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect(poweredFile.status).toBe(200);
    expect(await poweredFile.text()).toBe('<html/>');

    const api = await fetch(`${origin}/api/projects`, {
      headers: {
        Referer: poweredReferer,
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({
      error: 'Powered preview origin cannot access this API route',
    });
  });

  it('injects scroll and selection URL preview bridges together', async () => {
    const bridged = await fetch(`${rawUrl('body.html')}?odPreviewBridge=scroll&odPreviewBridge=selection&odPreviewBridge=snapshot`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).toContain('data-od-url-selection-bridge');
    expect(html).toContain('data-od-url-snapshot-bridge');
    expect(html.indexOf('data-od-url-scroll-bridge')).toBeLessThan(html.indexOf('</body>'));
    expect(html.indexOf('data-od-url-selection-bridge')).toBeLessThan(html.indexOf('</body>'));
    expect(html.indexOf('data-od-url-snapshot-bridge')).toBeLessThan(html.indexOf('</body>'));
  });

  it('does not inject the URL preview scroll bridge twice', async () => {
    const bridged = await fetch(`${rawUrl('bridged.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.match(/data-od-url-scroll-bridge/g)?.length).toBe(1);
  });

  it('does not inject the URL preview selection bridge twice', async () => {
    const bridged = await fetch(`${rawUrl('selection-bridged.html')}?odPreviewBridge=selection`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.match(/data-od-url-selection-bridge/g)?.length).toBe(1);
  });

  it('does not inject the URL preview snapshot bridge twice', async () => {
    const bridged = await fetch(`${rawUrl('snapshot-bridged.html')}?odPreviewBridge=snapshot`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.match(/data-od-url-snapshot-bridge/g)?.length).toBe(1);
  });

  it('returns 404 for a missing file', async () => {
    const res = await fetch(rawUrl('missing.mp4'));
    expect(res.status).toBe(404);
  });
});
