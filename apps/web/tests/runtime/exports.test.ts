import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveFilenameFrom,
  archiveRootFromFilePath,
  buildSandboxedPreviewDocument,
  exportAsMd,
  exportAsPdf,
  exportProjectAsPdf,
  openSandboxedPreviewInNewTab,
} from '../../src/runtime/exports';

function mockResponse(headers: Record<string, string>): Response {
  return { headers: new Headers(headers) } as Response;
}

describe('archiveRootFromFilePath', () => {
  it('returns the top-level directory name when present', () => {
    expect(archiveRootFromFilePath('ui-design/index.html')).toBe('ui-design');
    expect(archiveRootFromFilePath('ui-design/src/app.css')).toBe('ui-design');
  });

  it('returns empty for files at the project root', () => {
    expect(archiveRootFromFilePath('index.html')).toBe('');
    expect(archiveRootFromFilePath('README.md')).toBe('');
  });

  it('strips a leading slash before scanning', () => {
    expect(archiveRootFromFilePath('/ui-design/index.html')).toBe('ui-design');
    expect(archiveRootFromFilePath('//ui-design/index.html')).toBe('ui-design');
  });

  it('returns empty for empty/garbage input', () => {
    expect(archiveRootFromFilePath('')).toBe('');
    expect(archiveRootFromFilePath('/')).toBe('');
  });
});

describe('archiveFilenameFrom', () => {
  it('decodes the RFC 5987 UTF-8 filename* form (preserves multi-byte chars)', () => {
    // 'café-design.zip' encoded — the é is a 2-byte UTF-8 sequence (%C3%A9),
    // which is enough to fail under naive ASCII-only handling.
    const resp = mockResponse({
      'content-disposition':
        "attachment; filename=\"project.zip\"; filename*=UTF-8''caf%C3%A9-design.zip",
    });
    expect(archiveFilenameFrom(resp, 'fallback', 'ui-design')).toBe('café-design.zip');
  });

  it('falls back to the legacy quoted filename= when filename* is absent', () => {
    const resp = mockResponse({
      'content-disposition': 'attachment; filename="ui-design.zip"',
    });
    expect(archiveFilenameFrom(resp, 'fallback', 'ui-design')).toBe('ui-design.zip');
  });

  it('falls back to the active root slug when the header is missing', () => {
    const resp = mockResponse({});
    expect(archiveFilenameFrom(resp, 'fallback-title', 'ui-design')).toBe('ui-design.zip');
  });

  it('falls back to the title slug when both header and root are absent', () => {
    const resp = mockResponse({});
    expect(archiveFilenameFrom(resp, 'My Artifact', '')).toBe('My-Artifact.zip');
  });

  it('falls through to the slug when filename* is malformed', () => {
    // Truncated percent-escape — decodeURIComponent throws; we should not
    // surface the exception, just fall back to the next strategy.
    const resp = mockResponse({
      'content-disposition': "attachment; filename*=UTF-8''%E9%9D",
    });
    expect(archiveFilenameFrom(resp, 'fallback', 'ui-design')).toBe('ui-design.zip');
  });
});

describe('exportProjectAsPdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the daemon desktop PDF export API before falling back to browser print', async () => {
    const fallback = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const result = await exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result).toBe('desktop');
    expect(fallback).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/pdf', {
      body: JSON.stringify({ deck: true, fileName: 'deck/index.html', title: 'Seed Deck' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
  });

  it('falls back to browser print when the desktop PDF export API is unavailable', async () => {
    const fallback = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 501 })));

    const result = await exportProjectAsPdf({
      deck: false,
      fallbackPdf: fallback,
      filePath: 'index.html',
      projectId: 'proj-1',
      title: 'Landing',
    });

    expect(result).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});

// `exportAsMd` is a pass-through (the file body is the artifact source
// verbatim, only the extension and Content-Type flip). Tests exercise it
// end-to-end by stubbing the few DOM globals `triggerDownload` touches —
// we run under `environment: 'node'`, so `document` and `URL` aren't
// available by default. See issue #279.
describe('exportAsMd', () => {
  let capturedBlob: Blob | undefined;
  let capturedFilename: string | undefined;

  beforeEach(() => {
    capturedBlob = undefined;
    capturedFilename = undefined;
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      },
      revokeObjectURL: () => {},
    });
    vi.stubGlobal('document', {
      createElement: () => {
        const anchor = { href: '', click: () => {} } as { href: string; download?: string; click: () => void };
        Object.defineProperty(anchor, 'download', {
          set(value: string) {
            capturedFilename = value;
          },
          get() {
            return capturedFilename ?? '';
          },
        });
        return anchor;
      },
      body: { appendChild: () => {}, removeChild: () => {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads the source bytes verbatim under a `.md` extension', async () => {
    const source = '<!doctype html>\n<html lang="en"><body>hi</body></html>\n';

    exportAsMd(source, 'TTC — Seed Round · 2026');

    expect(capturedBlob).toBeDefined();
    expect(capturedBlob!.type).toBe('text/markdown;charset=utf-8');
    // Critical: no transformation, no normalization, no trimming. Whatever
    // the Source view shows is what lands in the .md.
    expect(await capturedBlob!.text()).toBe(source);
    expect(capturedFilename).toBe('TTC-Seed-Round-2026.md');
  });

  it('falls back to "artifact.md" when the title is empty or unsafe', () => {
    exportAsMd('hello', '');
    expect(capturedFilename).toBe('artifact.md');

    exportAsMd('hello', '???');
    expect(capturedFilename).toBe('artifact.md');
  });

  it('keeps multi-byte content (UTF-8) intact end-to-end', async () => {
    const source = '# 中文标题\n\n这是 markdown 文件 — でも本当は HTML 源代码 (مرحبا)。\n';

    exportAsMd(source, 'mixed');

    expect(await capturedBlob!.text()).toBe(source);
  });
});

describe('sandboxed preview Blob exports', () => {
  let capturedBlob: Blob | undefined;
  let openedFeatures: string | undefined;
  let mockWin: { opener: unknown; location: { href: string } };
  let openCalls: string[][];

  beforeEach(() => {
    capturedBlob = undefined;
    openedFeatures = undefined;
    openCalls = [];
    mockWin = { opener: {}, location: { href: '' } };
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('window', {
      open: (_url: string, _target: string, features?: string) => {
        openCalls.push([_url, _target]);
        openedFeatures = features;
        return mockWin;
      },
      addEventListener: () => {},
    });
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wraps generated HTML in an opaque-origin sandbox for new-tab previews', async () => {
    openSandboxedPreviewInNewTab('<script>window.parent.localStorage.clear()</script>', 'Unsafe preview');

    expect(openedFeatures).toBe('noopener,noreferrer');
    expect(capturedBlob).toBeDefined();
    const wrapper = await capturedBlob!.text();
    expect(wrapper).toContain('sandbox="allow-scripts"');
    expect(wrapper).not.toContain('allow-same-origin');
    expect(wrapper).toContain('&lt;script&gt;window.parent.localStorage.clear()&lt;/script&gt;');
    expect(wrapper).not.toContain('<script>window.parent.localStorage.clear()</script>');
  });

  it('passes srcdoc options through the sandboxed new-tab wrapper', async () => {
    openSandboxedPreviewInNewTab('<section class="slide">One</section>', 'Deck preview', {
      deck: true,
      baseHref: '/artifacts/project/assets/',
      initialSlideIndex: 2,
    });

    expect(openedFeatures).toBe('noopener,noreferrer');
    expect(capturedBlob).toBeDefined();
    const wrapper = await capturedBlob!.text();
    expect(wrapper).toContain('sandbox="allow-scripts"');
    expect(wrapper).not.toContain('allow-same-origin');
    expect(wrapper).toContain('&lt;base href=&quot;/artifacts/project/assets/&quot;&gt;');
    expect(wrapper).toContain('od:slide');
  });

  it('can build a print wrapper without granting same-origin access', () => {
    const wrapper = buildSandboxedPreviewDocument('<!doctype html><title>x</title>', 'Print', {
      allowModals: true,
    });

    expect(wrapper).toContain('sandbox="allow-scripts allow-modals"');
    expect(wrapper).not.toContain('allow-same-origin');
  });

  it('uses a sandboxed Blob wrapper with synchronous popup detection for PDF exports', async () => {
    await exportAsPdf('<script>window.parent.document.body.innerHTML="owned"</script>', 'PDF');

    expect(openCalls).toEqual([['', '_blank']]);
    expect(mockWin.opener).toBeNull();
    expect(mockWin.location.href).toBe('blob:test');
    expect(capturedBlob).toBeDefined();
    const wrapper = await capturedBlob!.text();
    expect(wrapper).toContain('sandbox="allow-scripts allow-modals"');
    expect(wrapper).not.toContain('allow-same-origin');
    expect(wrapper).toContain('&lt;script&gt;window.parent.document.body.innerHTML=&quot;owned&quot;&lt;/script&gt;');
    expect(wrapper).not.toContain('<script>window.parent.document.body.innerHTML="owned"</script>');
  });

  it('preserves deck print handling inside sandboxed PDF exports', async () => {
    await exportAsPdf('<section class="slide">One</section>', 'Deck PDF', { deck: true });

    expect(openCalls).toEqual([['', '_blank']]);
    expect(mockWin.opener).toBeNull();
    expect(mockWin.location.href).toBe('blob:test');
    expect(capturedBlob).toBeDefined();
    const wrapper = await capturedBlob!.text();
    expect(wrapper).toContain('sandbox="allow-scripts allow-modals"');
    expect(wrapper).toContain('data-deck-print=&quot;injected&quot;');
    expect(wrapper).toContain('page-break-after: always;');
  });

  it('allows explicit trusted PDF opt-out without changing the secure default', async () => {
    await exportAsPdf('<main>Trusted local document</main>', 'Trusted PDF', {
      sandboxedPreview: false,
    });

    expect(openCalls).toEqual([['', '_blank']]);
    expect(mockWin.opener).toEqual({});
    expect(mockWin.location.href).toBe('blob:test');
    expect(capturedBlob).toBeDefined();
    const doc = await capturedBlob!.text();
    expect(doc).not.toContain('sandbox="allow-scripts allow-modals"');
    expect(doc).toContain('<main>Trusted local document</main>');
  });

  it('shows an alert and revokes the blob URL when the popup is blocked', async () => {
    vi.stubGlobal('window', {
      open: () => null,
      addEventListener: () => {},
    });

    const revokeSpy = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    revokeSpy.mockClear();

    await exportAsPdf('<p>test</p>', 'Blocked');

    expect(alert).toHaveBeenCalledWith('Popup blocked! Click the popup-blocked icon in your browser address bar (or browser menu), choose "Always allow pop-ups" for this site, then retry Export PDF.');
    expect(revokeSpy).toHaveBeenCalledWith('blob:test');
  });

  it('uses the desktop native print bridge when __odDesktop.printPdf is available', async () => {
    const printPdfMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      open: (_url: string, _target: string, features?: string) => {
        openCalls.push([_url, _target]);
        openedFeatures = features;
        return mockWin;
      },
      addEventListener: () => {},
      __odDesktop: { printPdf: printPdfMock, isDesktop: true },
    });

    await exportAsPdf('<script>window.parent.document.body.innerHTML="owned"</script>', 'Desktop PDF');

    expect(printPdfMock).toHaveBeenCalledTimes(1);
    expect(openCalls).toEqual([]);

    const htmlArg = printPdfMock.mock.calls[0]![0];
    expect(htmlArg).toContain('sandbox="allow-scripts"');
    expect(htmlArg).not.toContain('allow-modals');
    expect(htmlArg).toContain('&lt;script&gt;window.parent.document.body.innerHTML=&quot;owned&quot;&lt;/script&gt;');
    expect(htmlArg).not.toContain('<script>window.parent.document.body.innerHTML="owned"</script>');
    // Verify the readiness handshake is present — the sandboxed iframe posts
    // 'OD_PRINT_READY' to the parent once fonts and images are loaded.
    expect(htmlArg).toContain('OD_PRINT_READY');
    // Verify the parent-wrapper cache script is present so the handshake is
    // never missed even if 'OD_PRINT_READY' fires before the listener attaches.
    expect(htmlArg).toContain('__odPrintReady');
    // Verify the print script is NOT injected — Electron calls
    // webContents.print() natively, so a self-printing document would
    // trigger a second print dialog.
    expect(htmlArg).not.toContain('window.print()');
  });

  it('injects image-waiting logic into the print-ready handshake for the desktop bridge', async () => {
    const printPdfMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      open: () => mockWin,
      addEventListener: () => {},
      __odDesktop: { printPdf: printPdfMock, isDesktop: true },
    });

    // HTML with an intentionally non-loadable image to exercise the
    // incomplete-image detection in the injected handshake.
    const html = '<div><img src="https://example.com/will-not-load.png" alt="test"/></div>';
    await exportAsPdf(html, 'Image Test');

    const htmlArg = printPdfMock.mock.calls[0]![0];
    // In the sandboxed wrapper the srcdoc attribute is HTML-escaped, so the
    // handshake script content is present as unescaped JS fragments.
    expect(htmlArg).toContain('document.images');
    expect(htmlArg).toContain("img.addEventListener('load'");
    expect(htmlArg).toContain("img.addEventListener('error'");
    expect(htmlArg).toContain('img.complete');
    // The original font- and load-waiting logic must still be present.
    expect(htmlArg).toContain('document.fonts');
    expect(htmlArg).toContain('OD_PRINT_READY');
    // The handshake posts an object with a per-export nonce to prevent
    // spoofing by untrusted artifact code.
    expect(htmlArg).toContain("type:'OD_PRINT_READY'");
    expect(htmlArg).toContain("nonce:'");
    // The cache script also validates the nonce and event source.
    expect(htmlArg).toContain("e.data.type==='OD_PRINT_READY'");
    expect(htmlArg).toContain("e.data.nonce===");
    expect(htmlArg).toContain('e.source===');
    // The parent cache should still be injected.
    expect(htmlArg).toContain('__odPrintReady');
    // No window.print() since the desktop bridge handles printing natively.
    expect(htmlArg).not.toContain('window.print()');
  });

  it('injects the readiness cache for non-sandboxed desktop exports too', async () => {
    const printPdfMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      open: () => mockWin,
      addEventListener: () => {},
      __odDesktop: { printPdf: printPdfMock, isDesktop: true },
    });

    await exportAsPdf('<main>Trusted local document</main>', 'Trusted', {
      sandboxedPreview: false,
    });

    expect(printPdfMock).toHaveBeenCalledTimes(1);
    const htmlArg = printPdfMock.mock.calls[0]![0];
    // No sandbox wrapper — the document is passed through directly.
    expect(htmlArg).not.toContain('sandbox="allow-scripts"');
    expect(htmlArg).toContain('<main>Trusted local document</main>');
    // The readiness handshake must still be injected.
    expect(htmlArg).toContain('OD_PRINT_READY');
    // The cache must be present so waitForPrintReadyHandshake never hangs.
    expect(htmlArg).toContain('__odPrintReady');
    // No window.print() since the desktop bridge handles printing natively.
    expect(htmlArg).not.toContain('window.print()');
  });
});
