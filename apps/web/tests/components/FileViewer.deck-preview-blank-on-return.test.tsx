// @vitest-environment jsdom
// Regression coverage for the deck preview that used to go blank after a
// project round-trip. Project-file discovery no longer gates the document:
// the real-URL Runtime is promoted from its own exact protocol handshake.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  workspaceId: 'ws-deck-blank',
  workspaceMemberId: 'member-deck-blank',
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

function deckFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
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
    ...overrides,
  };
}

const DECK_HTML =
  '<html><body><section class="slide"><h1>slide-one</h1>'
  + '<img src="assets/cover.png" alt="" /></section></body></html>';

function installFetchMock(projectId: string, options: { empty?: boolean } = {}): void {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof Request ? input.url : String(input);
    if (url.split('?')[0] === filesUrl) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    }
    if (url.startsWith(rawUrl)) {
      return new Response(options.empty ? '' : DECK_HTML, { status: 200 });
    }
    return new Response('', { status: 404 });
  }));
}

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

function activeRuntimeFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

beforeEach(() => {
  resetSharedCancellableGet();
  installFileViewerPreviewRuntimeHarness();
});

afterEach(() => {
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deck preview blank after leaving and returning to the project', () => {
  it('does not let a stalled project-files read gate either project visit', async () => {
    const projectId = 'proj-deck-blank-return';
    installFetchMock(projectId);

    const first = render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );
    await waitFor(activeRuntimeFrame);
    expect(screen.queryByTestId('artifact-preview-first-load')).toBeNull();

    first.unmount();
    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );
    const returned = await waitFor(activeRuntimeFrame);
    expect(returned.getAttribute('data-od-render-mode')).toBe('runtime-url');
    expect(screen.queryByTestId('artifact-preview-first-load')).toBeNull();
  });

  it('shows the real document without waiting for relative-asset classification', async () => {
    const projectId = 'proj-deck-relative-asset';
    installFetchMock(projectId);
    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    const frame = await waitFor(activeRuntimeFrame);
    expect(frame.src).toContain('/deck.html');
    expect(screen.queryByTestId('artifact-preview-first-load')).toBeNull();
  });

  it('accepts an empty document as a completed preview', async () => {
    const projectId = 'proj-deck-empty-file';
    installFetchMock(projectId, { empty: true });
    render(
      <Wrap>
        <FileViewer
          projectId={projectId}
          projectKind="prototype"
          file={deckFile({ size: 0 })}
          isDeck
        />
      </Wrap>,
    );

    const frame = await waitFor(activeRuntimeFrame);
    expect(frame.getAttribute('data-od-render-mode')).toBe('runtime-url');
    expect(screen.queryByTestId('artifact-preview-first-load')).toBeNull();
  });
});
