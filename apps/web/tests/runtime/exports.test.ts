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
    exportAsPdf('<script>window.parent.document.body.innerHTML="owned"</script>', 'PDF');

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
    exportAsPdf('<section class="slide">One</section>', 'Deck PDF', { deck: true });

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
    exportAsPdf('<main>Trusted local document</main>', 'Trusted PDF', {
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
      ...window,
      open: () => null,
    });

    const revokeSpy = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    revokeSpy.mockClear();

    exportAsPdf('<p>test</p>', 'Blocked');

    expect(alert).toHaveBeenCalledWith('Popup blocked! Please allow popups for this site to export as PDF.');
    expect(revokeSpy).toHaveBeenCalledWith('blob:test');
  });
});
