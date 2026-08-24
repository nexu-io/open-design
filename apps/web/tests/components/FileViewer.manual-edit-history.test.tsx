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

async function enterManualEditMode() {
  const initialFrame = await waitFor(() => {
    const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (!node.contentWindow) throw new Error('Preview frame not ready');
    return node;
  });
  const postMessageSpy = vi.spyOn(initialFrame.contentWindow!, 'postMessage');

  clickManualTool('manual-edit-mode-toggle');

  const captureRequest = postMessageSpy.mock.calls
    .map(([value]) => value)
    .find((value) => (
      typeof value === 'object' &&
      value !== null &&
      (value as { type?: unknown }).type === 'od:preview-runtime-state-capture'
    )) as { type: string; id: string } | undefined;
  if (captureRequest) {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od:preview-runtime-state-captured',
          id: captureRequest.id,
          state: {
            version: 1,
            hash: '',
            htmlAttrs: {},
            bodyAttrs: {},
            entries: [],
          },
        },
        source: initialFrame.contentWindow,
      }));
    });
  }

  await waitFor(() => {
    expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(activeFrame.getAttribute('data-od-active')).toBe('true');
    expect(activeFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
  });
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
  return frame;
}

// Persisting harness: every manual-edit save is echoed back as the file's raw
// content, so history round-trips (undo → redo → follow-up edit) read what the
// previous step actually wrote.
function stubManualEditHistoryFetch(initialSource: string) {
  const savedSources: string[] = [];
  let persistedSource = initialSource;
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
  return { savedSources };
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

    await enterManualEditMode();
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

    await enterManualEditMode();
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

    await enterManualEditMode();
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

  it('updates the manual edit canvas after text patches without replacing its transport', async () => {
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

    await enterManualEditMode();
    await selectManualEditTarget();
    const getActivePreviewFrame = () => screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;

    await waitFor(() => {
      const frame = getActivePreviewFrame();
      expect(frame.getAttribute('data-od-active')).toBe('true');
      expect(frame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(panelState.props?.draft.fullSource).toContain('Hero');
    });
    const frame = getActivePreviewFrame();
    const transportBeforeSave = frame.srcdoc;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    act(() => {
      panelState.props?.onApplyPatch(
        { id: 'hero', kind: 'set-text', value: 'Updated hero' },
        'Content: Hero',
      );
    });

    await waitFor(() => expect(savedSources).toHaveLength(1));
    await waitFor(() => expect(panelState.props?.draft.fullSource).toContain('Updated hero'));
    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'od-edit-preview-text',
        id: 'hero',
        value: 'Updated hero',
      }, '*');
    });
    expect(getActivePreviewFrame()).toBe(frame);
    expect(frame.srcdoc).toBe(transportBeforeSave);
  });

  it('only exposes reset after the selected element draft changes', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1></body></html>';
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
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

    await enterManualEditMode();
    await selectManualEditTarget();

    expect(panelState.props?.resetAvailable).toBe(false);

    act(() => {
      const currentDraft = panelState.props?.draft;
      if (!currentDraft) throw new Error('Manual edit draft not found');
      panelState.props?.onDraftChange({ ...currentDraft, text: 'Panel edited copy' });
    });

    await waitFor(() => expect(panelState.props?.resetAvailable).toBe(true));

    await act(async () => {
      panelState.props?.onResetDraft();
    });

    await waitFor(() => expect(panelState.props?.resetAvailable).toBe(false));
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

    await enterManualEditMode();
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

  it('keeps toolbar undo/redo affordances in manual edit mode and drives history from them', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
    const { savedSources } = stubManualEditHistoryFetch(initialSource);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    await enterManualEditMode();
    await selectManualEditTarget();

    const undoButton = () => screen.getByTestId('manual-edit-undo') as HTMLButtonElement;
    const redoButton = () => screen.getByTestId('manual-edit-redo') as HTMLButtonElement;
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(true);

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { color: '#ef4444' } },
        'Style: Hero',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));
    await waitFor(() => expect(undoButton().disabled).toBe(false));

    fireEvent.click(undoButton());
    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(savedSources[1]).toBe(initialSource);
    await waitFor(() => expect(redoButton().disabled).toBe(false));

    fireEvent.click(redoButton());
    await waitFor(() => expect(savedSources).toHaveLength(3));
    expect(savedSources[2]).toContain('rgb(239, 68, 68)');
  });

  it('undoes on Ctrl/Cmd+Z from host chrome but never from a focused field', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
    const { savedSources } = stubManualEditHistoryFetch(initialSource);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    await enterManualEditMode();
    await selectManualEditTarget();

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { color: '#ef4444' } },
        'Style: Hero',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));

    // A focused input owns its own undo stack; stealing it loses the user's
    // in-progress typing instead of reverting a committed canvas edit.
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    act(() => {
      fireEvent.keyDown(field, { key: 'z', metaKey: true });
    });
    expect(savedSources).toHaveLength(1);
    field.remove();

    act(() => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
    });
    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(savedSources[1]).toBe(initialSource);
  });

  it('undoes a deleted element after the inspector unmounts, via the canvas hotkey bridge', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1><p data-od-id="body">Body</p></body></html>';
    const { savedSources } = stubManualEditHistoryFetch(initialSource);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    await enterManualEditMode();
    const frame = await selectManualEditTarget();

    act(() => {
      panelState.props?.onApplyPatch({ kind: 'remove-element', id: 'hero' }, 'Delete element');
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));
    expect(savedSources[0]).not.toContain('data-od-id="hero"');

    // Deleting clears the selection, so the inspector — and any listener it
    // owned — is gone. The toolbar and the canvas hotkey must still undo.
    await waitFor(() => expect(screen.queryByTestId('mock-manual-edit-panel')).toBeNull());
    expect((screen.getByTestId('manual-edit-undo') as HTMLButtonElement).disabled).toBe(false);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-history', op: 'undo' },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(savedSources[1]).toBe(initialSource);
  });

  it('ignores the shared-window shortcut while the viewer is retained inactive', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
    let persistedSource = initialSource;
    let failSaves = false;
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
        if (failSaves) {
          return new Response(JSON.stringify({ message: 'save failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        persistedSource = payload.content;
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

    const { rerender } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
        workspaceActive
      />,
    );

    await enterManualEditMode();
    await selectManualEditTarget();

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { color: '#ef4444' } },
        'Style: Hero',
      );
    });
    await waitFor(() => expect(savedSources).toHaveLength(1));

    // A retained viewer only keeps its manual-edit session when the safe exit
    // cannot complete. An uncommitted inspector preview whose save fails is
    // exactly that case — edit mode survives the switch to another tab.
    act(() => {
      panelState.props?.onStyleChange?.('hero', { color: '#22c55e' }, 'Style: Hero');
    });
    failSaves = true;
    rerender(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
        workspaceActive={false}
      />,
    );
    await waitFor(() => expect(savedSources).toHaveLength(2));
    expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('true');

    // The listener lives on the shared window, so the active tab's Cmd+Z would
    // otherwise reach this hidden instance and write its file.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      await Promise.resolve();
    });
    expect(savedSources).toHaveLength(2);
    expect(persistedSource).toBe(savedSources[0]);
  });

  it('drops a pending inspector preview instead of saving an older revision on undo', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
    const { savedSources } = stubManualEditHistoryFetch(initialSource);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    await enterManualEditMode();
    await selectManualEditTarget();

    // Inspector previews stay in a ref until Save, so the history stack is
    // still empty while the canvas already shows the change.
    act(() => {
      panelState.props?.onStyleChange?.('hero', { color: '#ef4444' }, 'Style: Hero');
    });
    expect(savedSources).toHaveLength(0);
    expect((screen.getByTestId('manual-edit-undo') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      await Promise.resolve();
    });

    // Undo reverted the live preview. Leaving edit mode must then have nothing
    // left to flush — otherwise the undone edit lands after the undo.
    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    });
    expect(savedSources).toHaveLength(0);
  });

  it('does not re-apply a pending inspector preview after a toolbar undo', async () => {
    const initialSource = '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
    const { savedSources } = stubManualEditHistoryFetch(initialSource);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    await enterManualEditMode();
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
      panelState.props?.onStyleChange?.('hero', { color: '#22c55e' }, 'Style: Hero');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('manual-edit-undo'));
      await Promise.resolve();
    });

    clickManualTool('manual-edit-mode-toggle');
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    });
    // The undo consumed the uncommitted preview, so the committed revision is
    // untouched and no later flush re-applies the discarded colour.
    expect(savedSources).toHaveLength(1);
    expect(savedSources[0]).not.toContain('rgb(34, 197, 94)');
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
