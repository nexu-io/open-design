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

import {
  FileWorkspace,
  type WorkspaceOpenRequest,
} from '../../src/components/FileWorkspace';
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

const manualEditHeld: {
  open: boolean;
  release: ((settled: boolean) => void) | null;
} = { open: false, release: null };

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
      // Resolvable, unlike a plain never-settling promise: the ownership tests
      // below need the parked activation to be RELEASED after the handoff, to
      // show it is dropped at that moment rather than merely still waiting.
      return new Promise<boolean>((resolve) => {
        manualEditHeld.release = resolve;
      });
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
  openRequest?: WorkspaceOpenRequest | null;
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
    manualEditHeld.release = null;
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
  // Shared by the two ownership tests: render, then hand the workspace an
  // internal request whose owner predicate the test controls, and leave the
  // activation parked on the manual edit.
  async function parkInternalRequest(isStillOwned: () => boolean) {
    const onTabsStateChange = vi.fn();
    const onUserActivateTab = vi.fn();
    const request: WorkspaceOpenRequest = {
      name: 'other.md',
      nonce: 1,
      source: 'internal',
      isStillOwned,
    };

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
          openRequest={request}
        />
      </I18nProvider>,
    );

    // The activation must really be parked, or releasing it below proves nothing.
    await waitFor(() => expect(manualEditHeld.release).not.toBeNull());
    expect(onTabsStateChange).not.toHaveBeenCalled();
    return { onTabsStateChange };
  }

  async function releaseManualEdit() {
    manualEditHeld.release?.(true);
    await waitFor(() => expect(manualEditHeld.release).not.toBeNull());
    await Promise.resolve();
    await Promise.resolve();
  }

  // Positive control for the ownership test below: without it, "did not
  // activate" would also pass if the parked activation simply never ran.
  it('lands a parked internal activation whose run still owns it', async () => {
    const { onTabsStateChange } = await parkInternalRequest(() => true);

    await releaseManualEdit();

    await waitFor(() =>
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ active: 'other.md' }),
      ),
    );
  });

  it('drops a parked internal activation whose run lost ownership while it waited', async () => {
    // Reviewer #6842 (nettee, 2026-08-18, round 7): the requester's generation
    // and conversation checks ran when the request was made. This window is
    // unbounded, so a newer run or another conversation can take over inside
    // it — and the parked callback would still activate, because the gate only
    // re-checks the source tab and the activation sequence, neither of which a
    // handoff changes. Re-asking the owner at release is what stops it.
    let owned = true;
    const { onTabsStateChange } = await parkInternalRequest(() => owned);

    // The handoff: a newer send, or the user moving to another chat.
    owned = false;
    await releaseManualEdit();

    expect(onTabsStateChange).not.toHaveBeenCalled();
  });
});
