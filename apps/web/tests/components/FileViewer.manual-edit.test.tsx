// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileViewer,
  cancelManualEditPendingStyleSnapshot,
  resolveManualEditCropUrl,
} from '../../src/components/FileViewer';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer manual edit regressions', () => {
  function clickManualTool(testId: string) {
    fireEvent.click(screen.getByTestId(testId));
  }

  async function previewFrame() {
    return waitFor(() => {
      const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      if (!node.contentWindow) throw new Error('Preview frame not ready');
      return node;
    });
  }

  // Hover raises no host chrome at all — the dashed highlight lives in the
  // iframe's bridge CSS. Posting the message must therefore be a no-op here.
  async function hoverManualEditTarget(target = heroTarget()) {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-hover', target },
        source: frame.contentWindow,
      }));
    });
  }

  // Clicking the empty canvas is the gesture that opens the compact page card.
  async function clickManualEditBackground() {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-background' },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).not.toBeNull();
    });
  }

  // Clicking an element raises only the lightweight selection chrome; the
  // full inspector opens through the action bar's "Edit parameters" button.
  // This helper walks that two-step flow.
  async function selectManualEditTarget(target = heroTarget()) {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-selection-frame')).toBeTruthy();
    });
    expect(document.querySelector('.manual-edit-right')).toBeNull();
    fireEvent.click(screen.getByTestId('manual-edit-open-inspector'));
    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).not.toBeNull();
    });
  }

  async function findStyleInput(label: string) {
    return waitFor(() => {
      const input = Array.from(document.querySelectorAll('.cc-row'))
        .find((row) => row.textContent?.includes(label))
        ?.querySelector('input') as HTMLInputElement | null;
      if (!input) throw new Error(`${label} input not found`);
      return input;
    });
  }

  it('keeps root-relative preview images on their same-origin URL for cropping', () => {
    expect(resolveManualEditCropUrl('project-1', 'pages/index.html', '/app-icon.png')).toBe('/app-icon.png');
    expect(resolveManualEditCropUrl('project-1', 'pages/index.html', 'assets/photo.png'))
      .toBe('/api/projects/project-1/raw/pages/assets/photo.png');
  });

  it('removes invalid fields from pending manual edit style saves without dropping unrelated fields', () => {
    expect(cancelManualEditPendingStyleSnapshot({
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { fontSize: '4px', color: '#111111' },
    }, 'hero', ['fontSize'])).toEqual({
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { color: '#111111' },
    });

    expect(cancelManualEditPendingStyleSnapshot({
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { fontSize: '4px' },
    }, 'hero', ['fontSize'])).toBeNull();

    const otherTargetPending = {
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { fontSize: '4px' },
    };
    expect(cancelManualEditPendingStyleSnapshot(otherTargetPending, 'cta', ['fontSize'])).toBe(otherTargetPending);
  });

  it('opens edit mode with a clean canvas and no docked panel', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    // No panel auto-pops; the canvas stays clean.
    expect(document.querySelector('.manual-edit-right')).toBeNull();
    expect(screen.queryByText('PAGE')).toBeNull();

    // Hovering surfaces nothing host-side, still no panel.
    await hoverManualEditTarget();
    expect(document.querySelector('.manual-edit-right')).toBeNull();
    expect(screen.queryByText('PAGE')).toBeNull();
    expect(screen.queryByTestId('manual-edit-hover-open')).toBeNull();
  });

  it('opens the compact page-styles card when the empty canvas is clicked', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await clickManualEditBackground();

    expect(screen.getByText('PAGE')).toBeTruthy();
    expect(document.querySelector('.manual-edit-page-card')).not.toBeNull();
  });

  it('pins the inspector only through selection and the action bar, never on hover', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await hoverManualEditTarget();
    // Hover raises neither the panel nor any floating affordance.
    expect(document.querySelector('.manual-edit-right')).toBeNull();
    expect(screen.queryByTestId('manual-edit-hover-open')).toBeNull();

    // Selection chrome plus the action bar's "Edit parameters" button is the
    // only path into the inspector.
    await selectManualEditTarget();

    // Selected target inspector exposes the typography "Size" control.
    await findStyleInput('Size');
    expect(screen.queryByText('PAGE')).toBeNull();
  });

  it('re-enters edit mode on the latest source after an external rewrite', async () => {
    const v1 = '<!doctype html><html><body><main data-od-id="hero">Version One</main></body></html>';
    const v2 = '<!doctype html><html><body><main data-od-id="hero">Version Two</main></body></html>';
    let payload = v1;
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(payload, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));
    const fileV1 = htmlPreviewFile();
    const { rerender } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={fileV1} />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => {
      const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(node.srcdoc).toContain('Version One');
    });

    // Leave edit mode; the agent rewrites the file (mtime bump → re-fetch).
    clickManualTool('manual-edit-mode-toggle');
    payload = v2;
    rerender(
      <FileViewer projectId="project-1" projectKind="prototype"
        file={{ ...fileV1, mtime: fileV1.mtime + 1000 }}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => {
      const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(node.srcdoc).toContain('Version Two');
      expect(node.srcdoc).not.toContain('Version One');
    });
  });

  it('follows an external rewrite into the frozen canvas while edit mode stays open', async () => {
    const v1 = '<!doctype html><html><body><main data-od-id="hero">Version One</main></body></html>';
    const v2 = '<!doctype html><html><body><main data-od-id="hero">Version Two</main></body></html>';
    let payload = v1;
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(payload, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));
    const fileV1 = htmlPreviewFile();
    const { rerender } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={fileV1} />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc).toContain('Version One');
    });

    // Agent rewrite lands while edit mode is still open and idle.
    payload = v2;
    rerender(
      <FileViewer projectId="project-1" projectKind="prototype"
        file={{ ...fileV1, mtime: fileV1.mtime + 1000 }}
      />,
    );

    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc).toContain('Version Two');
    });
  });

  it('shows one toolbar layer at a time: action bar by default, text toolbar on a text range', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target: heroTarget() },
        source: frame.contentWindow,
      }));
    });
    // Element selection: action bar only, no text toolbar underneath.
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-action-bar')).toBeTruthy();
    });
    expect(screen.queryByTestId('manual-edit-text-toolbar')).toBeNull();

    // A live text range flips ownership to the text toolbar.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-selection', id: 'hero', hasRange: true },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-text-toolbar')).toBeTruthy();
      expect(screen.queryByTestId('manual-edit-action-bar')).toBeNull();
    });
  });

  it('keeps the selection frame aligned when toolbar typography reflows text', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">A wrapping hero title</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target: heroTarget() },
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-selection', id: 'hero', hasRange: true },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => expect(screen.getByTestId('manual-edit-text-toolbar')).toBeTruthy());

    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.click(screen.getByRole('button', { name: 'Font size' }));
    fireEvent.click(screen.getByRole('button', { name: '32px' }));

    const previewMessage = await waitFor(() => {
      const message = postSpy.mock.calls
        .map(([value]) => value as { type?: string; version?: number; measureRect?: boolean })
        .find((value) => value.type === 'od-edit-preview-style');
      if (!message) throw new Error('Typography preview was not posted');
      return message;
    });
    expect(previewMessage.measureRect).toBe(true);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-preview-style-applied',
          version: previewMessage.version,
          ok: true,
          rect: { x: 24, y: 24, width: 160, height: 96 },
        },
        source: frame.contentWindow,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-selection-frame').style.height).toBe('96px');
    });
  });

  it('flushes a pending toolbar style before switching to another target', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main><footer data-od-id="footer">Footer</footer></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target: heroTarget() },
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-selection', id: 'hero', hasRange: true },
        source: frame.contentWindow,
      }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Font size' }));
    fireEvent.click(screen.getByRole('button', { name: '32px' }));

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-select',
          target: {
            ...heroTarget(),
            id: 'footer',
            label: 'Footer',
            text: 'Footer',
            outerHtml: '<footer data-od-id="footer">Footer</footer>',
          },
        },
        source: frame.contentWindow,
      }));
    });

    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]!.content).toContain('data-od-id="hero" style="font-size: 32px;"');
  });

  it('flushes a pending toolbar style before duplicating against the latest source', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main><footer data-od-id="footer">Footer</footer></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target: heroTarget() },
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-selection', id: 'hero', hasRange: true },
        source: frame.contentWindow,
      }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Font size' }));
    fireEvent.click(screen.getByRole('button', { name: '32px' }));
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-selection', id: 'hero', hasRange: false },
        source: frame.contentWindow,
      }));
    });
    fireEvent.click(await screen.findByTestId('manual-edit-duplicate'));
    await ackApplyDom(frame, postSpy);

    await waitFor(() => expect(savedBodies).toHaveLength(2));
    expect(savedBodies[0]!.content).toContain('data-od-id="hero" style="font-size: 32px;"');
    expect(savedBodies[0]!.content.match(/<main/g)).toHaveLength(1);
    expect(savedBodies[1]!.content).toContain('data-od-id="hero" style="font-size: 32px;"');
    expect(savedBodies[1]!.content.match(/<main/g)).toHaveLength(2);
  });

  it('queues an inline text commit behind a slow toolbar style save', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main><footer data-od-id="footer">Footer</footer></body></html>';
    const savedBodies: Array<{ content: string; versionLabel?: string; versionSource?: string }> = [];
    let resolveFirstWrite!: (response: Response) => void;
    const firstWriteResponse = new Promise<Response>((resolve) => {
      resolveFirstWrite = resolve;
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        savedBodies.push(JSON.parse(String(init.body)) as (typeof savedBodies)[number]);
        if (savedBodies.length === 1) return firstWriteResponse;
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        const latest = savedBodies[savedBodies.length - 1]?.content ?? source;
        return new Response(latest, { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target: heroTarget() },
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-selection', id: 'hero', hasRange: true },
        source: frame.contentWindow,
      }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Font size' }));
    fireEvent.click(screen.getByRole('button', { name: '32px' }));

    // Switching targets flushes the debounced style save. Hold that request
    // open, then finish the inline text session while the save is in flight.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-select',
          target: {
            ...heroTarget(),
            id: 'footer',
            label: 'Footer',
            text: 'Footer',
            outerHtml: '<footer data-od-id="footer">Footer</footer>',
          },
        },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => expect(savedBodies).toHaveLength(1));

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });
    expect(savedBodies).toHaveLength(1);

    await act(async () => {
      resolveFirstWrite(new Response(JSON.stringify({ file: htmlPreviewFile() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      await firstWriteResponse;
    });

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.html).toContain('Updated hero');
    await waitFor(() => expect(savedBodies).toHaveLength(2));
    expect(savedBodies[0]!.content).toContain('data-od-id="hero" style="font-size: 32px;"');
    expect(savedBodies[1]!.content).toContain('data-od-id="hero" style="font-size: 32px;">Updated hero</main>');
  });

  it('does not let a pending manual edit style save survive a file switch', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('<!doctype html><html><body></body></html>', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = htmlPreviewFile();
    const second = { ...htmlPreviewFile(), name: 'second.html', path: 'second.html' };
    const { rerender } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={first}
        liveHtml='<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');
    fireEvent.change(baseSizeInput, { target: { value: '18' } });

    rerender(
      <FileViewer projectId="project-1" projectKind="prototype" file={second}
        liveHtml='<!doctype html><html><body><main data-od-id="second">Second</main></body></html>'
      />,
    );

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/projects/project-1/files',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('clears loaded source immediately on file switch without liveHtml before manual edit can save', async () => {
    let secondResolve!: (value: Response) => void;
    const secondFetch = new Promise<Response>((resolve) => {
      secondResolve = resolve;
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/second.html')) return secondFetch;
      return new Response('<!doctype html><html><body><main data-od-id="hero">First</main></body></html>', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const first = htmlPreviewFile();
      const second = { ...htmlPreviewFile(), name: 'second.html', path: 'second.html' };
      const { rerender } = render(<FileViewer projectId="project-1" projectKind="prototype" file={first} />);

      // The raw fetch is cache-busted on every mtime / reload / files-refresh
      // bump so srcDoc-mode previews see fresh HTML after agent edits.
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/projects\/project-1\/raw\/preview\.html(\?|$)/),
        {},
      ));
      fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
      await selectManualEditTarget();
      const baseSizeInput = await findStyleInput('Size');
      fireEvent.change(baseSizeInput, { target: { value: '18' } });

      rerender(<FileViewer projectId="project-1" projectKind="prototype" file={second} />);
      fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });

      expect(fetchMock).not.toHaveBeenCalledWith(
        '/api/projects/project-1/files',
        expect.objectContaining({ method: 'POST' }),
      );
      secondResolve(new Response('<!doctype html><html><body><main data-od-id="second">Second</main></body></html>', { status: 200 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a prior manual edit save error after a later successful save', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    let saveAttempts = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        saveAttempts += 1;
        if (saveAttempts === 1) {
          return new Response(JSON.stringify({
            error: { code: 'FORBIDDEN', message: 'Request failed (403).' },
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(source, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');

    fireEvent.change(baseSizeInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText(/Could not save the edited file/)).toBeTruthy();
    });

    fireEvent.change(baseSizeInput, { target: { value: '19' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.queryByText(/Could not save the edited file/)).toBeNull();
    });
  });

  it('closes the inspector without saving on cancel, staying in edit mode', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const fetchMock = vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');

    fireEvent.change(baseSizeInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).toBeNull();
    });
    expect(document.querySelector('.manual-edit-workspace')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/projects/project-1/files',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('closes the inspector after save succeeds, staying in edit mode', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');

    fireEvent.change(baseSizeInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/files',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(document.querySelector('.manual-edit-right')).toBeNull();
    });
    expect(document.querySelector('.manual-edit-workspace')).not.toBeNull();
  });

  it('saves text typed in the inspector while an inline text session is active', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const savedBodies: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        savedBodies.push(String(init.body));
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-session', id: 'hero', active: true },
        source: frame.contentWindow,
      }));
    });

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Edited from panel' } });
    fireEvent.click(screen.getByText('Save'));
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-text-session',
          id: 'hero',
          active: false,
          changed: false,
          committed: false,
        },
        source: frame.contentWindow,
      }));
    });

    await waitFor(() => {
      expect(savedBodies.length).toBe(1);
    });
    const payload = JSON.parse(savedBodies[0]!) as { content: string };
    expect(payload.content).toContain('<main data-od-id="hero">Edited from panel</main>');
    expect(payload.content).not.toContain('<main data-od-id="hero">Hero</main>');
  });

  it('saves escaped inspector text after an inline HTML commit adds nested formatting', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hello world</main></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-html-commit', id: 'hero', value: 'Hello <strong>world</strong>' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]!.content).toContain('Hello <strong>world</strong>');

    postSpy.mockClear();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '<literal> & replacement' } });
    fireEvent.click(screen.getByText('Save'));

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.html).toContain('&lt;literal&gt; &amp; replacement');
    await waitFor(() => expect(savedBodies).toHaveLength(2));
    expect(savedBodies[1]!.content).toContain('&lt;literal&gt; &amp; replacement');
    expect(savedBodies[1]!.content).not.toContain('<strong>');
  });

  it('undoes a style edit in place without reloading the preview iframe', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    let savedContent: string | null = null;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        savedContent = (JSON.parse(String(init.body)) as { content: string }).content;
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Raw reads reflect the latest save so the undo path's history-source
      // confirmation sees a consistent file.
      return new Response(savedContent ?? source, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    // Element selection raises the action bar only (one toolbar layer at a
    // time); element-level styles route through the inspector.
    await selectManualEditTarget();
    expect(screen.queryByTestId('manual-edit-text-toolbar')).toBeNull();

    const sizeInput = await findStyleInput('Size');
    fireEvent.change(sizeInput, { target: { value: '48' } });
    const modal = document.querySelector('.manual-edit-modal') as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(savedContent).toContain('font-size: 48px');
    }, { timeout: 4000 });

    const iframe = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const srcdocBefore = iframe.srcdoc;
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');

    fireEvent.click(screen.getByTestId('manual-edit-undo'));
    await waitFor(() => {
      expect(savedContent).not.toContain('font-size: 48px');
    }, { timeout: 4000 });

    // The flash bug: undo used to swap the frozen srcDoc and reload the
    // iframe. The style patch must instead revert through the preview channel.
    expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc).toBe(srcdocBefore);
    await waitFor(() => {
      expect(postSpy.mock.calls.some(([message]) => {
        const data = message as { type?: string; styles?: Record<string, string> };
        return data?.type === 'od-edit-preview-style' && data.styles?.fontSize === '';
      })).toBe(true);
    });
  });

  it('keeps the preview mounted and does not save when deleting the only rendered root', async () => {
    const source = '<!doctype html><html><body><main data-od-id="app-root">App</main><script>window.bootApp && window.bootApp();</script></body></html>';
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'app-root',
      label: 'App root',
      text: 'App',
      outerHtml: '<main data-od-id="app-root">App</main>',
    });

    // Both the selection-frame action bar and the panel footer expose a
    // delete control now; either one drives the same remove-element patch.
    fireEvent.click(screen.getAllByLabelText('Delete element')[0]!);

    await waitFor(() => {
      expect(screen.getByText('Cannot remove the last rendered element in the document.')).toBeTruthy();
    });
    expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc).toContain('data-od-id="app-root"');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/projects/project-1/files',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ---------------------------------------------------------------------------
  // In-place content pipeline: content commits mutate the live iframe DOM via
  // od-edit-apply-dom instead of swapping srcDoc — no white flash, no scroll
  // reset. These tests play the bridge's role: capture the apply-dom post and
  // ack it, then assert the canvas was NOT reloaded (srcdoc unchanged).
  // ---------------------------------------------------------------------------

  type ApplyDomMessage = {
    type: string;
    id: string;
    html: string;
    op?: string;
    fields?: Record<string, unknown>;
    version: number;
  };

  function lastApplyDomMessage(spy: { mock: { calls: unknown[][] } }): ApplyDomMessage | null {
    for (let i = spy.mock.calls.length - 1; i >= 0; i--) {
      const msg = spy.mock.calls[i]?.[0] as { type?: string } | undefined;
      if (msg?.type === 'od-edit-apply-dom') return msg as ApplyDomMessage;
    }
    return null;
  }

  async function ackApplyDom(frame: HTMLIFrameElement, spy: { mock: { calls: unknown[][] } }) {
    const message = await waitFor(() => {
      const found = lastApplyDomMessage(spy);
      if (!found) throw new Error('no od-edit-apply-dom posted yet');
      return found;
    });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-apply-dom-result', version: message.version, ok: true },
        source: frame.contentWindow,
      }));
    });
    return message;
  }

  function manualEditWriteMock(initialSource: string) {
    const savedBodies: Array<{ content: string; versionLabel?: string; versionSource?: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/upload') && init?.method === 'POST') {
        return new Response(JSON.stringify({ files: [{ name: 'pasted-image.png', path: 'pasted-image.png' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        savedBodies.push(JSON.parse(String(init.body)) as (typeof savedBodies)[number]);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        // The latest saved content is the persisted truth; applyManualEdit's
        // freshness confirm must see its own writes or it clears history.
        const latest = savedBodies[savedBodies.length - 1]?.content ?? initialSource;
        return new Response(latest, { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    return { fetchMock, savedBodies };
  }

  it('applies a text commit in place without reloading the srcDoc canvas', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();
    const srcdocBefore = frame.srcdoc;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.op ?? 'replace').toBe('replace');
    expect(applied.id).toBe('hero');
    expect(applied.html).toContain('Updated hero');

    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]!.content).toContain('Updated hero');
    expect(savedBodies[0]!.versionSource).toBe('manual');
    // No srcDoc swap — the canvas kept its DOM (and therefore its scroll).
    expect(frame.srcdoc).toBe(srcdocBefore);
  });

  it('deletes an element in place through the remove op', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main><footer data-od-id="footer">Footer</footer></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();
    const srcdocBefore = frame.srcdoc;

    fireEvent.click(screen.getAllByLabelText('Delete element')[0]!);

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.op).toBe('remove');
    expect(applied.id).toBe('hero');

    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]!.content).not.toContain('data-od-id="hero"');
    expect(frame.srcdoc).toBe(srcdocBefore);
    // Selection chrome is gone with the element.
    await waitFor(() => {
      expect(screen.queryByTestId('manual-edit-selection-frame')).toBeNull();
    });
  });

  it('inserts a pasted image in place and hands the selection to it', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();
    const srcdocBefore = frame.srcdoc;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-paste-image',
          id: 'hero',
          name: 'pasted-image.png',
          mime: 'image/png',
          buffer: new Uint8Array([137, 80, 78, 71]).buffer,
        },
        source: frame.contentWindow,
      }));
    });

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.op).toBe('insert-after');
    expect(applied.id).toBe('hero');
    expect(applied.html).toContain('<img');
    expect(applied.html).toContain('pasted-image.png');

    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(frame.srcdoc).toBe(srcdocBefore);

    // The bridge would re-broadcast targets after the in-place insert; the
    // armed hand-off must select the new image element (positional path id
    // read back from the saved source: hero is body child 0 → img is 1).
    const imageTarget: ManualEditTarget = {
      ...heroTarget(),
      id: 'path-1',
      kind: 'image',
      label: 'Pasted image',
      tagName: 'img',
      text: '',
      fields: { src: 'pasted-image.png', alt: '' },
      attributes: {},
      outerHtml: '<img src="pasted-image.png" alt="" style="max-width: 100%;">',
    };
    // A newly inserted image may still be 0x0 before its asset load, so the
    // bridge's first non-empty target pass can legitimately omit it. Keep the
    // pending hand-off alive until that exact target is announced later.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-targets', targets: [heroTarget()] },
        source: frame.contentWindow,
      }));
    });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-targets', targets: [heroTarget(), imageTarget] },
        source: frame.contentWindow,
      }));
    });
    // Image selection exposes the crop affordance in the action bar.
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-crop-start')).toBeTruthy();
    });
  });

  it('shows localized upload, processing, and success toasts for pasted or dropped images', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock: baseFetchMock } = manualEditWriteMock(source);
    let resolveUpload!: (response: Response) => void;
    const uploadResponse = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/upload') && init?.method === 'POST') {
        return uploadResponse;
      }
      return baseFetchMock(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-paste-image',
          id: 'hero',
          name: 'pasted-image.png',
          mime: 'image/png',
          buffer: new Uint8Array([137, 80, 78, 71]).buffer,
        },
        source: frame.contentWindow,
      }));
    });

    expect(await screen.findByText('Uploading image…')).toBeTruthy();

    await act(async () => {
      resolveUpload(new Response(JSON.stringify({
        files: [{ name: 'pasted-image.png', path: 'pasted-image.png' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      await uploadResponse;
    });

    expect(await screen.findByText('Processing image…')).toBeTruthy();
    await ackApplyDom(frame, postSpy);
    expect(await screen.findByText('Image added')).toBeTruthy();
  });

  it('applies brand-kit text commits in place instead of reloading (runtime-annotated ids)', async () => {
    // Brand-kit targets get their data-od-id from the bridge at runtime — the
    // saved source has no markup for them; edits persist into the payload.
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'brand-name',
      label: 'Brand name',
      text: 'Acme',
      fields: { text: 'Acme' },
      attributes: { 'data-od-id': 'brand-name' },
      outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
    });
    const srcdocBefore = frame.srcdoc;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'brand-name', value: 'Acme Studios' },
        source: frame.contentWindow,
      }));
    });

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.op).toBe('apply-content');
    expect((applied as unknown as { fields?: { text?: string } }).fields?.text).toBe('Acme Studios');

    await waitFor(() => expect(savedBodies).toHaveLength(1));
    // The edit persisted into the brand payload…
    expect(savedBodies[0]!.content).toContain('Acme Studios');
    // …and the canvas was NOT reloaded.
    expect(frame.srcdoc).toBe(srcdocBefore);
  });

  it('replays runtime-only brand-kit text history in place without reloading', async () => {
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'brand-name',
      label: 'Brand name',
      text: 'Acme',
      fields: { text: 'Acme' },
      attributes: { 'data-od-id': 'brand-name' },
      outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
    });
    const srcdocBefore = frame.srcdoc;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'brand-name', value: 'Acme Studios' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));

    postSpy.mockClear();
    fireEvent.click(screen.getByTestId('manual-edit-undo'));
    const undoApplied = await ackApplyDom(frame, postSpy);
    expect(undoApplied).toMatchObject({
      id: 'brand-name',
      op: 'apply-content',
      fields: { text: 'Acme' },
    });
    await waitFor(() => expect(savedBodies).toHaveLength(2));
    expect(savedBodies[1]!.content).toBe(source);
    expect(frame.srcdoc).toBe(srcdocBefore);

    postSpy.mockClear();
    fireEvent.click(screen.getByTestId('manual-edit-redo'));
    const redoApplied = await ackApplyDom(frame, postSpy);
    expect(redoApplied).toMatchObject({
      id: 'brand-name',
      op: 'apply-content',
      fields: { text: 'Acme Studios' },
    });
    await waitFor(() => expect(savedBodies).toHaveLength(3));
    expect(savedBodies[2]!.content).toContain('Acme Studios');
    expect(frame.srcdoc).toBe(srcdocBefore);
  });

  it('replays runtime-only brand-kit style history in place with the persisted values', async () => {
    // Runtime-only targets persist set-style in the runtime-overrides <style>
    // rule, not as element inline styles. Redo must replay the persisted
    // values through the preview channel — the regression treated the target
    // as unstyled, cleared the touched property, and still reported success,
    // leaving the canvas on the undone style while the file held the redo.
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'brand-name',
      label: 'Brand name',
      text: 'Acme',
      fields: { text: 'Acme' },
      attributes: { 'data-od-id': 'brand-name' },
      outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
    });
    const srcdocBefore = frame.srcdoc;

    const sizeInput = await findStyleInput('Size');
    fireEvent.change(sizeInput, { target: { value: '48' } });
    const modal = document.querySelector('.manual-edit-modal') as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(savedBodies).toHaveLength(1), { timeout: 4000 });
    expect(savedBodies[0]!.content).toContain('font-size: 48px !important');

    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    const previewedFontSizes = () => postSpy.mock.calls
      .map(([message]) => message as { type?: string; styles?: Record<string, string> })
      .filter((data) => data?.type === 'od-edit-preview-style')
      .map((data) => data.styles?.fontSize);

    fireEvent.click(screen.getByTestId('manual-edit-undo'));
    await waitFor(() => expect(savedBodies).toHaveLength(2), { timeout: 4000 });
    expect(savedBodies[1]!.content).not.toContain('font-size: 48px');
    await waitFor(() => expect(previewedFontSizes()).toContain(''));

    postSpy.mockClear();
    fireEvent.click(screen.getByTestId('manual-edit-redo'));
    await waitFor(() => expect(savedBodies).toHaveLength(3), { timeout: 4000 });
    expect(savedBodies[2]!.content).toContain('font-size: 48px !important');
    // THE regression: redo must preview the persisted value, not clear it.
    await waitFor(() => expect(previewedFontSizes()).toContain('48px'));
    // Both replays stayed on the live canvas — no srcDoc reload.
    expect(frame.srcdoc).toBe(srcdocBefore);
  });

  it('keeps selection and canvas stable when the last runtime style declaration is cleared', async () => {
    // Clearing a runtime-only target's final declaration (here: toggling the
    // active alignment back to default) drops its override rule from the
    // saved source. The reconcile guard must classify the target as
    // runtime-backed via the brand payload — not via rule ownership — or
    // this valid, still-rendered target reads as deleted and the debounced
    // toolbar save drops the selection and reloads the canvas.
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const runtimeTarget = {
      ...heroTarget(),
      id: 'brand-name',
      label: 'Brand name',
      text: 'Acme',
      fields: { text: 'Acme' },
      attributes: { 'data-od-id': 'brand-name' },
      outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
    };
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target: runtimeTarget },
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-selection', id: 'brand-name', hasRange: true },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => expect(screen.getByTestId('manual-edit-text-toolbar')).toBeTruthy());
    const srcdocBefore = frame.srcdoc;

    fireEvent.click(screen.getByRole('button', { name: 'Align center' }));
    await waitFor(() => expect(savedBodies).toHaveLength(1), { timeout: 4000 });
    expect(savedBodies[0]!.content).toContain('text-align: center !important');

    // Toggling the active alignment off emits `textAlign: ''` — this deletes
    // the rule's last declaration and removes the rule itself.
    fireEvent.click(screen.getByRole('button', { name: 'Align center' }));
    await waitFor(() => expect(savedBodies).toHaveLength(2), { timeout: 4000 });
    expect(savedBodies[1]!.content).not.toContain('text-align: center');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // THE regression: the still-rendered runtime target must not be treated
    // as vanished — no error banner, no selection drop, no canvas reload.
    expect(screen.queryByText(/no longer exists/)).toBeNull();
    expect(screen.getByTestId('manual-edit-selection-frame')).toBeTruthy();
    expect(frame.srcdoc).toBe(srcdocBefore);
  });

  it('persists sanitized inline formatting for runtime-only brand-kit text', async () => {
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'brand-name',
      label: 'Brand name',
      text: 'Acme',
      attributes: { 'data-od-id': 'brand-name' },
      outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
    });
    const srcdocBefore = frame.srcdoc;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-html-commit',
          id: 'brand-name',
          value: 'Acme <span style="font-weight: 700" onclick="alert(1)">Studios</span><script>steal()</script>',
        },
        source: frame.contentWindow,
      }));
    });

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.op).toBe('apply-content');
    expect(applied.fields?.html).toBe('Acme <span style="font-weight: 700">Studios</span>');
    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]!.content).toContain('od-manual-edit-runtime-overrides');
    expect(savedBodies[0]!.content).not.toContain('onclick');
    expect(savedBodies[0]!.content).not.toContain('steal()');
    expect(frame.srcdoc).toBe(srcdocBefore);
  });

  it('keeps the semantic id when replacing runtime-only container HTML in place', async () => {
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'brand-system-section',
      kind: 'container',
      label: 'Brand system',
      text: 'Brand system',
      attributes: { 'data-od-id': 'brand-system-section' },
      outerHtml: '<section data-od-id="brand-system-section">Brand system</section>',
    });

    const htmlEditor = document.querySelector('.manual-edit-code') as HTMLTextAreaElement;
    fireEvent.change(htmlEditor, {
      target: { value: '<section class="replacement">Updated brand system</section>' },
    });
    const modal = document.querySelector('.manual-edit-modal') as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: /^Save$/ }));

    const applied = await ackApplyDom(frame, postSpy);
    expect(applied.op).toBe('replace');
    expect(applied.id).toBe('brand-system-section');
    expect(applied.html).toContain('data-od-id="brand-system-section"');
    expect(applied.html).toContain('class="replacement"');
    await waitFor(() => expect(savedBodies).toHaveLength(1));
  });

  it('does not offer duplicate for runtime-only brand-kit targets', async () => {
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    await previewFrame();
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'brand-name',
      label: 'Brand name',
      text: 'Acme',
      attributes: { 'data-od-id': 'brand-name' },
      outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
    });

    await waitFor(() => expect(screen.queryByTestId('manual-edit-duplicate')).toBeNull());
  });

  it('clears an older element clipboard when copying a runtime-only target', async () => {
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><main data-od-id="hero">Hero</main><footer data-od-id="footer">Footer</footer><div id="root"></div></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    await selectManualEditTarget();

    // Seed the internal element clipboard with a valid source-backed target.
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-copy-request', id: 'hero' },
        source: frame.contentWindow,
      }));
      await Promise.resolve();
    });

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-select',
          target: {
            ...heroTarget(),
            id: 'brand-name',
            label: 'Brand name',
            text: 'Acme',
            fields: { text: 'Acme' },
            attributes: { 'data-od-id': 'brand-name' },
            outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
          },
        },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect((screen.getByLabelText('Text') as HTMLInputElement).value).toBe('Acme');
    });

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-copy-request', id: 'brand-name' },
        source: frame.contentWindow,
      }));
    });

    expect(await screen.findAllByText('Runtime-rendered elements cannot be copied.')).not.toHaveLength(0);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-paste-request', id: 'footer' },
        source: frame.contentWindow,
      }));
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(savedBodies).toHaveLength(0);
  });

  it('rejects image paste before upload for runtime-only brand-kit targets', async () => {
    const source = '<!doctype html><html><head><script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme"}}</script></head><body><div id="root"></div></body></html>';
    const { fetchMock } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    await selectManualEditTarget({
      ...heroTarget(),
      id: 'brand-name',
      label: 'Brand name',
      text: 'Acme',
      attributes: { 'data-od-id': 'brand-name' },
      outerHtml: '<h1 data-od-id="brand-name">Acme</h1>',
    });

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-paste-image',
          id: 'brand-name',
          name: 'runtime-paste.png',
          mime: 'image/png',
          buffer: new Uint8Array([137, 80, 78, 71]).buffer,
        },
        source: frame.contentWindow,
      }));
    });

    expect(await screen.findAllByText('Runtime-rendered elements cannot be used as insertion points.')).not.toHaveLength(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/upload'))).toBe(false);
  });

  it('undoes a commit in place and records an Undo version label', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();
    const srcdocBefore = frame.srcdoc;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));

    fireEvent.keyDown(window, { key: 'z', metaKey: true });

    const applied = await waitFor(() => {
      const found = lastApplyDomMessage(postSpy);
      if (!found || !found.html.includes('>Hero<')) throw new Error('undo apply-dom not posted yet');
      return found;
    });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-apply-dom-result', version: applied.version, ok: true },
        source: frame.contentWindow,
      }));
    });
    expect(applied.op ?? 'replace').toBe('replace');

    await waitFor(() => expect(savedBodies).toHaveLength(2));
    // The rollback is a first-class version list entry.
    expect(savedBodies[1]!.versionSource).toBe('manual');
    expect(savedBodies[1]!.versionLabel).toMatch(/^Undo /);
    expect(savedBodies[1]!.content).toContain('>Hero<');
    expect(frame.srcdoc).toBe(srcdocBefore);
  });

  it('folds a live text session into history so undo walks the whole chain in order', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();

    // Chain step 1: a committed text edit.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));

    // Chain step 2: a live, still-uncommitted inline session.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-session', id: 'hero', active: true },
        source: frame.contentWindow,
      }));
    });

    fireEvent.keyDown(window, { key: 'z', metaKey: true });

    // The host must close the session FIRST — undoing beneath a live session
    // would skip the newest edit and re-apply it right after the rollback.
    await waitFor(() => {
      const asked = postSpy.mock.calls.some(([message]) =>
        (message as { type?: string } | undefined)?.type === 'od-edit-text-finish');
      if (!asked) throw new Error('od-edit-text-finish not posted yet');
    });
    // Play the bridge's part: the session commits its current text, then ends.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Second pass' },
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-session', id: 'hero', active: false },
        source: frame.contentWindow,
      }));
    });

    // The session lands as its own history entry…
    const sessionApply = await waitFor(() => {
      const found = lastApplyDomMessage(postSpy);
      if (!found || !found.html.includes('Second pass')) throw new Error('session commit apply-dom not posted yet');
      return found;
    });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-apply-dom-result', version: sessionApply.version, ok: true },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => expect(savedBodies).toHaveLength(2));
    expect(savedBodies[1]!.content).toContain('Second pass');

    // …and the undo then reverts exactly that entry, not an older one.
    const undoApply = await waitFor(() => {
      const found = lastApplyDomMessage(postSpy);
      if (!found || !found.html.includes('Updated hero')) throw new Error('undo apply-dom not posted yet');
      return found;
    });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-apply-dom-result', version: undoApply.version, ok: true },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => expect(savedBodies).toHaveLength(3));
    expect(savedBodies[2]!.versionLabel).toMatch(/^Undo /);
    expect(savedBodies[2]!.content).toContain('Updated hero');
    expect(savedBodies[2]!.content).not.toContain('Second pass');
  });

  // Speaker notes write the same HTML file from a surface OUTSIDE the manual
  // edit pipeline. Without a history record, the next undo's freshness check
  // sees bytes it never wrote, reads that as an external rewrite, and clears
  // the ENTIRE undo chain — the user loses every prior step.
  it('keeps the undo chain continuous across a speaker-notes save', async () => {
    const source = '<!doctype html><html><body><section class="slide"><main data-od-id="hero">Hero</main></section></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();

    // Chain step 1: a manual text edit.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));

    // Chain step 2: a speaker-notes edit, saved on blur.
    const notesPreview = await waitFor(() => {
      const node = document.querySelector('.speaker-notes-preview');
      if (!node) throw new Error('speaker notes panel not rendered');
      return node;
    });
    fireEvent.click(notesPreview);
    const textarea = await waitFor(() => {
      const node = document.querySelector('.speaker-notes-editor textarea') as HTMLTextAreaElement | null;
      if (!node) throw new Error('speaker notes editor not open');
      return node;
    });
    fireEvent.change(textarea, { target: { value: 'Open with the market slide.' } });
    fireEvent.blur(textarea);
    await waitFor(() => expect(savedBodies).toHaveLength(2));
    expect(savedBodies[1]!.content).toContain('Open with the market slide.');

    // Undo #1 reverts the notes edit — and must NOT report the file as
    // externally changed, which is how the chain used to be wiped.
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(savedBodies).toHaveLength(3));
    expect(savedBodies[2]!.content).not.toContain('Open with the market slide.');
    expect(savedBodies[2]!.content).toContain('Updated hero');
    expect(document.querySelector('.manual-edit-error')).toBeNull();

    // Undo #2 keeps walking back into the manual text edit — proof the chain
    // survived rather than being cleared at the notes boundary.
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    const undoApply = await waitFor(() => {
      const found = lastApplyDomMessage(postSpy);
      if (!found || !found.html.includes('>Hero<')) throw new Error('second undo apply-dom not posted yet');
      return found;
    });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-apply-dom-result', version: undoApply.version, ok: true },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => expect(savedBodies).toHaveLength(4));
    expect(savedBodies[3]!.content).toContain('>Hero<');
    expect(savedBodies[3]!.content).not.toContain('Updated hero');
  });

  // Notes live in a <script type="application/json"> the browser never
  // renders, so reverting one changes nothing on screen. Reloading the canvas
  // for it costs a white flash and a scroll-restore gamble for no visual gain.
  it('undoes a speaker-notes edit without reloading the canvas', async () => {
    const source = '<!doctype html><html><body><section class="slide"><main data-od-id="hero">Hero</main></section></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();

    // A manual edit first, so the notes entry's before-source no longer
    // matches the frozen canvas snapshot — otherwise the reload is a no-op
    // and the reload path never actually runs.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));

    const notesPreview = await waitFor(() => {
      const node = document.querySelector('.speaker-notes-preview');
      if (!node) throw new Error('speaker notes panel not rendered');
      return node;
    });
    fireEvent.click(notesPreview);
    const textarea = await waitFor(() => {
      const node = document.querySelector('.speaker-notes-editor textarea') as HTMLTextAreaElement | null;
      if (!node) throw new Error('speaker notes editor not open');
      return node;
    });
    fireEvent.change(textarea, { target: { value: 'Slow down on the ask.' } });
    fireEvent.blur(textarea);
    await waitFor(() => expect(savedBodies).toHaveLength(2));
    const srcdocBefore = frame.srcdoc;

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(savedBodies).toHaveLength(3));
    expect(savedBodies[2]!.content).not.toContain('Slow down on the ask.');

    // The canvas kept its DOM — and therefore its scroll position.
    expect(frame.srcdoc).toBe(srcdocBefore);
    // The notes panel still followed the rollback.
    await waitFor(() => {
      expect(document.querySelector('.speaker-notes-panel')?.textContent)
        .not.toContain('Slow down on the ask.');
    });
  });

  it('versions a speaker-notes save like every other manual edit', async () => {
    const source = '<!doctype html><html><body><section class="slide"><main data-od-id="hero">Hero</main></section></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    const notesPreview = await waitFor(() => {
      const node = document.querySelector('.speaker-notes-preview');
      if (!node) throw new Error('speaker notes panel not rendered');
      return node;
    });
    fireEvent.click(notesPreview);
    const textarea = await waitFor(() => {
      const node = document.querySelector('.speaker-notes-editor textarea') as HTMLTextAreaElement | null;
      if (!node) throw new Error('speaker notes editor not open');
      return node;
    });
    fireEvent.change(textarea, { target: { value: 'Land the pricing story here.' } });
    fireEvent.blur(textarea);

    // Notes edits used to write the file with no version metadata at all, so
    // they were invisible in the version list and unrecoverable.
    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]!.versionSource).toBe('manual');
    expect(savedBodies[0]!.versionLabel).toBeTruthy();
  });

  // Restoring a version is the user deliberately jumping the timeline. The
  // undo chain belongs to the lineage being left, so it is dropped — but
  // silently, not by letting the next undo blame an "external" rewrite.
  it('drops the undo chain on an explicit version restore without blaming an external rewrite', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const restored = '<!doctype html><html><body><main data-od-id="hero">Restored hero</main></body></html>';
    const { fetchMock, savedBodies } = manualEditWriteMock(source);
    const versionsFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const version = {
        id: 'v1', fileName: 'preview.html', version: 1, label: 'First draft',
        createdAt: 1710000000000, source: 'agent', prompt: null,
        size: restored.length, mime: 'text/html', kind: 'html', current: false,
      };
      if (url.includes('/versions/v1/restore') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: htmlPreviewFile(), version }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/versions/v1')) {
        return new Response(JSON.stringify({ version, content: restored }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/versions')) {
        return new Response(JSON.stringify({ file: htmlPreviewFile(), versions: [version] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return fetchMock(input, init);
    });
    vi.stubGlobal('fetch', versionsFetch);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect((screen.getByTestId('manual-edit-undo') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(document.querySelector('.file-version-trigger')!);
    const versionItem = await waitFor(() => {
      const node = document.querySelector('.file-version-item-select');
      if (!node) throw new Error('version list not loaded');
      return node;
    });
    fireEvent.click(versionItem);
    const restoreAction = await waitFor(() => {
      const node = document.querySelector('.file-version-restore-action') as HTMLButtonElement | null;
      if (!node || node.disabled) throw new Error('restore action not ready');
      return node;
    });
    fireEvent.click(restoreAction);
    fireEvent.click(await waitFor(() => {
      const node = document.querySelector('.file-version-restore-confirm-actions .primary');
      if (!node) throw new Error('restore confirm not open');
      return node;
    }));

    // The chain is gone (nothing to undo into the abandoned lineage)…
    await waitFor(() => {
      expect((screen.getByTestId('manual-edit-undo') as HTMLButtonElement).disabled).toBe(true);
    });
    // …and no undo write was attempted against the restored file.
    const writesAfterRestore = savedBodies.length;
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(savedBodies).toHaveLength(writesAfterRestore);
    // The old failure mode: a banner telling the user the file "changed
    // outside manual edit mode" — for a change they made themselves.
    expect(document.querySelector('.manual-edit-error')).toBeNull();
  });

  it('surfaces the server rejection detail when the undo write fails', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const savedBodies: Array<{ content: string; versionLabel?: string }> = [];
    let rejectNextWrite = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        if (rejectNextWrite) {
          rejectNextWrite = false;
          return new Response(
            JSON.stringify({ error: { code: 'ARTIFACT_REGRESSION', message: 'stub body regression' } }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        savedBodies.push(JSON.parse(String(init.body)) as (typeof savedBodies)[number]);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        const latest = savedBodies[savedBodies.length - 1]?.content ?? source;
        return new Response(latest, { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );
    clickManualTool('manual-edit-mode-toggle');
    const frame = await previewFrame();
    const postSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    await selectManualEditTarget();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-text-commit', id: 'hero', value: 'Updated hero' },
        source: frame.contentWindow,
      }));
    });
    await ackApplyDom(frame, postSpy);
    await waitFor(() => expect(savedBodies).toHaveLength(1));

    rejectNextWrite = true;
    fireEvent.keyDown(window, { key: 'z', metaKey: true });

    // The opaque "Could not save the undo result." gave no way to diagnose the
    // rejection; the banner must now carry the server's status/code/message.
    // (It renders inside the inspector panel when that is open, or as the
    // floating canvas toast otherwise — match the shared class, not the role.)
    await waitFor(() => {
      const banner = document.querySelector('.manual-edit-error');
      if (!banner) throw new Error('error banner not shown yet');
      expect(banner.textContent).toContain('Could not save the undo result (422 ARTIFACT_REGRESSION): stub body regression');
    });
  });
});

function heroTarget(): ManualEditTarget {
  return {
    id: 'hero',
    kind: 'text',
    label: 'Hero',
    tagName: 'main',
    className: '',
    text: 'Hero',
    rect: { x: 24, y: 24, width: 160, height: 48 },
    fields: { text: 'Hero' },
    attributes: { 'data-od-id': 'hero' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<main data-od-id="hero">Hero</main>',
  };
}

function htmlPreviewFile(): ProjectFile {
  return {
    name: 'preview.html',
    path: 'preview.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: 'preview.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}
