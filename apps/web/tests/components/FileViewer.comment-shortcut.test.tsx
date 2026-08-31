// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  newRequestId: vi.fn(() => 'request-comment-shortcut-1'),
}));

const panelState = vi.hoisted(() => ({
  props: null as ComponentProps<typeof import('../../src/components/ManualEditPanel').ManualEditPanel> | null,
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => analytics,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({ context: null, loading: false }),
  };
});

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

const SOURCE = '<!doctype html><html><body><h1 data-od-id="hero">Hero</h1></body></html>';

function htmlFile(name = 'preview.html'): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: name,
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function renderViewer(props: Partial<ComponentProps<typeof FileViewer>> = {}) {
  return render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml={SOURCE}
      {...props}
    />,
  );
}

function altC(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    altKey: true,
    bubbles: true,
    cancelable: true,
    code: 'KeyC',
    key: 'c',
    ...init,
  });
}

function dispatchAltC(target: EventTarget = window, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = altC(init);
  target.dispatchEvent(event);
  return event;
}

function dispatchCommentShortcutSource(source: MessageEventSource | null): void {
  if (!source) throw new Error('Preview frame not ready');
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'od:comment-shortcut' },
      source,
    }));
  });
}

function dispatchIframeCommentShortcut(frame: HTMLIFrameElement): void {
  dispatchCommentShortcutSource(frame.contentWindow);
}

function commentEvents(): Array<Record<string, unknown>> {
  return analytics.track.mock.calls
    .filter(([name, props]) => name === 'ui_click' && props?.element === 'comment')
    .map(([, props]) => props as Record<string, unknown>);
}

async function commentToggle(): Promise<HTMLElement> {
  return await screen.findByTestId('board-mode-toggle');
}

async function enterManualEditMode(): Promise<void> {
  const frame = await screen.findByTestId('artifact-preview-frame') as HTMLIFrameElement;
  if (!frame.contentWindow) throw new Error('Preview frame not ready');
  const postMessageSpy = vi.spyOn(frame.contentWindow, 'postMessage');

  fireEvent.click(await screen.findByTestId('manual-edit-mode-toggle'));

  const captureRequest = postMessageSpy.mock.calls
    .map(([value]) => value)
    .find((value) => (
      typeof value === 'object'
      && value !== null
      && (value as { type?: unknown }).type === 'od:preview-runtime-state-capture'
    )) as { id: string } | undefined;
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
        source: frame.contentWindow,
      }));
    });
  }

  await waitFor(() => {
    expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  });
}

function selectManualEditTarget(): void {
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const target: ManualEditTarget = {
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
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'od-edit-select', target },
      source: frame.contentWindow,
    }));
  });
}

beforeEach(() => {
  analytics.track.mockReset();
  analytics.newRequestId.mockClear();
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : String(input);
    if (url.includes('/deployments')) {
      return new Response(JSON.stringify({ deployments: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/files') && init?.method === 'POST') {
      return new Response(JSON.stringify({ file: htmlFile() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }));
});

afterEach(() => {
  cleanup();
  panelState.props = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer Comment Mode Alt+C shortcut', () => {
  it('toggles the existing Comment Mode once per key press and consumes only handled events', async () => {
    renderViewer();
    const toggle = await commentToggle();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('aria-keyshortcuts', 'Alt+C');
    expect(toggle.getAttribute('title')).toContain('Alt+C');

    const enter = altC();
    const stopEnterPropagation = vi.spyOn(enter, 'stopPropagation');
    window.dispatchEvent(enter);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    expect(enter.defaultPrevented).toBe(true);
    expect(stopEnterPropagation).toHaveBeenCalledOnce();
    expect(commentEvents()).toHaveLength(1);

    const exit = dispatchAltC();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
    expect(exit.defaultPrevented).toBe(true);
    expect(commentEvents()).toHaveLength(2);
  });

  it('uses the same state transition and analytics payload as the toolbar action', async () => {
    renderViewer();
    const toggle = await commentToggle();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const toolbarPayload = commentEvents()[0];

    fireEvent.click(toggle);
    analytics.track.mockClear();
    dispatchAltC();

    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    expect(commentEvents()).toEqual([toolbarPayload]);
  });

  it('accepts one semantic shortcut intent only from the active preview iframe', async () => {
    render(
      <>
        <FileViewer
          projectId="project-active"
          projectKind="prototype"
          file={htmlFile('active.html')}
          liveHtml={SOURCE}
          workspaceActive
        />
        <FileViewer
          projectId="project-retained"
          projectKind="prototype"
          file={htmlFile('retained.html')}
          liveHtml={SOURCE}
          workspaceActive={false}
        />
      </>,
    );
    const toggles = await screen.findAllByTestId('board-mode-toggle');
    await screen.findByTestId('artifact-preview-frame');
    const inactiveTransport = screen.getByTestId('artifact-preview-frame-srcdoc') as HTMLIFrameElement;
    const retainedFrame = screen.getByTestId(
      'artifact-preview-frame-retained-retained.html',
    ) as HTMLIFrameElement;

    dispatchIframeCommentShortcut(inactiveTransport);
    dispatchIframeCommentShortcut(retainedFrame);
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'false');
    expect(toggles[1]).toHaveAttribute('aria-pressed', 'false');
    expect(commentEvents()).toEqual([]);

    const modal = document.body.appendChild(document.createElement('div'));
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    dispatchIframeCommentShortcut(
      screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement,
    );
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'false');
    expect(commentEvents()).toEqual([]);
    modal.remove();

    dispatchIframeCommentShortcut(
      screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement,
    );
    await waitFor(() => expect(toggles[0]).toHaveAttribute('aria-pressed', 'true'));
    expect(toggles[1]).toHaveAttribute('aria-pressed', 'false');
    expect(commentEvents()).toHaveLength(1);

    dispatchIframeCommentShortcut(
      screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement,
    );
    await waitFor(() => expect(toggles[0]).toHaveAttribute('aria-pressed', 'false'));
    expect(commentEvents()).toHaveLength(2);
  });

  it('lets only the active viewer respond when another preview is retained', async () => {
    render(
      <>
        <FileViewer
          projectId="project-active"
          projectKind="prototype"
          file={htmlFile('active.html')}
          liveHtml={SOURCE}
          workspaceActive
        />
        <FileViewer
          projectId="project-retained"
          projectKind="prototype"
          file={htmlFile('retained.html')}
          liveHtml={SOURCE}
          workspaceActive={false}
        />
      </>,
    );
    const toggles = await screen.findAllByTestId('board-mode-toggle');
    expect(toggles).toHaveLength(2);

    dispatchAltC();

    await waitFor(() => expect(toggles[0]).toHaveAttribute('aria-pressed', 'true'));
    expect(toggles[1]).toHaveAttribute('aria-pressed', 'false');
    expect(commentEvents()).toHaveLength(1);
    expect(commentEvents()[0]).toEqual(expect.objectContaining({
      area: 'artifact_toolbar',
      element: 'comment',
    }));
  });

  it('does not steal Alt+C from editable or composer surfaces', async () => {
    const view = renderViewer();
    const toggle = await commentToggle();
    const input = view.container.appendChild(document.createElement('input'));
    const textarea = view.container.appendChild(document.createElement('textarea'));
    const select = view.container.appendChild(document.createElement('select'));
    const editable = view.container.appendChild(document.createElement('div'));
    editable.contentEditable = 'true';
    const composer = view.container.appendChild(document.createElement('div'));
    composer.className = 'composer';
    const composerButton = composer.appendChild(document.createElement('button'));
    const editor = view.container.appendChild(document.createElement('div'));
    editor.className = 'monaco-editor';
    const editorButton = editor.appendChild(document.createElement('button'));
    const textbox = view.container.appendChild(document.createElement('div'));
    textbox.setAttribute('role', 'textbox');
    const textboxButton = textbox.appendChild(document.createElement('button'));

    for (const target of [
      input,
      textarea,
      select,
      editable,
      composerButton,
      editorButton,
      textboxButton,
    ]) {
      target.focus();
      const event = dispatchAltC(target);
      expect(event.defaultPrevented).toBe(false);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    }
    expect(commentEvents()).toEqual([]);
  });

  it('ignores composing, repeated, modified, pre-consumed, modal-owned, and ordinary key events', async () => {
    const view = renderViewer();
    const toggle = await commentToggle();
    const ignored = [
      altC({ isComposing: true }),
      altC({ repeat: true }),
      altC({ ctrlKey: true }),
      altC({ metaKey: true }),
      altC({ shiftKey: true }),
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'KeyC',
        key: 'c',
      }),
    ];
    const alreadyConsumed = altC();
    alreadyConsumed.preventDefault();
    ignored.push(alreadyConsumed);

    for (const event of ignored) window.dispatchEvent(event);

    const modal = view.container.appendChild(document.createElement('div'));
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const modalEvent = altC();
    const stopModalPropagation = vi.spyOn(modalEvent, 'stopPropagation');
    window.dispatchEvent(modalEvent);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(modalEvent.defaultPrevented).toBe(false);
    expect(stopModalPropagation).not.toHaveBeenCalled();
    expect(commentEvents()).toEqual([]);
  });

  it('responds only while the comment-capable preview mode is active', async () => {
    renderViewer();
    const previewFrame = await screen.findByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const previewWindow = previewFrame.contentWindow;
    fireEvent.click(await screen.findByRole('tab', { name: 'Code' }));
    await waitFor(() => {
      expect(screen.queryByTestId('board-mode-toggle')).toBeNull();
    });

    const sourceModeEvent = dispatchAltC();
    dispatchCommentShortcutSource(previewWindow);

    expect(sourceModeEvent.defaultPrevented).toBe(false);
    expect(commentEvents()).toEqual([]);

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    const toggle = await commentToggle();
    const previewModeEvent = dispatchAltC();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    expect(previewModeEvent.defaultPrevented).toBe(true);
  });

  it('rejects iframe shortcut intents while in-tab presentation owns the viewer', async () => {
    renderViewer();
    const toggle = await commentToggle();
    const previewFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /in this tab/i }));
    await waitFor(() => {
      expect(document.body.querySelector('.present-overlay')).toBeTruthy();
    });

    dispatchIframeCommentShortcut(previewFrame);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(commentEvents()).toEqual([]);
  });

  it('removes its listener on unmount', async () => {
    const view = renderViewer();
    await commentToggle();
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const frameWindow = frame.contentWindow;
    if (!frameWindow) throw new Error('Preview frame not ready');
    view.unmount();

    const event = dispatchAltC();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od:comment-shortcut' },
        source: frameWindow,
      }));
    });

    expect(event.defaultPrevented).toBe(false);
    expect(commentEvents()).toEqual([]);
  });

  it('waits for the existing Manual Edit flush before entering Comment Mode', async () => {
    let resolveSave!: (response: Response) => void;
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
      if (url.includes('/files') && init?.method === 'POST') return await saveResponse;
      if (url.includes('/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/raw/preview.html')) {
        return new Response(SOURCE, { status: 200 });
      }
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));
    renderViewer();
    const comment = await commentToggle();
    await enterManualEditMode();
    selectManualEditTarget();
    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('hero'));

    act(() => {
      panelState.props?.onStyleChange?.('hero', { color: '#ef4444' }, 'Style: Hero');
    });
    dispatchAltC();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/files'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(comment).toHaveAttribute('aria-pressed', 'false');

    await act(async () => {
      resolveSave(new Response(JSON.stringify({ file: htmlFile() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      await saveResponse;
    });

    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
      expect(comment).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('keeps Manual Edit active when its save fails before an iframe shortcut transition', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
      if (url.includes('/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'save failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/deployments')) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/raw/preview.html')) return new Response(SOURCE, { status: 200 });
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));
    renderViewer();
    const comment = await commentToggle();
    await enterManualEditMode();
    selectManualEditTarget();
    await waitFor(() => expect(panelState.props?.selectedTarget?.id).toBe('hero'));

    act(() => {
      panelState.props?.onStyleChange?.('hero', { color: '#ef4444' }, 'Style: Hero');
    });
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    dispatchIframeCommentShortcut(frame);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/files'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(screen.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(comment).toHaveAttribute('aria-pressed', 'false');
    expect(commentEvents()).toHaveLength(1);
  });
});
