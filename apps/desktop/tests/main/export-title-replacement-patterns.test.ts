// Issue #6795 — injectTitle() in both export paths passed the user-derived
// `<title>` tag as the *string* replacement argument of String.replace(), so
// ECMA-262 GetSubstitution expanded `$$`, `$&`, `` $` ``, `$'` sequences from
// the artifact title: `Save $$$ This Quarter` lost a `$`, `$&`/`$'` spliced
// the matched tag or the whole document tail into the title (leaking visible
// text into the exported PDF/image). The sibling injectBaseHref/injectStyle
// helpers already used function replacements and were unaffected.
//
// These tests pin the "replace an existing <title>" branch — the branch that
// runs for virtually every generated artifact — by capturing the document each
// exporter loads into its hidden render window and asserting the title landed
// verbatim (HTML-escaped only) with no duplicated document content.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rendererState = vi.hoisted(() => ({
  loadedUrls: [] as string[],
  savePath: '' as string,
}));

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
      executeJavaScript: async (source: string): Promise<unknown> => {
        if (source.includes('document.documentElement.scrollHeight')) return 1;
        return true;
      },
      on: () => undefined,
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
  }

  return {
    BrowserWindow,
    dialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: rendererState.savePath }),
    },
  };
});

import { exportArtifact } from '../../src/main/artifact-export.js';
import { exportPdfFromHtml } from '../../src/main/pdf-export.js';

const sourceHtml =
  '<!doctype html><html><head><title>Old</title></head><body><p>BODY MARKER</p></body></html>';

// One title per GetSubstitution pattern a string replacement would expand.
// `expectedTitleTag` is the verbatim, HTML-escaped-only insertion the escape
// helpers around injectTitle clearly intend.
const titles = [
  { expectedTitleTag: '<title>Save $$$ This Quarter</title>', title: 'Save $$$ This Quarter' },
  { expectedTitleTag: '<title>Before $&amp; After</title>', title: 'Before $& After' },
  { expectedTitleTag: "<title>Rock $'n Roll Tour</title>", title: "Rock $'n Roll Tour" },
];

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'od-title-patterns-'));
  rendererState.savePath = join(workDir, 'out.pdf');
});

afterEach(async () => {
  rendererState.loadedUrls.length = 0;
  await rm(workDir, { force: true, recursive: true });
});

describe('export titles containing replacement patterns', () => {
  it.each(titles)(
    'exportPdfFromHtml renders the title $title verbatim',
    async ({ expectedTitleTag, title }) => {
      const result = await exportPdfFromHtml({
        deck: false,
        defaultFilename: 'artifact.pdf',
        html: sourceHtml,
        title,
      });

      expect(result.ok).toBe(true);
      expect(loadedDocument()).toContain(expectedTitleTag);
      expect(countBodyMarkers(loadedDocument())).toBe(1);
    },
  );

  it.each(titles)(
    'exportArtifact renders the title $title verbatim',
    async ({ expectedTitleTag, title }) => {
      const result = await exportArtifact({
        deck: false,
        format: 'image',
        html: sourceHtml,
        imageFormat: 'png',
        title,
      });

      try {
        expect(result.ok).toBe(true);
        expect(loadedDocument()).toContain(expectedTitleTag);
        expect(countBodyMarkers(loadedDocument())).toBe(1);
      } finally {
        if (result.path) await rm(dirname(result.path), { force: true, recursive: true });
      }
    },
  );
});

function loadedDocument(): string {
  expect(rendererState.loadedUrls).toHaveLength(1);
  const url = rendererState.loadedUrls[0];
  if (!url) throw new Error('renderer did not load a document');
  const prefix = 'data:text/html;charset=utf-8,';
  expect(url.startsWith(prefix)).toBe(true);
  return decodeURIComponent(url.slice(prefix.length));
}

// A `$'`/`$&` expansion splices document content into the <title>, so the
// corrupted output carries the body text more than once.
function countBodyMarkers(doc: string): number {
  return doc.split('BODY MARKER').length - 1;
}
