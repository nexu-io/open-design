// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import {
  DESIGN_FILES_TAB,
  FileWorkspace,
  settleManualEditFiles,
  scrollWorkspaceTabsWithWheel,
  settleManualEditExit,
} from '../../src/components/FileWorkspace';
import { publishChromeViewMode, resetChromeViewMode } from '../../src/components/workspace/chrome-view-mode';
import { REMIX_ICON_PATHS } from '../../src/components/remix-icon-paths';
import { ENABLE_BLANK_PAGE_WORKSPACE_ENTRYPOINT } from '../../src/components/workspace/tab-launcher';
import { I18nProvider } from '../../src/i18n';
import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import { projectSplitClassName, projectSplitStyle } from '../../src/components/ProjectView';
import {
  fetchProjectFileText,
  uploadProjectFiles,
  writeProjectTextFile,
  fetchProjectFolders,
} from '../../src/providers/registry';
import type { ChatMessage, OpenTabsState, ProjectFile, ProjectFolder } from '../../src/types';
import {
  CollabProvider,
  type CollabContextValue,
} from '../../src/collab/collab-context';
import { IframeKeepAliveProvider } from '../../src/components/IframeKeepAlivePool';
import { navigate } from '../../src/router';

describe('settleManualEditExit', () => {
  it.each([
    ['asynchronously', () => Promise.reject(new Error('save failed'))],
    ['synchronously', () => { throw new Error('save failed'); }],
  ])('treats an exit handler that rejects %s as an unsafe exit', async (_label, exit) => {
    await expect(settleManualEditExit(exit)).resolves.toBe(false);
  });

  it('settles every protected file instead of trusting only the active tab', async () => {
    const settle = vi.fn(async (fileName: string) => fileName !== 'offscreen.html');

    await expect(settleManualEditFiles(
      ['active.html', 'offscreen.html', 'offscreen.html'],
      settle,
    )).resolves.toBe(false);
    expect(settle.mock.calls.map(([fileName]) => fileName)).toEqual([
      'active.html',
      'offscreen.html',
    ]);
  });
});

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
const drawerCss = readFileSync(join(process.cwd(), 'src/styles/workspace/drawer.css'), 'utf8');

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
  window.history.replaceState(null, '', '/');
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

function teamContext(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: `team-${workspaceId}`,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
}

function collabValue(workspaceContext: WorkspaceCollabContext): CollabContextValue {
  return {
    workspaceContext,
    workspaceContextLoading: false,
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'allowed',
    isOwner: true,
    isEffectiveOwner: true,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => {},
    requestPublish: () => {},
    refreshPresence: () => {},
    checkStatusNow: () => {},
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

/**
 * What a tab is called. The strip is discrete — only the ACTIVE tab renders its
 * label as visible text (see workspace/TabLabel) — so identity lives on the
 * tooltip, which every tab carries whether it is open or collapsed.
 */
function tabName(tab: HTMLElement): string {
  return tab.getAttribute('title')?.trim() || (tab.textContent?.trim() ?? '');
}

function getTabByName(container: HTMLElement, name: RegExp): HTMLElement {
  const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
  const tab = tabs.find((node) => name.test(tabName(node)));
  if (!tab) throw new Error(`Could not find tab matching ${name}`);
  return tab;
}

/**
 * Open the tab launcher. The "+" that used to sit after the strip is gone
 * (per product), so ⌘T is the way in — the same handler the button called.
 */
function openTabLauncher() {
  // The handler listens on `window` in the capture phase.
  fireEvent.keyDown(window, { key: 't', metaKey: true });
}

function renderedTabLabels(): string[] {
  return screen.getAllByRole('tab').map(tabName);
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
    onUploadFiles: vi.fn(),
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
    // Once the quick switcher closes, the composer input returns to its resting
    // background (no longer the dimmed --bg-fill-tertiary isolation wash). The
    // #5517 restyle makes that resting fill a subtle color-mix tint of
    // --bg-panel/--bg-subtle, which resolves to white in the test theme.
    expect(getComputedStyle(composerInputWrap).background).toBe('rgb(255, 255, 255)');
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

    // Creation now lives in the tab strip's "+" launcher, not the empty state.
    openTabLauncher();
    fireEvent.click(screen.getByTestId('tab-launcher-action-new-sketch'));

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

  // PageCreator flows are unreachable while the 新建空白页面 launcher entry
  // is paused (see ENABLE_BLANK_PAGE_WORKSPACE_ENTRYPOINT); these suites
  // revive automatically when the switch flips back.
  it.skipIf(!ENABLE_BLANK_PAGE_WORKSPACE_ENTRYPOINT)('creates slide template pages without default speaker notes', async () => {
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

    openTabLauncher();
    fireEvent.click(screen.getByRole('button', { name: /New blank page/i }));
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

  // PageCreator flows are unreachable while the 新建空白页面 launcher entry
  // is paused (see ENABLE_BLANK_PAGE_WORKSPACE_ENTRYPOINT); these suites
  // revive automatically when the switch flips back.
  it.skipIf(!ENABLE_BLANK_PAGE_WORKSPACE_ENTRYPOINT)('localizes page creator content and saves template query as the first version prompt', async () => {
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

    openTabLauncher();
    fireEvent.click(screen.getByRole('button', { name: /新建空白页面/ }));

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

  // PageCreator flows are unreachable while the 新建空白页面 launcher entry
  // is paused (see ENABLE_BLANK_PAGE_WORKSPACE_ENTRYPOINT); these suites
  // revive automatically when the switch flips back.
  it.skipIf(!ENABLE_BLANK_PAGE_WORKSPACE_ENTRYPOINT)('hides blank cards and media category entries in the page creator dialog', async () => {
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

    openTabLauncher();
    fireEvent.click(screen.getByRole('button', { name: /New blank page/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Create page' });
    const dialogScope = within(dialog);
    expect(dialogScope.queryByText('New blank page')).toBeNull();
    expect(dialogScope.queryByRole('button', { name: /^Image\b/i })).toBeNull();
    expect(dialogScope.queryByRole('button', { name: /^Video\b/i })).toBeNull();
    expect(dialogScope.queryByRole('button', { name: /^Audio\b/i })).toBeNull();
  });

  it('reports an upload failure until dismissed, and opens a file on a single card click', async () => {
    mockedUploadProjectFiles.mockRejectedValueOnce(new Error('storage offline'));
    const onTabsStateChange = vi.fn();

    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[baseFile()]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={onTabsStateChange}
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

    fireEvent.click(screen.getByTestId('upload-error-dismiss'));
    expect(screen.queryByTestId('upload-error-banner')).toBeNull();

    // Images render as masonry cards; a single click on the thumb opens the
    // file in a workspace tab (there is no in-panel preview pane to land in).
    const row = screen.getByTestId('design-file-row-mock.png');
    const thumbButton = row.querySelector<HTMLButtonElement>('.df-card-thumb');
    if (!thumbButton) throw new Error('Could not find file thumb button');
    fireEvent.click(thumbButton);

    await waitFor(() =>
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ active: 'mock.png' }),
      ),
    );
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

  // 设计文件 browses the project's files full-pane: the strip of OPEN file tabs
  // over it, and the "+" beside them, were a second way to reach a file the
  // grid below already lists.
  it('takes the open-file strip and the "+" off the row on 设计文件', () => {
    render(
      <FileWorkspace
        projectId="project-hide"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html'], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const centre = () => document.querySelector('.ws-tabs-center')!;
    expect(centre().getAttribute('data-hide-tabs')).toBe('true');

    // The other views keep both: that is where open file tabs are the way around.
    fireEvent.click(screen.getByTestId('project-preview-tab'));
    expect(centre().getAttribute('data-hide-tabs')).toBeNull();
  });

  // The strip only ever shows what is OPEN. The "⌄" beside it is the way to
  // everything else without a detour out to 设计文件 and back.
  it('selects Preview when generation starts but respects later manual switching', async () => {
    const props = {
      projectId: 'generation-preview', projectKind: 'prototype' as const,
      files: [workspaceFile('index.html')], liveArtifacts: [],
      onRefreshFiles: vi.fn(), isDeck: false,
      tabsState: { tabs: ['index.html'], active: DESIGN_FILES_TAB },
      onTabsStateChange: vi.fn(),
    };
    const view = render(<FileWorkspace {...props} streaming={false} />);
    expect(screen.getByTestId('design-files-tab').getAttribute('aria-selected')).toBe('true');
    view.rerender(<FileWorkspace {...props} streaming />);
    await waitFor(() => expect(screen.getByTestId('project-preview-tab').getAttribute('aria-selected')).toBe('true'));
    fireEvent.click(screen.getByTestId('design-files-tab'));
    await waitFor(() => expect(screen.getByTestId('design-files-tab').getAttribute('aria-selected')).toBe('true'));
    view.rerender(<FileWorkspace {...props} streaming />);
    expect(screen.getByTestId('design-files-tab').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps Preview selected while the first written HTML is not listed yet', async () => {
    const props = {
      projectId: 'generation-pending-file', projectKind: 'prototype' as const,
      files: [], liveArtifacts: [], onRefreshFiles: vi.fn(), isDeck: false,
      tabsState: { tabs: [], active: DESIGN_FILES_TAB }, onTabsStateChange: vi.fn(),
    };
    const view = render(<FileWorkspace {...props} streaming />);
    view.rerender(<FileWorkspace {...props} streaming openRequest={{ name: 'index.html', nonce: 1 }} />);
    await waitFor(() => expect(screen.getByTestId('project-preview-tab').getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByTestId('project-preview-empty')).toBeTruthy();
  });

  it('keeps the live build surface when an agent write auto-opens its HTML route', async () => {
    const props = {
      projectId: 'generation-auto-open', projectKind: 'prototype' as const,
      files: [workspaceFile('index.html')], liveArtifacts: [],
      onRefreshFiles: vi.fn(), isDeck: false,
      tabsState: { tabs: ['index.html'], active: DESIGN_FILES_TAB },
      onTabsStateChange: vi.fn(),
    };
    const view = render(<FileWorkspace {...props} streaming />);
    view.rerender(<FileWorkspace {...props} streaming openRequest={{ name: 'index.html', nonce: 1 }} />);
    await waitFor(() => expect(screen.getByTestId('design-files-building')).toBeTruthy());
    expect(document.querySelector('[data-testid="retained-file-viewer"][aria-hidden="true"]')).toBeTruthy();
    fireEvent.click(screen.getByTestId('design-files-tab'));
    await waitFor(() => expect(screen.getByTestId('design-files-tab').getAttribute('aria-selected')).toBe('true'));
    view.rerender(<FileWorkspace {...props} streaming={false} openRequest={{ name: 'index.html', nonce: 2 }} />);
    await waitFor(() => expect(screen.queryByTestId('design-files-building')).toBeNull());
  });

  describe('all-project-files menu', () => {
    function renderRow(onTabsStateChange = vi.fn()) {
      render(
        <FileWorkspace
          projectId="project-pages-menu"
          projectKind="prototype"
          files={[
            workspaceFile('index.html'),
            workspaceFile('about.html'),
            workspaceFile('notes.txt'),
          ]}
          liveArtifacts={[]}
          onRefreshFiles={vi.fn()}
          isDeck={false}
          tabsState={{ tabs: ['index.html'], active: 'index.html' }}
          onTabsStateChange={onTabsStateChange}
        />,
      );
      return screen.getByTestId('workspace-pages-menu');
    }
    const options = () =>
      Array.from(document.querySelectorAll<HTMLElement>('.ws-pages-menu [role="option"]'));

    it('lists every project file, not just the open tabs', () => {
      fireEvent.click(renderRow());

      expect(options().map((row) => row.textContent)).toEqual([
        expect.stringContaining('index.html'),
        expect.stringContaining('about.html'),
        expect.stringContaining('notes.txt'),
      ]);
      // The one on screen is marked, so a long list still says where you are.
      expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
      expect(options()[1]!.getAttribute('aria-selected')).toBe('false');
    });

    it('opens the file you pick and closes behind itself', async () => {
      const onTabsStateChange = vi.fn();
      fireEvent.click(renderRow(onTabsStateChange));
      fireEvent.click(options().find((row) => row.textContent?.includes('about.html'))!);

      expect(document.querySelector('.ws-pages-menu')).toBeNull();
      // `openFile` waits on any in-flight manual edit before it commits.
      await waitFor(() =>
        expect(onTabsStateChange).toHaveBeenCalledWith(
          expect.objectContaining({
            tabs: ['index.html', 'about.html'],
            active: 'about.html',
          }),
        ),
      );
    });

    it('shows one selector rather than a strip of file tabs', async () => {
      const trigger = renderRow();
      expect(trigger.textContent).toContain('index.html');
      expect(document.querySelectorAll('.ws-tabs-bar [role="tab"]')).toHaveLength(0);
      fireEvent.click(trigger);
      fireEvent.click(options().find((row) => row.textContent?.includes('about.html'))!);
      await waitFor(() => expect(trigger.textContent).toContain('about.html'));
      expect(document.querySelectorAll('.ws-file-selector')).toHaveLength(1);
      expect(document.querySelectorAll('.ws-tabs-bar [role="tab"]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-app-chrome-tab-action]')).toHaveLength(1);
    });

    // Everything in the pill is a fixed box that cannot shrink — and neither
    // can `.ws-tab-anim`, because motion owns its width. So a tab still sized
    // for "name + close" does not clamp the name, it pushes the "⌄" out
    // through the pill's own rounded end.
    it('leaves the pill room for the controls instead of pushing them out', () => {
      expect(
        cssDeclarations(drawerCss, '.ws-tabs-bar .ws-tab:has(.ws-pages-switcher)'),
      ).toMatch(/max-width:\s*300px/);
      // The browser tab's fixed width has no room for either control.
      expect(
        cssDeclarations(drawerCss, '.ws-tabs-bar .ws-tab.browser-tab:has(.ws-pages-switcher)'),
      ).toMatch(/width:\s*auto/);
    });

    // `.ws-tab-add`'s 28px circle is sized against the 44px row; in a 30px
    // pill it fills the whole height and collides with the rounded end.
    it('wears the pill\'s icon box in a tab, not the row\'s', () => {
      const box = cssDeclarations(drawerCss, '.ws-tab > .ws-pages-switcher .ws-pages-trigger');
      expect(box).toMatch(/width:\s*18px/);
      expect(box).toMatch(/height:\s*18px/);
      // Right-anchored there: the trigger sits at the pill's right end, and a
      // 200–320px panel opening rightward from it runs off the row.
      expect(
        cssDeclarations(drawerCss, '.ws-tab > .ws-pages-switcher .ws-pages-menu'),
      ).toMatch(/right:\s*0/);
    });

    it('closes on Escape and on a press outside it', () => {
      const trigger = renderRow();

      fireEvent.click(trigger);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.querySelector('.ws-pages-menu')).toBeNull();

      fireEvent.click(trigger);
      fireEvent.pointerDown(document.body);
      expect(document.querySelector('.ws-pages-menu')).toBeNull();
    });

    it('leaves the row on 设计文件, where the pane below lists the same files', () => {
      expect(
        cssDeclarations(drawerCss, ".ws-tabs-center[data-hide-tabs='true'] > .ws-pages-switcher"),
      ).toMatch(/display:\s*none/);
    });

    // The overflow fade is an adjacent-sibling rule; inserting anything after
    // the strip silently moves the fade off whatever now abuts it.
    it('keeps the overflow fade on whichever control abuts the strip', () => {
      expect(
        cssDeclarations(drawerCss, '.ws-tabs-bar.is-overflowing + .ws-pages-switcher'),
      ).toMatch(/box-shadow/);
    });
  });

  it('hides them with layout, not opacity — and leaves the "+" its anchor box', () => {
    // The strip goes entirely; the "+" only goes invisible, because the
    // browser new-tab shortcut still opens the launcher from 设计文件 and the
    // popover anchors to that button's box.
    expect(
      cssDeclarations(drawerCss, ".ws-tabs-center[data-hide-tabs='true'] > .ws-tabs-bar"),
    ).toMatch(/display:\s*none/);
    expect(
      cssDeclarations(drawerCss, ".ws-tabs-center[data-hide-tabs='true'] > .ws-add-tab"),
    ).toMatch(/visibility:\s*hidden/);
  });

  // A page tab wears no glyph: its NAME is what tells the pages apart, and a
  // chain repeated down the strip only ate the width that name needs. `<>` is
  // the one exception — while 代码 is on, the markup IS what the tab shows.
  it("names a page tab instead of glyphing it, and shows `<>` only for 代码", () => {
    render(
      <FileWorkspace
        projectId="project-glyph"
        projectKind="prototype"
        files={[workspaceFile('index.html'), workspaceFile('about.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html', 'about.html'], active: 'index.html' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const tabOf = (name: string) =>
      getTabByName(document.body, new RegExp(name.replace('.', '\\.')));
    const glyphOf = (name: string) =>
      tabOf(name).querySelector('svg path')?.getAttribute('d') ?? '';
    const FILE_CODE = REMIX_ICON_PATHS['file-code-line']!;

    expect(tabOf('index.html').querySelector('.tab-icon')).toBeNull();
    // No glyph means the name is the only thing identifying the tab, so an
    // INACTIVE page tab carries it too rather than collapsing to an empty chip.
    expect(tabOf('about.html').querySelector('.tab-icon')).toBeNull();
    expect(tabOf('about.html').textContent).toContain('about.html');

    act(() => publishChromeViewMode('source'));

    expect(glyphOf('index.html')).toBe(FILE_CODE);
    // 代码 belongs to the tab you are ON: a background page tab is not the one
    // showing source, so it stays glyphless.
    expect(tabOf('about.html').querySelector('.tab-icon')).toBeNull();

    act(() => resetChromeViewMode());
    expect(tabOf('index.html').querySelector('.tab-icon')).toBeNull();
  });

  // 预览 / 代码 are one selection over whatever the row is showing, and the
  // viewport switcher (桌面端 / 平板 / 手机) only describes a rendered page.
  // So with a page open: 预览 reads as the selected view and the switcher sits
  // in its slot ahead of the file tabs; pick 代码 and the selection moves with
  // it while the switcher leaves the row entirely.
  it('selects 预览 while a page renders, and drops the viewport switcher for 代码', () => {
    render(
      <FileWorkspace
        projectId="project-view-pair"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html'], active: 'index.html' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const previewTab = screen.getByTestId('project-preview-tab');
    const codeTab = screen.getByTestId('workspace-code-tab');
    const viewportSlot = () => document.querySelector('.ws-tabs-lead-slot')!;

    expect(previewTab.getAttribute('aria-selected')).toBe('true');
    expect(codeTab.className).not.toContain('active');
    expect(viewportSlot().querySelector('.viewer-viewport-switcher')).toBeTruthy();

    fireEvent.click(codeTab);

    expect(previewTab.getAttribute('aria-selected')).toBe('false');
    expect(codeTab.className).toContain('active');
    // Empty, so `.ws-tabs-lead-slot:empty` collapses it and the tab strip sits
    // exactly where it does with nothing open. Reload is unaffected: it lives
    // in the file selector, not in this slot.
    expect(viewportSlot().childElementCount).toBe(0);
    expect(screen.getByRole('button', { name: /reload.*preview/i })).toBeTruthy();

    fireEvent.click(codeTab);

    expect(previewTab.getAttribute('aria-selected')).toBe('true');
    expect(viewportSlot().querySelector('.viewer-viewport-switcher')).toBeTruthy();
  });

  // Reload rides up into the ACTIVE page tab, ahead of its name: reloading is
  // done TO that page, and inside its own pill the two read as one thing
  // rather than as neighbours a row apart.
  it('puts Reload inside the active page tab, ahead of its name', () => {
    render(
      <FileWorkspace
        projectId="project-reload-row"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html'], active: 'index.html' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const tab = getTabByName(document.querySelector('.ws-tabs-bar')!, /index\.html/);
    expect(tab.querySelector('.ws-tab-action-slot .ws-tab-reload')).toBeTruthy();
    // Ahead of the name, in the glyph's place — and the all-files list rides
    // after it, between the name and the close button (the "+" it used to sit
    // beside, out after the strip, is gone).
    expect(Array.from(tab.children).map((el) => el.className)).toEqual([
      expect.stringContaining('ws-tab-action-slot'),
      expect.stringContaining('ws-tab-anim'),
      expect.stringContaining('ws-pages-switcher'),
      expect.stringContaining('ws-tab-close'),
    ]);
    // Moved, not copied — the preview toolbar below no longer carries it.
    expect(document.querySelector('.viewer-toolbar-left .ws-tab-reload')).toBeNull();
  });

  // A background page is not one you are reloading, and only one slot may
  // carry the id the viewer resolves against.
  it('gives the slot to the active tab only', () => {
    render(
      <FileWorkspace
        projectId="project-reload-one"
        projectKind="prototype"
        files={[workspaceFile('index.html'), workspaceFile('about.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html', 'about.html'], active: 'index.html' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(document.querySelectorAll('.ws-tab-action-slot')).toHaveLength(1);
    expect(
      getTabByName(document.querySelector('.ws-tabs-bar')!, /about\.html/)
        .querySelector('.ws-tab-action-slot'),
    ).toBeNull();
  });

  // `.icon-only`'s box lives under `.viewer-toolbar` in the viewer styles, so
  // a button portaled out of that toolbar arrives with no styling at all.
  it('gives the hoisted Reload a box that fits inside the pill', () => {
    const box = cssDeclarations(drawerCss, '.ws-tab-action-slot .ws-tab-reload');
    expect(box).toMatch(/width:\s*18px/);
    expect(box).toMatch(/height:\s*18px/);
    // Nothing to portal ⇒ the tab keeps exactly the box it had.
    expect(cssDeclarations(drawerCss, '.ws-tab-action-slot:empty')).toMatch(/display:\s*none/);
  });

  // The Preview tab is the entry page in the NORMAL viewer, chrome included:
  // Export / Share / version history / the comment and zoom bar are on
  // FileViewer's toolbar, and a preview without them is the one surface where
  // the page cannot be acted on.
  it('keeps an empty conversation preview clear of other project outputs', () => {
    render(<FileWorkspace projectId="empty-conversation" projectKind="prototype"
      files={[workspaceFile('index.html')]} liveArtifacts={[]} onRefreshFiles={vi.fn()} isDeck={false}
      tabsState={{ tabs: [], active: '__preview__' }} onTabsStateChange={vi.fn()}
      conversationPreviewFile={null} />);
    expect(screen.getByTestId('project-preview-empty')).toBeTruthy();
    expect(screen.queryByTestId('preview-tab-viewer')).toBeNull();
  });

  it('keeps the same Preview viewer when Edit protects an already-open file', async () => {
    mockedFetchProjectFileText.mockResolvedValue('<html><body><main>Preview</main></body></html>');
    render(
      <FileWorkspace
        projectId="preview-dock-switch"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html'], active: '__preview__' }}
        onTabsStateChange={vi.fn()}
      />,
    );
    const edit = await screen.findByTestId('manual-edit-mode-toggle');
    await waitFor(() => expect(edit).not.toBeDisabled());
    fireEvent.click(edit);
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle')).toBe(edit);
      expect(edit).toHaveAttribute('aria-pressed', 'true');
    });
    fireEvent.click(screen.getByTestId('canvas-dock-present-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle')).toBe(edit);
      expect(edit).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('canvas-dock-present-toggle')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('shows the entry page in the file viewer, not a bare frame', () => {
    render(
      <FileWorkspace
        projectId="project-preview"
        projectKind="prototype"
        files={[workspaceFile('index.html'), workspaceFile('notes.txt')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('project-preview-tab'));

    expect(screen.getByTestId('preview-tab-viewer')).toBeTruthy();
    // The chrome-less pane is what this replaces.
    expect(screen.queryByTestId('project-preview-frame')).toBeNull();
  });

  // While the run is writing that page the build preview owns the tab: it is
  // the same frame with a cursor on the line being written, which the plain
  // viewer cannot show.
  it('leaves the tab to the build preview while a run is writing', () => {
    render(
      <FileWorkspace
        projectId="project-preview"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        streaming
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('project-preview-tab'));

    expect(screen.queryByTestId('preview-tab-viewer')).toBeNull();
    expect(screen.getByTestId('project-preview')).toBeTruthy();
  });

  it('says there is nothing to preview before the project has a page', () => {
    render(
      <FileWorkspace
        projectId="project-preview"
        projectKind="prototype"
        files={[workspaceFile('notes.txt')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('project-preview-tab'));

    expect(screen.queryByTestId('preview-tab-viewer')).toBeNull();
    expect(screen.getByTestId('project-preview-empty')).toBeTruthy();
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

    // Folder rows live behind the Folders category tab (the default tab is
    // Pages whenever HTML files exist at the current level).
    fireEvent.click(screen.getByTestId('design-files-tab-folders'));
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

    // #5517: the breadcrumb root falls back to designFiles.crumbs ("Project")
    // instead of the removed workspace.allProjectFiles label.
    expect(container.querySelector('.df-breadcrumb-current')?.textContent).toBe('Project');
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
    // direction matches where the chat pane re-emerges from. It leads the
    // row's left zone (`.ws-tabs-lead`), ahead of the view switcher and — in
    // focus mode — the project tab strip's dock host (the strip portals into
    // it, see workspaceTabsDock.ts); the file tabs follow in the centre zone.
    expect(markup).toMatch(
      /<div class="ws-tabs-shell"><div class="ws-tabs-lead">\s*<button[^>]*data-testid="workspace-focus-toggle"[\s\S]*?<\/button>\s*(?:<div class="ws-tabs-project-dock"[^>]*><\/div>\s*)?<div[^>]*class="ws-tabs-views(?: [^"]+)?"/,
    );
    // …and the file-tab strip really is the centre zone, after that lead.
    // The viewport-switcher slot leads that centre zone (the open viewer
    // portals 桌面端/平板/手机 into it; empty and CSS-collapsed with nothing
    // open), so the tabs bar follows it.
    // `data-hide-tabs` rides on the centre zone: 设计文件 (the resting view
    // here) hides the open-file strip and the "+" through it.
    expect(markup).toMatch(
      /<\/div><div class="ws-tabs-center"[^>]*><div id="app-chrome-tab-lead" class="ws-tabs-lead-slot" data-app-chrome-tab-lead="true"><\/div><div class="ws-tabs-bar"/,
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
      /role="tablist"[\s\S]*data-testid="design-files-tab"[\s\S]*artifact\.html/,
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
  it('keeps the active HTML preview mounted across repeated Design Files round-trips', async () => {
    const file = workspaceFile('artifact.html');
    mockedFetchProjectFileText.mockResolvedValue('<html><body>artifact</body></html>');

    function Harness() {
      const [tabsState, setTabsState] = useState<OpenTabsState>({
        tabs: [file.name],
        active: file.name,
      });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={[file]}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={tabsState}
              onTabsStateChange={setTabsState}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    const { container } = render(<Harness />);
    await waitFor(() => {
      expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(1);
    });
    const firstFrame = screen.getByTestId('artifact-preview-frame');
    const retainedViewer = screen.getByTestId('retained-file-viewer');
    expect(retainedViewer.style.display).toBe('flex');

    for (let round = 0; round < 10; round += 1) {
      fireEvent.click(screen.getByTestId('design-files-tab'));
      expect(screen.getByTestId('retained-file-viewer')).toBe(retainedViewer);
      expect(retainedViewer.getAttribute('aria-hidden')).toBe('true');
      expect(retainedViewer.hasAttribute('inert')).toBe(true);
      expect(retainedViewer.hasAttribute('hidden')).toBe(false);
      expect(retainedViewer.style.display).toBe('flex');
      expect(retainedViewer.style.position).toBe('absolute');
      expect(retainedViewer.style.visibility).toBe('hidden');
      expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBeNull();

      fireEvent.click(screen.getByTestId('project-preview-tab'));
      expect(screen.getByTestId('artifact-preview-frame')).toBe(firstFrame);
      expect(screen.getByTestId('retained-file-viewer')).toBe(retainedViewer);
      expect(retainedViewer.style.display).toBe('flex');
      expect(retainedViewer.style.visibility).toBe('');
      expect(retainedViewer.hasAttribute('inert')).toBe(false);
    }

    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(1);
  });

  it('keeps warmed HTML preview frames connected while switching between files', async () => {
    const alpha = workspaceFile('alpha.html');
    const beta = workspaceFile('beta.html');
    mockedFetchProjectFileText.mockImplementation(async (_projectId, fileName) => (
      `<html><body>${fileName}</body></html>`
    ));

    function Harness() {
      const [tabsState, setTabsState] = useState<OpenTabsState>({
        tabs: [alpha.name, beta.name],
        active: alpha.name,
      });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={[alpha, beta]}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={tabsState}
              onTabsStateChange={setTabsState}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    const { container } = render(<Harness />);
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(1));
    const alphaFrame = screen.getByTestId('artifact-preview-frame');

    fireEvent.click(screen.getByRole('tab', { name: /beta\.html/i }));
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(2));
    const betaFrame = screen.getByTestId('artifact-preview-frame');
    expect(betaFrame).not.toBe(alphaFrame);
    expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBeNull();
    expect(document.body.contains(alphaFrame)).toBe(true);
    const retainedAfterBeta = screen.getAllByTestId('retained-file-viewer');
    expect(retainedAfterBeta.map((viewer) => viewer.getAttribute('data-file-name'))).toEqual([
      alpha.name,
      beta.name,
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /alpha\.html/i }));
    expect(screen.getByTestId('artifact-preview-frame')).toBe(alphaFrame);
    expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBeNull();
    expect(document.body.contains(betaFrame)).toBe(true);
    expect(screen.getAllByTestId('retained-file-viewer')).toEqual(retainedAfterBeta);
    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(2);
  });

  it('evicts the fourth HTML tab without reattaching the three surviving preview frames', async () => {
    const files = ['alpha.html', 'beta.html', 'gamma.html', 'delta.html'].map(workspaceFile);
    mockedFetchProjectFileText.mockImplementation(async (_projectId, fileName) => (
      `<html><body>${fileName}</body></html>`
    ));

    function Harness() {
      const [tabsState, setTabsState] = useState<OpenTabsState>({
        tabs: files.map((file) => file.name),
        active: 'alpha.html',
      });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={files}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={tabsState}
              onTabsStateChange={setTabsState}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: /beta\.html/i }));
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('tab', { name: /gamma\.html/i }));
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(3));
    const survivingFrames = ['beta.html', 'gamma.html'].map((name) => (
      document.querySelector(`iframe[title="${name}"][data-od-render-mode="url-load"]`)
    ));
    expect(survivingFrames.every(Boolean)).toBe(true);
    const appendSpy = vi.spyOn(Node.prototype, 'appendChild');

    fireEvent.click(screen.getByRole('tab', { name: /delta\.html/i }));
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(document.querySelector('iframe[title="alpha.html"]')).toBeNull());

    for (const [index, name] of ['beta.html', 'gamma.html'].entries()) {
      const frame = survivingFrames[index];
      expect(document.querySelector(
        `iframe[title="${name}"][data-od-render-mode="url-load"]`,
      )).toBe(frame);
      expect(appendSpy.mock.calls.filter(([node]) => node === frame)).toHaveLength(0);
    }
  });

  it('deletes the active HTML viewer without reattaching a surviving warm iframe', async () => {
    const alpha = workspaceFile('alpha.html');
    const beta = workspaceFile('beta.html');
    mockedFetchProjectFileText.mockImplementation(async (_projectId, fileName) => (
      `<html><body>${fileName}</body></html>`
    ));

    function Harness({ files, generation }: { files: ProjectFile[]; generation: number }) {
      const [tabsState, setTabsState] = useState<OpenTabsState>({
        tabs: [alpha.name, beta.name],
        active: alpha.name,
      });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={files}
              filesGeneration={generation}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={tabsState}
              onTabsStateChange={setTabsState}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    const { rerender } = render(<Harness files={[alpha, beta]} generation={1} />);
    await waitFor(() => expect(document.querySelector(
      'iframe[title="alpha.html"][data-od-render-mode="url-load"]',
    )).not.toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: /beta\.html/i }));
    await waitFor(() => expect(document.querySelector(
      'iframe[title="alpha.html"][data-od-render-mode="url-load"]',
    )).not.toBeNull());
    const alphaFrame = document.querySelector(
      'iframe[title="alpha.html"][data-od-render-mode="url-load"]',
    );
    expect(alphaFrame).not.toBeNull();
    const readsBeforeDelete = mockedFetchProjectFileText.mock.calls.length;
    const appendSpy = vi.spyOn(Node.prototype, 'appendChild');

    rerender(<Harness files={[alpha]} generation={2} />);

    await waitFor(() => expect(document.querySelector('iframe[title="beta.html"]')).toBeNull());
    expect(document.querySelector(
      'iframe[title="alpha.html"][data-od-render-mode="url-load"]',
    )).toBe(alphaFrame);
    expect(appendSpy.mock.calls.filter(([node]) => node === alphaFrame)).toHaveLength(0);
    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(readsBeforeDelete);
  });

  it('keeps warmed HTML preview frames through equivalent context refreshes and transient empty file snapshots', async () => {
    const alphaName = 'alpha.html';
    const betaName = 'beta.html';
    mockedFetchProjectFileText.mockImplementation(async (_projectId, fileName) => (
      `<html><body>${fileName}</body></html>`
    ));

    function Harness({
      active,
      files,
      tabs,
      workspaceContext,
      filesRefreshKey = 0,
    }: {
      active: string;
      files: ProjectFile[];
      tabs: string[];
      workspaceContext: WorkspaceCollabContext;
      filesRefreshKey?: number;
    }) {
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(workspaceContext)}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={files}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={{ tabs, active }}
              onTabsStateChange={vi.fn()}
              filesRefreshKey={filesRefreshKey}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    const workspaceContext = teamContext('workspace-a', 'member-a');
    const { rerender } = render(
      <Harness
        active={alphaName}
        files={[workspaceFile(alphaName), workspaceFile(betaName)]}
        tabs={[alphaName, betaName]}
        workspaceContext={workspaceContext}
      />,
    );
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(1));
    const alphaFrame = screen.getByTestId('artifact-preview-frame');

    rerender(
      <Harness
        active={betaName}
        files={[workspaceFile(alphaName), workspaceFile(betaName)]}
        tabs={[alphaName, betaName]}
        workspaceContext={{ ...workspaceContext }}
      />,
    );
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(2));
    const betaFrame = screen.getByTestId('artifact-preview-frame');

    // Ambient workspace refreshes can briefly publish an empty file snapshot.
    // Open tabs are the durable witness that these files were not closed or
    // deleted, so both warmed iframe nodes must stay connected through it.
    rerender(
      <Harness
        active={betaName}
        files={[]}
        tabs={[alphaName, betaName]}
        workspaceContext={{ ...workspaceContext }}
      />,
    );
    expect(document.body.contains(alphaFrame)).toBe(true);
    expect(document.body.contains(betaFrame)).toBe(true);
    expect(alphaFrame.closest('[data-testid="retained-file-viewer"]')).not.toBeNull();
    expect(betaFrame.closest('[data-testid="retained-file-viewer"]')).not.toBeNull();
    expect(document.querySelector('.iframe-keep-alive-pool iframe')).toBeNull();

    rerender(
      <Harness
        active={alphaName}
        files={[workspaceFile(alphaName), workspaceFile(betaName)]}
        tabs={[alphaName, betaName]}
        workspaceContext={{ ...workspaceContext }}
      />,
    );
    expect(screen.getByTestId('artifact-preview-frame')).toBe(alphaFrame);
    expect(document.body.contains(betaFrame)).toBe(true);
    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(2);

    // Removing a tab is an explicit permanent close/delete witness and must
    // still evict that viewer rather than retaining it forever.
    rerender(
      <Harness
        active={alphaName}
        files={[workspaceFile(alphaName), workspaceFile(betaName)]}
        tabs={[alphaName]}
        workspaceContext={{ ...workspaceContext }}
      />,
    );
    await waitFor(() => expect(document.querySelector('iframe[title="beta.html"]')).toBeNull());
    expect(screen.getByTestId('artifact-preview-frame')).toBe(alphaFrame);
  });

  it('evicts a deleted HTML viewer after a committed file refresh even when its tab persists', async () => {
    const alphaName = 'alpha.html';
    const betaName = 'beta.html';
    const workspaceContext = teamContext('workspace-a', 'member-a');
    const tabs = [alphaName, betaName];

    function Harness({ files, refreshKey }: { files: ProjectFile[]; refreshKey: number }) {
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(workspaceContext)}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={files}
              filesRefreshKey={refreshKey}
              filesGeneration={refreshKey}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={{ tabs, active: alphaName }}
              onTabsStateChange={vi.fn()}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    const initialFiles = [workspaceFile(alphaName), workspaceFile(betaName)];
    const { rerender } = render(
      <Harness files={initialFiles} refreshKey={0} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /beta\.html/i }));
    await waitFor(() => expect(document.querySelector('iframe[title="beta.html"]')).not.toBeNull());
    const betaFrame = document.querySelector('iframe[title="beta.html"]');

    // Authorization-scoped keep-alive keys append metadata after `beta.html:`.
    // A committed refresh that still contains the file must retain that frame.
    rerender(<Harness files={initialFiles} refreshKey={1} />);
    await waitFor(() => expect(document.querySelector('iframe[title="beta.html"]')).toBe(betaFrame));
    fireEvent.click(screen.getByRole('tab', { name: /alpha\.html/i }));

    rerender(<Harness files={[workspaceFile(alphaName)]} refreshKey={2} />);

    await waitFor(() => expect(document.querySelector('iframe[title="beta.html"]')).toBeNull());
    expect(screen.getByTestId('artifact-preview-frame').getAttribute('title')).toBe(alphaName);
  });

  describe('protected viewer deletion revalidation', () => {
    const fileName = 'page.html';
    const initialFiles = [workspaceFile(fileName)];

    function Harness({
      revalidatedFiles,
      onFresh,
      freshFailure = null,
      acceptedGeneration = 3,
      committedGeneration = acceptedGeneration,
    }: {
      revalidatedFiles: ProjectFile[];
      onFresh: (options?: { fresh?: boolean }) => void;
      freshFailure?: 'throw' | 'null' | null;
      acceptedGeneration?: number;
      committedGeneration?: number;
    }) {
      const [snapshot, setSnapshot] = useState({ files: initialFiles, generation: 1 });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <button
              type="button"
              data-testid="commit-r1-missing"
              onClick={() => setSnapshot({ files: [], generation: 2 })}
            >
              delete witness
            </button>
            <button
              type="button"
              data-testid="commit-later-missing"
              onClick={() => setSnapshot({ files: [], generation: 4 })}
            >
              later missing witness
            </button>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={snapshot.files}
              filesRefreshKey={7}
              filesGeneration={snapshot.generation}
              liveArtifacts={[]}
              onRefreshFiles={async (options) => {
                onFresh(options);
                if (options?.fresh) {
                  if (freshFailure === 'throw') throw new Error('fresh read failed');
                  if (freshFailure === 'null') return { acceptedGeneration: null };
                  setSnapshot({ files: revalidatedFiles, generation: committedGeneration });
                  return { acceptedGeneration };
                }
                return { acceptedGeneration: null };
              }}
              isDeck={false}
              tabsState={{ tabs: [fileName], active: fileName }}
              onTabsStateChange={vi.fn()}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    async function enterManualEdit() {
      const toggle = await screen.findByTestId('manual-edit-mode-toggle');
      fireEvent.click(toggle);
      await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'));
      await waitFor(() => {
        expect(screen.getByTestId('artifact-preview-frame').getAttribute('data-od-render-mode')).toBe('srcdoc');
      });
      return toggle;
    }

    it('purges a protected no-op editor only after the fresh R2 still reports it missing', async () => {
      mockedFetchProjectFileText.mockResolvedValue('<html><body>Page</body></html>');
      const onFresh = vi.fn();
      render(<Harness revalidatedFiles={[]} onFresh={onFresh} />);
      await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame');

      fireEvent.click(screen.getByTestId('commit-r1-missing'));

      await waitFor(() => expect(onFresh).toHaveBeenCalledWith({ fresh: true }));
      await waitFor(() => expect(document.body.contains(frame)).toBe(false));
    });

    it('keeps a successfully saved viewer when fresh R2 recreates it at the same refresh key', async () => {
      const initialSource = '<html><body><p data-od-id="copy">Copy</p></body></html>';
      mockedFetchProjectFileText.mockResolvedValue(initialSource);
      let writes = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/projects/project-1/files') && init?.method === 'POST') {
          writes += 1;
          return new Response(JSON.stringify({ file: workspaceFile(fileName) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/versions')) {
          return new Response(JSON.stringify({ versions: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/raw/page.html')) return new Response(initialSource, { status: 200 });
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
      vi.stubGlobal('fetch', fetchMock);
      const onFresh = vi.fn();
      render(<Harness revalidatedFiles={initialFiles} onFresh={onFresh} />);
      await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            type: 'od-edit-drag-commit',
            id: 'copy',
            transform: 'translate(12px, 8px)',
            display: 'block',
          },
        }));
      });

      fireEvent.click(screen.getByTestId('commit-r1-missing'));

      await waitFor(() => expect(writes).toBe(1));
      await waitFor(() => expect(onFresh).toHaveBeenCalledWith({ fresh: true }));
      expect(document.body.contains(frame)).toBe(true);
    });

    it('does not let the save-triggered ordinary refresh adjudicate deletion before fresh R2 completes', async () => {
      const initialSource = '<html><body><p data-od-id="copy">Copy</p></body></html>';
      mockedFetchProjectFileText.mockResolvedValue(initialSource);
      let resolveFresh!: () => void;
      const freshGate = new Promise<void>((resolve) => { resolveFresh = resolve; });
      const refreshCalls = vi.fn();

      function RacingHarness() {
        const [snapshot, setSnapshot] = useState({ files: initialFiles, generation: 1 });
        return (
          <IframeKeepAliveProvider>
            <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
              <button
                type="button"
                data-testid="commit-racing-r1-missing"
                onClick={() => setSnapshot({ files: [], generation: 2 })}
              >
                delete witness
              </button>
              <FileWorkspace
                projectId="project-1"
                projectKind="prototype"
                files={snapshot.files}
                filesRefreshKey={7}
                filesGeneration={snapshot.generation}
                liveArtifacts={[]}
                onRefreshFiles={async (options) => {
                  refreshCalls(options);
                  if (!options?.fresh) {
                    // applyManualEdit -> onFileSaved performs this cached
                    // refresh before safeExit resolves.
                    setSnapshot({ files: [], generation: 3 });
                    return { acceptedGeneration: 3 };
                  }
                  await freshGate;
                  setSnapshot({ files: initialFiles, generation: 4 });
                  return { acceptedGeneration: 4 };
                }}
                isDeck={false}
                tabsState={{ tabs: [fileName], active: fileName }}
                onTabsStateChange={vi.fn()}
              />
            </CollabProvider>
          </IframeKeepAliveProvider>
        );
      }

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/projects/project-1/files') && init?.method === 'POST') {
          return new Response(JSON.stringify({ file: workspaceFile(fileName) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/versions')) {
          return new Response(JSON.stringify({ versions: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/raw/page.html')) return new Response(initialSource, { status: 200 });
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<RacingHarness />);
      await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            type: 'od-edit-drag-commit',
            id: 'copy',
            transform: 'translate(12px, 8px)',
            display: 'block',
          },
        }));
      });

      fireEvent.click(screen.getByTestId('commit-racing-r1-missing'));

      await waitFor(() => expect(refreshCalls).toHaveBeenCalledWith(undefined));
      await waitFor(() => expect(refreshCalls).toHaveBeenCalledWith({ fresh: true }));
      expect(document.body.contains(frame)).toBe(true);

      await act(async () => { resolveFresh(); });
      await waitFor(() => expect(document.body.contains(frame)).toBe(true));
    });

    function FailedR2Harness({
      mode,
      ordinaryGate,
      freshGate,
      onRefresh,
    }: {
      mode: 'throw' | 'null';
      ordinaryGate: Promise<void>;
      freshGate: Promise<void>;
      onRefresh: (options?: { fresh?: boolean }) => void;
    }) {
      const [snapshot, setSnapshot] = useState({ files: initialFiles, generation: 1 });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <output data-testid="failed-r2-generation">{snapshot.generation}</output>
            <button
              type="button"
              data-testid="failed-r2-r1-missing"
              onClick={() => setSnapshot({ files: [], generation: 2 })}
            >
              R1 missing
            </button>
            <button
              type="button"
              data-testid="failed-r2-later-missing"
              onClick={() => setSnapshot({ files: [], generation: 4 })}
            >
              later missing
            </button>
            <button
              type="button"
              data-testid="failed-r2-later-present"
              onClick={() => setSnapshot({ files: initialFiles, generation: 4 })}
            >
              later present
            </button>
            <button
              type="button"
              data-testid="failed-r2-after-present-missing"
              onClick={() => setSnapshot({ files: [], generation: 5 })}
            >
              after present missing
            </button>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={snapshot.files}
              filesRefreshKey={7}
              filesGeneration={snapshot.generation}
              liveArtifacts={[]}
              onRefreshFiles={async (options) => {
                onRefresh(options);
                if (!options?.fresh) {
                  setSnapshot({ files: [], generation: 3 });
                  await ordinaryGate;
                  return { acceptedGeneration: 3 };
                }
                await freshGate;
                if (mode === 'throw') throw new Error('fresh read failed');
                return { acceptedGeneration: null };
              }}
              isDeck={false}
              tabsState={{ tabs: [fileName], active: fileName }}
              onTabsStateChange={vi.fn()}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    function stubManualEditSave(source: string) {
      mockedFetchProjectFileText.mockResolvedValue(source);
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/projects/project-1/files') && init?.method === 'POST') {
          return new Response(JSON.stringify({ file: workspaceFile(fileName) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/versions')) {
          return new Response(JSON.stringify({ versions: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/raw/page.html')) return new Response(source, { status: 200 });
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }));
    }

    async function dirtyActiveViewer(frame: HTMLIFrameElement) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            type: 'od-edit-drag-commit',
            id: 'copy',
            transform: 'translate(12px, 8px)',
            display: 'block',
          },
        }));
      });
    }

    it('waits beyond the pre-R2 save generation before a failed R2 can purge', async () => {
      const source = '<html><body><p data-od-id="copy">Copy</p></body></html>';
      stubManualEditSave(source);
      let resolveOrdinary!: () => void;
      const ordinaryGate = new Promise<void>((resolve) => { resolveOrdinary = resolve; });
      const onRefresh = vi.fn();
      render(
        <FailedR2Harness
          mode="throw"
          ordinaryGate={ordinaryGate}
          freshGate={Promise.resolve()}
          onRefresh={onRefresh}
        />,
      );
      await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      await dirtyActiveViewer(frame);
      fireEvent.click(screen.getByTestId('failed-r2-r1-missing'));

      await waitFor(() => expect(screen.getByTestId('failed-r2-generation').textContent).toBe('3'));
      await act(async () => { resolveOrdinary(); });
      await waitFor(() => expect(onRefresh).toHaveBeenCalledWith({ fresh: true }));
      expect(document.body.contains(frame)).toBe(true);

      fireEvent.click(screen.getByTestId('failed-r2-later-missing'));
      await waitFor(() => expect(document.body.contains(frame)).toBe(false));
    });

    it('uses a later missing generation that overtakes an in-flight null R2', async () => {
      const source = '<html><body><p data-od-id="copy">Copy</p></body></html>';
      stubManualEditSave(source);
      let resolveOrdinary!: () => void;
      let resolveFresh!: () => void;
      const ordinaryGate = new Promise<void>((resolve) => { resolveOrdinary = resolve; });
      const freshGate = new Promise<void>((resolve) => { resolveFresh = resolve; });
      const onRefresh = vi.fn();
      render(
        <FailedR2Harness
          mode="null"
          ordinaryGate={ordinaryGate}
          freshGate={freshGate}
          onRefresh={onRefresh}
        />,
      );
      await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      await dirtyActiveViewer(frame);
      fireEvent.click(screen.getByTestId('failed-r2-r1-missing'));

      await waitFor(() => expect(screen.getByTestId('failed-r2-generation').textContent).toBe('3'));
      await act(async () => { resolveOrdinary(); });
      await waitFor(() => expect(onRefresh).toHaveBeenCalledWith({ fresh: true }));
      fireEvent.click(screen.getByTestId('failed-r2-later-missing'));
      expect(document.body.contains(frame)).toBe(true);

      await act(async () => { resolveFresh(); });
      await waitFor(() => expect(document.body.contains(frame)).toBe(false));
    });

    it('clears a failed R2 decision when a later generation contains the file', async () => {
      const source = '<html><body><p data-od-id="copy">Copy</p></body></html>';
      stubManualEditSave(source);
      let resolveOrdinary!: () => void;
      let resolveFresh!: () => void;
      const ordinaryGate = new Promise<void>((resolve) => { resolveOrdinary = resolve; });
      const freshGate = new Promise<void>((resolve) => { resolveFresh = resolve; });
      const onRefresh = vi.fn();
      render(
        <FailedR2Harness
          mode="null"
          ordinaryGate={ordinaryGate}
          freshGate={freshGate}
          onRefresh={onRefresh}
        />,
      );
      await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      await dirtyActiveViewer(frame);
      fireEvent.click(screen.getByTestId('failed-r2-r1-missing'));

      await waitFor(() => expect(screen.getByTestId('failed-r2-generation').textContent).toBe('3'));
      await act(async () => { resolveOrdinary(); });
      await waitFor(() => expect(onRefresh).toHaveBeenCalledWith({ fresh: true }));
      fireEvent.click(screen.getByTestId('failed-r2-later-present'));
      await act(async () => { resolveFresh(); });
      await waitFor(() => expect(document.body.contains(frame)).toBe(true));

      fireEvent.click(screen.getByTestId('failed-r2-after-present-missing'));
      await waitFor(() => expect(document.body.contains(frame)).toBe(false));
    });

    it('purges when a later accepted missing snapshot overtakes the accepted fresh R2 generation', async () => {
      mockedFetchProjectFileText.mockResolvedValue('<html><body>Page</body></html>');
      const onFresh = vi.fn();
      render(
        <Harness
          revalidatedFiles={[]}
          onFresh={onFresh}
          acceptedGeneration={3}
          committedGeneration={4}
        />,
      );
      await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame');

      fireEvent.click(screen.getByTestId('commit-r1-missing'));

      await waitFor(() => expect(onFresh).toHaveBeenCalledWith({ fresh: true }));
      await waitFor(() => expect(document.body.contains(frame)).toBe(false));
    });

    it('retains the protected viewer and skips R2 when its dirty flush fails', async () => {
      const initialSource = '<html><body><p data-od-id="copy">Copy</p></body></html>';
      mockedFetchProjectFileText.mockResolvedValue(initialSource);
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/projects/project-1/files') && init?.method === 'POST') {
          return new Response(JSON.stringify({ error: { message: 'conflict' } }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/versions')) {
          return new Response(JSON.stringify({ versions: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/raw/page.html')) return new Response(initialSource, { status: 200 });
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
      vi.stubGlobal('fetch', fetchMock);
      const onFresh = vi.fn();
      render(<Harness revalidatedFiles={[]} onFresh={onFresh} />);
      const toggle = await enterManualEdit();
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            type: 'od-edit-drag-commit',
            id: 'copy',
            transform: 'translate(12px, 8px)',
            display: 'block',
          },
        }));
      });

      fireEvent.click(screen.getByTestId('commit-r1-missing'));

      await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
      expect(onFresh).not.toHaveBeenCalledWith({ fresh: true });
      expect(document.body.contains(frame)).toBe(true);
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('keeps manual-edit viewers within the hard cap by flushing before each tab switch', async () => {
    const files = ['alpha.html', 'beta.html', 'gamma.html', 'delta.html'].map(workspaceFile);
    mockedFetchProjectFileText.mockImplementation(async (_projectId, fileName) => (
      `<html><body><p data-od-id="copy">${fileName}</p></body></html>`
    ));

    function Harness() {
      const [tabsState, setTabsState] = useState<OpenTabsState>({
        tabs: files.map((file) => file.name),
        active: files[0]!.name,
      });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={files}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={tabsState}
              onTabsStateChange={setTabsState}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    render(<Harness />);
    for (let index = 0; index < files.length; index += 1) {
      const currentName = files[index]!.name;
      await waitFor(() => {
        expect(screen.getByTestId('artifact-preview-frame').getAttribute('title')).toBe(currentName);
      });
      const activeViewer = document.querySelector<HTMLElement>(
        `[data-testid="retained-file-viewer"][data-file-name="${currentName}"]`,
      );
      expect(activeViewer).not.toBeNull();
      const editToggle = within(activeViewer!).getByTestId('manual-edit-mode-toggle');
      fireEvent.click(editToggle);
      await waitFor(() => {
        expect(editToggle.getAttribute('aria-pressed')).toBe('true');
      });
      if (index < files.length - 1) {
        const nextName = files[index + 1]!.name;
        fireEvent.click(screen.getByRole('tab', { name: new RegExp(nextName.replace('.', '\\.')) }));
        await waitFor(() => {
          expect(screen.getByTestId('artifact-preview-frame').getAttribute('title')).toBe(nextName);
        });
      }
      expect(screen.getAllByTestId('retained-file-viewer').length).toBeLessThanOrEqual(3);
    }

    expect(document.querySelector('iframe[title="alpha.html"]')).toBeNull();
    expect(screen.getAllByTestId('manual-edit-mode-toggle').length).toBeLessThanOrEqual(3);
    expect(screen.getAllByTestId('manual-edit-mode-toggle').filter(
      (toggle) => toggle.getAttribute('aria-pressed') === 'true',
    )).toHaveLength(1);
  });

  it('waits for the active inline edit before navigating away from the project', async () => {
    const alpha = workspaceFile('alpha.html');
    mockedFetchProjectFileText.mockResolvedValue(
      '<html><body><p data-od-id="copy">alpha.html</p></body></html>',
    );
    window.history.replaceState(null, '', '/projects/project-1');

    render(
      <IframeKeepAliveProvider>
        <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
          <FileWorkspace
            projectId="project-1"
            projectKind="prototype"
            files={[alpha]}
            liveArtifacts={[]}
            onRefreshFiles={vi.fn()}
            isDeck={false}
            tabsState={{ tabs: [alpha.name], active: alpha.name }}
            onTabsStateChange={vi.fn()}
          />
        </CollabProvider>
      </IframeKeepAliveProvider>,
    );

    const toggle = await screen.findByTestId('manual-edit-mode-toggle');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'));
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        data: { type: 'od-edit-text-session', id: 'copy', active: true },
      }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBe(false);
    expect(beforeUnload.defaultPrevented).toBe(true);

    navigate({ kind: 'home', view: 'projects' });
    expect(window.location.pathname).toBe('/projects/project-1');

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          type: 'od-edit-text-session',
          id: 'copy',
          active: false,
          committed: true,
          changed: false,
        },
      }));
    });
    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('evicts the previous project preview pool when the workspace changes', async () => {
    const workspaceContext = teamContext('workspace-a', 'member-a');
    function Harness({ projectId, fileName }: { projectId: string; fileName: string }) {
      const file = workspaceFile(fileName);
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(workspaceContext)}>
            <FileWorkspace
              projectId={projectId}
              projectKind="prototype"
              files={[file]}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={{ tabs: [fileName], active: fileName }}
              onTabsStateChange={vi.fn()}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    const { rerender } = render(<Harness projectId="project-1" fileName="old.html" />);
    await waitFor(() => expect(document.querySelector('iframe[title="old.html"]')).not.toBeNull());
    const oldFrame = document.querySelector('iframe[title="old.html"]');

    rerender(<Harness projectId="project-2" fileName="new.html" />);

    await waitFor(() => expect(document.querySelector('iframe[title="new.html"]')).not.toBeNull());
    expect(document.body.contains(oldFrame)).toBe(false);
    expect(document.querySelector('.iframe-keep-alive-pool iframe[title="old.html"]')).toBeNull();
  });

  it('evicts the least-recently-used HTML viewer after the fourth warm tab', async () => {
    const files = ['alpha.html', 'beta.html', 'gamma.html', 'delta.html'].map(workspaceFile);
    mockedFetchProjectFileText.mockImplementation(async (_projectId, fileName) => (
      `<html><body>${fileName}</body></html>`
    ));

    function Harness() {
      const [tabsState, setTabsState] = useState<OpenTabsState>({
        tabs: files.map((file) => file.name),
        active: files[0]!.name,
      });
      return (
        <IframeKeepAliveProvider>
          <CollabProvider value={collabValue(teamContext('workspace-a', 'member-a'))}>
            <FileWorkspace
              projectId="project-1"
              projectKind="prototype"
              files={files}
              liveArtifacts={[]}
              onRefreshFiles={vi.fn()}
              isDeck={false}
              tabsState={tabsState}
              onTabsStateChange={setTabsState}
            />
          </CollabProvider>
        </IframeKeepAliveProvider>
      );
    }

    render(<Harness />);
    for (const name of files.slice(1).map((file) => file.name)) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(name.replace('.', '\\.')) }));
      await waitFor(() => expect(screen.getByTestId('artifact-preview-frame').getAttribute('title')).toBe(name));
    }
    await waitFor(() => {
      expect(screen.getAllByTestId('retained-file-viewer').map((viewer) => viewer.getAttribute('data-file-name')))
        .toEqual(['beta.html', 'gamma.html', 'delta.html']);
    });
    expect(document.querySelector('iframe[title="alpha.html"]')).toBeNull();
    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(4);

    fireEvent.click(screen.getByRole('tab', { name: /alpha\.html/i }));
    await waitFor(() => expect(screen.getByTestId('artifact-preview-frame').getAttribute('title')).toBe('alpha.html'));
    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(5);
    await waitFor(() => {
      expect(screen.getAllByTestId('retained-file-viewer').map((viewer) => viewer.getAttribute('data-file-name')))
        .toEqual(['alpha.html', 'gamma.html', 'delta.html']);
    });
  });

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

  // The Preview tab is the project as it LOOKS; Design Files is what it is made
  // of. Clicking Preview swaps the pane without touching the open file tabs.
  // Discrete strip: the active tab carries its label, the rest hold their icon
  // alone (workspace/TabLabel animates the width between the two). Every tab
  // still names itself through its tooltip, which is what a collapsed one has.
  it('shows the label on the active tab only, and names the rest by tooltip', () => {
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

    const preview = screen.getByTestId('project-preview-tab');
    const designFiles = screen.getByTestId('design-files-tab');
    expect(designFiles.getAttribute('aria-selected')).toBe('true');
    expect(designFiles.textContent).toContain('Design Files');
    expect(preview.textContent?.trim()).toBe('');
    expect(preview.getAttribute('title')).toBe('Preview');

    fireEvent.click(preview);

    expect(preview.textContent).toContain('Preview');
    expect(designFiles.textContent?.trim()).toBe('');
    expect(designFiles.getAttribute('title')).toContain('Design Files');
  });

  it('opens the project preview from its own root tab', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[
          {
            name: 'index.html',
            size: 1200,
            mtime: 1_756_000_000_123,
            kind: 'html',
            mime: 'text/html',
          } as never,
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('project-preview-tab'));

    // With a page on disk and no run in flight the pane mounts the real
    // viewer for it; ProjectPreviewPane covers the other two states (no page
    // yet, and a run writing one) — see its own tests.
    expect(screen.getByTestId('preview-tab-viewer')).toBeTruthy();
    expect(screen.queryByTestId('design-files-empty')).toBeNull();
    expect(screen.getByTestId('project-preview-tab').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('design-files-tab').getAttribute('aria-selected')).toBe('false');
  });

  // Landing on 预览 used to leave the strip naming every surface except the
  // one on screen: the entry page was being previewed with no tab of its own,
  // and only opening the file yourself put its chip there.
  it('names the previewed entry page in the tab strip without opening it', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('index.html'), workspaceFile('about.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const tabsBar = () => document.querySelector<HTMLElement>('.ws-tabs-bar')!;
    expect(tabsBar().querySelectorAll('[role="tab"]').length).toBe(0);

    fireEvent.click(screen.getByTestId('project-preview-tab'));

    const entryTab = getTabByName(tabsBar(), /index\.html/);
    expect(entryTab.className).toContain('active');
    expect(entryTab.textContent).toContain('index.html');
    // It is what 预览 IS, not an opened tab, so there is nothing to close…
    expect(entryTab.querySelector('.ws-tab-close')).toBeNull();
    // …and it does not put itself in the persisted tab list either.
    expect(tabsBar().querySelectorAll('[role="tab"]').length).toBe(1);
  });

  // Stepping into 预览 used to collapse that page's own chip to a bare icon,
  // so the row showed a page with nothing on it naming the page — and only
  // clicking the chip (i.e. leaving 预览) brought the label back.
  it('keeps the previewed page\'s own tab expanded while 预览 is the active tab', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html'], active: 'index.html' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const entryTab = () => getTabByName(document.querySelector<HTMLElement>('.ws-tabs-bar')!, /index\.html/);
    expect(entryTab().textContent).toContain('index.html');

    fireEvent.click(screen.getByTestId('project-preview-tab'));

    expect(entryTab().className).toContain('active');
    expect(entryTab().textContent).toContain('index.html');
  });

  it('stands the previewed-page tab down once that page is opened for real', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('index.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['index.html'], active: 'index.html' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('project-preview-tab'));

    // One chip for the page, not two: the real tab is already there.
    const tabsBar = document.querySelector<HTMLElement>('.ws-tabs-bar')!;
    expect(tabsBar.querySelectorAll('[role="tab"]').length).toBe(1);
  });

  it('shows Design Files when the persisted active file no longer exists', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['missing.png'], active: 'missing.png' }}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('design-files-empty')).toBeTruthy();
    expect(screen.queryByText(/Open a file from/i)).toBeNull();
    // Preview leads the strip: what the project looks like, before what it is
    // made of. Both are fixed root tabs and neither can be closed.
    expect(renderedTabLabels()).toEqual(['Preview', 'Design Files']);
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

    openTabLauncher();

    const launcherMenu = within(screen.getByTestId('tab-launcher-menu'));
    expect(launcherMenu.queryByRole('button', { name: /New Terminal/i })).toBeNull();
    expect(launcherMenu.getByRole('button', { name: /New Browser/i })).toBeTruthy();
    expect(launcherMenu.getByRole('button', { name: /New sketch/i })).toBeTruthy();
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

    expect(screen.getByTestId('design-files-tab').textContent).toContain('Design Files');
    // Design Files is a plain tab in the strip (role="tab"), so it is part of
    // the rendered tab list rather than a dropdown trigger sitting outside it.
    expect(renderedTabLabels()).toEqual([
      'Preview',
      'Design Files',
      'Browser',
      'New Terminal',
      'Side chat',
    ]);
  });

  it('does not flash a shared-project notice while read-only access is provisional', () => {
    const props = {
      projectId: 'pending-project-access',
      projectKind: 'prototype' as const,
      files: [workspaceFile('notes.txt')],
      liveArtifacts: [],
      onRefreshFiles: vi.fn(),
      isDeck: false,
      tabsState: { tabs: [], active: DESIGN_FILES_TAB },
      onTabsStateChange: vi.fn(),
    };
    const view = render(<FileWorkspace {...props} viewerOnly readonlyNotice={null} />);
    expect(view.container.querySelector('.workspace-readonly-notice')).toBeNull();

    // An owner finishes loading without ever seeing the shared-project banner.
    view.rerender(<FileWorkspace {...props} viewerOnly={false} readonlyNotice={null} />);
    expect(view.container.querySelector('.workspace-readonly-notice')).toBeNull();

    // Confirmed shared viewers still receive the access explanation.
    view.rerender(<FileWorkspace {...props} viewerOnly readonlyNotice="Shared by a teammate" />);
    expect(view.container.querySelector('.workspace-readonly-notice')?.textContent)
      .toContain('Shared by a teammate');

    view.rerender(<FileWorkspace {...props} viewerOnly />);
    expect(view.container.querySelector('.workspace-readonly-notice')?.textContent)
      .toContain('This is a shared project');
  });

  it('shows project sync progress on the Design Files root tab without hiding materialized files', () => {
    render(
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[workspaceFile('notes.txt')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        viewerOnly
        fileSyncBadge="downloading"
        tabsState={{ tabs: [], active: DESIGN_FILES_TAB }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const rootTab = screen.getByTestId('design-files-tab');
    expect(rootTab.title).toContain('Downloading from the team');
    expect(rootTab.getAttribute('aria-label')).toContain('Downloading from the team');
    expect(rootTab.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('notes.txt')).toBeTruthy();
    expect(screen.queryByTestId('design-files-syncing')).toBeNull();
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

    openTabLauncher();
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

    openTabLauncher();
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
    // The "+" that used to carry `aria-expanded` is gone (per product), so the
    // shortcut's own result — an open launcher — is what this asserts.
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

  it('reloads design-system source files under the complete pinned Workspace identity', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const workspaceB = teamContext('workspace-b', 'member-b');
    const props = {
      projectId: 'project-1',
      projectKind: 'prototype' as const,
      files: [workspaceFile('DESIGN.md'), workspaceFile('brand.json')],
      liveArtifacts: [],
      onRefreshFiles: vi.fn(),
      isDeck: false,
      tabsState: { tabs: [], active: '__design_system__' },
      onTabsStateChange: vi.fn(),
      designSystemProject: {
        id: 'neutral-modern',
        title: 'Neutral Modern',
        category: 'Starter',
        source: 'bundled',
        updatedAt: 1,
      } as never,
    };

    const { rerender } = render(
      <CollabProvider value={collabValue(workspaceA)}>
        <FileWorkspace {...props} />
      </CollabProvider>,
    );
    await waitFor(() => {
      expect(mockedFetchProjectFileText).toHaveBeenCalledWith(
        'project-1',
        'DESIGN.md',
        { cache: 'no-store', workspaceContext: workspaceA },
      );
    });

    mockedFetchProjectFileText.mockClear();
    rerender(
      <CollabProvider value={collabValue(workspaceB)}>
        <FileWorkspace {...props} />
      </CollabProvider>,
    );

    await waitFor(() => {
      expect(mockedFetchProjectFileText).toHaveBeenCalledWith(
        'project-1',
        'DESIGN.md',
        { cache: 'no-store', workspaceContext: workspaceB },
      );
      expect(mockedFetchProjectFileText).toHaveBeenCalledWith(
        'project-1',
        'brand.json',
        { cache: 'no-store', workspaceContext: workspaceB },
      );
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
        onUploadFiles={vi.fn()}
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

describe('projectSplitClassName', () => {
  it('marks the project split as focused so the chat pane can collapse globally', () => {
    expect(projectSplitClassName(false)).toBe('split');
    expect(projectSplitClassName(true)).toBe('split split-focus');
  });

  it('uses CSS variables for split widths so pointer resize can update layout without rerendering workspace content', () => {
    // `.split`'s grid-template-columns is always
    // `var(--project-chat-panel-width) var(--project-chat-handle-width) var(--project-workspace-panel-track)`
    // (see shell.css), so the style object only needs to carry the three
    // custom properties — no more concatenated `gridTemplateColumns` string.
    expect(projectSplitStyle(false, 512, 'minmax(420px, 1fr)')).toEqual({
      '--project-chat-panel-width': '512px',
      '--project-chat-handle-width': '8px',
      '--project-workspace-panel-track': 'minmax(420px, 1fr)',
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

    expect(screen.queryByTestId('tab-launcher-menu')).toBeNull();

    act(() => {
      openTabLauncher();
    });

    const browserItem = screen.getByRole('button', { name: /New Browser/ });
    const menu = browserItem.closest('[data-testid="tab-launcher-menu"]');
    expect(menu).not.toBeNull();
    expect(screen.queryByRole('button', { name: /New Terminal/ })).toBeNull();

    // The tab strip is a horizontal scroll container that also clips
    // vertically, so the launcher menu is portaled to <body> and cannot be
    // clipped by the scrolling bar. (The "+" that used to stand outside the
    // bar for the same reason is gone — ⌘T is the way in.)
    const tabsBar = document.querySelector('.ws-tabs-bar');
    expect(tabsBar).not.toBeNull();
    expect(tabsBar!.contains(menu)).toBe(false);
    expect(document.querySelector('.ws-add-tab')).toBeNull();
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
      openTabLauncher();
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

    for (let i = 0; i < 3; i += 1) {
      act(() => {
        openTabLauncher();
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /New Browser/ }));
      });
    }

    const browserTabs = screen
      .getAllByRole('tab')
      .filter((tab) => /Browser(?: \d+)?/.test(tabName(tab)));
    expect(browserTabs).toHaveLength(3);
    expect(browserTabs.map(tabName)).toEqual(['Browser', 'Browser 2', 'Browser 3']);
    // Only the one just opened is expanded; the other two are icon-wide.
    expect(browserTabs.map((tab) => tab.textContent?.trim())).toEqual([
      '',
      '',
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
      expect(screen.queryByTestId('preview-run-status')).toBeNull();
      expect(screen.getByTestId('design-files-empty')).toBeTruthy();
    },
  );

  it('keeps delivery recovery in Chat without mounting status over existing preview files', () => {
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

    expect(screen.queryByTestId('preview-run-status')).toBeNull();
    expect(screen.queryByTestId('preview-run-status-retry')).toBeNull();
    expect(screen.queryByTestId('preview-run-status-view-details')).toBeNull();
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

  it('does not mount a delivered confirmation over the preview canvas', () => {
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

    expect(screen.queryByTestId('preview-run-status')).toBeNull();
  });
});
