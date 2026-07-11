// @vitest-environment jsdom
//
// Unit tests for the file-version-history modal's hook: loading + default
// selection, search filtering, the content cache/prefetch path, copy-prompt,
// the restore flow (success and version-warning branches), and the
// priority-ordered Escape/outside-dismiss wiring — all through fake ports, no
// real transport or DOM globals.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileVersion } from '@open-design/contracts';

import {
  useFileVersionManager,
  type FileVersionManagerDeps,
} from '../../../src/features/file-viewer/hooks/useFileVersionManager.hooks';
import type {
  DismissPort,
  ElementSizePort,
  FileVersionsPort,
  PortalPort,
  ShareLinkClipboardPort,
} from '../../../src/features/file-viewer/ports';
import type { TranslateFn } from '../../../src/features/file-viewer/types';
import type { ProjectFile } from '../../../src/types';

vi.mock('../../../src/runtime/exports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/runtime/exports')>()),
  openSandboxedPreviewInNewTab: vi.fn(),
}));
import { openSandboxedPreviewInNewTab } from '../../../src/runtime/exports';

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 10,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    ...overrides,
  };
}

function makeVersion(overrides: Partial<ProjectFileVersion> = {}): ProjectFileVersion {
  return {
    id: 'v1',
    fileName: 'index.html',
    version: 1,
    label: '',
    createdAt: 1000,
    source: 'ai',
    prompt: null,
    size: 10,
    mime: 'text/html',
    kind: 'html',
    current: true,
    ...overrides,
  };
}

function makeFileVersionsPort(over: Partial<FileVersionsPort> = {}): FileVersionsPort {
  return {
    fetchProjectFileVersions: vi.fn(async () => ({ versions: [makeVersion()] })),
    fetchProjectFileVersion: vi.fn(async () => ({ content: '<p>fetched</p>' })),
    restoreProjectFileVersion: vi.fn(async () => ({ version: makeVersion({ current: true }), versionWarning: undefined })),
    ...over,
  };
}

function makeDismissPort(over: Partial<DismissPort> = {}): DismissPort {
  return {
    subscribeOutsideDismiss: vi.fn(() => () => {}),
    subscribeOutsidePointerDismiss: vi.fn(() => () => {}),
    subscribeOutsidePointerDown: vi.fn(() => () => {}),
    subscribeEscapeKey: vi.fn(() => () => {}),
    ...over,
  };
}

function makeElementSizePort(over: Partial<ElementSizePort> = {}): ElementSizePort {
  return {
    observeElementSize: vi.fn(() => () => {}),
    ...over,
  };
}

function makePortalPort(over: Partial<PortalPort> = {}): PortalPort {
  return {
    getPortalRoot: vi.fn(() => document.body),
    ...over,
  };
}

function makeClipboardPort(over: Partial<ShareLinkClipboardPort> = {}): ShareLinkClipboardPort {
  return {
    copyToClipboard: vi.fn(async () => true),
    ...over,
  };
}

const t: TranslateFn = ((key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as TranslateFn;

function makeDeps(over: Partial<FileVersionManagerDeps> = {}): FileVersionManagerDeps {
  return {
    projectId: 'proj-1',
    projectKind: 'prototype',
    file: file(),
    currentSource: '<p>current</p>',
    entryFrom: 'toolbar',
    t,
    locale: 'en',
    analytics: { track: vi.fn() },
    onClose: vi.fn(),
    onRestored: vi.fn(async () => {}),
    ...over,
  };
}

function renderManager(opts: {
  port?: FileVersionsPort;
  dismissPort?: DismissPort;
  elementSizePort?: ElementSizePort;
  portalPort?: PortalPort;
  clipboardPort?: ShareLinkClipboardPort;
  deps?: FileVersionManagerDeps;
} = {}) {
  const port = opts.port ?? makeFileVersionsPort();
  const dismissPort = opts.dismissPort ?? makeDismissPort();
  const elementSizePort = opts.elementSizePort ?? makeElementSizePort();
  const portalPort = opts.portalPort ?? makePortalPort();
  const clipboardPort = opts.clipboardPort ?? makeClipboardPort();
  const deps = opts.deps ?? makeDeps();
  const rendered = renderHook(() =>
    useFileVersionManager(port, dismissPort, elementSizePort, portalPort, clipboardPort, deps),
  );
  return { ...rendered, port, dismissPort, elementSizePort, portalPort, clipboardPort, deps };
}

describe('useFileVersionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('loads versions, selects the current one, and seeds its content from currentSource with no fetch', async () => {
    const v = makeVersion({ id: 'v1', current: true });
    const fetchProjectFileVersion = vi.fn(async () => ({ content: 'should not be called' }));
    const { result } = renderManager({
      port: makeFileVersionsPort({
        fetchProjectFileVersions: vi.fn(async () => ({ versions: [v] })),
        fetchProjectFileVersion,
      }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.versions).toEqual([v]);
    expect(result.current.selectedVersion?.id).toBe('v1');
    expect(result.current.srcDoc).toContain('current');
    expect(fetchProjectFileVersion).not.toHaveBeenCalled();
  });

  it('reports a load error via the translated key when the port resolves null', async () => {
    const { result } = renderManager({
      port: makeFileVersionsPort({ fetchProjectFileVersions: vi.fn(async () => null) }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('fileViewer.versions.loadFailed');
    expect(result.current.versions).toEqual([]);
  });

  it('only shows the search box once there are more than 3 versions, and filters by prompt/label/version', async () => {
    const versions = [
      makeVersion({ id: 'v1', version: 1, current: true, prompt: 'Alpha change' }),
      makeVersion({ id: 'v2', version: 2, current: false, prompt: 'Beta change' }),
      makeVersion({ id: 'v3', version: 3, current: false, label: 'Gamma' }),
      makeVersion({ id: 'v4', version: 4, current: false, label: 'Delta' }),
    ];
    const { result } = renderManager({
      port: makeFileVersionsPort({ fetchProjectFileVersions: vi.fn(async () => ({ versions })) }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.showSearch).toBe(true);

    act(() => {
      result.current.setSearch('beta');
    });
    expect(result.current.visibleVersions.map((version) => version.id)).toEqual(['v2']);

    act(() => {
      result.current.setSearch('');
    });
    expect(result.current.visibleVersions).toHaveLength(4);
  });

  it('selecting a different version fetches and caches its content, and fires tracking only when the selection actually changes', async () => {
    const versions = [
      makeVersion({ id: 'v1', version: 1, current: true }),
      makeVersion({ id: 'v2', version: 2, current: false }),
    ];
    const fetchProjectFileVersion = vi.fn(async () => ({ content: '<p>v2 body</p>' }));
    const { result, deps } = renderManager({
      port: makeFileVersionsPort({
        fetchProjectFileVersions: vi.fn(async () => ({ versions })),
        fetchProjectFileVersion,
      }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const tracksBeforeSelect = (deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      result.current.onSelectVersion(versions[1]!);
    });
    await waitFor(() => expect(result.current.selectedVersion?.id).toBe('v2'));
    await waitFor(() => expect(result.current.srcDoc).toContain('v2 body'));

    expect(fetchProjectFileVersion).toHaveBeenCalledWith('proj-1', 'index.html', 'v2');
    expect((deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length).toBe(tracksBeforeSelect + 1);

    const tracksAfterSelect = (deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      result.current.onSelectVersion(versions[1]!);
    });
    // Re-selecting the already-selected version must not double-fire tracking.
    expect((deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length).toBe(tracksAfterSelect);
  });

  it('prefetching a version primes the cache without changing the current selection', async () => {
    const versions = [
      makeVersion({ id: 'v1', version: 1, current: true }),
      makeVersion({ id: 'v2', version: 2, current: false }),
    ];
    const fetchProjectFileVersion = vi.fn(async () => ({ content: '<p>prefetched</p>' }));
    const { result } = renderManager({
      port: makeFileVersionsPort({
        fetchProjectFileVersions: vi.fn(async () => ({ versions })),
        fetchProjectFileVersion,
      }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.onPrefetchVersion('v2');
    });
    await waitFor(() => expect(fetchProjectFileVersion).toHaveBeenCalledWith('proj-1', 'index.html', 'v2'));
    expect(result.current.selectedVersion?.id).toBe('v1');
  });

  it('copies the selected prompt through the clipboard port and auto-clears the copied flag', async () => {
    const version = makeVersion({ id: 'v1', current: true, prompt: '  Make it blue  ' });
    const copyToClipboard = vi.fn(async () => true);
    const { result } = renderManager({
      port: makeFileVersionsPort({ fetchProjectFileVersions: vi.fn(async () => ({ versions: [version] })) }),
      clipboardPort: makeClipboardPort({ copyToClipboard }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onCopyPrompt();
    });
    expect(copyToClipboard).toHaveBeenCalledWith('Make it blue');
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(result.current.copied).toBe(false);
  });

  it('does not flip the copied flag when the clipboard port reports failure', async () => {
    const version = makeVersion({ id: 'v1', current: true, prompt: 'x' });
    const { result } = renderManager({
      port: makeFileVersionsPort({ fetchProjectFileVersions: vi.fn(async () => ({ versions: [version] })) }),
      clipboardPort: makeClipboardPort({ copyToClipboard: vi.fn(async () => false) }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onCopyPrompt();
    });
    expect(result.current.copied).toBe(false);
  });

  it('opens the current preview in a new tab once content is loaded and matches the selection', async () => {
    const version = makeVersion({ id: 'v1', current: true });
    const { result } = renderManager({
      port: makeFileVersionsPort({ fetchProjectFileVersions: vi.fn(async () => ({ versions: [version] })) }),
      deps: makeDeps({ currentSource: '<p>preview body</p>' }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.selectedContentMatchesVersion).toBe(true));

    act(() => {
      result.current.onOpenInNewTab();
    });
    expect(openSandboxedPreviewInNewTab).toHaveBeenCalledTimes(1);
    expect((openSandboxedPreviewInNewTab as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toBe('index.html · v1');
  });

  it('restoring successfully calls onRestored and closes the modal', async () => {
    const version = makeVersion({ id: 'v2', version: 2, current: false });
    const restoreProjectFileVersion = vi.fn(async () => ({
      version: makeVersion({ id: 'v2', version: 2, current: true }),
      versionWarning: undefined,
    }));
    const { result, deps } = renderManager({
      port: makeFileVersionsPort({
        fetchProjectFileVersions: vi.fn(async () => ({ versions: [version] })),
        fetchProjectFileVersion: vi.fn(async () => ({ content: '<p>v2</p>' })),
        restoreProjectFileVersion,
      }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.selectedContentMatchesVersion).toBe(true));

    await act(async () => {
      result.current.onConfirmRestore();
      await vi.waitFor(() => expect(restoreProjectFileVersion).toHaveBeenCalled());
    });

    await waitFor(() => expect(deps.onClose).toHaveBeenCalledTimes(1));
    expect(deps.onRestored).toHaveBeenCalledWith('<p>v2</p>', expect.objectContaining({ id: 'v2' }));
  });

  it('a restore that returns a versionWarning reloads the list, surfaces the warning, and does not close', async () => {
    const version = makeVersion({ id: 'v2', version: 2, current: false });
    const restoreProjectFileVersion = vi.fn(async () => ({
      version: makeVersion({ id: 'v2', version: 2, current: true }),
      versionWarning: { code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED' as const, message: 'Could not capture a fresh snapshot' },
    }));
    const fetchProjectFileVersions = vi.fn(async () => ({ versions: [version] }));
    const { result, deps } = renderManager({
      port: makeFileVersionsPort({
        fetchProjectFileVersions,
        fetchProjectFileVersion: vi.fn(async () => ({ content: '<p>v2</p>' })),
        restoreProjectFileVersion,
      }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.selectedContentMatchesVersion).toBe(true));

    await act(async () => {
      result.current.onConfirmRestore();
      await vi.waitFor(() => expect(restoreProjectFileVersion).toHaveBeenCalled());
    });

    await waitFor(() => expect(result.current.error).toBe('Could not capture a fresh snapshot'));
    expect(deps.onClose).not.toHaveBeenCalled();
    expect(fetchProjectFileVersions.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('Escape prioritizes closing the restore-confirm popover, then the prompt popover, then the modal', async () => {
    const version = makeVersion({ id: 'v1', current: false });
    let onEscape: (() => void) | undefined;
    const dismissPort = makeDismissPort({
      subscribeEscapeKey: vi.fn((cb: () => void) => {
        onEscape = cb;
        return () => {};
      }),
    });
    const { result, deps } = renderManager({
      port: makeFileVersionsPort({ fetchProjectFileVersions: vi.fn(async () => ({ versions: [version] })) }),
      dismissPort,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.onToggleRestoreConfirm();
      result.current.onTogglePrompt();
    });
    expect(result.current.confirmRestore).toBe(true);
    expect(result.current.promptOpen).toBe(true);

    act(() => onEscape?.());
    expect(result.current.confirmRestore).toBe(false);
    expect(result.current.promptOpen).toBe(true);
    expect(deps.onClose).not.toHaveBeenCalled();

    act(() => onEscape?.());
    expect(result.current.promptOpen).toBe(false);
    expect(deps.onClose).not.toHaveBeenCalled();

    act(() => onEscape?.());
    expect(deps.onClose).toHaveBeenCalledTimes(1);
  });

  it('viewport change only fires tracking when the viewport actually changes', async () => {
    const version = makeVersion({ id: 'v1', current: true });
    const { result, deps } = renderManager({
      port: makeFileVersionsPort({ fetchProjectFileVersions: vi.fn(async () => ({ versions: [version] })) }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const tracksBefore = (deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      result.current.onViewportChange('desktop');
    });
    expect((deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length).toBe(tracksBefore);

    act(() => {
      result.current.onViewportChange('mobile');
    });
    expect(result.current.previewViewport).toBe('mobile');
    expect((deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length).toBe(tracksBefore + 1);
  });

  it('resolves portalRoot from the injected portal port', async () => {
    const root = document.createElement('div');
    const { result } = renderManager({ portalPort: makePortalPort({ getPortalRoot: () => root }) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.portalRoot).toBe(root);
  });
});
