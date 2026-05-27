// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';

const panelState = vi.hoisted(() => ({
  props: null as ComponentProps<typeof import('../../src/components/ManualEditPanel').ManualEditPanel> | null,
}));

vi.mock('../../src/components/ManualEditPanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/ManualEditPanel')>();
  return {
    ...actual,
    ManualEditPanel: (props: ComponentProps<typeof actual.ManualEditPanel>) => {
      panelState.props = props;
      return <div data-testid="mock-manual-edit-panel" />;
    },
  };
});

import { FileViewer } from '../../src/components/FileViewer';

function openManualTools() {
  // Manual tools now live directly in the primary toolbar.
}

function clickManualTool(testId: string) {
  openManualTools();
  fireEvent.click(screen.getByTestId(testId));
}

function clickAgentTool(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
}

afterEach(() => {
  cleanup();
  panelState.props = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer manual edit history regressions', () => {
  it('flushes pending style edits before activating draw mode from manual edit', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
    let saveResolve!: (value: Response) => void;
    const saveResponse = new Promise<Response>((resolve) => {
      saveResolve = resolve;
    });
    const savedSources: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        savedSources.push(payload.content);
        return saveResponse;
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(initialSource, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => expect(panelState.props).not.toBeNull());

    act(() => {
      panelState.props?.onStyleChange?.('hero', { color: '#ef4444' }, 'Style: Hero');
    });
    clickAgentTool('draw-overlay-toggle');

    await waitFor(() => expect(savedSources).toHaveLength(1));
    expect(savedSources[0]).toContain('rgb(239, 68, 68)');
    openManualTools();
    expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('draw-overlay-toggle').getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      saveResolve(new Response(JSON.stringify({ file: htmlPreviewFile() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      await saveResponse;
    });

    await waitFor(() => {
      openManualTools();
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    });
    expect(screen.getByTestId('draw-overlay-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('uses the undone source snapshot for a follow-up edit after undo', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
    let persistedSource = initialSource;
    const savedSources: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        persistedSource = payload.content;
        savedSources.push(payload.content);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(persistedSource, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => expect(panelState.props).not.toBeNull());

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { color: '#ef4444' } },
        'Style: Hero',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));
    await waitFor(() => expect(panelState.props?.busy).toBe(false));
    await waitFor(() => expect(panelState.props?.canUndo).toBe(true));
    expect(savedSources[0]).toContain('rgb(239, 68, 68)');

    act(() => {
      panelState.props?.onUndo();
    });
    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(savedSources[1]).toBe(initialSource);

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { backgroundColor: '#f97316' } },
        'Style: Hero',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(3));

    expect(savedSources[2]).toContain('background-color: rgb(249, 115, 22)');
    expect(savedSources[2]).not.toContain('rgb(239, 68, 68)');
  });

  it('refreshes the manual edit canvas after non-style source patches', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1></body></html>';
    const savedSources: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        savedSources.push(payload.content);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(initialSource, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());
    const getActivePreviewFrame = () => screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;

    await waitFor(() => {
      const frame = getActivePreviewFrame();
      expect(frame.getAttribute('data-od-active')).toBe('true');
      expect(frame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(panelState.props?.draft.fullSource).toContain('Hero');
    });
    act(() => {
      panelState.props?.onApplyPatch(
        { id: 'hero', kind: 'set-text', value: 'Updated hero' },
        'Content: Hero',
      );
    });

    await waitFor(() => expect(savedSources).toHaveLength(1));
    await waitFor(() => expect(panelState.props?.draft.fullSource).toContain('Updated hero'));
    await waitFor(() => {
      expect(getActivePreviewFrame().srcdoc).toContain('Updated hero');
    });
  });

  it('clears the selected target after deleting an element', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="body">Body</p></body></html>';
    let persistedSource = initialSource;
    const savedSources: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        persistedSource = payload.content;
        savedSources.push(payload.content);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(persistedSource, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const postMessageSpy = vi.spyOn(frame.contentWindow!, 'postMessage');

    await act(async () => {
      await panelState.props?.onSelectTarget(heroTarget());
    });
    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('hero'));
    expect(panelState.props?.draft.text).toBe('Hero');

    act(() => {
      panelState.props?.onApplyPatch(
        { id: 'hero', kind: 'remove-element' },
        'Delete element',
      );
    });

    await waitFor(() => expect(savedSources).toHaveLength(1));
    expect(savedSources[0]).not.toContain('data-od-id="hero"');
    expect(savedSources[0]).toContain('data-od-id="body"');
    await waitFor(() => expect(panelState.props?.selectedTarget).toBeNull());
    expect(panelState.props?.draft.text).toBe('');
    expect(panelState.props?.draft.fullSource).not.toContain('data-od-id="hero"');
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od-edit-selected-target', id: null }),
      '*',
    );
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc)
        .not.toContain('data-od-id="hero"');
    });
  });

  it('syncs panel target selection to the iframe bridge', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="cta">Call to action</p></body></html>'
      />,
    );
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const postMessageSpy = vi.spyOn(frame.contentWindow!, 'postMessage');
    const hero = manualEditTarget('hero', 'Hero');
    const cta = manualEditTarget('cta', 'Call to action');

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od-edit-targets', targets: [hero, cta] },
    }));
    await waitFor(() => expect(panelState.props?.targets.length).toBe(2));

    act(() => {
      panelState.props?.onSelectTarget(cta);
    });

    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'od-edit-selected-target', id: 'cta' }),
        '*',
      );
    });
  });

  it('flushes latest inline text when Save Changes is clicked within the debounce window', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1></body></html>';
    const savedSources: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        savedSources.push(payload.content);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(initialSource, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const originalPostMessage = frame.contentWindow!.postMessage.bind(frame.contentWindow);
    const postMessageSpy = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((message: unknown, options?: WindowPostMessageOptions) => {
      const data = message as { type?: string };
      if (data?.type === 'od-edit-text-commit-now') {
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            type: 'od-edit-text-commit',
            id: 'hero',
            value: 'Hero latest',
            target: manualEditTarget('hero', 'Hero latest'),
          },
        }));
      }
      originalPostMessage(message, options);
    });

    act(() => {
      panelState.props?.onSaveInlineContent?.();
    });

    await waitFor(() => expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od-edit-text-commit-now' }),
      '*',
    ));
    await waitFor(() => expect(savedSources).toHaveLength(1));
    expect(savedSources[0]).toContain('Hero latest');
  });

  it('flushes pending inline text before panel undo', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1></body></html>';
    let persistedSource = initialSource;
    const savedSources: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        persistedSource = payload.content;
        savedSources.push(payload.content);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(persistedSource, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { color: '#ef4444' } },
        'Style: Hero',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const originalPostMessage = frame.contentWindow!.postMessage.bind(frame.contentWindow);
    const postMessageSpy = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((message: unknown, options?: WindowPostMessageOptions) => {
      const data = message as { type?: string };
      if (data?.type === 'od-edit-text-commit-now') {
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            type: 'od-edit-text-commit',
            id: 'hero',
            value: 'Hero latest',
            target: manualEditTarget('hero', 'Hero latest'),
          },
        }));
      }
      originalPostMessage(message, options);
    });

    act(() => {
      panelState.props?.onUndo();
    });

    await waitFor(() => expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od-edit-text-commit-now' }),
      '*',
    ));
    await waitFor(() => expect(savedSources.length).toBeGreaterThanOrEqual(2));
    expect(savedSources[1]).toContain('Hero latest');
  });

  it('does not restore prior selection when inline commit arrives after panel switches target', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="cta">Call to action</p></body></html>'
      />,
    );
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const hero = manualEditTarget('hero', 'Hero');
    const cta = manualEditTarget('cta', 'Call to action');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od-edit-targets', targets: [hero, cta] },
    }));
    await waitFor(() => expect(panelState.props?.targets.length).toBe(2));

    await act(async () => {
      await panelState.props?.onSelectTarget(hero);
    });
    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('hero'));

    await act(async () => {
      await panelState.props?.onSelectTarget(cta);
    });
    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('cta'));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od-edit-text-commit',
        id: 'hero',
        value: 'Hero latest',
        target: manualEditTarget('hero', 'Hero latest'),
      },
    }));

    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('cta'));
  });

  it('does not restore prior selection when inline commit arrives after panel clears selection', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="cta">Call to action</p></body></html>'
      />,
    );
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const hero = manualEditTarget('hero', 'Hero');
    const cta = manualEditTarget('cta', 'Call to action');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od-edit-targets', targets: [hero, cta] },
    }));
    await waitFor(() => expect(panelState.props?.targets.length).toBe(2));

    await act(async () => {
      await panelState.props?.onSelectTarget(hero);
    });
    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('hero'));

    await act(async () => {
      await panelState.props?.onClearSelection();
    });
    await waitFor(() => expect(panelState.props?.selectedTarget).toBeNull());

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od-edit-text-commit',
        id: 'hero',
        value: 'Hero latest',
        target: manualEditTarget('hero', 'Hero latest'),
      },
    }));

    await waitFor(() => expect(panelState.props?.selectedTarget).toBeNull());
  });

  it('flushes pending inline text before clearing selection', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1></body></html>';
    const savedSources: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        savedSources.push(payload.content);
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        return new Response(initialSource, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => expect(panelState.props).not.toBeNull());

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const hero = manualEditTarget('hero', 'Hero');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od-edit-targets', targets: [hero] },
    }));
    await waitFor(() => expect(panelState.props?.targets.length).toBe(1));
    await act(async () => {
      await panelState.props?.onSelectTarget(hero);
    });
    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('hero'));

    const originalPostMessage = frame.contentWindow!.postMessage.bind(frame.contentWindow);
    const postMessageSpy = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((message: unknown, options?: WindowPostMessageOptions) => {
      const data = message as { type?: string };
      if (data?.type === 'od-edit-text-commit-now') {
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            type: 'od-edit-text-commit',
            id: 'hero',
            value: 'Hero latest',
            target: manualEditTarget('hero', 'Hero latest'),
          },
        }));
      }
      originalPostMessage(message, options);
    });

    await act(async () => {
      await panelState.props?.onClearSelection();
    });

    await waitFor(() => expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od-edit-text-commit-now' }),
      '*',
    ));
    await waitFor(() => expect(savedSources).toHaveLength(1));
    expect(savedSources[0]).toContain('Hero latest');
    expect(panelState.props?.selectedTarget).toBeNull();
  });
});

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

function manualEditTarget(id: string, text: string): ManualEditTarget {
  return {
    id,
    kind: 'text',
    label: text,
    tagName: 'h1',
    className: '',
    text,
    rect: { x: 0, y: 0, width: 120, height: 32 },
    fields: { text },
    attributes: { 'data-od-id': id },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: `<h1 data-od-id="${id}">${text}</h1>`,
  };
}

function heroTarget(): ManualEditTarget {
  return {
    id: 'hero',
    kind: 'text',
    label: 'Hero',
    tagName: 'h1',
    className: '',
    text: 'Hero',
    rect: { x: 0, y: 0, width: 120, height: 40 },
    fields: { text: 'Hero' },
    attributes: { 'data-od-id': 'hero' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<h1 data-od-id="hero">Hero</h1>',
  };
}
