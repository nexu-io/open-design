// @vitest-environment jsdom
//
// OPEND-2035 red spec: the preview device/viewport dropdown stays open when
// the user clicks the preview.
//
// The menu already implements a textbook click-outside on the host document:
//
//   document.addEventListener('pointerdown', e => {
//     if (!menuRef.current.contains(e.target)) setOpen(false);
//   });
//
// That handler is correct and it works — but it can only see pointer events
// that reach THIS document. The preview is rendered into a sandboxed iframe
// (`sandbox="allow-scripts allow-downloads"`, i.e. an opaque origin), so a
// click that lands on the preview dispatches inside the frame's own document
// and never reaches the host. Measured live against a real runtime: clicking
// host chrome delivered 1 host pointerdown and closed the menu; clicking the
// preview delivered 0 and left the menu open — and the preview is by far the
// largest, most natural place to click when dismissing a menu.
//
// The one signal the host does reliably get is focus leaving the top-level
// document for the frame, which is exactly what a click on the preview does.
// This spec freezes that: focus moving into an iframe must dismiss the menu.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import { resetSharedCancellableGet } from '../../src/lib/shared-cancellable-get';
import type { ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

const WORKSPACE_CONTEXT = workspaceContextFixture({
  workspaceId: 'ws-viewport-menu',
  workspaceMemberId: 'member-viewport-menu',
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

const PAGE_HTML = '<html><body><h1>preview</h1></body></html>';

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

function viewportTrigger(): HTMLButtonElement {
  const trigger = document.querySelector('.viewer-viewport-trigger');
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('viewport trigger not rendered');
  return trigger;
}

function menuIsOpen(): boolean {
  return viewportTrigger().getAttribute('aria-expanded') === 'true';
}

beforeEach(() => {
  resetSharedCancellableGet();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('preview viewport menu dismissal (OPEND-2035)', () => {
  it('closes when a click lands in the preview iframe (focus leaves the host document)', async () => {
    const projectId = 'proj-viewport-menu-iframe';
    installFetchMock(projectId);

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );

    await waitFor(() => expect(document.querySelector('.viewer-viewport-trigger')).not.toBeNull());
    fireEvent.click(viewportTrigger());
    await waitFor(() => expect(menuIsOpen()).toBe(true));

    // A click that lands on the sandboxed preview: the host document sees no
    // pointerdown at all, only focus moving to the frame element.
    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    act(() => {
      frame!.focus();
      window.dispatchEvent(new Event('blur'));
    });

    await waitFor(() => expect(menuIsOpen()).toBe(false));
  });

  it('stays open when the window merely loses focus without the preview taking it', async () => {
    const projectId = 'proj-viewport-menu-app-switch';
    installFetchMock(projectId);

    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );

    await waitFor(() => expect(document.querySelector('.viewer-viewport-trigger')).not.toBeNull());
    fireEvent.click(viewportTrigger());
    await waitFor(() => expect(menuIsOpen()).toBe(true));

    // Switching to another application blurs the window too. The menu is not
    // being dismissed by the user in that case, so it must survive — dropping
    // it would make the menu vanish every time the user alt-tabs away.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(menuIsOpen()).toBe(true);
  });
});
