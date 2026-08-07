// @vitest-environment jsdom
// Red spec for issue #6583: a deck preview that mounts while the browser tab
// is HIDDEN stays permanently white after the user returns to the tab.
//
// Mechanism under test:
//
//   1. Decks always render through the srcDoc transport
//      (`file-viewer-render-mode.ts`: `if (d.isDeck) return false`), so the
//      deck HTML is parsed the moment the srcdoc iframe mounts — even when
//      the whole browser tab is hidden (e.g. the project finished generating
//      in a background tab).
//
//   2. While the tab is hidden Chrome never runs layout for the iframe, so
//      the deck's one-shot fit computes against a 0x0 child viewport and
//      resolves to `transform: scale(0)`. The srcdoc bridge's only recovery,
//      `chaseFirstLayout` (30 x 50ms resize nudges), is exhausted by
//      background-timer throttling long before the user returns; neither the
//      host nor the bridge listens for `visibilitychange`, so nothing ever
//      re-runs the fit. The main stage stays white forever while the
//      thumbnail rail (host-rendered) stays healthy.
//
// The spec freezes the invariant: a srcdoc document whose load completed
// while `document.visibilityState === 'hidden'` has never experienced a real
// layout pass, so on the FIRST return to a visible document the deck's
// srcdoc iframe must be remounted (fresh srcdoc parse — the only recovery
// path that reliably re-runs the deck's fit). Loads that complete while
// visible must NOT trigger a remount on later visibility round-trips (no
// flicker), and a retained viewer (`workspaceActive === false`) must not
// react at all.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import { resetSharedCancellableGet } from '../../src/lib/shared-cancellable-get';
import type { ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

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

// Two-slide deck with NO relative project asset refs, so the #6142
// scoped-asset preview hold never arms and the srcdoc fills as soon as the
// raw source resolves. This spec is about visibility, not the hold (#6519).
const DECK_HTML =
  '<html><body>'
  + '<section class="slide"><h1>slide-one</h1></section>'
  + '<section class="slide"><p>slide-two</p></section>'
  + '</body></html>';

/**
 * Fetch mock for one workspace-scoped deck project where every request
 * settles immediately: the file list and raw deck HTML resolve, everything
 * else 404s (preview-url probe, etc. — all null-safe).
 */
function installFetchMock(projectId: string) {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`;
  const isFilesListUrl = (url: string) => url.split('?')[0] === filesUrl;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (isFilesListUrl(url)) {
      return new Response(
        JSON.stringify({ files: [deckFile()] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith(rawUrl)) {
      return new Response(DECK_HTML, { status: 200 });
    }
    return new Response('', { status: 404 });
  }));
}

let documentVisibility: DocumentVisibilityState = 'visible';

function setDocumentVisibility(state: DocumentVisibilityState) {
  documentVisibility = state;
}

function dispatchVisibilityChange() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function activeSrcDocFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

function retainedSrcDocFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame-srcdoc-retained-deck.html') as HTMLIFrameElement;
}

beforeEach(() => {
  resetSharedCancellableGet();
  documentVisibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => documentVisibility);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => documentVisibility === 'hidden');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deck preview mounted while the browser tab is hidden (#6583)', () => {
  it('remounts the srcdoc iframe on first return to visible after a hidden-tab load (fresh parse)', async () => {
    const projectId = 'proj-deck-hidden-mount-recover';
    installFetchMock(projectId);
    setDocumentVisibility('hidden');

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    // The deck parses into the srcdoc iframe while the tab is hidden…
    await waitFor(() => {
      expect(activeSrcDocFrame().getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(activeSrcDocFrame().getAttribute('srcdoc') ?? '').toContain('slide-one');
    });

    // …and its load completes with the document still hidden: this document
    // never experienced a real layout pass (0x0 viewport → fit = scale(0)).
    const hiddenLoadedFrame = activeSrcDocFrame();
    fireEvent.load(hiddenLoadedFrame);

    // User returns to the tab. The host must give the deck a fresh srcdoc
    // parse: a NEW iframe DOM node (explicit identity check — the old node
    // is gone from the document), still carrying the deck HTML.
    setDocumentVisibility('visible');
    dispatchVisibilityChange();

    await waitFor(() => {
      const remounted = activeSrcDocFrame();
      expect(remounted).not.toBe(hiddenLoadedFrame);
      expect(remounted.getAttribute('srcdoc') ?? '').toContain('slide-one');
    });
    expect(hiddenLoadedFrame.isConnected).toBe(false);
  });

  it('does NOT remount when the load completed while visible (visibility round-trip is flicker-free)', async () => {
    const projectId = 'proj-deck-visible-load-stable';
    installFetchMock(projectId);

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    await waitFor(() => {
      expect(activeSrcDocFrame().getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(activeSrcDocFrame().getAttribute('srcdoc') ?? '').toContain('slide-one');
    });

    // Load completes while the document is visible: layout was real.
    const visibleLoadedFrame = activeSrcDocFrame();
    fireEvent.load(visibleLoadedFrame);

    // Tab goes to background and comes back — no remount, same DOM node.
    setDocumentVisibility('hidden');
    dispatchVisibilityChange();
    setDocumentVisibility('visible');
    dispatchVisibilityChange();

    expect(activeSrcDocFrame()).toBe(visibleLoadedFrame);
    expect(visibleLoadedFrame.isConnected).toBe(true);
  });

  it('does NOT remount a retained viewer (workspaceActive=false) on return to visible', async () => {
    const projectId = 'proj-deck-hidden-mount-retained';
    installFetchMock(projectId);

    // A viewer becomes retained after being active: mount active first so the
    // deck parses into the srcdoc iframe, then park it offscreen.
    const view = render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={deckFile()} isDeck />
      </Wrap>,
    );

    await waitFor(() => {
      expect(activeSrcDocFrame().getAttribute('srcdoc') ?? '').toContain('slide-one');
    });

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

    // The retained srcdoc iframe's load completes while the document is
    // hidden (e.g. its content refreshed in a background browser tab).
    setDocumentVisibility('hidden');
    const retainedFrame = retainedSrcDocFrame();
    fireEvent.load(retainedFrame);

    // Returning to visible must not touch a retained viewer at all — only
    // the active viewer owns recovery.
    setDocumentVisibility('visible');
    dispatchVisibilityChange();

    expect(retainedSrcDocFrame()).toBe(retainedFrame);
    expect(retainedFrame.isConnected).toBe(true);
  });
});
