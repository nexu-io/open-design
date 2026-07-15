// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DESIGN_FILES_TAB,
  FileWorkspace,
  scrollWorkspaceTabsWithWheel,
} from '../../src/components/FileWorkspace';
import { I18nProvider } from '../../src/i18n';
import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import { projectSplitClassName, projectSplitStyle } from '../../src/components/ProjectView';
import {
  fetchProjectFileText,
  uploadProjectFiles,
  writeProjectTextFile,
  fetchProjectFolders,
} from '../../src/providers/registry';
import type { ChatMessage, ProjectFile, ProjectFolder } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: vi.fn(),
    uploadProjectFiles: vi.fn(),
    writeProjectBase64File: vi.fn(),
    writeProjectTextFile: vi.fn(),
    fetchProjectFolders: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../src/components/DesignBrowserPanel', () => ({
  DesignBrowserPanel: ({
    initialIconUrl,
    initialTitle,
    initialUrl,
    navigateRequest,
    onPageSnapshotToast,
  }: {
    initialIconUrl?: string;
    initialTitle?: string;
    initialUrl?: string;
    navigateRequest?: { url: string; nonce: number };
    onPageSnapshotToast?: (event: {
      actionFileName?: string;
      actionLabel?: string;
      actionTarget?: 'design-files' | 'file';
      elapsedSeconds?: number;
      message: string;
      status: 'loading' | 'success' | 'error' | 'canceled';
      tabId: string;
      ttlMs?: number;
    }) => void;
  }) => (
    <div
      data-testid="design-browser-panel"
      data-initial-icon-url={initialIconUrl ?? ''}
      data-initial-title={initialTitle ?? ''}
      data-initial-url={initialUrl ?? ''}
      data-navigate-url={navigateRequest?.url ?? ''}
      data-navigate-nonce={navigateRequest?.nonce ?? ''}
    >
      <button
        type="button"
        data-testid="emit-browser-snapshot-success"
        onClick={() => onPageSnapshotToast?.({
          actionFileName: 'browser-archive/example/manifest.json',
          actionLabel: 'View Design Files',
          actionTarget: 'design-files',
          elapsedSeconds: 0,
          message: 'Saved page snapshot (HTML + CSS).',
          status: 'success',
          tabId: '__browser__:1',
          ttlMs: 8000,
        })}
      >
        emit snapshot success
      </button>
    </div>
  ),
  labelFromUrl: (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '') || url;
    } catch {
      return url;
    }
  },
  normalizeBrowserAddress: (rawAddress: string) => {
    const value = rawAddress.trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return `https://${value}`;
    return value || 'about:blank';
  },
}));

vi.mock('../../src/components/workspace/TerminalViewer', () => ({
  TerminalViewer: ({ terminalId }: { terminalId: string }) => (
    <div data-testid="terminal-viewer">{terminalId}</div>
  ),
}));

const { excalidrawWorkspaceMock } = vi.hoisted(() => ({
  excalidrawWorkspaceMock: {
    lastProps: null as Record<string, any> | null,
  },
}));

vi.mock('@excalidraw/excalidraw', async () => {
  const React = await import('react');
  const MainMenu = Object.assign(
    (props: Record<string, any>) => React.createElement('div', null, props.children),
    {
      Item: ({ children, disabled, icon, onClick, ...rest }: Record<string, any>) => React.createElement(
        'button',
        {
          ...rest,
          type: 'button',
          disabled,
          onClick,
        },
        icon,
        children,
      ),
      DefaultItems: {
        SearchMenu: () => null,
        Help: () => null,
        ClearCanvas: () => null,
        ChangeCanvasBackground: () => null,
      },
      Separator: () => null,
    },
  );
  return {
    Excalidraw: (props: Record<string, any>) => {
      excalidrawWorkspaceMock.lastProps = props;
      React.useEffect(() => {
        props.excalidrawAPI?.({
          getSceneElementsIncludingDeleted: () => [{ id: 'workspace-element', type: 'freedraw', isDeleted: false }],
          getAppState: () => ({ viewBackgroundColor: '#ffffff' }),
          getFiles: () => ({}),
          updateScene: vi.fn(),
          setOpenDialog: vi.fn(),
        });
      }, [props]);
      return React.createElement(
        'div',
        { 'data-testid': 'excalidraw' },
        React.createElement('canvas'),
        props.renderTopRightUI?.(false, {}),
        props.children,
      );
    },
    MainMenu,
    convertToExcalidrawElements: vi.fn((elements: unknown[]) => elements),
    exportToBlob: vi.fn(async () => new Blob(['mock image'], { type: 'image/png' })),
  };
});

// Records the `folders` prop DesignFilesPanel receives on EVERY render (still
// renders the real component). Lets a test observe the first render after a
// project switch — the pre-paint frame RTL's post-rerender DOM assertion can't
// see — to prove no stale folders ever reach the new panel.
const { designFilesPanelRenders } = vi.hoisted(() => ({
  designFilesPanelRenders: [] as { projectId: string; folderCount: number }[],
}));
vi.mock('../../src/components/DesignFilesPanel', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/DesignFilesPanel')>(
    '../../src/components/DesignFilesPanel',
  );
  const Real = actual.DesignFilesPanel;
  return {
    ...actual,
    DesignFilesPanel: (props: Parameters<typeof Real>[0]) => {
      designFilesPanelRenders.push({
        projectId: props.projectId,
        folderCount: props.folders?.length ?? 0,
      });
      return <Real {...props} />;
    },
  };
});

const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);
const mockedUploadProjectFiles = vi.mocked(uploadProjectFiles);
const mockedWriteProjectTextFile = vi.mocked(writeProjectTextFile);
const chatCss = readFileSync(join(process.cwd(), 'src/styles/chat.css'), 'utf8');
const routinesCss = readFileSync(join(process.cwd(), 'src/styles/viewer/routines.css'), 'utf8');

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let composerCssStyle: HTMLStyleElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Needed else the ResizeObserver in SketchEditor crashes the test
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

beforeEach(() => {
  mockedFetchProjectFileText.mockResolvedValue('');
});

afterEach(() => {
  cleanup();
  excalidrawWorkspaceMock.lastProps = null;
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.classList.remove('od-quick-switcher-open');
  document.querySelectorAll('.chat-composer-fixed-layer').forEach((node) => node.remove());
  composerCssStyle?.remove();
  composerCssStyle = null;
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

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function installComposerIsolationCss() {
  const rules = [
    ['.chat-composer-fixed-layer', chatCss],
    ['.chat-composer-fixed-layer .composer', chatCss],
    ['.composer-input-wrap', chatCss],
    ['.composer-input-wrap:focus-within', chatCss],
    ['.composer-input-editor .composer-editable', chatCss],
    ['.composer-input-placeholder', chatCss],
    ['.chat-composer-fixed-layer .composer-shell', routinesCss],
    ['.chat-composer-fixed-layer .composer.drag-active .composer-shell', routinesCss],
    ['.chat-composer-fixed-layer .composer-input-wrap', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-shell', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer.drag-active .composer-shell', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-wrap', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-wrap:focus-within', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-editor .composer-editable', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-placeholder', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context-row', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context-picker--design-system .project-ds-picker-trigger', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-chip', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-order', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-comment button', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-name', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-comment .staged-name strong', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-comment .staged-name span', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context .staged-icon', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-chip .staged-icon', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .staged-chip .staged-remove', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-active-file', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .icon-btn', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .session-mode-toggle__trigger', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .avatar-agent-trigger', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .avatar-btn', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-send', routinesCss],
    ['body.od-quick-switcher-open .chat-composer-fixed-layer .composer-send:disabled', routinesCss],
  ] as const;
  composerCssStyle = document.createElement('style');
  composerCssStyle.textContent = rules
    .map(([selector, css]) => `${selector} {${cssDeclarations(css, selector)}}`)
    .join('\n');
  document.head.appendChild(composerCssStyle);
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

function renderedTabLabels(): string[] {
  return screen.getAllByRole('tab').map((tab) => tab.textContent?.trim() ?? '');
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

function renderDesignFilesPanel(overrides: Partial<React.ComponentProps<typeof DesignFilesPanel>> = {}) {
  const props: React.ComponentProps<typeof DesignFilesPanel> = {
    projectId: 'project-1',
    files: [],
    liveArtifacts: [],
    onRefreshFiles: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onRenameFile: vi.fn(),
    onDeleteFile: vi.fn(),
    onDeleteFiles: vi.fn(),
    onUpload: vi.fn(),
    onUploadFiles: vi.fn(),
    onPaste: vi.fn(),
    onNewSketch: vi.fn(),
    ...overrides,
  };
  return render(<DesignFilesPanel {...props} />);
}

describe('FileWorkspace quick switcher visual isolation', () => {
  it('moves focus into quick search and marks the document while the overlay is open', async () => {
    installComposerIsolationCss();

    const composerLayer = document.createElement('div');
    composerLayer.className = 'chat-composer-fixed-layer';
    composerLayer.innerHTML = `
      <div class="composer drag-active">
        <div class="composer-shell">
          <div class="staged-row staged-context-row">
            <div class="staged-context-picker staged-context-picker--design-system">
              <button class="project-ds-picker-trigger picked" type="button">Choose design system</button>
            </div>
            <div class="staged-chip staged-context staged-context--workspace">
              <span class="staged-icon">F</span>
              <span class="staged-name">
                <span class="staged-context-kind">Current</span>manual-edit.html
              </span>
              <button class="staged-remove" type="button">x</button>
            </div>
            <div class="staged-chip staged-file">
              <span class="staged-order">1</span>
              <span class="staged-icon">F</span>
              <span class="staged-name">hero.png</span>
              <button class="staged-remove" type="button">x</button>
            </div>
            <div class="staged-chip staged-comment">
              <span class="staged-name"><strong>Hero</strong><span>Needs tweak</span></span>
              <button class="staged-remove" type="button">x</button>
            </div>
          </div>
          <div class="composer-active-file">
            <span class="composer-active-file__label">Current</span>
            <span class="composer-active-file__name">manual-edit.html</span>
          </div>
          <div class="composer-input-wrap">
            <div class="composer-input-editor">
              <div class="composer-editable" contenteditable="true" tabindex="0">Mock focused composer control</div>
              <div class="composer-input-placeholder">Describe what you want to generate...</div>
            </div>
          </div>
          <div class="composer-row">
            <button class="icon-btn" type="button">+</button>
            <button class="avatar-agent-trigger" type="button">
              <span class="avatar-btn">A</span>
            </button>
            <button class="session-mode-toggle__trigger" type="button">Design</button>
            <button class="composer-send" type="button" disabled>Send</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(composerLayer);

    const composer = composerLayer.querySelector<HTMLElement>('.composer');
    const composerShell = composerLayer.querySelector<HTMLElement>('.composer-shell');
    const composerInputWrap = composerLayer.querySelector<HTMLElement>('.composer-input-wrap');
    const composerControl = composerLayer.querySelector<HTMLElement>('.composer-editable');
    const composerPlaceholder = composerLayer.querySelector<HTMLElement>('.composer-input-placeholder');
    const designSystemTrigger = composerLayer.querySelector<HTMLElement>('.project-ds-picker-trigger');
    const stagedContext = composerLayer.querySelector<HTMLElement>('.staged-context');
    const stagedContextKind = composerLayer.querySelector<HTMLElement>('.staged-context-kind');
    const stagedIcon = composerLayer.querySelector<HTMLElement>('.staged-context .staged-icon');
    const stagedRemove = composerLayer.querySelector<HTMLElement>('.staged-context .staged-remove');
    const stagedFile = composerLayer.querySelector<HTMLElement>('.staged-file');
    const stagedOrder = composerLayer.querySelector<HTMLElement>('.staged-file .staged-order');
    const stagedFileIcon = composerLayer.querySelector<HTMLElement>('.staged-file > .staged-icon');
    const stagedFileRemove = composerLayer.querySelector<HTMLElement>('.staged-file > .staged-remove');
    const stagedFileName = composerLayer.querySelector<HTMLElement>('.staged-file .staged-name');
    const stagedComment = composerLayer.querySelector<HTMLElement>('.staged-comment');
    const stagedCommentButton = composerLayer.querySelector<HTMLElement>('.staged-comment button');
    const stagedCommentStrong = composerLayer.querySelector<HTMLElement>('.staged-comment .staged-name strong');
    const stagedCommentSpan = composerLayer.querySelector<HTMLElement>('.staged-comment .staged-name span');
    const activeFileChip = composerLayer.querySelector<HTMLElement>('.composer-active-file');
    const toolbarIcon = composerLayer.querySelector<HTMLElement>('.icon-btn');
    const toolbarAvatar = composerLayer.querySelector<HTMLElement>('.avatar-agent-trigger');
    const toolbarAvatarButton = composerLayer.querySelector<HTMLElement>('.avatar-btn');
    const toolbarMode = composerLayer.querySelector<HTMLElement>('.session-mode-toggle__trigger');
    const toolbarSend = composerLayer.querySelector<HTMLElement>('.composer-send');
    if (!composer) throw new Error('Missing mock composer');
    if (!composerShell) throw new Error('Missing mock composer shell');
    if (!composerInputWrap) throw new Error('Missing mock composer input wrapper');
    if (!composerControl) throw new Error('Missing mock composer control');
    if (!composerPlaceholder) throw new Error('Missing mock composer placeholder');
    if (!designSystemTrigger) throw new Error('Missing mock design-system trigger');
    if (!stagedContext) throw new Error('Missing mock staged context');
    if (!stagedContextKind) throw new Error('Missing mock staged context kind');
    if (!stagedIcon) throw new Error('Missing mock staged context icon');
    if (!stagedRemove) throw new Error('Missing mock staged context remove');
    if (!stagedFile) throw new Error('Missing mock staged file');
    if (!stagedOrder) throw new Error('Missing mock staged order');
    if (!stagedFileIcon) throw new Error('Missing mock staged file icon');
    if (!stagedFileRemove) throw new Error('Missing mock staged file remove');
    if (!stagedFileName) throw new Error('Missing mock staged file name');
    if (!stagedComment) throw new Error('Missing mock staged comment');
    if (!stagedCommentButton) throw new Error('Missing mock staged comment button');
    if (!stagedCommentStrong) throw new Error('Missing mock staged comment strong text');
    if (!stagedCommentSpan) throw new Error('Missing mock staged comment span text');
    if (!activeFileChip) throw new Error('Missing mock active file chip');
    if (!toolbarIcon) throw new Error('Missing mock toolbar icon');
    if (!toolbarAvatar) throw new Error('Missing mock toolbar avatar');
    if (!toolbarAvatarButton) throw new Error('Missing mock toolbar avatar button');
    if (!toolbarMode) throw new Error('Missing mock toolbar mode');
    if (!toolbarSend) throw new Error('Missing mock toolbar send');

    expect(getComputedStyle(composerLayer).pointerEvents).toBe('none');
    expect(getComputedStyle(composer).pointerEvents).toBe('auto');
    expect(getComputedStyle(composerControl).pointerEvents).toBe('auto');

    composerControl.focus();
    expect(document.activeElement).toBe(composerControl);

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    await waitFor(() => {
      expect(document.body.classList.contains('od-quick-switcher-open')).toBe(true);
    });
    const quickSearchInput = screen.getByRole('textbox');
    await waitFor(() => {
      expect(document.activeElement).toBe(quickSearchInput);
    });
    await waitFor(() => {
      expect(getComputedStyle(composer).pointerEvents).toBe('none');
    });
    expect(getComputedStyle(composerLayer).pointerEvents).toBe('none');
    expect(getComputedStyle(composerLayer).opacity).toBe('0.58');
    expect(getComputedStyle(composerControl).pointerEvents).toBe('none');
    expect(getComputedStyle(composerShell).boxShadow).toBe('none');
    expect(getComputedStyle(composerShell).borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(composerInputWrap).background).toBe('var(--bg-fill-tertiary)');
    expect(getComputedStyle(composerInputWrap).borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(composerInputWrap).boxShadow).toBe('none');
    expect(getComputedStyle(composerControl).color).toBe('var(--text-muted)');
    expect(getComputedStyle(composerControl).caretColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(composerPlaceholder).color).toBe('color-mix(in srgb, var(--text-muted) 72%, transparent)');
    for (const toolbarControl of [
      designSystemTrigger,
      stagedContext,
      stagedIcon,
      stagedRemove,
      stagedFile,
      stagedOrder,
      stagedFileIcon,
      stagedFileRemove,
      stagedComment,
      stagedCommentButton,
      activeFileChip,
      toolbarIcon,
      toolbarAvatar,
      toolbarAvatarButton,
      toolbarMode,
      toolbarSend,
    ]) {
      expect(getComputedStyle(toolbarControl).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(toolbarControl).borderColor).toBe('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(toolbarControl).boxShadow).toBe('none');
    }
    expect(getComputedStyle(stagedContextKind).color).toBe('var(--text-muted)');
    expect(getComputedStyle(stagedFileName).color).toBe('var(--text-muted)');
    expect(getComputedStyle(stagedCommentStrong).color).toBe('var(--text-muted)');
    expect(getComputedStyle(stagedCommentSpan).color).toBe('var(--text-muted)');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(document.body.classList.contains('od-quick-switcher-open')).toBe(false);
    });
    await waitFor(() => {
      expect(getComputedStyle(composer).pointerEvents).toBe('auto');
    });
    expect(getComputedStyle(composerControl).pointerEvents).toBe('auto');
    expect(getComputedStyle(composerLayer).opacity).not.toBe('0.58');
    expect(getComputedStyle(composerInputWrap).background).toBe('var(--bg-panel)');
  });
});

function unreadableDropDataTransfer(fallbackFiles: File[] = []) {
  return {
    files: fallbackFiles,
    items: [
      {
        webkitGetAsEntry: () => ({
          isFile: true,
          isDirectory: false,
          name: 'stale.png',
          file: (_done: (file: File) => void, fail?: (error: DOMException) => void) => {
            fail?.(new DOMException('missing', 'NotFoundError'));
          },
        }),
      },
    ],
  };
}

describe('FileWorkspace upload input', () => {
  it('keeps the Design Files picker aligned with drag-and-drop file support', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
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

  it('auto-saves a newly created sketch into project files', async () => {
    const onRefreshFiles = vi.fn();
    const onTabsStateChange = vi.fn();
    mockedWriteProjectTextFile.mockImplementation(async (_projectId, name) => ({
      name,
      path: name,
      type: 'file',
      size: 128,
      mtime: 1710000000,
      kind: 'sketch',
      mime: 'application/json',
    }));

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={onRefreshFiles}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    fireEvent.click(screen.getByTestId('design-files-empty-new-sketch'));

    await waitFor(() => expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(1));
    const [projectId, name, content] = mockedWriteProjectTextFile.mock.calls[0]!;
    expect(projectId).toBe('project-1');
    expect(name).toMatch(/^sketch-.*\.sketch\.json$/);
    expect(JSON.parse(content as string)).toMatchObject({
      type: 'excalidraw',
      version: 2,
    });
    await waitFor(() => expect(onRefreshFiles).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          tabs: [name],
          active: name,
        }),
      ),
    );
  });

  it('creates slide template pages without default speaker notes', async () => {
    const onRefreshFiles = vi.fn();
    const onTabsStateChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({
          plugins: [{
            id: 'clean-deck',
            title: 'Clean Deck',
            version: '0.1.0',
            sourceKind: 'bundled',
            source: '/tmp',
            trust: 'bundled',
            capabilitiesGranted: [],
            manifest: {
              name: 'clean-deck',
              version: '0.1.0',
              title: 'Clean Deck',
              od: {
                kind: 'scenario',
                mode: 'deck',
                inputs: [{ name: 'audience', label: 'Audience', default: 'founder teams' }],
                preview: { type: 'html', entry: './preview.html' },
                useCase: { query: 'Create a clean launch deck for {{audience}}.' },
              },
            },
            fsPath: '/tmp',
            installedAt: 0,
            updatedAt: 0,
          }],
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/plugins/clean-deck/preview') {
        return new Response(
          '<!doctype html><html><body><main>Clean Deck</main><script type="application/json" id="speaker-notes">["Use speaker notes"]</script></body></html>',
          { headers: { 'content-type': 'text/html' } },
        );
      }
      return new Response('', { status: 404 });
    }));
    mockedWriteProjectTextFile.mockImplementation(async (_projectId, name) => workspaceFile(name));

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="slide_deck"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={onRefreshFiles}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    fireEvent.click(screen.getByTestId('workspace-pages-menu-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: /New blank page/i }));
    const title = await screen.findByText('Clean Deck');
    const card = title.closest('article');
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Use' }));

    await waitFor(() => expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(1));
    const [projectId, name, content, options] = mockedWriteProjectTextFile.mock.calls[0]!;
    expect(projectId).toBe('project-1');
    expect(name).toBe('clean-deck.html');
    expect(content).not.toContain('id="speaker-notes"');
    expect(content).not.toContain('Use speaker notes');
    expect(options).toMatchObject({
      versionSource: 'manual',
      versionPrompt: 'Create a clean launch deck for founder teams.',
    });
    await waitFor(() => expect(onRefreshFiles).toHaveBeenCalledTimes(1));
  });

  it('localizes page creator content and saves template query as the first version prompt', async () => {
    const onRefreshFiles = vi.fn();
    const onTabsStateChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({
          plugins: [{
            id: 'html-ppt-pitch-deck',
            title: 'Write a Demo Day Pitch like a Top Accelerator Group Partner',
            version: '0.1.0',
            sourceKind: 'bundled',
            source: '/tmp',
            trust: 'bundled',
            capabilitiesGranted: [],
            manifest: {
              name: 'html-ppt-pitch-deck',
              version: '0.1.0',
              title: 'Write a Demo Day Pitch like a Top Accelerator Group Partner',
              title_i18n: { 'zh-CN': '像顶级加速器合伙人一样写 Demo Day 路演' },
              description: 'For fundraising pitch work: turn a startup story into growth, moat, and fundraise narrative that earns another meeting.',
              description_i18n: { 'zh-CN': '融资/路演场景：围绕 core query「series-a-pitch-deck」把粗糙材料整理成可购买、可复用的专业 Deck。' },
              tags: ['pitch-deck', 'fundraising-pitch', 'series-a-pitch-deck', 'commercial-slide-agent'],
              od: {
                kind: 'scenario',
                mode: 'deck',
                preview: { type: 'html', entry: './preview.html' },
                useCase: {
                  query: {
                    en: 'Create "Write a Demo Day Pitch like a Top Accelerator Group Partner" as a Fundraising pitch deck.',
                    'zh-CN': '像顶级加速器合伙人一样写 Demo Day 路演。先确认受众、决策目标、素材来源、截止时间和必须保留的数据，再输出叙事主线、页面规划、逐页文案、视觉方向和按评审标准自检的版本。',
                  },
                },
              },
            },
            fsPath: '/tmp',
            installedAt: 0,
            updatedAt: 0,
          }],
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/plugins/html-ppt-pitch-deck/preview') {
        return new Response(
          '<!doctype html><html><body><main>Write a Demo Day Pitch like a Top Accelerator Group Partner</main></body></html>',
          { headers: { 'content-type': 'text/html' } },
        );
      }
      return new Response('', { status: 404 });
    }));
    mockedWriteProjectTextFile.mockImplementation(async (_projectId, name) => workspaceFile(name));

    render(
      <I18nProvider initial="zh-CN">
        <FileWorkspace
          projectId="project-1"
          projectKind="slide_deck"
          files={[]}
          liveArtifacts={[]}
          onRefreshFiles={onRefreshFiles}
          isDeck={false}
          tabsState={{ tabs: [], active: null }}
          onTabsStateChange={onTabsStateChange}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('workspace-pages-menu-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: /新建空白页面/ }));

    const dialog = await screen.findByRole('dialog', { name: '新建页面' });
    const dialogScope = within(dialog);
    expect(dialogScope.getByRole('tab', { name: /全部 幻灯片/ })).toBeTruthy();
    // The deck's commercial scene ("融资路演" / fundraising-pitch) is now the
    // sub-category tab, resolved from its category tag — the filter row and the
    // per-card 品类 chip share one taxonomy.
    expect(await dialogScope.findByRole('tab', { name: /融资路演/ })).toBeTruthy();
    const title = await dialogScope.findByText('像顶级加速器合伙人一样写 Demo Day 路演');
    const card = title.closest('article');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('融资/路演场景：围绕 core query「series-a-pitch-deck」把粗糙材料整理成可购买、可复用的专业 Deck。')).toBeTruthy();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '使用' }));

    await waitFor(() => expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(1));
    const [projectId, name, , options] = mockedWriteProjectTextFile.mock.calls[0]!;
    expect(projectId).toBe('project-1');
    expect(name).toBe('像顶级加速器合伙人一样写-demo-day-路演.html');
    expect(options).toMatchObject({
      versionSource: 'manual',
      versionPrompt: '像顶级加速器合伙人一样写 Demo Day 路演。先确认受众、决策目标、素材来源、截止时间和必须保留的数据，再输出叙事主线、页面规划、逐页文案、视觉方向和按评审标准自检的版本。',
    });
    await waitFor(() =>
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          tabs: ['像顶级加速器合伙人一样写-demo-day-路演.html'],
          active: '像顶级加速器合伙人一样写-demo-day-路演.html',
        }),
      ),
    );
    await waitFor(() => expect(onRefreshFiles).toHaveBeenCalledTimes(1));
  });

  it('hides blank cards and media category entries in the page creator dialog', async () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="slide_deck"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('workspace-pages-menu-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: /New blank page/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Create page' });
    const dialogScope = within(dialog);
    expect(dialogScope.queryByText('New blank page')).toBeNull();
    expect(dialogScope.queryByRole('button', { name: /^Image\b/i })).toBeNull();
    expect(dialogScope.queryByRole('button', { name: /^Video\b/i })).toBeNull();
    expect(dialogScope.queryByRole('button', { name: /^Audio\b/i })).toBeNull();
  });

  it('hides upload failure details during in-panel preview and restores them after closing preview', async () => {
    mockedUploadProjectFiles.mockRejectedValueOnce(new Error('storage offline'));

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
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
        projectKind="prototype"
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

  it('starts Design Files navigation fresh when switching projects', () => {
    const baseProps: React.ComponentProps<typeof FileWorkspace> = {
      projectId: 'project-a',
      projectKind: 'prototype',
      files: [
        workspaceFile('assets/logo.png'),
        workspaceFile('top.html'),
      ],
      liveArtifacts: [],
      onRefreshFiles: vi.fn(),
      isDeck: false,
      tabsState: { tabs: [], active: null },
      onTabsStateChange: vi.fn(),
    };

    const { container, rerender } = render(<FileWorkspace {...baseProps} />);

    fireEvent.click(container.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(container.querySelector('.df-breadcrumb-current')?.textContent).toBe('assets');

    rerender(
      <FileWorkspace
        {...baseProps}
        projectId="project-b"
        files={[
          workspaceFile('beta-assets/logo.png'),
          workspaceFile('home.html'),
        ]}
      />,
    );

    expect(container.querySelector('.df-breadcrumb-current')?.textContent).toBe('All project files');
    expect(screen.getByTestId('design-file-row-home.html')).toBeTruthy();
  });

  it('drops the previous project folders when switching, before the new fetch resolves', async () => {
    const folder = (path: string): ProjectFolder => ({
      name: path.split('/').pop() ?? path,
      path,
      type: 'dir',
      size: 0,
      mtime: 1700000000,
    });
    const mockedFolders = vi.mocked(fetchProjectFolders);
    // project-a has an empty persisted folder; project-b's fetch stays pending.
    // (One-time values take precedence over the factory default `[]`; no reset,
    // so later tests keep that default.)
    mockedFolders.mockResolvedValueOnce([folder('assets')]);
    mockedFolders.mockReturnValueOnce(new Promise<ProjectFolder[]>(() => {}));

    const baseProps: React.ComponentProps<typeof FileWorkspace> = {
      projectId: 'project-a',
      projectKind: 'prototype',
      files: [],
      liveArtifacts: [],
      onRefreshFiles: vi.fn(),
      isDeck: false,
      tabsState: { tabs: [], active: null },
      onTabsStateChange: vi.fn(),
    };
    const { container, rerender } = render(<FileWorkspace {...baseProps} />);
    // project-a's empty folder shows once its fetch resolves.
    await waitFor(() => {
      expect(
        [...container.querySelectorAll('.df-dir-row .df-row-name')].some(
          (e) => e.textContent === 'assets',
        ),
      ).toBe(true);
    });

    // Switch to project-b; its folder fetch is still pending. The previous
    // project's 'assets' folder must be gone immediately (reset synchronously),
    // not linger and suppress the new project's empty state.
    designFilesPanelRenders.length = 0;
    rerender(<FileWorkspace {...baseProps} projectId="project-b" files={[]} />);
    expect(
      [...container.querySelectorAll('.df-dir-row .df-row-name')].some(
        (e) => e.textContent === 'assets',
      ),
    ).toBe(false);

    // The reset happens during render, not in an effect — so the new panel's
    // FIRST render (and every render thereafter) already sees zero folders.
    // An effect-based reset would let project-b's first render observe the
    // stale 'assets' folder before the effect cleared it; RTL's post-rerender
    // DOM check above can't catch that frame, this can.
    const projectBRenders = designFilesPanelRenders.filter((r) => r.projectId === 'project-b');
    expect(projectBRenders.length).toBeGreaterThan(0);
    expect(projectBRenders.every((r) => r.folderCount === 0)).toBe(true);
  });

  it('clears a prior upload failure after a later successful upload', async () => {
    mockedUploadProjectFiles
      .mockRejectedValueOnce(new Error('storage offline'))
      .mockResolvedValueOnce({
        uploaded: [
          {
            path: 'retry.png',
            name: 'retry.png',
            kind: 'image',
            size: 1024,
          },
        ],
        failed: [],
      });

    const onRefreshFiles = vi.fn();
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[baseFile({ name: 'retry.png', path: 'retry.png' })]}
        liveArtifacts={[]}
        onRefreshFiles={onRefreshFiles}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('design-files-upload-input');
    fireEvent.change(input, {
      target: { files: [new File(['failed'], 'failed.png', { type: 'image/png' })] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error-banner').textContent).toContain('storage offline');
    });

    fireEvent.change(input, {
      target: { files: [new File(['retry'], 'retry.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onRefreshFiles).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('upload-error-banner')).toBeNull());
  });

  it('falls back to the browser file list when a dragged entry cannot be read', async () => {
    const fallbackFile = new File(['mock'], 'fallback.png', { type: 'image/png' });
    const onUploadFiles = vi.fn();
    const { container } = renderDesignFilesPanel({ onUploadFiles });

    fireEvent.drop(container.querySelector('.df-body')!, {
      dataTransfer: unreadableDropDataTransfer([fallbackFile]),
    });

    await waitFor(() => expect(onUploadFiles).toHaveBeenCalledWith([fallbackFile]));
    expect(screen.queryByTestId('upload-error-banner')).toBeNull();
  });

  it('uploads files pasted from the clipboard in Design Files', () => {
    const pastedFile = new File(['mock'], 'clipboard.png', { type: 'image/png' });
    const onUploadFiles = vi.fn();
    const onClearUploadError = vi.fn();
    renderDesignFilesPanel({ onUploadFiles, onClearUploadError });

    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [pastedFile],
        items: [],
      },
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onClearUploadError).toHaveBeenCalledTimes(1);
    expect(onUploadFiles).toHaveBeenCalledWith([pastedFile]);
  });

  it('does not steal clipboard files from text inputs', () => {
    const pastedFile = new File(['mock'], 'clipboard.png', { type: 'image/png' });
    const onUploadFiles = vi.fn();
    renderDesignFilesPanel({ onUploadFiles });
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    try {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', {
        value: {
          files: [pastedFile],
          items: [],
        },
      });
      textarea.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(onUploadFiles).not.toHaveBeenCalled();
    } finally {
      textarea.remove();
    }
  });

  it('shows a recoverable read error when a dragged entry disappears before import', async () => {
    const onUploadFiles = vi.fn();
    const { container } = renderDesignFilesPanel({ onUploadFiles });

    fireEvent.drop(container.querySelector('.df-body')!, {
      dataTransfer: unreadableDropDataTransfer(),
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error-banner').textContent).toContain(
        'Could not read one or more dropped files or folders',
      );
    });
    expect(onUploadFiles).not.toHaveBeenCalled();
  });

  it('hides the workspace focus control while the chat pane is open', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
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
        projectKind="prototype"
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

  it('keeps the pages switcher before opened file tabs', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('artifact.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['artifact.html'], active: 'artifact.html' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(markup).toContain('class="ws-tabs-bar"');
    expect(markup).toMatch(
      /role="tablist"[\s\S]*data-testid="workspace-pages-menu-trigger"[\s\S]*artifact\.html/,
    );
  });

  it('labels the same workspace control as chat restore while focused', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
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

describe('FileWorkspace launcher tab creation', () => {
  it('does not report a Design Files context for an empty project', async () => {
    // A brand-new project has no files, live artifacts, or folders. The
    // composer must not auto-stage a "Design files" chip that points at
    // nothing, so the active workspace context stays null.
    const onActiveContextChange = vi.fn();
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        resolvedDir="/tmp/open-design/project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        onActiveContextChange={onActiveContextChange}
      />,
    );

    await waitFor(() => {
      expect(onActiveContextChange).toHaveBeenCalled();
    });
    expect(onActiveContextChange).toHaveBeenLastCalledWith(null);
  });

  it('reports the active Design Files tab as workspace context once files exist', async () => {
    const onActiveContextChange = vi.fn();
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        resolvedDir="/tmp/open-design/project-1"
        files={[workspaceFile('cover.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        onActiveContextChange={onActiveContextChange}
      />,
    );

    await waitFor(() => {
      expect(onActiveContextChange).toHaveBeenLastCalledWith({
        id: 'workspace:design-files',
        kind: 'design-files',
        label: 'Design Files',
        tabId: '__design_files__',
        absolutePath: '/tmp/open-design/project-1',
      });
    });
  });

  it('hides terminal creation while keeping browser creation available', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('workspace-add-tab'));

    expect(screen.queryByRole('button', { name: /New Terminal/i })).toBeNull();
    expect(screen.getByRole('button', { name: /New Browser/i })).toBeTruthy();
    expect(
      screen.getByText('Sketch rough layouts and notes for the agent to use as design context'),
    ).toBeTruthy();
    expect(screen.getByText('Create new')).toBeTruthy();
  });

  it('renders terminal and side chat tabs after a Design Files-anchored browser tab', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['terminal:term-1', 'chat:conversation-1'],
          active: 'chat:conversation-1',
          browserTabs: [
            {
              id: '__browser__:1',
              insertAfter: '__design_files__',
              label: 'Browser',
            },
          ],
        }}
        conversations={[
          {
            id: 'conversation-1',
            projectId: 'project-1',
            title: null,
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('workspace-pages-menu-trigger').textContent).toContain('Pages');
    expect(renderedTabLabels()).toEqual(['Browser', 'New Terminal', 'Side chat']);
  });

  it('opens Design Files from the browser snapshot toast action instead of the manifest file', async () => {
    const onTabsStateChange = vi.fn();
    const browserTab = {
      id: '__browser__:1',
      insertAfter: '__design_files__',
      label: 'Browser',
      title: 'Example',
      url: 'https://example.com',
    };

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: [],
          active: '__browser__:1',
          browserTabs: [browserTab],
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    fireEvent.click(screen.getByTestId('emit-browser-snapshot-success'));
    await screen.findByRole('button', { name: 'View Design Files' });
    const toastAnchor = document.querySelector('.workspace-toast-anchor');
    expect(toastAnchor).toBeTruthy();
    expect(toastAnchor?.querySelector('.od-toast-browser-snapshot')).toBeTruthy();
    const toastAction = document.querySelector<HTMLButtonElement>('.od-toast-action');
    if (!toastAction) throw new Error('Could not find browser snapshot toast action');
    await act(async () => {
      fireEvent.click(toastAction);
    });

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: [],
        active: DESIGN_FILES_TAB,
        browserTabs: [browserTab],
      });
    });
    expect(onTabsStateChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ active: 'browser-archive/example/manifest.json' }),
    );
  });

  it('anchors the browser snapshot toast inside the workspace pane', async () => {
    // The Download Page progress/result toast is workspace-owned UI. Rendered
    // as a bare fixed .od-toast it centers on the whole viewport, drifting
    // over the chat pane and covering the composer send area in split view;
    // the anchor scopes it to the workspace pane instead.
    const browserTab = {
      id: '__browser__:1',
      insertAfter: '__design_files__',
      label: 'Browser',
      title: 'Example',
      url: 'https://example.com',
    };

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: [],
          active: '__browser__:1',
          browserTabs: [browserTab],
        }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('emit-browser-snapshot-success'));

    const toast = await waitFor(() => {
      const node = document.querySelector<HTMLElement>('.od-toast');
      expect(node?.textContent).toContain('Saved page snapshot');
      return node as HTMLElement;
    });
    expect(toast.closest('.workspace-toast-anchor')).toBeTruthy();
    expect(toast.closest('[data-testid="file-workspace"]')).toBeTruthy();
  });

  it('anchors a new browser after the visible tab tail', async () => {
    const onTabsStateChange = vi.fn();
    const rootBrowserTab = {
      id: '__browser__:1',
      insertAfter: '__design_files__',
      label: 'Browser',
    };

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['terminal:term-1'],
          active: 'terminal:term-1',
          browserTabs: [rootBrowserTab],
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    fireEvent.click(screen.getByTestId('workspace-add-tab'));
    fireEvent.click(await screen.findByRole('button', { name: /New Browser/i }));

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['terminal:term-1'],
        active: '__browser__:2',
        browserTabs: [
          rootBrowserTab,
          {
            id: '__browser__:2',
            insertAfter: 'terminal:term-1',
            label: 'Browser 2',
          },
        ],
      });
    });
  });

  it('reanchors stale browser tabs before appending a file from the launcher', async () => {
    const onTabsStateChange = vi.fn();
    const staleBrowserTab = {
      id: '__browser__:1',
      insertAfter: 'deleted.html',
      label: 'Browser',
    };

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html'), workspaceFile('notes.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['cover.html'],
          active: 'cover.html',
          browserTabs: [staleBrowserTab],
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    fireEvent.click(screen.getByTestId('workspace-add-tab'));
    fireEvent.click(await screen.findByRole('button', { name: /notes\.html/i }));

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['cover.html', 'notes.html'],
        active: 'notes.html',
        browserTabs: [
          {
            ...staleBrowserTab,
            insertAfter: 'cover.html',
          },
        ],
      });
    });
  });

  it('opens the Design Files tab launcher with the browser new-tab shortcut', async () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const allowedDefault = fireEvent.keyDown(window, {
      key: 't',
      metaKey: true,
    });

    expect(allowedDefault).toBe(false);
    expect(screen.getByTestId('workspace-add-tab').getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(await screen.findByRole('dialog', { name: /New tab/i })).toBeTruthy();
    expect(screen.getByTestId('tab-launcher-search')).toBe(document.activeElement);
  });

  it('closes the active Design Files workspace tab with the browser close-tab shortcut', () => {
    const onTabsStateChange = vi.fn();
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('analysis.html'), workspaceFile('notes.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['analysis.html', 'notes.html'], active: 'notes.html' }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const allowedDefault = fireEvent.keyDown(window, {
      key: 'w',
      ctrlKey: true,
    });

    expect(allowedDefault).toBe(false);
    expect(onTabsStateChange).toHaveBeenLastCalledWith({
      tabs: ['analysis.html'],
      active: 'analysis.html',
    });
  });

  it('switches Design Files workspace tabs with browser-style next and previous shortcuts', async () => {
    const onTabsStateChange = vi.fn();
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('analysis.html'), workspaceFile('notes.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['analysis.html', 'notes.html'], active: 'analysis.html' }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const nextAllowedDefault = fireEvent.keyDown(window, {
      key: 'Tab',
      ctrlKey: true,
    });

    expect(nextAllowedDefault).toBe(false);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /notes\.html/ }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });
    expect(onTabsStateChange).toHaveBeenLastCalledWith({
      tabs: ['analysis.html', 'notes.html'],
      active: 'notes.html',
    });

    const previousAllowedDefault = fireEvent.keyDown(window, {
      key: 'Tab',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(previousAllowedDefault).toBe(false);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /analysis\.html/ }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });
    expect(onTabsStateChange).toHaveBeenLastCalledWith({
      tabs: ['analysis.html', 'notes.html'],
      active: 'analysis.html',
    });
  });

  it('focuses a browser open request without adding it to file tabs', async () => {
    const onTabsStateChange = vi.fn();
    const browserTabs = [
      {
        id: '__browser__:1',
        label: 'Browser 1',
        title: 'Dribbble',
        url: 'https://dribbble.com/',
      },
    ];

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['cover.html'], active: 'cover.html', browserTabs }}
        openRequest={{ name: '__browser__:1', nonce: 1 }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['cover.html'],
        active: '__browser__:1',
        browserTabs,
      });
    });
  });

  it('creates and navigates a browser tab from a browser open request', async () => {
    const onTabsStateChange = vi.fn();

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['cover.html'], active: 'cover.html' }}
        browserOpenRequest={{ tabId: '__browser__:1', url: 'https://economist.com/', nonce: 7 }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['cover.html'],
        active: '__browser__:1',
        browserTabs: [
          {
            id: '__browser__:1',
            insertAfter: 'cover.html',
            label: 'Browser',
            title: 'economist.com',
            url: 'https://economist.com/',
          },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('design-browser-panel').getAttribute('data-navigate-url'))
        .toBe('https://economist.com/');
    });
  });

  it('opens a share request without dropping existing browser tabs', async () => {
    const onTabsStateChange = vi.fn();
    const browserTabs = [
      {
        id: '__browser__:1',
        label: 'Browser 1',
        title: 'Dribbble',
        url: 'https://dribbble.com/',
      },
    ];

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html'), workspaceFile('landing.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['cover.html'], active: '__browser__:1', browserTabs }}
        shareRequest={{ name: 'landing.html', nonce: 1 }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['cover.html', 'landing.html'],
        active: 'landing.html',
        browserTabs,
      });
    });
  });

  it('opens and activates the target file for a download request', async () => {
    const onTabsStateChange = vi.fn();
    const browserTabs = [
      { id: '__browser__:1', label: 'Browser 1', title: 'Dribbble', url: 'https://dribbble.com/' },
    ];

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html'), workspaceFile('landing.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['cover.html'], active: '__browser__:1', browserTabs }}
        downloadRequest={{ name: 'landing.html', nonce: 1 }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['cover.html', 'landing.html'],
        active: 'landing.html',
        browserTabs,
      });
    });
  });

  it('focuses the design-system workspace tab without adding it to file tabs', async () => {
    const onTabsStateChange = vi.fn();

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['cover.html'], active: 'cover.html' }}
        openRequest={{ name: '__design_system__', nonce: 1 }}
        onTabsStateChange={onTabsStateChange}
        designSystemProject={{
          id: 'neutral-modern',
          title: 'Neutral Modern',
          category: 'Starter',
          source: 'bundled',
          updatedAt: 1,
        } as never}
      />,
    );

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['cover.html'],
        active: '__design_system__',
      });
    });
  });

  it('focuses an already-open file tab without adding a duplicate tab', async () => {
    const onTabsStateChange = vi.fn();

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('Web Prototype mutuals-v2.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['Web Prototype mutuals-v2.html'],
          active: 'notes.html',
        }}
        openRequest={{ name: 'Web Prototype mutuals-v2.html', nonce: 1 }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    await waitFor(() => {
      expect(onTabsStateChange).toHaveBeenCalledWith({
        tabs: ['Web Prototype mutuals-v2.html'],
        active: 'Web Prototype mutuals-v2.html',
      });
    });
  });
});

describe('DesignFilesPanel plugin folders', () => {
  it('surfaces generated plugin folders with agent-routed CLI actions', async () => {
    const onPluginFolderAgentAction = vi.fn();
    const container = renderWorkspace(
      <DesignFilesPanel
        projectId="project-1"
        files={[
          workspaceFile('generated-plugin/open-design.json'),
          workspaceFile('generated-plugin/SKILL.md'),
          workspaceFile('generated-plugin/examples/demo.md'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDeleteFile={vi.fn()}
        onDeleteFiles={vi.fn()}
        onRenameFile={vi.fn()}
        onUpload={vi.fn()}
        onUploadFiles={vi.fn()}
        onPaste={vi.fn()}
        onNewSketch={vi.fn()}
        onPluginFolderAgentAction={onPluginFolderAgentAction}
      />,
    );

    expect(container.querySelector('[data-testid="design-plugin-folder-generated-plugin"]')).toBeTruthy();
    const install = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-plugin-folder-install-generated-plugin"]',
    );
    expect(install).toBeTruthy();
    await act(async () => {
      install?.click();
    });
    expect(onPluginFolderAgentAction).toHaveBeenCalledWith('generated-plugin', 'install');

    const publish = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-plugin-folder-publish-generated-plugin"]',
    );
    const contribute = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-plugin-folder-contribute-generated-plugin"]',
    );
    expect(publish).toBeTruthy();
    expect(contribute).toBeTruthy();
    await act(async () => {
      publish?.click();
    });
    expect(onPluginFolderAgentAction).toHaveBeenCalledWith('generated-plugin', 'publish');
    await act(async () => {
      contribute?.click();
    });
    expect(onPluginFolderAgentAction).toHaveBeenCalledWith('generated-plugin', 'contribute');
    expect(container.textContent).not.toContain(
      'Sent to the agent. The CLI run will continue in chat.',
    );
  });
});

describe('FileWorkspace tab reordering', () => {
  it('persists a dragged file tab before the tab it is dropped on', () => {
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
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
        projectKind="prototype"
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
        projectKind="prototype"
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
        projectKind="prototype"
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

describe('FileWorkspace Questions tab', () => {
  const discoveryForm = {
    id: 'discovery',
    title: 'Quick brief',
    questions: [
      {
        id: 'platform',
        label: 'Platform',
        type: 'radio' as const,
        options: [
          { label: 'Mobile', value: 'Mobile' },
          { label: 'Desktop web', value: 'Desktop web' },
        ],
        required: true,
      },
    ],
  };

  it('shows the Questions tab while the form is unanswered', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        questionForm={discoveryForm}
      />,
    );

    expect(screen.getByTestId('questions-tab')).toBeTruthy();
  });

  it('closes the Questions preview after submit, then lets the answered form reopen', async () => {
    const baseProps: React.ComponentProps<typeof FileWorkspace> = {
      projectId: 'project-1',
      projectKind: 'prototype',
      files: [],
      liveArtifacts: [],
      onRefreshFiles: vi.fn(),
      isDeck: false,
      tabsState: { tabs: [], active: null },
      onTabsStateChange: vi.fn(),
      questionForm: discoveryForm,
      focusQuestionsRequest: { nonce: 1 },
    };
    const { rerender } = render(<FileWorkspace {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('Quick brief')).toBeTruthy();
    });

    rerender(
      <FileWorkspace
        {...baseProps}
        questionFormSubmittedAnswers={{ platform: 'Mobile' }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Quick brief')).toBeNull();
    });
    expect(screen.getByTestId('questions-tab')).toBeTruthy();

    fireEvent.click(screen.getByTestId('questions-tab'));
    expect(screen.getByText('Quick brief')).toBeTruthy();
    expect(screen.getByText('Mobile')).toBeTruthy();
  });
});

describe('projectSplitClassName', () => {
  it('marks the project split as focused so the chat pane can collapse globally', () => {
    expect(projectSplitClassName(false)).toBe('split');
    expect(projectSplitClassName(true)).toBe('split split-focus');
  });

  it('uses CSS variables for split widths so pointer resize can update layout without rerendering workspace content', () => {
    expect(projectSplitStyle(false, 512, 'minmax(420px, 1fr)')).toEqual({
      '--project-chat-panel-width': '512px',
      '--project-workspace-panel-track': 'minmax(420px, 1fr)',
      gridTemplateColumns: '512px 8px minmax(420px, 1fr)',
    });
    expect(projectSplitStyle(true, 512, 'minmax(420px, 1fr)')).toBeUndefined();
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

describe('FileWorkspace sketch save', () => {
  it('opens a persisted sketch through the editor path without rendering the static preview first', async () => {
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [{ id: 'box', type: 'rectangle', isDeleted: false }],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      }),
    );

    const { container } = render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[file]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading sketch…')).toBeTruthy();
    expect(container.querySelector('[data-testid="sketch-preview-svg"]')).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(1);
    expect(mockedFetchProjectFileText).toHaveBeenCalledWith('project-1', 'test.sketch.json');
    expect(container.querySelector('[data-testid="sketch-preview-svg"]')).toBeNull();
  });

  it('preloads persisted sketches before the tab is opened', async () => {
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [{ id: 'box', type: 'rectangle', isDeleted: false }],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      }),
    );

    const baseProps: React.ComponentProps<typeof FileWorkspace> = {
      projectId: 'project-1',
      projectKind: 'prototype',
      files: [file],
      liveArtifacts: [],
      onRefreshFiles: vi.fn(),
      isDeck: false,
      tabsState: { tabs: [], active: null },
      onTabsStateChange: vi.fn(),
    };
    const { rerender } = render(
      <FileWorkspace {...baseProps} />,
    );

    await waitFor(() => {
      expect(mockedFetchProjectFileText).toHaveBeenCalledWith('project-1', 'test.sketch.json');
    });

    rerender(
      <FileWorkspace
        {...baseProps}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
      />,
    );

    expect(screen.queryByText('Loading sketch…')).toBeNull();
    expect(screen.getByTestId('excalidraw')).toBeTruthy();
    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(1);
  });

  it('keeps saving state visible for at least 500ms', async () => {
    // Simulate user doing some edits in the workspace
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        version: 1,
        items: [
          { kind: 'pen', points: [{ x: 10, y: 20 }], color: '#000', size: 2 },
        ],
      }),
    );
    mockedWriteProjectTextFile.mockResolvedValue(file);

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[file]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('canvas')).not.toBeNull();
    });

    vi.useFakeTimers();

    const btn = screen.getByText('Save') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn.textContent).toBe('Saving…');
    expect(btn.disabled).toBe(true);

    // Before the 500ms floor is reached, still saving
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(btn.textContent).toBe('Saving…');
    expect(btn.disabled).toBe(true);

    // After 500ms total, saving should end and the checkmark should appear
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(btn.textContent).not.toBe('Saving…');
    expect(btn.querySelector('svg')).not.toBeNull();
  });

  it('autosaves an empty sketch when clear happens before a pending sketch autosave', async () => {
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      }),
    );
    mockedWriteProjectTextFile.mockResolvedValue(file);

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[file]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    vi.useFakeTimers();
    const props = excalidrawWorkspaceMock.lastProps;
    if (!props?.onChange) throw new Error('expected Excalidraw onChange');

    act(() => {
      props.onChange(
        [{ id: 'baseline', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
      props.onChange(
        [{ id: 'drawn-before-clear', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
    });

    const clearButton = screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement;
    expect(clearButton.disabled).toBe(false);
    act(() => {
      fireEvent.click(clearButton);
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(1);
    const savedText = mockedWriteProjectTextFile.mock.calls[0]?.[2];
    if (typeof savedText !== 'string') throw new Error('expected saved sketch JSON');
    const saved = JSON.parse(savedText) as { elements?: unknown[] };
    expect(saved.elements).toEqual([]);
  });

  it('serializes overlapping sketch autosaves so the latest scene wins', async () => {
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };
    let resolveFirstSave!: (file: ProjectFile) => void;
    const firstSave = new Promise<ProjectFile>((resolve) => {
      resolveFirstSave = resolve;
    });
    const savedTexts: string[] = [];

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      }),
    );
    mockedWriteProjectTextFile.mockImplementation(async (_projectId, _name, text) => {
      savedTexts.push(text);
      return savedTexts.length === 1 ? firstSave : file;
    });

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[file]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    vi.useFakeTimers();
    const props = excalidrawWorkspaceMock.lastProps;
    if (!props?.onChange) throw new Error('expected Excalidraw onChange');

    act(() => {
      props.onChange(
        [{ id: 'baseline', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
      props.onChange(
        [{ id: 'autosave-a', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(1);

    act(() => {
      props.onChange(
        [{ id: 'autosave-b', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSave(file);
      await firstSave;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(2);
    const firstSaved = JSON.parse(savedTexts[0]!) as { elements?: Array<{ id?: string }> };
    const secondSaved = JSON.parse(savedTexts[1]!) as { elements?: Array<{ id?: string }> };
    expect(firstSaved.elements?.[0]?.id).toBe('autosave-a');
    expect(secondSaved.elements?.[0]?.id).toBe('autosave-b');
  });

  it('does not wire Excalidraw library item changes into sketch autosave', async () => {
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
        libraryItems: [],
      }),
    );
    mockedWriteProjectTextFile.mockResolvedValue(file);

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[file]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    const props = excalidrawWorkspaceMock.lastProps;
    expect(props?.onLibraryChange).toBeUndefined();
    expect(props?.initialData?.libraryItems).toBeUndefined();
    expect(mockedWriteProjectTextFile).not.toHaveBeenCalled();
  });

  it('flushes pending sketch autosaves when the workspace unmounts before debounce', async () => {
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
        libraryItems: [],
      }),
    );
    mockedWriteProjectTextFile.mockResolvedValue(file);

    const { unmount } = render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[file]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    const props = excalidrawWorkspaceMock.lastProps;
    if (!props?.onChange) throw new Error('expected Excalidraw onChange');

    act(() => {
      props.onChange([], { viewBackgroundColor: '#ffffff' }, {});
      props.onChange(
        [{ id: 'scene-before-unmount', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
      unmount();
    });

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledTimes(1);
    });
    const savedText = mockedWriteProjectTextFile.mock.calls[0]?.[2];
    if (typeof savedText !== 'string') throw new Error('expected saved sketch JSON');
    const saved = JSON.parse(savedText) as { elements?: Array<{ id?: string }>; libraryItems?: unknown[] };
    expect(saved.elements?.map((item) => item.id)).toEqual(['scene-before-unmount']);
    expect(saved.libraryItems).toBeUndefined();
  });

  it('preserves a newer sketch scene while its autosave is still debouncing', async () => {
    const file: ProjectFile = {
      name: 'test.sketch.json',
      path: 'test.sketch.json',
      type: 'file',
      size: 100,
      mtime: 1700000000,
      kind: 'sketch',
      mime: 'application/json',
    };
    const writes: Array<{
      text: string;
      resolve: (file: ProjectFile | null) => void;
    }> = [];

    mockedFetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      }),
    );
    mockedWriteProjectTextFile.mockImplementation((_projectId, _name, text) => new Promise((resolve) => {
      if (typeof text !== 'string') throw new Error('expected saved sketch JSON');
      writes.push({ text, resolve });
    }));

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[file]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['test.sketch.json'], active: 'test.sketch.json' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    vi.useFakeTimers();
    const props = excalidrawWorkspaceMock.lastProps;
    if (!props?.onChange) throw new Error('expected Excalidraw onChange');

    act(() => {
      props.onChange(
        [{ id: 'baseline', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
      props.onChange(
        [{ id: 'older-scene', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    expect(writes).toHaveLength(1);

    act(() => {
      props.onChange(
        [{ id: 'latest-scene', type: 'rectangle', isDeleted: false }],
        { viewBackgroundColor: '#ffffff' },
        {},
      );
    });

    await act(async () => {
      writes[0]?.resolve(file);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writes).toHaveLength(2);

    await act(async () => {
      writes[1]?.resolve(file);
      await Promise.resolve();
      await Promise.resolve();
    });

    const firstSaved = JSON.parse(writes[0]?.text ?? '{}') as { elements?: Array<{ id?: string }> };
    const latestSaved = JSON.parse(writes[1]?.text ?? '{}') as { elements?: Array<{ id?: string }> };
    expect(firstSaved.elements?.map((element) => element.id)).toEqual(['older-scene']);
    expect(latestSaved.elements?.map((element) => element.id)).toEqual(['latest-scene']);
  });
});

describe('FileWorkspace add-module menu', () => {
  it('opens the add-module menu with Browser available and Terminal hidden', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const addButton = screen.getByTestId('workspace-add-tab');
    expect(addButton.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      fireEvent.click(addButton);
    });

    expect(addButton.getAttribute('aria-expanded')).toBe('true');
    const browserItem = screen.getByRole('button', { name: /New Browser/ });
    const menu = browserItem.closest('[data-testid="tab-launcher-menu"]');
    expect(menu).not.toBeNull();
    expect(screen.queryByRole('button', { name: /New Terminal/ })).toBeNull();

    // The tab strip is a horizontal scroll container that also clips
    // vertically, so the "+" button lives outside it in `.ws-add-tab`
    // and the launcher menu is portaled to <body> -- neither can be clipped
    // by the scrolling bar.
    const tabsBar = document.querySelector('.ws-tabs-bar');
    expect(tabsBar).not.toBeNull();
    expect(tabsBar!.contains(addButton)).toBe(false);
    expect(tabsBar!.contains(menu)).toBe(false);
    expect(addButton.closest('.ws-add-tab')).not.toBeNull();
  });

  it('orders launcher sections as create new, files, then tabs in one scroll body', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('cover.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['cover.html'],
          active: 'cover.html',
          browserTabs: [
            {
              id: '__browser__:1',
              label: 'Reference Browser',
              title: 'Behance',
              url: 'https://www.behance.net/',
            },
          ],
        }}
        onTabsStateChange={vi.fn()}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByTestId('workspace-add-tab'));
    });

    const scrollBody = screen.getByTestId('tab-launcher-scroll-body');
    const createHeader = screen.getByText('Create new');
    const fileHeader = screen.getByText('Open a file');
    const tabsHeader = screen.getByText('Open tabs');

    expect(scrollBody.contains(createHeader)).toBe(true);
    expect(scrollBody.contains(fileHeader)).toBe(true);
    expect(scrollBody.contains(tabsHeader)).toBe(true);
    expect(createHeader.compareDocumentPosition(fileHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fileHeader.compareDocumentPosition(tabsHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds a new browser tab every time the Browser module is selected', () => {
    const onTabsStateChange = vi.fn();
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const addButton = screen.getByTestId('workspace-add-tab');
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        fireEvent.click(addButton);
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /New Browser/ }));
      });
    }

    const browserTabs = screen
      .getAllByRole('tab')
      .filter((tab) => /Browser(?: \d+)?/.test(tab.textContent ?? ''));
    expect(browserTabs).toHaveLength(3);
    expect(browserTabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Browser',
      'Browser 2',
      'Browser 3',
    ]);
    expect(browserTabs[2]!.getAttribute('aria-selected')).toBe('true');

    const browserPanels = screen
      .getAllByTestId('design-browser-panel')
      .map((panel) => panel.closest('.ws-browser-panel'));
    expect(browserPanels).toHaveLength(3);
    expect(browserPanels[0]!.className).not.toContain('active');
    expect(browserPanels[1]!.className).not.toContain('active');
    expect(browserPanels[2]!.className).toContain('active');
    expect(onTabsStateChange).toHaveBeenLastCalledWith({
      tabs: [],
      active: '__browser__:3',
      browserTabs: [
        { id: '__browser__:1', insertAfter: '__design_files__', label: 'Browser' },
        { id: '__browser__:2', insertAfter: '__browser__:1', label: 'Browser 2' },
        { id: '__browser__:3', insertAfter: '__browser__:2', label: 'Browser 3' },
      ],
    });
  });

  it('restores persisted browser tabs with their active URL state', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: [],
          active: '__browser__:2',
          browserTabs: [
            {
              id: '__browser__:2',
              insertAfter: '__design_files__',
              label: 'Browser 2',
              title: 'SVG Repo',
              url: 'https://www.svgrepo.com/',
              iconUrl: 'https://www.svgrepo.com/favicon.ico',
            },
          ],
        }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const restoredTab = screen.getByRole('tab', { name: /SVG Repo/ });
    expect(restoredTab.getAttribute('aria-selected')).toBe('true');
    const browserPanel = screen.getByTestId('design-browser-panel');
    expect(browserPanel.dataset.initialUrl).toBe('https://www.svgrepo.com/');
    expect(browserPanel.dataset.initialTitle).toBe('SVG Repo');
    expect(browserPanel.dataset.initialIconUrl).toBe('https://www.svgrepo.com/favicon.ico');
  });

  it('persists browser-tab removal when a browser tab is closed', () => {
    const onTabsStateChange = vi.fn();
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: [],
          active: '__browser__:1',
          browserTabs: [
            { id: '__browser__:1', insertAfter: '__design_files__', label: 'Browser' },
          ],
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const restoredTab = screen.getByRole('tab', { name: /Browser/ });
    const closeButton = restoredTab.querySelector<HTMLButtonElement>('.ws-tab-close');
    expect(closeButton).not.toBeNull();
    act(() => {
      fireEvent.click(closeButton!);
    });

    expect(screen.queryByRole('tab', { name: /Browser/ })).toBeNull();
    expect(screen.queryByTestId('design-browser-panel')).toBeNull();
    expect(onTabsStateChange).toHaveBeenLastCalledWith({
      tabs: [],
      active: '__design_files__',
    });
  });

  it('keeps the pinned brand browser tab mounted while another tab is active', () => {
    const browserTabs = [
      {
        id: '__browser__:1',
        label: 'Browser',
        title: 'The Economist',
        url: 'https://www.economist.com/',
      },
    ];

    // Without the pin, a browser tab that was never activated this session is
    // not mounted while a file tab is active, so its live (post-wall) DOM can't
    // be read — this is the failure the pin fixes.
    const { unmount } = render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('brand.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['brand.html'], active: 'brand.html', browserTabs }}
        onTabsStateChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('design-browser-panel')).toBeNull();
    unmount();

    // With the pin, the same inactive browser tab stays mounted so the chat
    // "Continue extraction" handler can read its post-wall DOM.
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('brand.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['brand.html'], active: 'brand.html', browserTabs }}
        pinnedBrowserTabId="__browser__:1"
        onTabsStateChange={vi.fn()}
      />,
    );
    const panel = screen.getByTestId('design-browser-panel');
    expect(panel.dataset.initialTitle).toBe('The Economist');
  });

});

describe('FileWorkspace empty-project generation contract', () => {
  function assistantMessage(runStatus: 'running' | 'failed'): ChatMessage {
    return {
      id: `msg-${runStatus}`,
      role: 'assistant',
      content: '',
      createdAt: 1700000000,
      startedAt: 1700000000,
      runId: `run-${runStatus}`,
      runStatus,
      agentId: 'claude',
      preTurnFileNames: [],
      events: [{ kind: 'status', label: runStatus === 'failed' ? 'error' : 'thinking' }],
    };
  }

  // The generation-preview card / transient `generating-tab` were removed: an
  // empty project keeps the plain `design-files-empty` placeholder for running
  // AND failed turns, with no card hijacking the surface.
  it.each(['running', 'failed'] as const)(
    'keeps the design-files empty placeholder and shows no generation card for a %s turn',
    (runStatus) => {
      render(
        <FileWorkspace
          projectId="project-1"
          projectKind="prototype"
          files={[]}
          liveArtifacts={[]}
          onRefreshFiles={vi.fn()}
          isDeck={false}
          streaming={runStatus === 'running'}
          tabsState={{ tabs: [], active: DESIGN_FILES_TAB }}
          onTabsStateChange={vi.fn()}
          messages={[assistantMessage(runStatus)]}
        />,
      );

      expect(screen.queryByTestId('generating-tab')).toBeNull();
      expect(screen.queryByTestId('generation-preview-stage')).toBeNull();
      expect(screen.getByTestId('design-files-empty')).toBeTruthy();
    },
  );

  it('keeps delivery recovery in Chat and leaves a passive failure hint over existing preview files', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('previous-design.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: DESIGN_FILES_TAB }}
        onTabsStateChange={vi.fn()}
        messages={[
          {
            ...assistantMessage('failed'),
            id: 'delivery-failure',
            runStatus: 'succeeded',
            resultDeliveryState: 'no_result',
            sessionMode: 'design',
            endedAt: 1_700_000_012_000,
          },
        ]}
      />,
    );

    const previewStatus = screen.getByTestId('preview-run-status');
    expect(previewStatus).toHaveTextContent('Delivery needs attention · Retry in Chat');
    expect(previewStatus.closest('.ws-preview-run-status-slot')).not.toBeNull();
    expect(previewStatus.closest('[data-testid="design-files-empty"]')).toBeNull();
    expect(screen.queryByTestId('preview-run-status-retry')).toBeNull();
    expect(screen.queryByTestId('preview-run-status-view-details')).toBeNull();
    expect(previewStatus).not.toHaveTextContent('Elapsed');
  });

  it('does not mount main-preview delivery feedback over a browser tab', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('previous-design.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['previous-design.html'],
          active: '__browser__:1',
          browserTabs: [{ id: '__browser__:1', label: 'Browser', url: 'https://example.com' }],
        }}
        onTabsStateChange={vi.fn()}
        messages={[
          {
            ...assistantMessage('failed'),
            id: 'browser-delivery-failure',
            runStatus: 'succeeded',
            resultDeliveryState: 'delivery_failed',
            sessionMode: 'design',
            endedAt: 1_700_000_012_000,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('design-browser-panel')).toBeTruthy();
    expect(screen.queryByTestId('preview-run-status')).toBeNull();
  });

  it('keeps a delivered confirmation on the preview canvas after files arrive', () => {
    const now = 1_700_000_012_500;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('delivered-design.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['delivered-design.html'], active: 'delivered-design.html' }}
        onTabsStateChange={vi.fn()}
        messages={[
          {
            ...assistantMessage('failed'),
            id: 'delivery-succeeded',
            runStatus: 'succeeded',
            resultDeliveryState: 'delivered',
            sessionMode: 'design',
            startedAt: now - 4_000,
            endedAt: now - 1_000,
          },
        ]}
      />,
    );

    const previewStatus = screen.getByTestId('preview-run-status');
    expect(previewStatus).toHaveTextContent('Design ready');
    expect(previewStatus.closest('.ws-preview-run-status-slot')).not.toBeNull();
    expect(previewStatus.closest('[data-testid="design-files-empty"]')).toBeNull();
    expect(previewStatus).not.toHaveAttribute('aria-live');
    expect(within(previewStatus).getByRole('status')).toHaveTextContent('Design ready');
    expect(previewStatus.querySelector('[aria-hidden="true"]')).toHaveTextContent('Elapsed 0:03');
  });
});
