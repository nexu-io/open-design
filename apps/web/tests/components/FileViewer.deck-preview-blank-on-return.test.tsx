// @vitest-environment jsdom
// Red spec for the "deck preview goes blank after leaving and returning to the
// project" report (packaged client, multiple project tabs open).
//
// Mechanism under test — all three observed facts reproduce from it:
//
//   1. For a workspace-scoped project whose deck HTML references a relative
//      project asset, PR #6142 holds the srcDoc preview at `''` (a bare white
//      iframe, no loading cover) until `GET /api/projects/:id/files` and the
//      scoped asset rewrite complete (`scopedRelativeAssetRefs &&
//      inlinedSource === null` → `previewSource = null` → `srcDoc = ''`).
//      The thumbnail rail and speaker notes render from `source` directly, so
//      they stay healthy while the main stage is a white empty document.
//
//   2. FileViewer's project-file-list effect calls `fetchProjectFiles`
//      WITHOUT an AbortSignal. `sharedCancellableGet` therefore marks the
//      shared single-flight entry as *pinned*: it can never be aborted and it
//      stays in the shared map until it settles. `fetchProjectFiles` resolves
//      `[]` on every failure path — the only way it can stay unsettled is a
//      request that neither resolves nor rejects (a stalled/queued
//      connection). When that happens, every later viewer mount for the same
//      project + workspace identity silently REJOINS the same dead promise
//      instead of issuing its own read, so switching away and back to the
//      project keeps showing the white stage forever.
//
// The spec freezes the invariant: a freshly mounted viewer must not be wedged
// by a stalled read that a previous (now unmounted) viewer started — its own
// mount re-issues the project-files read, and the preview hold releases.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import { resetSharedCancellableGet } from '../../src/lib/shared-cancellable-get';
import type { ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

const WORKSPACE_CONTEXT = workspaceContextFixture({
  workspaceId: 'ws-deck-blank',
  workspaceMemberId: 'member-deck-blank',
});

// Full context value: a team-workspace project that is not live-shared.
// `workspaceContext` + `projectResourceAuthority: 'workspace'` is what arms
// the scoped-asset preview hold in FileViewer.
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

// Two-slide deck whose first slide carries a RELATIVE project asset ref —
// that ref is what arms `scopedRelativeAssetRefs` and the preview hold.
const DECK_HTML =
  '<html><body>'
  + '<section class="slide"><h1>slide-one</h1><img src="assets/cover.png" alt="" /></section>'
  + '<section class="slide"><p>slide-two</p></section>'
  + '</body></html>';

type FilesRequestLog = { url: string }[];

/**
 * Fetch mock for one workspace-scoped deck project:
 *  - `GET .../raw/deck.html` resolves with the deck HTML,
 *  - `GET .../files` — the first request STALLS forever (neither resolves nor
 *    rejects, like a request queued behind saturated connections); every
 *    later request resolves with the real file list,
 *  - everything else 404s (preview-url probe, etc. — all null-safe).
 */
function installFetchMock(projectId: string, filesRequests: FilesRequestLog) {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`;
  // Exact-path match: `/files/<name>/publish-public` (the public-publication
  // probe) must not be mistaken for the project file LIST read.
  const isFilesListUrl = (url: string) => url.split('?')[0] === filesUrl;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (isFilesListUrl(url)) {
      filesRequests.push({ url });
      if (filesRequests.length === 1) {
        // Stalled read: keep the promise pending forever, but honor an abort
        // like real fetch would so an aborted joiner can settle.
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }
        });
      }
      return new Response(
        JSON.stringify({
          files: [
            deckFile(),
            {
              name: 'assets/cover.png',
              path: 'assets/cover.png',
              type: 'file',
              size: 10,
              mtime: 1710000000,
              kind: 'image',
              mime: 'image/png',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith(rawUrl)) {
      return new Response(DECK_HTML, { status: 200 });
    }
    return new Response('', { status: 404 });
  }));
}

/**
 * Fetch mock for a project whose deck HTML file is a legitimate ZERO-BYTE
 * file: `GET .../raw/deck.html` resolves 200 with an empty body, the project
 * file list resolves immediately (no stall, no relative assets — nothing arms
 * the scoped-asset hold), everything else 404s.
 */
function installEmptyFileFetchMock(projectId: string) {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`;
  const isFilesListUrl = (url: string) => url.split('?')[0] === filesUrl;
  const rawRequests: FilesRequestLog = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (isFilesListUrl(url)) {
      return new Response(
        JSON.stringify({ files: [deckFile({ size: 0 })] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith(rawUrl)) {
      rawRequests.push({ url });
      return new Response('', { status: 200 });
    }
    return new Response('', { status: 404 });
  }));
  return rawRequests;
}

function srcDocFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

beforeEach(() => {
  resetSharedCancellableGet();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deck preview blank after leaving and returning to the project', () => {
  it('re-issues the project-files read on remount instead of rejoining a stalled shared read, releasing the preview hold', async () => {
    const projectId = 'proj-deck-blank-return';
    const filesRequests: FilesRequestLog = [];
    installFetchMock(projectId, filesRequests);

    // --- Phase 1: open the deck project; the files read stalls ---
    const first = render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    // Deck source arrives and the deck chrome renders (thumbnail rail up)…
    await waitFor(() => {
      expect(srcDocFrame().getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(document.querySelector('.deck-thumbnail-rail')).toBeTruthy();
    });
    expect(filesRequests.length).toBe(1);

    // …while the main stage is held at an EMPTY document (bare white iframe):
    // the scoped-asset hold is waiting on the stalled project-files read.
    expect(srcDocFrame().getAttribute('srcdoc') ?? '').toBe('');

    // --- Phase 2: switch to another project (viewer unmounts) ---
    first.unmount();

    // --- Phase 3: switch back (fresh viewer mounts) ---
    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    // The remounted viewer must perform ITS OWN project-files read — not
    // silently rejoin the previous viewer's stalled, pinned request.
    await waitFor(() => {
      expect(filesRequests.length).toBeGreaterThanOrEqual(2);
    });

    // With the read answered, the hold releases and the deck actually renders.
    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcdoc') ?? '').toContain('slide-one');
    });
  });

  it('covers the held srcDoc preview with the loading indicator instead of a bare white iframe', async () => {
    const projectId = 'proj-deck-blank-cover';
    const filesRequests: FilesRequestLog = [];
    installFetchMock(projectId, filesRequests);

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    // Deck data is on screen, the main stage is still held empty…
    await waitFor(() => {
      expect(srcDocFrame().getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(document.querySelector('.deck-thumbnail-rail')).toBeTruthy();
    });
    expect(srcDocFrame().getAttribute('srcdoc') ?? '').toBe('');

    // …so the user must see the loading cover, not a dead white pane. The
    // URL-load path already has exactly this cover for its own first-load
    // white-pane case; the srcDoc hold needs the same treatment.
    await waitFor(() => {
      expect(screen.getByTestId('artifact-preview-first-load')).toBeTruthy();
    });
  });

  it('drops the loading cover once a legitimately empty file has loaded, instead of pinning it forever', async () => {
    // Guards the other side of the cover condition: `previewSource` uses ''
    // for "loaded, zero bytes" and null for "not ready yet". A cover keyed on
    // srcDoc emptiness cannot tell those apart and would announce a permanent
    // `role="status"` / aria-busy loader over a file that finished loading
    // with no request in flight.
    const projectId = 'proj-deck-empty-file';
    const rawRequests = installEmptyFileFetchMock(projectId);

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile({ size: 0 })} isDeck />
      </Wrap>,
    );

    // The zero-byte source load resolves on the srcDoc path…
    await waitFor(() => {
      expect(srcDocFrame().getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(rawRequests.length).toBeGreaterThanOrEqual(1);
    });

    // …and the loading cover must clear: the file IS loaded, nothing is in
    // flight, and the truthful render of an empty file is an empty document.
    await waitFor(() => {
      expect(screen.queryByTestId('artifact-preview-first-load')).toBeNull();
    });
    expect(srcDocFrame().getAttribute('srcdoc') ?? '').toBe('');
  });
});
