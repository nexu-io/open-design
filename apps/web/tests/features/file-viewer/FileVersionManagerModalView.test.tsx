// @vitest-environment jsdom
//
// Dumb-component tests for the file-version-history modal view: it renders
// entirely from its controller prop and never touches transport/DOM globals
// itself (its portal target comes from `controller.portalRoot`).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileVersion } from '@open-design/contracts';

import { FileVersionManagerModalView } from '../../../src/features/file-viewer/components/FileVersionManagerModalView';
import type { FileVersionManagerController } from '../../../src/features/file-viewer/hooks/useFileVersionManager.hooks';
import type { ProjectFile } from '../../../src/types';

afterEach(cleanup);

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

function makeController(overrides: Partial<FileVersionManagerController> = {}): FileVersionManagerController {
  const v1 = makeVersion();
  return {
    versions: [v1],
    versionCountLabel: 'fileViewer.versions.countOne',
    showSearch: false,
    search: '',
    setSearch: vi.fn(),
    visibleVersions: [v1],
    versionById: new Map([[v1.id, v1]]),
    loading: false,
    onSelectVersion: vi.fn(),
    onPrefetchVersion: vi.fn(),

    selectedVersion: v1,
    selectedDate: 'Jan 01',
    selectedRestoredFrom: null,
    promptWrapRef: createRef<HTMLDivElement>(),
    promptOpen: false,
    promptPopoverId: 'prompt-pop',
    onTogglePrompt: vi.fn(),
    selectedPrompt: '',
    copied: false,
    onCopyPrompt: vi.fn(),
    restoreWrapRef: createRef<HTMLDivElement>(),
    confirmRestore: false,
    restorePopoverId: 'restore-pop',
    restoreDisabled: true,
    restoring: false,
    onToggleRestoreConfirm: vi.fn(),
    onCancelRestore: vi.fn(),
    onConfirmRestore: vi.fn(),
    previewViewport: 'desktop',
    onViewportChange: vi.fn(),
    onOpenInNewTab: vi.fn(),
    loadingContent: false,
    selectedContentMatchesVersion: true,

    previewFrameRef: createRef<HTMLDivElement>(),
    previewFrameSize: undefined,
    error: null,
    srcDoc: '<p>hi</p>',
    isDeckPreview: false,
    frameReady: true,
    onFrameLoad: vi.fn(),
    portalRoot: document.body,
    ...overrides,
  };
}

describe('FileVersionManagerModalView', () => {
  it('renders nothing when the controller has no portal root', () => {
    const { container } = render(
      <FileVersionManagerModalView file={file()} locale="en" controller={makeController({ portalRoot: null })} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current-version badge and the version count', () => {
    render(
      <FileVersionManagerModalView
        file={file()}
        locale="en"
        controller={makeController({ versionCountLabel: '1 version' })}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(screen.getByText('1 version')).toBeTruthy();
  });

  it('selecting a row in the list calls onSelectVersion with that version', () => {
    const v1 = makeVersion({ id: 'v1', version: 1, current: true });
    const v2 = makeVersion({ id: 'v2', version: 2, current: false });
    const onSelectVersion = vi.fn();
    render(
      <FileVersionManagerModalView
        file={file()}
        locale="en"
        controller={makeController({
          versions: [v1, v2],
          visibleVersions: [v1, v2],
          versionById: new Map([[v1.id, v1], [v2.id, v2]]),
          selectedVersion: v1,
          onSelectVersion,
        })}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByText('Version 2')[0]!);
    expect(onSelectVersion).toHaveBeenCalledWith(v2);
  });

  it('the close button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <FileVersionManagerModalView file={file()} locale="en" controller={makeController()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the restore action calls onToggleRestoreConfirm for a non-current version', () => {
    const onToggleRestoreConfirm = vi.fn();
    const older = makeVersion({ id: 'v2', version: 2, current: false });
    render(
      <FileVersionManagerModalView
        file={file()}
        locale="en"
        controller={makeController({
          selectedVersion: older,
          versions: [older],
          visibleVersions: [older],
          versionById: new Map([[older.id, older]]),
          restoreDisabled: false,
          onToggleRestoreConfirm,
        })}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Switch to this version'));
    expect(onToggleRestoreConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the loading skeleton while loading and the empty state once loaded with no versions', () => {
    const { rerender } = render(
      <FileVersionManagerModalView
        file={file()}
        locale="en"
        controller={makeController({ loading: true, versions: [], visibleVersions: [], selectedVersion: null })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('status', { name: 'Loading versions...' })).toBeTruthy();

    rerender(
      <FileVersionManagerModalView
        file={file()}
        locale="en"
        controller={makeController({ loading: false, versions: [], visibleVersions: [], selectedVersion: null })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('No versions yet.')).toBeTruthy();
  });

  it('the search box only appears when showSearch is true', () => {
    const { rerender } = render(
      <FileVersionManagerModalView file={file()} locale="en" controller={makeController({ showSearch: false })} onClose={() => {}} />,
    );
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();

    rerender(
      <FileVersionManagerModalView file={file()} locale="en" controller={makeController({ showSearch: true })} onClose={() => {}} />,
    );
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy();
  });
});
