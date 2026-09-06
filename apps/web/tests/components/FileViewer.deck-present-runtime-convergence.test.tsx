// @vitest-environment jsdom
//
// Red spec: entering fullscreen presentation mints a SECOND browsing context.
//
// The Dev Design's terminal invariant is one file -> one stable real URL -> one
// versioned Preview Runtime, and "changing capability or view must not navigate
// the document". Presenting is a view change.
//
// What actually happens today: `.present-overlay` is portaled to <body> as a
// fixed, full-window layer while the `.viewer` underneath stays mounted (only
// its toolbar is hidden). The overlay then renders its OWN <iframe>. So the
// running preview document is still alive underneath and a second one is
// created on top.
//
//   * a deck takes `srcDoc={presentationSrcDoc}`, which is
//     `buildSrcdoc(deckVisualSource, ...)` — a document rebuilt from source
//     that carries only `initialSlideIndex` across.
//   * plain HTML takes `src={activePreviewSrcUrl}`. Better, but still a fresh
//     navigation in a fresh element: `data-od-render-mode="url-load"` rather
//     than the runtime's own `runtime-url`.
//
// Either way the JS heap, Canvas/WebGL contexts, timers, closures and authored
// interaction state do not migrate. That is pain point 1 of the Dev Design,
// with the entry point moved from "enter edit mode" to "enter presentation".
//
// The pool already knows how to relocate a live frame without resetting it:
// `moveIframeElement` uses `Element.moveBefore()`, validated on Electron 41 /
// Chrome 146 to retain the request count, load count, window instance and
// authored state, where `appendChild()` reset all four. Presentation should use
// that, not build a second frame.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  workspaceId: 'ws-present-converge',
  workspaceMemberId: 'member-present-converge',
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

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
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
const DECK_HTML =
  '<html><body>'
  + '<section class="slide"><h1>one</h1></section>'
  + '<section class="slide"><p>two</p></section>'
  + '</body></html>';

function installFetchMock(projectId: string, name: string, body: string, file: ProjectFile) {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/${name}`;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.split('?')[0] === filesUrl) {
      return new Response(
        JSON.stringify({ files: [file] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith(rawUrl)) return new Response(body, { status: 200 });
    return new Response('', { status: 404 });
  }));
}

/** The document the user is already looking at, as the harness exposes it. */
function liveRuntimeFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
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

/**
 * The contract under test.
 *
 * Presenting must show the very document that was already running. A second
 * <iframe> element anywhere is a second browsing context: even pointed at the
 * same real URL it starts a fresh document and drops everything the page was
 * holding. So the overlay owns no frame of its own, the frame that was running
 * before is still the frame on screen, and it was never swapped for a different
 * transport on the way in.
 */
function expectPresentationReusesTheLiveRuntimeFrame(live: HTMLIFrameElement) {
  // We really are presenting — otherwise the assertions below pass vacuously.
  expect(overlay()).not.toBeNull();
  expect(document.querySelector('.viewer.is-tab-present')).not.toBeNull();

  expect(overlay()!.querySelector('iframe')).toBeNull();
  expect(liveRuntimeFrame()).toBe(live);
  expect(liveRuntimeFrame().getAttribute('data-od-render-mode')).toBe('runtime-url');
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

describe('fullscreen presentation reuses the one running preview document', () => {
  // Control. Everything below hinges on being able to identify the live
  // document, so prove that selector resolves in ordinary preview first. If
  // this fails, the two cases below are reporting a broken probe rather than a
  // real defect.
  it('the running preview is reachable, and is the runtime document', async () => {
    const projectId = 'proj-present-converge-control';
    installFetchMock(projectId, 'page.html', PAGE_HTML, pageFile());

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );

    const live = await waitFor(liveRuntimeFrame);
    expect(live.getAttribute('data-od-render-mode')).toBe('runtime-url');
  });

  it('plain HTML presents the frame that is already running', async () => {
    const projectId = 'proj-present-converge-page';
    installFetchMock(projectId, 'page.html', PAGE_HTML, pageFile());

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );

    const live = await waitFor(liveRuntimeFrame);
    await enterPresentation();
    expectPresentationReusesTheLiveRuntimeFrame(live);
  });

  it('a deck presents the frame that is already running, instead of rebuilding from source', async () => {
    const projectId = 'proj-present-converge-deck';
    installFetchMock(projectId, 'deck.html', DECK_HTML, deckFile());

    const fakePopup = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    };
    vi.stubGlobal('open', vi.fn(() => fakePopup));

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="slide_deck" file={deckFile()} isDeck />
      </Wrap>,
    );

    const live = await waitFor(liveRuntimeFrame);
    await enterPresentation();
    expectPresentationReusesTheLiveRuntimeFrame(live);
  });
});
