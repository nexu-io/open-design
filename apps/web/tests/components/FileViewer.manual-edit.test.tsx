// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileViewer,
  cancelManualEditPendingStyleSnapshot,
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

  async function hoverManualEditTarget(target = heroTarget()) {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-hover', target },
        source: frame.contentWindow,
      }));
    });
    // Hover only surfaces the affordance; it must not open any panel.
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-hover-open')).toBeTruthy();
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

  // Hover only surfaces the "edit params" affordance; pinning the inspector to
  // a target now requires an explicit click (mirrors clicking that affordance
  // or a container/image body in the bridge).
  async function selectManualEditTarget(target = heroTarget()) {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target },
        source: frame.contentWindow,
      }));
    });
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

    // Hovering surfaces only the click affordance, still no panel.
    await hoverManualEditTarget();
    expect(document.querySelector('.manual-edit-right')).toBeNull();
    expect(screen.queryByText('PAGE')).toBeNull();
    expect(screen.getByTestId('manual-edit-hover-open')).toBeTruthy();
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

  it('pins the inspector to a target only after clicking the hover affordance', async () => {
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
    // No panel until the affordance is clicked.
    expect(document.querySelector('.manual-edit-right')).toBeNull();

    fireEvent.click(screen.getByTestId('manual-edit-hover-open'));

    // Selected target inspector exposes the typography "Size" control.
    await findStyleInput('Size');
    expect(screen.queryByText('PAGE')).toBeNull();
    // Affordance hides once its element is the pinned selection.
    expect(screen.queryByTestId('manual-edit-hover-open')).toBeNull();
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

    fireEvent.click(screen.getByLabelText('Delete element'));

    await waitFor(() => {
      expect(screen.getByText('Cannot remove the last rendered element in the document.')).toBeTruthy();
    });
    expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc).toContain('data-od-id="app-root"');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/projects/project-1/files',
      expect.objectContaining({ method: 'POST' }),
    );
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
