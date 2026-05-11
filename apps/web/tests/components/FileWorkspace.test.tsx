// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileWorkspace, scrollWorkspaceTabsWithWheel } from '../../src/components/FileWorkspace';
import { projectSplitClassName } from '../../src/components/ProjectView';
import { uploadProjectFiles } from '../../src/providers/registry';
import type { ProjectFile } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    uploadProjectFiles: vi.fn(),
  };
});

const mockedUploadProjectFiles = vi.mocked(uploadProjectFiles);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function baseFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'mock.png',
    path: 'mock.png',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'image',
    mime: 'image/png',
    ...overrides,
  };
}

function workspaceFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 100,
    mtime: 1700000000,
    kind: name.endsWith('.html') ? 'html' : 'text',
    mime: name.endsWith('.html') ? 'text/html' : 'text/plain',
  };
}

function renderWorkspace(element: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(element);
  });
  return host;
}

function getTabByName(container: HTMLElement, name: RegExp): HTMLElement {
  const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
  const tab = tabs.find((node) => name.test(node.textContent ?? ''));
  if (!tab) throw new Error(`Could not find tab matching ${name}`);
  return tab;
}

function createDragDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
  };
}

function dispatchDragEvent(
  target: HTMLElement,
  type: string,
  dataTransfer = createDragDataTransfer(),
  clientX = 0,
  relatedTarget: EventTarget | null = null,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    dataTransfer: { value: dataTransfer },
    relatedTarget: { value: relatedTarget },
  });
  target.dispatchEvent(event);
  return dataTransfer;
}

function stubTabRect(tab: HTMLElement, left = 0, width = 100) {
  tab.getBoundingClientRect = vi.fn(() => ({
    x: left,
    y: 0,
    left,
    top: 0,
    right: left + width,
    bottom: 20,
    width,
    height: 20,
    toJSON: () => ({}),
  }));
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('FileWorkspace upload input', () => {
  it('keeps the Design Files picker aligned with drag-and-drop file support', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(markup).toContain('data-testid="design-files-upload-input"');
    expect(markup).not.toContain('accept=');
  });

  it('hides upload failure details during in-panel preview and restores them after closing preview', async () => {
    mockedUploadProjectFiles.mockRejectedValueOnce(new Error('storage offline'));

    render(
      <FileWorkspace
        projectId="project-1"
        files={[baseFile()]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('design-files-upload-input'), {
      target: { files: [new File(['mock'], 'mock.png', { type: 'image/png' })] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error-banner').textContent).toContain(
        'storage offline',
      );
    });

    const row = screen.getByTestId('design-file-row-mock.png');
    const nameButton = row.querySelector<HTMLButtonElement>('.df-row-name-btn');
    if (!nameButton) throw new Error('Could not find file name button');
    fireEvent.click(nameButton);

    expect(screen.getByTestId('design-file-preview')).toBeTruthy();
    expect(screen.queryByTestId('upload-error-banner')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));

    await waitFor(() => {
      expect(screen.getByTestId('upload-error-banner').textContent).toContain(
        'storage offline',
      );
    });

    fireEvent.click(screen.getByTestId('upload-error-dismiss'));

    expect(screen.queryByTestId('upload-error-banner')).toBeNull();
  });

  it('keeps partial upload failures visible after a successful file opens', async () => {
    mockedUploadProjectFiles.mockResolvedValueOnce({
      uploaded: [
        {
          path: 'uploaded.png',
          name: 'uploaded.png',
          kind: 'image',
          size: 1024,
        },
      ],
      failed: [{ name: 'failed.png', error: 'permission denied' }],
      error: 'permission denied',
    });

    render(
      <FileWorkspace
        projectId="project-1"
        files={[baseFile({ name: 'uploaded.png', path: 'uploaded.png' })]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('design-files-upload-input'), {
      target: {
        files: [
          new File(['uploaded'], 'uploaded.png', { type: 'image/png' }),
          new File(['failed'], 'failed.png', { type: 'image/png' }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error-banner').textContent).toContain(
        'Uploaded 1 file(s), but 1 failed (permission denied).',
      );
    });
  });

  it('hides the workspace focus control while the chat pane is open', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        focusMode={false}
        onFocusModeChange={vi.fn()}
      />,
    );

    // While chat is visible the collapse trigger lives in ChatPane.
    // FileWorkspace only renders an expand control once chat is hidden.
    expect(markup).not.toContain('data-testid="workspace-focus-toggle"');
  });

  it('renders the expand control on the LEFT of the tab bar while focused', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        focusMode
        onFocusModeChange={vi.fn()}
      />,
    );

    expect(markup).toContain('class="ws-tabs-shell"');
    expect(markup).toContain('data-testid="workspace-focus-toggle"');
    // The expand control sits before the tabs bar (left side) so its
    // direction matches where the chat pane re-emerges from.
    expect(markup).toMatch(
      /<div class="ws-tabs-shell">\s*<button[^>]*data-testid="workspace-focus-toggle"[\s\S]*?<\/button>\s*<div class="ws-tabs-bar"/,
    );
  });

  it('labels the same workspace control as chat restore while focused', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        focusMode
        onFocusModeChange={vi.fn()}
      />,
    );

    expect(markup).toContain('Show chat');
  });
});

describe('FileWorkspace design file rename', () => {
  it('renames from the Design Files row menu and replaces persisted tabs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/projects/project-1/files/rename') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            file: workspaceFile('resume-notes.txt'),
            oldName: 'paste-1.txt',
            newName: 'resume-notes.txt',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onTabsStateChange = vi.fn();
    const onRefreshFiles = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[workspaceFile('paste-1.txt'), workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={onRefreshFiles}
        isDeck={false}
        tabsState={{ tabs: ['paste-1.txt', 'index.html'], active: 'paste-1.txt' }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const designFilesTab = container.querySelector<HTMLElement>('[data-testid="design-files-tab"]');
    if (!designFilesTab) throw new Error('Could not find design files tab');

    act(() => designFilesTab.click());
    const menuButton = container.querySelector<HTMLElement>('[data-testid="design-file-menu-paste-1.txt"]');
    if (!menuButton) throw new Error('Could not find design file menu');
    act(() => menuButton.click());
    const renameButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Rename');
    if (!renameButton) throw new Error('Could not find rename command');
    act(() => renameButton.click());

    const input = container.querySelector<HTMLInputElement>('.df-rename-input');
    if (!input) throw new Error('Could not find rename input');
    act(() => {
      changeInputValue(input, 'resume-notes.txt');
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/files/rename',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ from: 'paste-1.txt', to: 'resume-notes.txt' }),
      }),
    );
    expect(onTabsStateChange).toHaveBeenLastCalledWith({
      tabs: ['resume-notes.txt', 'index.html'],
      active: 'resume-notes.txt',
    });
    expect(onRefreshFiles).toHaveBeenCalledTimes(1);
  });

  it('rejects renaming a persisted file over an open pending sketch tab', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('', { status: 200 }),
    );
    const alertMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('alert', alertMock);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[workspaceFile('paste-1.txt')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['paste-1.txt'], active: 'paste-1.txt' }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const designFilesTab = container.querySelector<HTMLElement>('[data-testid="design-files-tab"]');
    if (!designFilesTab) throw new Error('Could not find design files tab');
    act(() => designFilesTab.click());

    const newSketchButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'New sketch');
    if (!newSketchButton) throw new Error('Could not find new sketch command');
    act(() => newSketchButton.click());

    const pendingSketchTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]')).find((tab) =>
      tab.textContent?.includes('.sketch.json'),
    );
    if (!pendingSketchTab) throw new Error('Could not find pending sketch tab');
    const pendingSketchName = pendingSketchTab.textContent!.replace(' •', '');

    act(() => designFilesTab.click());
    const menuButton = container.querySelector<HTMLElement>('[data-testid="design-file-menu-paste-1.txt"]');
    if (!menuButton) throw new Error('Could not find file menu');
    act(() => menuButton.click());
    const renameButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Rename');
    if (!renameButton) throw new Error('Could not find rename command');
    act(() => renameButton.click());

    const input = container.querySelector<HTMLInputElement>('.df-rename-input');
    if (!input) throw new Error('Could not find rename input');
    act(() => {
      changeInputValue(input, pendingSketchName);
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(alertMock).toHaveBeenCalledWith(
      `A pending sketch named "${pendingSketchName}" is already open. Save or close it before renaming.`,
    );
    const renameCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith('/api/projects/project-1/files/rename'),
    );
    expect(renameCalls).toHaveLength(0);
    expect(onTabsStateChange).not.toHaveBeenCalled();
    expect(pendingSketchTab.textContent).toContain(pendingSketchName);
  });
});

describe('FileWorkspace sketch round-trip', () => {
  it('preserves unsupported sketch items when saving an unedited sketch file', async () => {
    const sourceDoc = {
      version: 3,
      items: [
        { kind: 'pen', points: [{ x: 10, y: 12 }], color: '#111', size: 2 },
        { kind: 'ellipse', cx: 80, cy: 60, rx: 24, ry: 12, color: '#0af', size: 3 },
        { kind: 'text', x: 20, y: 32, text: 'hello', color: '#222', size: 16 },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects/project-1/raw/diagram.sketch.json') {
        return new Response(JSON.stringify(sourceDoc), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/files' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            file: {
              ...workspaceFile('diagram.sketch.json'),
              kind: 'sketch',
              mime: 'application/json',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    render(
      <FileWorkspace
        projectId="project-1"
        files={[
          baseFile({
            name: 'diagram.sketch.json',
            path: 'diagram.sketch.json',
            kind: 'sketch',
            mime: 'application/json',
          }),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['diagram.sketch.json'], active: 'diagram.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const saveButton = await screen.findByRole('button', { name: 'Save' });
    await waitFor(() => expect(saveButton.hasAttribute('disabled')).toBe(false));

    fireEvent.click(saveButton);

    await waitFor(() => {
      const writeCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input) === '/api/projects/project-1/files' &&
          init &&
          typeof init === 'object' &&
          init.method === 'POST',
      );
      expect(writeCall).toBeTruthy();
    });

    const writeCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/projects/project-1/files' &&
        init &&
        typeof init === 'object' &&
        init.method === 'POST',
    );
    if (!writeCall) throw new Error('Expected sketch save request');
    const [, init] = writeCall;
    const payload = JSON.parse(String((init as RequestInit).body)) as {
      name: string;
      content: string;
    };
    const savedDoc = JSON.parse(payload.content) as {
      version: number;
      items: Array<Record<string, unknown>>;
    };

    expect(savedDoc).toEqual(sourceDoc);
  });

  it('keeps Save and Clear available for unsupported-only sketch files', async () => {
    const sourceDoc = {
      version: 3,
      items: [
        { kind: 'ellipse', cx: 80, cy: 60, rx: 24, ry: 12, color: '#0af', size: 3 },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects/project-1/raw/diagram.sketch.json') {
        return new Response(JSON.stringify(sourceDoc), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/files' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            file: {
              ...workspaceFile('diagram.sketch.json'),
              kind: 'sketch',
              mime: 'application/json',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    render(
      <FileWorkspace
        projectId="project-1"
        files={[
          baseFile({
            name: 'diagram.sketch.json',
            path: 'diagram.sketch.json',
            kind: 'sketch',
            mime: 'application/json',
          }),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['diagram.sketch.json'], active: 'diagram.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const clearButton = await screen.findByRole('button', { name: 'Clear' });
    const saveButton = await screen.findByRole('button', { name: 'Save' });
    await waitFor(() => {
      expect(clearButton.hasAttribute('disabled')).toBe(false);
      expect(saveButton.hasAttribute('disabled')).toBe(false);
    });

    fireEvent.click(clearButton);
    await waitFor(() => expect(clearButton.hasAttribute('disabled')).toBe(true));

    fireEvent.click(saveButton);

    await waitFor(() => {
      const writeCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input) === '/api/projects/project-1/files' &&
          init &&
          typeof init === 'object' &&
          init.method === 'POST',
      );
      expect(writeCall).toBeTruthy();
    });

    const writeCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/projects/project-1/files' &&
        init &&
        typeof init === 'object' &&
        init.method === 'POST',
    );
    if (!writeCall) throw new Error('Expected sketch save request');
    const [, init] = writeCall;
    const payload = JSON.parse(String((init as RequestInit).body)) as {
      name: string;
      content: string;
    };
    const savedDoc = JSON.parse(payload.content) as {
      version: number;
      items: Array<Record<string, unknown>>;
    };

    expect(savedDoc).toEqual({
      version: 3,
      items: [],
    });
  });

  it('does not resurrect unsupported sketch items after clearing and saving', async () => {
    const sourceDoc = {
      version: 3,
      items: [
        { kind: 'text', x: 20, y: 32, text: 'hello', color: '#222', size: 16 },
        { kind: 'ellipse', cx: 80, cy: 60, rx: 24, ry: 12, color: '#0af', size: 3 },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects/project-1/raw/diagram.sketch.json') {
        return new Response(JSON.stringify(sourceDoc), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/files' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            file: {
              ...workspaceFile('diagram.sketch.json'),
              kind: 'sketch',
              mime: 'application/json',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    render(
      <FileWorkspace
        projectId="project-1"
        files={[
          baseFile({
            name: 'diagram.sketch.json',
            path: 'diagram.sketch.json',
            kind: 'sketch',
            mime: 'application/json',
          }),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['diagram.sketch.json'], active: 'diagram.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const clearButton = await screen.findByRole('button', { name: 'Clear' });
    const saveButton = await screen.findByRole('button', { name: 'Save' });
    await waitFor(() => expect(clearButton.hasAttribute('disabled')).toBe(false));

    fireEvent.click(clearButton);
    await waitFor(() => expect(clearButton.hasAttribute('disabled')).toBe(true));

    fireEvent.click(saveButton);

    await waitFor(() => {
      const writeCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input) === '/api/projects/project-1/files' &&
          init &&
          typeof init === 'object' &&
          init.method === 'POST',
      );
      expect(writeCall).toBeTruthy();
    });

    const writeCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/projects/project-1/files' &&
        init &&
        typeof init === 'object' &&
        init.method === 'POST',
    );
    if (!writeCall) throw new Error('Expected sketch save request');
    const [, init] = writeCall;
    const payload = JSON.parse(String((init as RequestInit).body)) as {
      name: string;
      content: string;
    };
    const savedDoc = JSON.parse(payload.content) as {
      version: number;
      items: Array<Record<string, unknown>>;
    };

    expect(savedDoc).toEqual({
      version: 3,
      items: [],
    });
  });
});

describe('FileWorkspace tab reordering', () => {
  it('persists a dragged file tab before the tab it is dropped on', () => {
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[
          workspaceFile('analysis.html'),
          workspaceFile('notes.md'),
          workspaceFile('summary.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md', 'summary.html'],
          active: null,
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const source = getTabByName(container, /summary\.html/i);
    const target = getTabByName(container, /analysis\.html/i);
    stubTabRect(target);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(source, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(target, 'dragover', dataTransfer));
    act(() => dispatchDragEvent(target, 'drop', dataTransfer));

    expect(onTabsStateChange).toHaveBeenCalledWith({
      tabs: ['summary.html', 'analysis.html', 'notes.md'],
      active: null,
    });
  });

  it('persists a dragged file tab after the tab when dropped on its right side', () => {
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[
          workspaceFile('analysis.html'),
          workspaceFile('notes.md'),
          workspaceFile('summary.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md', 'summary.html'],
          active: null,
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const source = getTabByName(container, /analysis\.html/i);
    const target = getTabByName(container, /summary\.html/i);
    stubTabRect(target);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(source, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(target, 'drop', dataTransfer, 75));

    expect(onTabsStateChange).toHaveBeenCalledWith({
      tabs: ['notes.md', 'summary.html', 'analysis.html'],
      active: null,
    });
  });

  it('does not persist when a tab is dropped on itself', () => {
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[workspaceFile('analysis.html'), workspaceFile('notes.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md'],
          active: null,
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const tab = getTabByName(container, /analysis\.html/i);
    stubTabRect(tab);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(tab, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(tab, 'drop', dataTransfer));

    expect(onTabsStateChange).not.toHaveBeenCalled();
  });

  it('clears the drop indicator when the drag leaves the tab bar', () => {
    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[workspaceFile('analysis.html'), workspaceFile('notes.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md'],
          active: null,
        }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const source = getTabByName(container, /analysis\.html/i);
    const target = getTabByName(container, /notes\.md/i);
    const tabBar = container.querySelector<HTMLElement>('.ws-tabs-bar');
    if (!tabBar) throw new Error('Could not find tabs bar');
    stubTabRect(target);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(source, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(target, 'dragover', dataTransfer));

    expect(target.className).toContain('drag-over-before');

    act(() => dispatchDragEvent(tabBar, 'dragleave', dataTransfer, 0, document.body));

    expect(target.className).not.toContain('drag-over-before');
    expect(target.className).not.toContain('drag-over-after');
  });
});

describe('projectSplitClassName', () => {
  it('marks the project split as focused so the chat pane can collapse globally', () => {
    expect(projectSplitClassName(false)).toBe('split');
    expect(projectSplitClassName(true)).toBe('split split-focus');
  });
});

describe('scrollWorkspaceTabsWithWheel', () => {
  function makeTabBar(scrollLeft: number, scrollWidth = 400, clientWidth = 200) {
    return { scrollLeft, scrollWidth, clientWidth } as HTMLDivElement;
  }

  function makeClampedTabBar(scrollLeft: number, scrollWidth = 400, clientWidth = 200) {
    let value = scrollLeft;
    return {
      scrollWidth,
      clientWidth,
      get scrollLeft() {
        return value;
      },
      set scrollLeft(next: number) {
        value = Math.min(Math.max(next, 0), scrollWidth - clientWidth);
      },
    } as HTMLDivElement;
  }

  it('maps vertical mouse wheel movement to horizontal tab scrolling', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(52);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('supports reverse vertical wheel movement', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(52);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: -40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('normalizes line-based wheel deltas to useful pixel movement', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: false,
      deltaMode: 1,
      deltaX: 0,
      deltaY: 3,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(60);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('normalizes page-based wheel deltas to useful pixel movement', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12, 600, 200);
    const event = {
      ctrlKey: false,
      deltaMode: 2,
      deltaX: 0,
      deltaY: 1,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(172);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('leaves native horizontal wheel gestures alone', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 50,
      deltaY: 10,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('leaves ctrl-wheel zoom gestures alone', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: true,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does not intercept vertical wheel movement when tabs do not overflow', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12, 200, 200);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('lets page scrolling continue when the tab bar is already at the wheel boundary', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeClampedTabBar(200, 400, 200);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(200);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
