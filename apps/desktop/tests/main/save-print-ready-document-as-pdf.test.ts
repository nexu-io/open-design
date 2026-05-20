// Issue #1774 — on desktop, "Export PDF" opened the macOS system print
// dialog instead of a direct Save-as-PDF flow. The root cause was the
// `od:print-pdf` IPC handler reaching for `webContents.print()` (the
// printer-first OS dialog) rather than the `showSaveDialog` +
// `printToPDF` + write-to-disk shape that `exportPdfFromHtml` already
// uses for the daemon-backed export path.
//
// `savePrintReadyDocumentAsPdf` is the extracted save-as-PDF flow. It
// takes a structural `PrintReadyPdfTarget` (mirroring the
// `WindowFullscreenSurface` pattern in runtime.ts) so the contract can
// be pinned with plain stubs — no real Electron `dialog` or
// `BrowserWindow`. The surface deliberately has no `print()` method:
// the only render path is `printToPdf()`, so the regression cannot be
// reintroduced without a type error.

import { describe, expect, test } from 'vitest';

import {
  pdfFilenameFromDocument,
  savePrintReadyDocumentAsPdf,
  type PrintReadyPdfTarget,
} from '../../src/main/pdf-export.js';

type StubOptions = {
  savePath?: string | null;
  pdfBytes?: Uint8Array;
  measuredPageSize?: { height: number; width: number };
  failOn?: 'load' | 'waitUntilReady' | 'measurePageSize' | 'printToPdf' | 'write';
};

type PrintToPdfCallOptions = {
  margins: { bottom: number; left: number; right: number; top: number };
  pageSize: { height: number; width: number };
  preferCSSPageSize: boolean;
  printBackground: boolean;
};

function createStubTarget(options: StubOptions = {}): {
  target: PrintReadyPdfTarget;
  calls: string[];
  printedWith: Array<PrintToPdfCallOptions | undefined>;
  written: Array<{ filePath: string; data: Uint8Array }>;
  promptedWith: string[];
} {
  const calls: string[] = [];
  const printedWith: Array<PrintToPdfCallOptions | undefined> = [];
  const written: Array<{ filePath: string; data: Uint8Array }> = [];
  const promptedWith: string[] = [];
  const pdfBytes = options.pdfBytes ?? new Uint8Array([1, 2, 3]);
  const failAt = (step: StubOptions['failOn']) => {
    if (options.failOn === step) throw new Error(`${step} failed`);
  };
  const target = {
    async promptSavePath(defaultFilename) {
      calls.push('promptSavePath');
      promptedWith.push(defaultFilename);
      return options.savePath === undefined ? '/tmp/picked.pdf' : options.savePath;
    },
    async load(_html) {
      calls.push('load');
      failAt('load');
    },
    async waitUntilReady(_nonce) {
      calls.push('waitUntilReady');
      failAt('waitUntilReady');
    },
    async measurePageSize() {
      calls.push('measurePageSize');
      failAt('measurePageSize');
      return options.measuredPageSize ?? { height: 9, width: 16 };
    },
    async printToPdf(printOptions?: PrintToPdfCallOptions) {
      calls.push('printToPdf');
      printedWith.push(printOptions);
      failAt('printToPdf');
      return pdfBytes;
    },
    async write(filePath, data) {
      calls.push('write');
      failAt('write');
      written.push({ filePath, data });
    },
    dispose() {
      calls.push('dispose');
    },
  } satisfies PrintReadyPdfTarget;
  return { target, calls, printedWith, written, promptedWith };
}

describe('savePrintReadyDocumentAsPdf', () => {
  test('writes the rendered PDF to the path chosen in the Save dialog', async () => {
    const pdfBytes = new Uint8Array([9, 8, 7]);
    const { target, written } = createStubTarget({ savePath: '/tmp/deck.pdf', pdfBytes });

    const result = await savePrintReadyDocumentAsPdf('<html></html>', 'nonce-1', target);

    expect(result).toEqual({ ok: true, path: '/tmp/deck.pdf' });
    expect(written).toEqual([{ filePath: '/tmp/deck.pdf', data: pdfBytes }]);
  });

  // The #1774 invariant: the export shows a Save dialog and writes the
  // file to disk, in that order. It never opens a printer dialog — the
  // only render call is the dialogless printToPdf().
  test('shows the Save dialog, then renders and writes, in order', async () => {
    const { target, calls } = createStubTarget();

    await savePrintReadyDocumentAsPdf('<html></html>', 'nonce-2', target);

    expect(calls).toEqual([
      'promptSavePath',
      'load',
      'waitUntilReady',
      'measurePageSize',
      'printToPdf',
      'write',
      'dispose',
    ]);
  });

  test('renders with CSS page size preference, zero margins, and inferred page size by default', async () => {
    const { target, printedWith } = createStubTarget({
      measuredPageSize: { height: 11, width: 8.5 },
    });

    await savePrintReadyDocumentAsPdf('<html></html>', 'nonce-options', target);

    expect(printedWith).toEqual([
      {
        margins: { bottom: 0, left: 0, right: 0, top: 0 },
        pageSize: { height: 11, width: 8.5 },
        preferCSSPageSize: true,
        printBackground: true,
      },
    ]);
  });

  test('renders deck exports as one 1920x1080 slide per PDF page', async () => {
    const { target, calls, printedWith } = createStubTarget({
      measuredPageSize: { height: 11, width: 8.5 },
    });

    await savePrintReadyDocumentAsPdf('<html></html>', 'nonce-deck', target, { deck: true });

    expect(calls).not.toContain('measurePageSize');
    expect(printedWith).toEqual([
      {
        margins: { bottom: 0, left: 0, right: 0, top: 0 },
        pageSize: { height: 7.5, width: 13.333333 },
        preferCSSPageSize: true,
        printBackground: true,
      },
    ]);
  });

  test('does nothing when the user cancels the Save dialog', async () => {
    const { target, calls, written } = createStubTarget({ savePath: null });

    const result = await savePrintReadyDocumentAsPdf('<html></html>', 'nonce-3', target);

    expect(result).toEqual({ ok: true, canceled: true });
    expect(written).toEqual([]);
    expect(calls).toEqual(['promptSavePath', 'dispose']);
  });

  test('surfaces a render failure without writing a partial file', async () => {
    const { target, calls, written } = createStubTarget({ failOn: 'printToPdf' });

    const result = await savePrintReadyDocumentAsPdf('<html></html>', 'nonce-4', target);

    expect(result).toEqual({ ok: false, error: 'printToPdf failed' });
    expect(written).toEqual([]);
    // The render target is still torn down even though rendering threw.
    expect(calls).toEqual([
      'promptSavePath',
      'load',
      'waitUntilReady',
      'measurePageSize',
      'printToPdf',
      'dispose',
    ]);
  });

  test('seeds the Save dialog with a filename derived from the document', async () => {
    const { target, promptedWith } = createStubTarget();

    await savePrintReadyDocumentAsPdf(
      '<html><head><title>Quarterly Deck</title></head><body></body></html>',
      'nonce-5',
      target,
    );

    expect(promptedWith).toEqual(['Quarterly-Deck.pdf']);
  });
});

describe('pdfFilenameFromDocument', () => {
  test('derives the filename from the document <title>', () => {
    expect(
      pdfFilenameFromDocument('<html><head><title>My Artifact</title></head></html>'),
    ).toBe('My-Artifact.pdf');
  });

  test('decodes HTML entities escaped into the title', () => {
    expect(pdfFilenameFromDocument('<title>Roadmap &amp; Plan</title>')).toBe(
      'Roadmap-Plan.pdf',
    );
  });

  test('falls back to artifact.pdf when no usable title is present', () => {
    expect(pdfFilenameFromDocument('<html><body>no title here</body></html>')).toBe(
      'artifact.pdf',
    );
    expect(pdfFilenameFromDocument('<title>   </title>')).toBe('artifact.pdf');
  });
});
