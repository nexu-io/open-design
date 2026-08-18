// @vitest-environment jsdom

// Issue #5352 / PR #6842, reviewer round 5 (nettee, 2026-08-17).
//
// `onUserActivateTab` is what retires ProjectView's post-turn auto-open watch,
// and two things decide whether it is trustworthy: WHO an activation belongs to,
// and WHEN the parent hears about it. This file pins both at the component that
// owns them.
//
// The timing half is the reason these tests mock FileViewer rather than reusing
// the main suite: every activation in FileWorkspace funnels through
// `afterActiveManualEditSettles`, which parks the activation until the active
// tab's manual edit has flushed. A manual edit that is still open therefore
// holds the activation — potentially past the settle watcher's deadline — so a
// report derived from the landed activation would arrive too late, or (if the
// edit never settles) never. The mock registers an exit handler that never
// resolves, which is that window held open for the length of the test.

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileWorkspace } from '../../src/components/FileWorkspace';
import { I18nProvider } from '../../src/i18n';
import type { ProjectFile } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: vi.fn().mockResolvedValue(''),
    fetchProjectFolders: vi.fn().mockResolvedValue([]),
    uploadProjectFiles: vi.fn(),
    writeProjectBase64File: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

const manualEditHeld = { open: false };

vi.mock('../../src/components/FileViewer', () => ({
  // Stands in for a file sitting in Manual Edit mode: it registers an exit
  // handler that never settles, so any activation requested while it is mounted
  // stays parked inside `afterActiveManualEditSettles` for the whole test.
  FileViewer: ({
    file,
    onManualEditExitHandlerChange,
  }: {
    file: { name: string };
    onManualEditExitHandlerChange?: (
      fileName: string,
      handler: (() => Promise<boolean>) | null,
    ) => void;
  }) => {
    onManualEditExitHandlerChange?.(file.name, () => {
      manualEditHeld.open = true;
      return new Promise<boolean>(() => {});
    });
    return <div data-testid="file-viewer">{file.name}</div>;
  },
  LiveArtifactViewer: () => null,
}));

function textFile(name: string): ProjectFile {
  return {
    kind: 'text',
    mime: 'text/plain',
    mtime: 1,
    name,
    path: name,
    size: 10,
    type: 'file',
  } as ProjectFile;
}

const NOTES = textFile('notes.md');
const OTHER = textFile('other.md');

function renderWorkspace(props: {
  onTabsStateChange: () => void;
  onUserActivateTab: () => void;
  openRequest?: { name: string; nonce: number; source: 'user' | 'internal' } | null;
}) {
  return render(
    <I18nProvider>
      <FileWorkspace
        projectId="project-1"
        projectKind="prototype"
        files={[NOTES, OTHER]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: ['notes.md'], active: 'notes.md' }}
        onTabsStateChange={props.onTabsStateChange}
        onUserActivateTab={props.onUserActivateTab}
        openRequest={props.openRequest ?? null}
      />
    </I18nProvider>,
  );
}

describe('FileWorkspace user-activation reporting', () => {
  afterEach(() => {
    cleanup();
    manualEditHeld.open = false;
    vi.clearAllMocks();
  });

  it('reports a user-sourced open request before the manual-edit gate lets it land', async () => {
    const onTabsStateChange = vi.fn();
    const onUserActivateTab = vi.fn();

    const { rerender } = renderWorkspace({ onTabsStateChange, onUserActivateTab });
    await waitFor(() => expect(onUserActivateTab).not.toHaveBeenCalled());

    // A chat file-link / produced-file chip click. It reaches the workspace on
    // the SAME prop as a run's auto-open, so only `source` separates them.
    rerender(
      <I18nProvider>
        <FileWorkspace
          projectId="project-1"
          projectKind="prototype"
          files={[NOTES, OTHER]}
          liveArtifacts={[]}
          onRefreshFiles={vi.fn()}
          isDeck={false}
          tabsState={{ tabs: ['notes.md'], active: 'notes.md' }}
          onTabsStateChange={onTabsStateChange}
          onUserActivateTab={onUserActivateTab}
          openRequest={{ name: 'other.md', nonce: 1, source: 'user' }}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(onUserActivateTab).toHaveBeenCalledTimes(1));
    // The point of the test: the parent already knows, even though the
    // activation itself is still parked behind the unsettled manual edit and the
    // persisted tab state has not moved. Derived from the landed activation
    // instead, this report would not exist yet — and the settle watcher would
    // read "the user has not chosen anything" and open its own pick over
    // other.md.
    expect(manualEditHeld.open).toBe(true);
    expect(onTabsStateChange).not.toHaveBeenCalled();
  });

  it('does not report a run-sourced open request', async () => {
    const onTabsStateChange = vi.fn();
    const onUserActivateTab = vi.fn();

    const { rerender } = renderWorkspace({ onTabsStateChange, onUserActivateTab });

    rerender(
      <I18nProvider>
        <FileWorkspace
          projectId="project-1"
          projectKind="prototype"
          files={[NOTES, OTHER]}
          liveArtifacts={[]}
          onRefreshFiles={vi.fn()}
          isDeck={false}
          tabsState={{ tabs: ['notes.md'], active: 'notes.md' }}
          onTabsStateChange={onTabsStateChange}
          onUserActivateTab={onUserActivateTab}
          openRequest={{ name: 'other.md', nonce: 1, source: 'internal' }}
        />
      </I18nProvider>,
    );

    // Counterpart to the test above, so that one cannot pass merely because the
    // gate reports everything: a run's own auto-open must never retire the watch
    // that issued it.
    await waitFor(() => expect(manualEditHeld.open).toBe(true));
    expect(onUserActivateTab).not.toHaveBeenCalled();
  });
});
