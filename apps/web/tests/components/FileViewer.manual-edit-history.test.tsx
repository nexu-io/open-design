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

// Pins the inspector to a target. Hover no longer auto-selects, so selection
// rides the explicit click path (od-edit-select), matching the bridge sending
// it when the user clicks the hover affordance or a container/image body.
async function selectManualEditTarget(target = heroTarget()) {
  const frame = await waitFor(() => {
    const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (!node.contentWindow) throw new Error('Preview frame not ready');
    return node;
  });
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'od-edit-select', target },
      source: frame.contentWindow,
    }));
  });
  await waitFor(() => expect(panelState.props).not.toBeNull());
}

function extractManualEditBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-edit-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('Manual edit bridge script not found');
  return match[1];
}

function installManualEditBridgeFromFrame(frame: HTMLIFrameElement): {
  doc: Document;
  win: Window & typeof globalThis;
} {
  const win = frame.contentWindow as (Window & typeof globalThis) | null;
  const doc = frame.contentDocument;
  if (!win || !doc) throw new Error('Preview frame document not ready');

  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: {
      postMessage(message: unknown) {
        window.dispatchEvent(new MessageEvent('message', {
          data: message,
          source: win,
        }));
      },
    },
  });

  const evaluate = new win.Function(extractManualEditBridgeScript(frame.srcdoc));
  evaluate.call(win);
  win.dispatchEvent(new win.MessageEvent('message', {
    data: { type: 'od-edit-mode', enabled: true },
  }));
  return { doc, win };
}

function dispatchIframeHistoryShortcut(
  win: Window & typeof globalThis,
  target: EventTarget,
  init: KeyboardEventInit,
): boolean {
  return target.dispatchEvent(new win.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  }));
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
    await selectManualEditTarget();

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

  it('keeps the srcDoc iframe mounted when closing manual edit on a srcDoc-only preview', async () => {
    const source = '<!doctype html><html><body><script>localStorage.getItem("od");</script><main data-od-id="hero">Hero</main></body></html>';

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();

    const editFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(editFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
    expect(editFrame.srcdoc).toContain('data-od-edit-bridge');

    // Exiting edit mode is the toolbar toggle's job — the panel's own close
    // button only collapses the inspector and stays in edit.
    clickManualTool('manual-edit-mode-toggle');

    await waitFor(() => {
      const previewFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(previewFrame).toBe(editFrame);
      expect(previewFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(previewFrame.srcdoc).toContain('Hero');
      expect(previewFrame.srcdoc).toContain('data-od-edit-bridge');
    });
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
    await selectManualEditTarget();

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { color: '#ef4444' } },
        'Style: Hero',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));
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
    await selectManualEditTarget();
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
    await selectManualEditTarget();
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const postMessageSpy = vi.spyOn(frame.contentWindow!, 'postMessage');

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
    // Clearing the selection closes the inspector: edit mode returns to a clean
    // canvas (no docked/pinned panel) and the iframe selection marker is reset.
    await waitFor(() => expect(screen.queryByTestId('mock-manual-edit-panel')).toBeNull());
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od-edit-selected-target', id: null }),
      '*',
    );
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc)
        .not.toContain('data-od-id="hero"');
    });
  });

  it('restores and redoes a deleted element from edit history controls', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="body">Body</p></body></html>';
    let persistedSource = initialSource;
    const savedSources: string[] = [];
    vi.stubGlobal('fetch', createPersistenceFetchMock({
      getPersistedSource: () => persistedSource,
      setPersistedSource: (source) => {
        persistedSource = source;
        savedSources.push(source);
      },
    }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();

    act(() => {
      panelState.props?.onApplyPatch(
        { id: 'hero', kind: 'remove-element' },
        'Delete element',
      );
    });

    await waitFor(() => expect(savedSources).toHaveLength(1));
    expect(savedSources[0]).not.toContain('data-od-id="hero"');
    await waitFor(() => expect(screen.queryByTestId('mock-manual-edit-panel')).toBeNull());

    const undoButton = screen.getByTestId('manual-edit-toolbar-undo') as HTMLButtonElement;
    const redoButton = screen.getByTestId('manual-edit-toolbar-redo') as HTMLButtonElement;
    expect(undoButton.disabled).toBe(false);
    expect(redoButton.disabled).toBe(true);

    fireEvent.click(undoButton);

    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(savedSources[1]).toContain('data-od-id="hero"');
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc)
        .toContain('data-od-id="hero"');
    });
    expect((screen.getByTestId('manual-edit-toolbar-undo') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('manual-edit-toolbar-redo') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('manual-edit-toolbar-redo'));

    await waitFor(() => expect(savedSources).toHaveLength(3));
    expect(savedSources[2]).not.toContain('data-od-id="hero"');
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc)
        .not.toContain('data-od-id="hero"');
    });
  });

  it('routes edit history shortcuts from the preview iframe document', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="body">Body</p></body></html>';
    let persistedSource = initialSource;
    const savedSources: string[] = [];
    vi.stubGlobal('fetch', createPersistenceFetchMock({
      getPersistedSource: () => persistedSource,
      setPersistedSource: (source) => {
        persistedSource = source;
        savedSources.push(source);
      },
    }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();

    act(() => {
      panelState.props?.onApplyPatch(
        { id: 'hero', kind: 'remove-element' },
        'Delete element',
      );
    });

    await waitFor(() => expect(savedSources).toHaveLength(1));
    expect(savedSources[0]).not.toContain('data-od-id="hero"');
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc)
        .not.toContain('data-od-id="hero"');
    });

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const { doc, win } = installManualEditBridgeFromFrame(frame);

    const input = doc.createElement('input');
    const textarea = doc.createElement('textarea');
    const select = doc.createElement('select');
    const contentEditable = doc.createElement('div');
    const contentEditableChild = doc.createElement('span');
    contentEditable.setAttribute('contenteditable', 'true');
    contentEditable.appendChild(contentEditableChild);
    const textbox = doc.createElement('div');
    textbox.setAttribute('role', 'textbox');

    for (const target of [input, textarea, select, contentEditableChild, textbox]) {
      const host = target === contentEditableChild ? contentEditable : target;
      doc.body.appendChild(host);
      expect(dispatchIframeHistoryShortcut(win, target, { key: 'z', ctrlKey: true })).toBe(true);
      expect(savedSources).toHaveLength(1);
      host.remove();
    }

    expect(dispatchIframeHistoryShortcut(win, doc, { key: 'z', ctrlKey: true })).toBe(false);
    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(savedSources[1]).toContain('data-od-id="hero"');
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc)
        .toContain('data-od-id="hero"');
    });

    expect(dispatchIframeHistoryShortcut(win, doc, { key: 'z', ctrlKey: true, shiftKey: true })).toBe(false);
    await waitFor(() => expect(savedSources).toHaveLength(3));
    expect(savedSources[2]).not.toContain('data-od-id="hero"');
    await waitFor(() => {
      expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc)
        .not.toContain('data-od-id="hero"');
    });
  });

  it('handles edit history shortcuts without intercepting native text input undo', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="body">Body</p></body></html>';
    let persistedSource = initialSource;
    const savedSources: string[] = [];
    vi.stubGlobal('fetch', createPersistenceFetchMock({
      getPersistedSource: () => persistedSource,
      setPersistedSource: (source) => {
        persistedSource = source;
        savedSources.push(source);
      },
    }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    act(() => {
      panelState.props?.onApplyPatch(
        { id: 'hero', kind: 'remove-element' },
        'Delete element',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const contentEditable = document.createElement('div');
    const contentEditableChild = document.createElement('span');
    contentEditable.setAttribute('contenteditable', 'true');
    contentEditable.appendChild(contentEditableChild);
    const textbox = document.createElement('div');
    textbox.setAttribute('role', 'textbox');

    for (const target of [input, textarea, select, contentEditableChild, textbox]) {
      document.body.appendChild(target === contentEditableChild ? contentEditable : target);
      fireEvent.keyDown(target, { key: 'z', ctrlKey: true });
      expect(savedSources).toHaveLength(1);
      (target === contentEditableChild ? contentEditable : target).remove();
    }

    expect(fireEvent.keyDown(window, { key: 'z', metaKey: true })).toBe(false);
    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(savedSources[1]).toContain('data-od-id="hero"');

    fireEvent.keyDown(window, { key: 'y', metaKey: true });
    expect(savedSources).toHaveLength(2);

    expect(fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })).toBe(false);
    await waitFor(() => expect(savedSources).toHaveLength(3));
    expect(savedSources[2]).not.toContain('data-od-id="hero"');

    expect(fireEvent.keyDown(window, { key: 'z', ctrlKey: true })).toBe(false);
    await waitFor(() => expect(savedSources).toHaveLength(4));
    expect(fireEvent.keyDown(window, { key: 'y', ctrlKey: true })).toBe(false);
    await waitFor(() => expect(savedSources).toHaveLength(5));
    expect(savedSources[4]).not.toContain('data-od-id="hero"');

    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(savedSources).toHaveLength(5);
  });
});

function createPersistenceFetchMock({
  getPersistedSource,
  setPersistedSource,
}: {
  getPersistedSource: () => string;
  setPersistedSource: (source: string) => void;
}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/api/projects/project-1/deployments')) {
      return new Response(JSON.stringify({ deployments: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as { content: string };
      setPersistedSource(payload.content);
      return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/projects/project-1/raw/preview.html')) {
      return new Response(getPersistedSource(), { status: 200 });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
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
