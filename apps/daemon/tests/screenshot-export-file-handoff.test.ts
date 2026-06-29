import type http from 'node:http';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  DesktopExportArtifactInput,
  DesktopExportArtifactResult,
  DesktopRenderSlidesInput,
  DesktopRenderSlidesResult,
} from '@open-design/sidecar-proto';
import { startServer } from '../src/server.js';

// ---------------------------------------------------------------------------
// Screenshot export — desktop renderer file handoff.
//
// The daemon hands the desktop renderer a scratch `outputDir` under the data
// root, the renderer writes image files there (instead of pushing base64
// through IPC), and the daemon reads them back and deletes the scratch dir.
// Exercised end-to-end at the HTTP boundary with a stub renderer standing in
// for the desktop runtime.
// ---------------------------------------------------------------------------

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'base64',
);
const PPTX = Buffer.from('PK\x03\x04editable-pptx');

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return predicate();
}

describe('screenshot export desktop renderer file handoff', () => {
  let server: http.Server;
  let baseUrl: string;
  let exportRenderRoot: string;
  const projectId = 'proj-export-handoff';
  const seenDirs: string[] = [];
  const seenInputs: DesktopRenderSlidesInput[] = [];

  // Stub desktop renderer: assert we were handed an outputDir, write the image
  // files there exactly like the real renderer's emitImages, return file paths.
  const stubRenderer = async (input: DesktopRenderSlidesInput): Promise<DesktopRenderSlidesResult> => {
    seenInputs.push(input);
    if (!input.outputDir) return { ok: false, error: 'expected an outputDir handoff' };
    seenDirs.push(input.outputDir);
    await mkdir(input.outputDir, { recursive: true });
    if (input.editable) {
      const file = path.join(input.outputDir, 'deck.pptx');
      await writeFile(file, PPTX);
      return { ok: true, pptxFile: file, width: 1920, height: 1080, mode: 'deck' };
    }
    const jpeg = input.pageImageFormat === 'jpeg';
    const file = path.join(input.outputDir, jpeg ? 'slide-0.jpeg' : 'slide-0.png');
    await writeFile(file, jpeg ? JPEG : PNG);
    return { ok: true, slideFiles: [file], width: 1920, height: 1080, mode: input.stitch ? 'deck' : 'page' };
  };

  const exportImage = () =>
    fetch(`${baseUrl}/api/projects/${projectId}/export/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html' }),
    });

  beforeAll(async () => {
    const started = (await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: stubRenderer,
    })) as { url: string; server: http.Server };
    baseUrl = started.url;
    server = started.server;

    const dataDir = process.env.OD_DATA_DIR!;
    // The daemon derives the scratch dir from the realpath-resolved data root
    // (RUNTIME_DATA_DIR_CANONICAL); on macOS OD_DATA_DIR may contain a symlink
    // (/var -> /private/var), so resolve it the same way for the prefix check.
    exportRenderRoot = path.join(realpathSync(dataDir), 'export-render');
    const dir = path.join(dataDir, 'projects', projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<html><body><section class="slide">A</section></body></html>');
    await writeFile(path.join(dir, 'page.html'), '<html><body><main>Ordinary page</main></body></html>');
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('hands the renderer an outputDir under the data root and returns the image', async () => {
    const res = await exportImage();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47'); // PNG magic

    const used = seenDirs.at(-1)!;
    expect(used).toBeTruthy();
    expect(used.startsWith(exportRenderRoot + path.sep)).toBe(true);
  });

  it('forwards jpeg image exports to the screenshot renderer', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', imageFormat: 'jpeg' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/jpeg');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
  });

  it('rejects multi-image JPEG image exports instead of truncating to the first chunk', async () => {
    const chunkingRenderer = async (input: DesktopRenderSlidesInput): Promise<DesktopRenderSlidesResult> => {
      if (!input.outputDir) return { ok: false, error: 'expected an outputDir handoff' };
      await mkdir(input.outputDir, { recursive: true });
      const first = path.join(input.outputDir, 'slide-0.jpeg');
      const second = path.join(input.outputDir, 'slide-1.jpeg');
      await writeFile(first, JPEG);
      await writeFile(second, JPEG);
      return { ok: true, slideFiles: [first, second], width: 1440, height: 1000, mode: 'page' };
    };
    const srv = (await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: chunkingRenderer,
    })) as { url: string; server: http.Server };
    try {
      const res = await fetch(`${srv.url}/api/projects/${projectId}/export/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'index.html', imageFormat: 'jpeg' }),
      });
      expect(res.status).toBe(502);
      expect(await res.text()).toContain('single-image export');
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  it('routes legacy generic image export through the screenshot renderer too', async () => {
    const before = seenDirs.length;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', format: 'image', imageFormat: 'jpeg' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/jpeg');
    expect(seenDirs.length).toBe(before + 1);
  });

  it('leaves omitted generic export deck signals undefined for renderer auto-detection', async () => {
    const before = seenInputs.length;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', format: 'image' }),
    });
    expect(res.status).toBe(200);
    expect(seenInputs.length).toBe(before + 1);
    expect(seenInputs.at(-1)?.deck).toBeUndefined();
  });

  it('preserves generic export width and height contract inputs', async () => {
    const before = seenInputs.length;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', format: 'image', width: 1280, height: 720 }),
    });
    expect(res.status).toBe(200);
    expect(seenInputs.length).toBe(before + 1);
    expect(seenInputs.at(-1)?.width).toBe(1280);
    expect(seenInputs.at(-1)?.height).toBe(720);
  });

  it('routes generic POST /export pdf through the raster screenshot renderer, not the vector path', async () => {
    // Regression: the generic /export route used to render `format: pdf` with the
    // vector printToPDF path (desktopArtifactExporter), which drops CJK glyphs in
    // the packaged runtime. The shared contract advertises pdf as screenshot-
    // rendered, so this route must hand pdf to the screenshot renderer (seenDirs
    // grows = the stub renderer ran) and stream back a real PDF.
    const before = seenDirs.length;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', format: 'pdf' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(seenDirs.length).toBe(before + 1); // the screenshot renderer was invoked
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF'); // raster PDF assembled from the screenshots
  });

  it('preserves non-ASCII export titles in the RFC 5987 filename', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', title: 'Café Deck 简报' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''Caf%C3%A9%20Deck%20%E7%AE%80%E6%8A%A5.png",
    );
  });

  it('omits page JPEG hints for omitted-deck PDF exports so detected decks stay PNG', async () => {
    const before = seenInputs.length;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', format: 'pdf' }),
    });
    expect(res.status).toBe(200);
    expect(seenInputs.length).toBe(before + 1);
    expect(seenInputs.at(-1)?.deck).toBeUndefined();
    expect(seenInputs.at(-1)?.paginate).toBe(true);
    expect(seenInputs.at(-1)?.pageImageFormat).toBeUndefined();
  });

  it('streams editable PPTX files written by the desktop renderer', async () => {
    const before = seenInputs.length;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/pptx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', editable: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(seenInputs.at(-1)?.editable).toBe(true);
    expect(seenInputs.length).toBe(before + 1);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(PPTX)).toBe(true);
  });

  it('returns 422 when PPTX export is requested for a non-deck page', async () => {
    const noSlideRenderer = async (): Promise<DesktopRenderSlidesResult> => ({
      ok: false,
      error: 'no slide surfaces found in this deck',
      errorCode: 'NO_SLIDES',
    });
    const srv = (await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: noSlideRenderer,
    })) as { url: string; server: http.Server };
    try {
      const res = await fetch(`${srv.url}/api/projects/${projectId}/export/pptx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'page.html' }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      expect(body.error?.code).toBe('BAD_REQUEST');
      expect(body.error?.message).toContain('not a slide deck');
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  it('returns 422 for semantic renderer request errors', async () => {
    const indexErrorRenderer = async (): Promise<DesktopRenderSlidesResult> => ({
      ok: false,
      error: 'slide index 4 is out of range (deck has 2 slide(s))',
      errorCode: 'SLIDE_INDEX_OUT_OF_RANGE',
    });
    const srv = (await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: indexErrorRenderer,
    })) as { url: string; server: http.Server };
    try {
      const res = await fetch(`${srv.url}/api/projects/${projectId}/export/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'index.html', index: 4 }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      expect(body.error?.code).toBe('BAD_REQUEST');
      expect(body.error?.message).toContain('out of range');
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  it('rejects unsupported image export formats before rendering', async () => {
    const before = seenDirs.length;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html', imageFormat: 'webp' }),
    });
    expect(res.status).toBe(400);
    expect(seenDirs.length).toBe(before);
  });

  it('falls back to the legacy artifact exporter for image export when slide rendering is unavailable', async () => {
    const seenLegacyInputs: DesktopExportArtifactInput[] = [];
    const legacyExporter = async (
      input: DesktopExportArtifactInput,
    ): Promise<DesktopExportArtifactResult> => {
      seenLegacyInputs.push(input);
      const dir = path.join(os.tmpdir(), `od-legacy-image-export-${Date.now()}`);
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, 'artifact.png');
      await writeFile(file, PNG);
      return { ok: true, path: file, mime: 'image/png', bytes: PNG.length };
    };
    const srv = (await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: null,
      desktopArtifactExporter: legacyExporter,
    })) as { url: string; server: http.Server };
    try {
      const res = await fetch(`${srv.url}/api/projects/${projectId}/export/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'index.html', deck: false }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/png');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
      expect(seenLegacyInputs.at(-1)).toMatchObject({
        deck: false,
        format: 'image',
        title: 'index',
      });
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  it('does not fall back to the legacy artifact exporter for raster PDF export', async () => {
    const seenLegacyInputs: DesktopExportArtifactInput[] = [];
    const legacyExporter = async (
      input: DesktopExportArtifactInput,
    ): Promise<DesktopExportArtifactResult> => {
      seenLegacyInputs.push(input);
      const dir = path.join(os.tmpdir(), `od-legacy-pdf-export-${Date.now()}`);
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, 'artifact.pdf');
      await writeFile(file, Buffer.from('%PDF-legacy'));
      return { ok: true, path: file, mime: 'application/pdf' };
    };
    const srv = (await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: null,
      desktopArtifactExporter: legacyExporter,
    })) as { url: string; server: http.Server };
    try {
      const res = await fetch(`${srv.url}/api/projects/${projectId}/export/pdf-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'index.html' }),
      });
      expect(res.status).toBe(501);
      expect(await res.text()).toContain('screenshot export is only available');
      expect(seenLegacyInputs).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  it('deletes the scratch render dir after the export completes', async () => {
    const res = await exportImage();
    await res.arrayBuffer();
    const used = seenDirs.at(-1)!;
    // Cleanup runs in the handler's finally, after the response is flushed —
    // poll for eventual removal rather than asserting synchronously.
    expect(await waitFor(() => !existsSync(used))).toBe(true);
    const remaining = existsSync(exportRenderRoot) ? await readdir(exportRenderRoot) : [];
    expect(remaining.length).toBe(0);
  });

  it('gives each concurrent export its own scratch dir', async () => {
    const before = seenDirs.length;
    await Promise.all(Array.from({ length: 5 }, () => exportImage().then((r) => r.arrayBuffer())));
    const fresh = seenDirs.slice(before);
    expect(fresh.length).toBe(5);
    expect(new Set(fresh).size).toBe(5); // all unique — no collision across concurrent exports
  });

  it('rejects a renderer slide path outside the scratch dir (no path-traversal read)', async () => {
    // A malicious/buggy renderer points slideFiles at a secret outside the
    // scratch dir; the daemon must refuse rather than read & stream it back.
    const dataDir = process.env.OD_DATA_DIR!;
    const secret = path.join(dataDir, 'SECRET-out-of-tree.txt');
    await writeFile(secret, 'TOP SECRET');
    const evilRenderer = async (input: DesktopRenderSlidesInput): Promise<DesktopRenderSlidesResult> => {
      if (input.outputDir) await mkdir(input.outputDir, { recursive: true });
      return { ok: true, slideFiles: [secret], width: 1920, height: 1080, mode: 'page' };
    };
    const srv = (await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: evilRenderer,
    })) as { url: string; server: http.Server };
    try {
      const res = await fetch(`${srv.url}/api/projects/${projectId}/export/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'index.html' }),
      });
      expect(res.status).toBe(502);
      const body = await res.text();
      expect(body).not.toContain('TOP SECRET');
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  it('resolves an imported-folder project file via metadata.baseDir (not <data>/projects/:id)', async () => {
    // Imported-folder projects keep their workspace OUTSIDE <data>/projects/:id
    // (at metadata.baseDir). The screenshot export must thread that metadata into
    // readProjectFile, or it 404s on the default dir even though the file exists.
    const folder = path.join(realpathSync(os.tmpdir()), `od-import-export-${Date.now()}`);
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, 'index.html'),
      '<html><body><section class="slide">Imported</section></body></html>',
    );
    const importResp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const res = await fetch(`${baseUrl}/api/projects/${project.id}/export/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'index.html' }),
    });
    // 200 (image streamed back) proves the file was resolved via baseDir — a
    // regression would surface as 404 FILE_NOT_FOUND.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
  });
});
