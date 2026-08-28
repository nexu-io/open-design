// Regression (#6795): artifact titles containing String.prototype.replace
// replacement patterns (`$$`, `$&`, `$``, `$'`) must land in exported PDF /
// image documents verbatim (HTML-escaped only). A string replacement in
// `injectTitle` would expand them and corrupt the rendered document.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const rendererState = vi.hoisted(() => ({ loadedUrls: [] as string[], saveDir: '' }));

vi.mock('electron', () => {
  const image = {
    getSize: () => ({ height: 1, width: 1 }),
    toBitmap: () => Buffer.alloc(4),
    toJPEG: () => Buffer.from('jpeg'),
    toPNG: () => Buffer.from('png'),
  };

  class BrowserWindow {
    readonly webContents = {
      capturePage: async () => image,
      debugger: {
        attach: () => {
          throw new Error('debugger unavailable in title-pattern test');
        },
        detach: () => undefined,
        sendCommand: async () => undefined,
      },
      executeJavaScript: async (source: string): Promise<unknown> => {
        if (source.includes("document.querySelectorAll('.slide")) return 0;
        if (source.includes('document.documentElement.scrollHeight')) return 1;
        if (source === 'window.devicePixelRatio || 1') return 1;
        return true;
      },
      on: () => undefined,
      // Real Electron webContents is an EventEmitter; the renderer's document
      // load waits on `once('dom-ready')`. The stub's loadURL resolves
      // immediately, so a no-op is faithful here — the load simply never has a
      // dom-ready to race against.
      once: () => undefined,
      printToPDF: async () => Buffer.from('pdf'),
      setWindowOpenHandler: () => undefined,
    };

    async loadURL(url: string): Promise<void> {
      rendererState.loadedUrls.push(url);
    }

    destroy(): void {}
    getContentSize(): [number, number] { return [1440, 900]; }
    isDestroyed(): boolean { return false; }
    setContentSize(): void {}
    setOpacity(): void {}
    showInactive(): void {}
  }

  return {
    BrowserWindow,
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: join(rendererState.saveDir, 'out.pdf') }) },
    nativeImage: { createFromBitmap: () => image },
  };
});

import { exportArtifact } from '../../src/main/artifact-export.js';
import { exportPdfFromHtml } from '../../src/main/pdf-export.js';

const SOURCE_DOC = '<html><head><title>Old</title></head><body><p>BODY MARKER</p></body></html>';
const TITLES = ['Save $$$ This Quarter', "Rock $'n Roll Tour", 'Before $& After', 'Backtick $` Pattern'] as const;

beforeAll(async () => {
  rendererState.saveDir = await mkdtemp(join(tmpdir(), 'od-title-export-'));
});

afterAll(async () => {
  await rm(rendererState.saveDir, { force: true, recursive: true });
});

function lastLoadedDocument(): string {
  const url = rendererState.loadedUrls[rendererState.loadedUrls.length - 1];
  if (!url?.startsWith('data:text/html;charset=utf-8,')) throw new Error(`unexpected loaded URL: ${url}`);
  return decodeURIComponent(url.slice('data:text/html;charset=utf-8,'.length));
}

/** The exact HTML-escaping the exporters apply before interpolation. */
function escapedTitle(title: string): string {
  return title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A prototype whose script builds an HTML document string — the shape behind
 * nexu-io/open-design#7410. Its authored `<head>`, `<title>` and `</head>`
 * all come *before* the document's own, which is the only arrangement a
 * first-match injector gets wrong.
 */
const AUTHORED = 'const doc = `<head><title>Slip</title></head><body>slip</body>`;';
const SCRIPT_DOC = '<!doctype html><html><head>'
  + `<script>${AUTHORED}<\/script><title>Old</title></head>`
  + '<body><p>BODY MARKER</p></body></html>';

/** A title whose own attribute holds a `</title>`, and text holding a prefix. */
const TITLE_HAZARD = '<!doctype html><html><head>'
  + '<title data-x="</title>">Old</title></head>'
  + '<body><p>BODY MARKER</p></body></html>';

describe('export injection points (#7410)', () => {
  it('leaves a script that builds an HTML document string intact in PDF export', async () => {
    rendererState.loadedUrls.length = 0;
    const result = await exportPdfFromHtml({
      baseHref: 'https://example.test/base/',
      deck: true,
      defaultFilename: 'out.pdf',
      html: SCRIPT_DOC,
      title: 'Export',
    });
    expect(result.ok).toBe(true);
    const doc = lastLoadedDocument();
    // The authored string survives; only the document's own title is replaced.
    expect(doc).toContain(AUTHORED);
    expect(doc).toContain('<title>Export</title>');
    expect(doc).toContain('<p>BODY MARKER</p>');
  }, 30_000);

  it('replaces the whole title element when its attribute holds a `</title>`', async () => {
    rendererState.loadedUrls.length = 0;
    const result = await exportPdfFromHtml({
      baseHref: undefined,
      deck: false,
      defaultFilename: 'out.pdf',
      html: TITLE_HAZARD,
      title: 'Export',
    });
    expect(result.ok).toBe(true);
    const doc = lastLoadedDocument();
    expect(doc).toContain('<title>Export</title>');
    // No shrapnel from the original element left behind in <head>.
    expect(doc).not.toContain('">Old</title>');
    expect(doc).not.toContain('data-x=');
    expect(doc).toContain('<p>BODY MARKER</p>');
  }, 30_000);

  it('leaves a script that builds an HTML document string intact in image export', async () => {
    rendererState.loadedUrls.length = 0;
    const result = await exportArtifact({
      baseHref: 'https://example.test/base/',
      deck: false,
      format: 'image',
      html: SCRIPT_DOC,
      imageFormat: 'png',
      title: 'Export',
    } as const);
    try {
      expect(result.ok).toBe(true);
      const doc = lastLoadedDocument();
      expect(doc).toContain(AUTHORED);
      expect(doc).toContain('<p>BODY MARKER</p>');
    } finally {
      if (result.path) await rm(dirname(result.path), { force: true, recursive: true });
    }
  }, 30_000);
});

describe('export title replacement-pattern safety (#6795)', () => {
  it('keeps replacement-pattern sequences verbatim in PDF export titles', async () => {
    for (const title of TITLES) {
      rendererState.loadedUrls.length = 0;
      const result = await exportPdfFromHtml({
        baseHref: undefined,
        deck: true,
        defaultFilename: 'out.pdf',
        html: SOURCE_DOC,
        title,
      });
      expect(result.ok).toBe(true);
      const doc = lastLoadedDocument();
      expect(doc).toContain(`<title>${escapedTitle(title)}</title>`);
      expect(doc).toContain('<p>BODY MARKER</p>');
    }
  }, 30_000);

  it('keeps replacement-pattern sequences verbatim in image export titles', async () => {
    for (const title of TITLES) {
      rendererState.loadedUrls.length = 0;
      const result = await exportArtifact({
        baseHref: undefined,
        deck: false,
        format: 'image',
        html: SOURCE_DOC,
        imageFormat: 'png',
        title,
      } as const);
      try {
        expect(result.ok).toBe(true);
        const doc = lastLoadedDocument();
        expect(doc).toContain(`<title>${escapedTitle(title)}</title>`);
        expect(doc).toContain('<p>BODY MARKER</p>');
      } finally {
        if (result.path) await rm(dirname(result.path), { force: true, recursive: true });
      }
    }
  }, 30_000);
});
