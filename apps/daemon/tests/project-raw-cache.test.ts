import type http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// ---------------------------------------------------------------------------
// GET /api/projects/:id/raw/* — cache revalidation behaviour.
//
// Covers, live preview, and screenshot export all load project HTML + its
// fonts/CSS/images through /raw/, and (in the packaged app) the export window
// shares the same Chromium session/cache as the web UI. These validators let
// a second load reuse already-downloaded bytes via a 304 instead of re-fetching
// every asset. The ETag/Last-Modified are derived from size+mtime, so any agent
// rewrite busts the cache immediately.
// ---------------------------------------------------------------------------

describe('GET /api/projects/:id/raw/* cache revalidation', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectsRoot: string;
  const projectId = 'proj-raw-cache-test';

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const dir = path.join(projectsRoot, projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'styles.css'), Buffer.from('body{color:#123456}'));
    await writeFile(path.join(dir, 'logo.png'), Buffer.alloc(256, 0x7f));
    await writeFile(path.join(dir, 'clip.mp4'), Buffer.alloc(512, 0x42));
    // A Vite dev entry whose /raw/ response is substituted with dist/index.html.
    await writeFile(
      path.join(dir, 'vite-entry.html'),
      Buffer.from('<!doctype html><html><head><script type="module" src="/src/main.tsx"></script></head><body></body></html>'),
    );
    await mkdir(path.join(dir, 'dist', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'dist', 'index.html'),
      Buffer.from('<!doctype html><html><head><script type="module" crossorigin src="/assets/app.js"></script></head><body>v1</body></html>'),
    );
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const rawUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/raw/${name}`;

  it('emits ETag, Last-Modified and Cache-Control: no-cache for a CSS asset', async () => {
    const res = await fetch(rawUrl('styles.css'));
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBeTruthy();
    expect(res.headers.get('last-modified')).toBeTruthy();
    // no-cache = always revalidate, never serve stale silently (safe for mutable files).
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('returns 304 with an empty body when If-None-Match matches', async () => {
    const first = await fetch(rawUrl('styles.css'));
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();

    const second = await fetch(rawUrl('styles.css'), { headers: { 'If-None-Match': etag } });
    expect(second.status).toBe(304);
    const body = await second.text();
    expect(body).toBe('');
  });

  it('returns 304 when If-Modified-Since is at/after the file mtime', async () => {
    const first = await fetch(rawUrl('logo.png'));
    const lastModified = first.headers.get('last-modified')!;
    expect(lastModified).toBeTruthy();

    const second = await fetch(rawUrl('logo.png'), { headers: { 'If-Modified-Since': lastModified } });
    expect(second.status).toBe(304);
  });

  it('busts the cache (new ETag, full 200) after the file is rewritten', async () => {
    const before = await fetch(rawUrl('styles.css'));
    const oldEtag = before.headers.get('etag')!;

    // Rewrite with different content+size so size/mtime — and thus the ETag — change.
    await writeFile(
      path.join(projectsRoot, projectId, 'styles.css'),
      Buffer.from('body{color:#abcdef;background:#000}'),
    );

    const after = await fetch(rawUrl('styles.css'), { headers: { 'If-None-Match': oldEtag } });
    expect(after.status).toBe(200);
    expect(after.headers.get('etag')).not.toBe(oldEtag);
    expect(await after.text()).toContain('#abcdef');
  });

  it('treats If-None-Match as authoritative when both validators are sent (no stale 304)', async () => {
    // Same-second rewrite: ETag changes immediately but Last-Modified stays
    // identical at HTTP-date (second) granularity. A client that sends the stale
    // ETag AND the current Last-Modified must get 200 — If-None-Match wins, so
    // the If-Modified-Since match must NOT produce a 304 for changed bytes.
    const dir = path.join(projectsRoot, projectId);
    await writeFile(path.join(dir, 'precedence.css'), Buffer.from('a{color:#111}'));
    const first = await fetch(rawUrl('precedence.css'));
    const staleEtag = first.headers.get('etag')!;

    await writeFile(path.join(dir, 'precedence.css'), Buffer.from('a{color:#222;font-size:9px}'));
    const probe = await fetch(rawUrl('precedence.css'));
    const currentLastModified = probe.headers.get('last-modified')!;
    expect(probe.headers.get('etag')).not.toBe(staleEtag);

    const res = await fetch(rawUrl('precedence.css'), {
      headers: { 'If-None-Match': staleEtag, 'If-Modified-Since': currentLastModified },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('#222');
  });

  it('busts the cache when transform-substituted content changes (dist rewrite => 200)', async () => {
    // /raw/vite-entry.html is served as dist/index.html (Vite substitution). The
    // validator must reflect the SENT bytes, not the unchanged source entry — so
    // rewriting only dist/index.html must return 200, not a stale 304.
    const dir = path.join(projectsRoot, projectId);
    const first = await fetch(rawUrl('vite-entry.html'));
    expect(first.status).toBe(200);
    expect(await first.text()).toContain('v1'); // substituted dist content
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();

    // Same ETag is returned for unchanged content.
    const unchanged = await fetch(rawUrl('vite-entry.html'), { headers: { 'If-None-Match': etag } });
    expect(unchanged.status).toBe(304);

    // Rewrite ONLY the substituted dist file; the source vite-entry.html is untouched.
    await writeFile(
      path.join(dir, 'dist', 'index.html'),
      Buffer.from('<!doctype html><html><head><script type="module" crossorigin src="/assets/app.js"></script></head><body>v2</body></html>'),
    );
    const after = await fetch(rawUrl('vite-entry.html'), { headers: { 'If-None-Match': etag } });
    expect(after.status).toBe(200);
    expect(await after.text()).toContain('v2');
  });

  it('rejects entity-tag If-Range (weak ETag) but honors a fresh date If-Range', async () => {
    const dir = path.join(projectsRoot, projectId);
    await writeFile(path.join(dir, 'resume.mp4'), Buffer.alloc(512, 0x42));
    const head = await fetch(rawUrl('resume.mp4'));
    const etag = head.headers.get('etag')!;
    // Our /raw/ validator is weak; RFC 9110 §13.1.5 forbids weak validators with
    // If-Range, so an entity-tag If-Range must NOT authorize a 206 even when it
    // "matches" — a same-size rewrite / mtime collision could otherwise splice
    // stale + fresh bytes. Full 200 instead.
    expect(etag.startsWith('W/')).toBe(true);
    const etagRange = await fetch(rawUrl('resume.mp4'), {
      headers: { Range: 'bytes=0-99', 'If-Range': etag },
    });
    expect(etagRange.status).toBe(200);

    // Date form, file unchanged since the (future) If-Range date → partial 206.
    const future = new Date(Date.now() + 3_600_000).toUTCString();
    const dateOk = await fetch(rawUrl('resume.mp4'), {
      headers: { Range: 'bytes=0-99', 'If-Range': future },
    });
    expect(dateOk.status).toBe(206);

    // Rewrite the file, then resume with a STALE (past) date If-Range: the file
    // changed since, so the range is ignored and the full current file returned.
    await writeFile(path.join(dir, 'resume.mp4'), Buffer.alloc(700, 0x43));
    const past = new Date(Date.now() - 3_600_000).toUTCString();
    const full200 = await fetch(rawUrl('resume.mp4'), {
      headers: { Range: 'bytes=0-99', 'If-Range': past },
    });
    expect(full200.status).toBe(200);
    expect(Number(full200.headers.get('content-length'))).toBe(700);
  });

  it('revalidates the streamed media path too (304 on matching ETag)', async () => {
    const first = await fetch(rawUrl('clip.mp4'));
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect(first.headers.get('cache-control')).toBe('no-cache');

    const second = await fetch(rawUrl('clip.mp4'), { headers: { 'If-None-Match': etag } });
    expect(second.status).toBe(304);
  });
});
