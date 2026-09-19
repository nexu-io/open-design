// @vitest-environment jsdom
// Regression coverage for #6583 on the converged real-URL Preview Runtime.
// A hidden browser tab must not create a second parse/remount path: the same
// retained browsing context survives visibility and workspace activation.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import { resetSharedCancellableGet } from '../../src/lib/shared-cancellable-get';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  uninstallFileViewerPreviewRuntimeHarness,
  useSyntheticProjectScopedPreviewNavigation,
} from '../helpers/file-viewer-preview-runtime';
import { workspaceContextFixture } from '../helpers/workspace-context';

vi.mock('../../src/runtime/use-project-preview-session-navigation', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/runtime/use-project-preview-session-navigation')
  >();
  return {
    ...actual,
    useProjectScopedPreviewNavigation: (
      options: Parameters<typeof actual.useProjectScopedPreviewNavigation>[0],
    ) => useSyntheticProjectScopedPreviewNavigation(options),
  };
});

const WORKSPACE_CONTEXT = workspaceContextFixture({
  workspaceId: 'ws-deck-hidden-mount',
  workspaceMemberId: 'member-deck-hidden-mount',
});

function collabValue(): CollabContextValue {
  return {
    workspaceContext: WORKSPACE_CONTEXT,
    workspaceContextLoading: false,
    projectResourceAuthority: 'workspace',
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'pending',
    isOwner: false,
    isEffectiveOwner: false,
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

function Wrap({ children }: { children: ReactNode }) {
  return <CollabProvider value={collabValue()}>{children}</CollabProvider>;
}

function deckFile(): ProjectFile {
  return {
    name: 'deck.html',
    path: 'deck.html',
    type: 'file',
    size: 2048,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'deck',
      title: 'Deck',
      entry: 'deck.html',
      renderer: 'deck-html',
      exports: ['html'],
    },
  };
}

const DECK_HTML =
  '<html><body><section class="slide"><h1>slide-one</h1></section>'
  + '<section class="slide"><p>slide-two</p></section></body></html>';

function installFetchMock(projectId: string): void {
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof Request ? input.url : String(input);
    if (url.startsWith(rawUrl)) return new Response(DECK_HTML, { status: 200 });
    return new Response('', { status: 404 });
  }));
}

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

function activeRuntimeFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

let documentVisibility: DocumentVisibilityState = 'visible';

function setDocumentVisibility(state: DocumentVisibilityState): void {
  documentVisibility = state;
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

beforeEach(() => {
  resetSharedCancellableGet();
  installFileViewerPreviewRuntimeHarness();
  documentVisibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => documentVisibility);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => documentVisibility === 'hidden');
});

afterEach(() => {
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deck preview mounted while the browser tab is hidden (#6583)', () => {
  it('promotes the real-URL deck while hidden and keeps its browsing context on return', async () => {
    const projectId = 'proj-deck-hidden-mount';
    installFetchMock(projectId);
    setDocumentVisibility('hidden');

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    const frame = await waitFor(activeRuntimeFrame);
    expect(frame.getAttribute('data-od-render-mode')).toBe('runtime-url');
    expect(frame.src).toContain('/deck.html');

    setDocumentVisibility('visible');
    expect(activeRuntimeFrame()).toBe(frame);
  });

  it('does not remount a healthy deck across a visibility round-trip', async () => {
    const projectId = 'proj-deck-visible-stable';
    installFetchMock(projectId);
    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    const frame = await waitFor(activeRuntimeFrame);
    setDocumentVisibility('hidden');
    setDocumentVisibility('visible');
    expect(activeRuntimeFrame()).toBe(frame);
  });

  it('retains the same deck while inactive and reactivates it without navigation', async () => {
    const projectId = 'proj-deck-retained-activate';
    installFetchMock(projectId);
    const view = render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    const frame = await waitFor(activeRuntimeFrame);
    const originalSrc = frame.src;
    view.rerender(
      <Wrap>
        <FileViewer
          projectId={projectId}
          projectKind="prototype"
          file={deckFile()}
          isDeck
          workspaceActive={false}
        />
      </Wrap>,
    );
    await waitFor(() => expect(frame.getAttribute('data-od-active')).toBe('false'));

    setDocumentVisibility('hidden');
    setDocumentVisibility('visible');
    view.rerender(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    await waitFor(() => expect(activeRuntimeFrame().getAttribute('data-od-active')).toBe('true'));
    expect(activeRuntimeFrame()).toBe(frame);
    expect(frame.src).toBe(originalSrc);
  });
});
