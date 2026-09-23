// @vitest-environment jsdom
//
// OPEND-2156 red spec: entering presentation leaves the user with no way out.
//
// Reported as "od 自己和新弹出的弹窗都变成了 ppt 演示, od 自己变成演示后没地方
// 返回, 只能关了 od 客户端", and reproduced against a real runtime:
//
//   * `.present-overlay` is `position: fixed; inset: 0; z-index: 1050` — it
//     covers the whole web content area, so the only "close" left on screen
//     is the OS window button, which quits the app.
//   * The overlay's only child is the sandboxed preview iframe. Measured
//     live: `overlay.querySelectorAll('button').length === 0`.
//   * Esc does exit — but only while focus is still on the host document.
//     The first click on a slide (the natural way to advance) moves focus
//     into the sandboxed frame, and from then on neither pointer nor key
//     events reach the host, so Esc stops working too.
//
// The invariant frozen here: the presentation overlay must always carry its
// own exit control. It lives in the host document, so it keeps working no
// matter where focus went — which is exactly what Esc cannot promise.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import { resetSharedCancellableGet } from '../../src/lib/shared-cancellable-get';
import type { ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

const WORKSPACE_CONTEXT = workspaceContextFixture({
  workspaceId: 'ws-present-exit',
  workspaceMemberId: 'member-present-exit',
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

function pageFile(): ProjectFile {
  return {
    name: 'page.html',
    path: 'page.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
  };
}

const PAGE_HTML = '<html><body><h1>slide</h1></body></html>';

function installFetchMock(projectId: string) {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/page.html`;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.split('?')[0] === filesUrl) {
      return new Response(
        JSON.stringify({ files: [pageFile()] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith(rawUrl)) return new Response(PAGE_HTML, { status: 200 });
    return new Response('', { status: 404 });
  }));
}

function overlay(): HTMLElement | null {
  return document.querySelector('.present-overlay');
}

async function enterPresentation() {
  const trigger = document.querySelector('.present-trigger');
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('present trigger not rendered');
  fireEvent.click(trigger);
  const inTab = await screen.findByRole('menuitem', { name: /In this tab|在当前标签页/i });
  fireEvent.click(inTab);
  await waitFor(() => expect(overlay()).not.toBeNull());
}

beforeEach(() => {
  resetSharedCancellableGet();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const DECK_HTML =
  '<html><body>'
  + '<section class="slide"><h1>one</h1></section>'
  + '<section class="slide"><p>two</p></section>'
  + '</body></html>';

function installDeckFetchMock(projectId: string) {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.split('?')[0] === filesUrl) {
      return new Response(
        JSON.stringify({ files: [deckFile()] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith(rawUrl)) return new Response(DECK_HTML, { status: 200 });
    return new Response('', { status: 404 });
  }));
}

describe('presentation overlay exit affordance (OPEND-2156)', () => {
  it('renders an exit control inside the overlay', async () => {
    const projectId = 'proj-present-exit-control';
    installFetchMock(projectId);

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );

    await waitFor(() => expect(document.querySelector('.present-trigger')).not.toBeNull());
    await enterPresentation();

    // The overlay covers everything; without a control of its own the user is
    // left with the OS window button, which quits the app.
    const exit = overlay()!.querySelector('button');
    expect(exit).not.toBeNull();
  });

  it('leaves presentation when that control is used, with focus inside the preview frame', async () => {
    const projectId = 'proj-present-exit-works';
    installFetchMock(projectId);

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );

    await waitFor(() => expect(document.querySelector('.present-trigger')).not.toBeNull());
    await enterPresentation();

    // Reproduce the state the user is actually stuck in: they clicked a slide
    // to advance, so focus now lives in the sandboxed frame and Esc can no
    // longer reach the host.
    const frame = overlay()!.querySelector('iframe');
    expect(frame).not.toBeNull();
    frame!.focus();

    const exit = overlay()!.querySelector('button');
    expect(exit).not.toBeNull();
    fireEvent.click(exit!);

    await waitFor(() => expect(overlay()).toBeNull());
  });

  // Presenting a deck opens a second window for speaker notes
  // (`presentInThisTab` → `openPresenterWindow`). The reported symptom was that
  // BOTH the app and that popup turn into the presentation, so an exit that
  // only unmounts the overlay leaves the user still presenting in the popup —
  // half the bug. The real teardown is `closeInTabPresentation()`, which is
  // also what Esc and presenter-close use; this control has to go through it.
  it('tears down the speaker-notes popup too, not just the overlay', async () => {
    const projectId = 'proj-present-exit-popup';
    installDeckFetchMock(projectId);

    const popupClose = vi.fn();
    const fakePopup = {
      closed: false,
      close: popupClose,
      focus: vi.fn(),
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    };
    vi.stubGlobal('open', vi.fn(() => fakePopup));

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="slide_deck" file={deckFile()} isDeck />
      </Wrap>,
    );

    await waitFor(() => expect(document.querySelector('.present-trigger')).not.toBeNull());
    await enterPresentation();

    const exit = overlay()!.querySelector('button');
    expect(exit).not.toBeNull();
    fireEvent.click(exit!);

    await waitFor(() => expect(overlay()).toBeNull());
    expect(popupClose).toHaveBeenCalled();
  });
});
