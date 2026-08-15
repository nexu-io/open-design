// @vitest-environment jsdom

// The Share tab's "Publish this file for everyone" flow reports three
// analytics points: the publish button click (`ui_click` element
// `publish_file`), the settled outcome (`artifact_publish_result` with
// action/result/error_code), and the post-publish copy-link click (`ui_click`
// element `copy_publish_link`). These are the numerator inputs for the 产物导出率
// metric once publish success joins it, so a silent regression here would make
// the metric under-count real sharing again.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { FileViewer } from '../../src/components/FileViewer';
import {
  CollabProvider,
  type CollabContextValue,
} from '../../src/collab/collab-context';
import type { ProjectFile } from '../../src/types';

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  newRequestId: vi.fn(() => 'request-publish-1'),
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: analytics.track,
    newRequestId: analytics.newRequestId,
  }),
}));

function teamWorkspaceContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    teamId: 'team-1',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  };
}

function htmlFile(): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Page',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function renderProjectFileViewer(
  context: WorkspaceCollabContext,
  props: ComponentProps<typeof FileViewer>,
) {
  const collab: CollabContextValue = {
    workspaceContext: context,
    workspaceContextLoading: false,
    enabled: true,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'allowed',
    isOwner: true,
    isEffectiveOwner: true,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => {},
    requestPublish: () => {},
    refreshPresence: () => {},
    checkStatusNow: () => {},
  };
  const tree = (next: ComponentProps<typeof FileViewer>) => (
    <CollabProvider value={collab}>
      <FileViewer {...next} />
    </CollabProvider>
  );
  const result = render(tree(props));
  return {
    ...result,
    rerenderWith: (next: ComponentProps<typeof FileViewer>) => result.rerender(tree(next)),
  };
}

function stubFetch(
  options: { publishStatus?: number; publishBody?: unknown; unpublishStatus?: number } = {},
) {
  const { publishStatus = 200, publishBody, unpublishStatus = 200 } = options;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/workspace/context')) {
      return new Response(JSON.stringify({ context: teamWorkspaceContext() }), { status: 200 });
    }
    if (url.includes('publish-public')) {
      if (init?.method === 'POST') {
        const body =
          publishBody ??
          (publishStatus === 200
            ? { url: 'https://open-design.ai/p/slug-1', slug: 'slug-1', fileName: 'index.html' }
            : { error: { message: 'WORKSPACE_IDENTITY_REQUIRED' } });
        return new Response(JSON.stringify(body), { status: publishStatus });
      }
      if (init?.method === 'DELETE') {
        const body =
          unpublishStatus === 200
            ? { ok: true, slug: 'slug-1', fileName: 'index.html' }
            : { error: { message: 'WORKSPACE_IDENTITY_REQUIRED' } };
        return new Response(JSON.stringify(body), { status: unpublishStatus });
      }
      return new Response(JSON.stringify({ publication: null }), { status: 200 });
    }
    return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function trackedEvents(name: string): Record<string, unknown>[] {
  return analytics.track.mock.calls
    .filter(([event]) => event === name)
    .map(([, props]) => props as Record<string, unknown>);
}

function reactComponentFile(): ProjectFile {
  return {
    name: 'App.jsx',
    path: 'App.jsx',
    type: 'file',
    size: 512,
    mtime: 1710000000,
    kind: 'code',
    mime: 'text/javascript',
    artifactManifest: {
      version: 1,
      kind: 'react-component',
      title: 'App',
      entry: 'App.jsx',
      renderer: 'react-component',
      exports: ['jsx'],
    },
  };
}

// The publish trigger is the Share panel's `role="menuitem"` row labelled by
// `fileViewer.publishSingleFileTitle`; once published it is replaced by the
// copy-link / `fileViewer.unpublishFile` pair.
const PUBLISH_ROW = /get a share link/i;
const UNPUBLISH_ROW = /stop sharing/i;
// `fileViewer.publishingFile` — the row's in-flight label, and therefore the
// state the publish handler leaves behind only once its `finally` has run.
const BUSY_PUBLISH_ROW = /creating link/i;
// Either settled shape of the panel: the idle publish row, or the copy-link
// control that replaces it once a published URL is committed.
const SETTLED_PUBLISH_PANEL = /get a share link|copy share link/i;

async function openPublishPanel() {
  renderProjectFileViewer(teamWorkspaceContext(), {
    projectId: 'project-pub',
    projectKind: 'prototype',
    file: htmlFile(),
    liveHtml: '<html><body><h1>Hello</h1></body></html>',
  });
  const shareButton = await screen.findByRole('button', { name: /^share$/i });
  fireEvent.click(shareButton);
  return await screen.findByRole('menuitem', { name: PUBLISH_ROW });
}

// Same flow through the ReactComponentViewer copy of the publish card, which
// is hand-duplicated from HtmlViewer and can regress independently.
async function openReactComponentPublishPanel() {
  renderProjectFileViewer(teamWorkspaceContext(), {
    projectId: 'project-pub',
    projectKind: 'prototype',
    file: reactComponentFile(),
  });
  const shareButton = await screen.findByRole('button', { name: /^share$/i });
  fireEvent.click(shareButton);
  return await screen.findByRole('menuitem', { name: PUBLISH_ROW });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  analytics.track.mockReset();
  analytics.newRequestId.mockClear();
});

describe('publish flow analytics', () => {
  it('reports the publish click, the success result, and the copy-link click', async () => {
    stubFetch();
    const publishButton = await openPublishPanel();
    fireEvent.click(publishButton);

    expect(trackedEvents('ui_click')).toContainEqual(
      expect.objectContaining({
        area: 'share_option_popover',
        element: 'publish_file',
        project_id: 'project-pub',
        // Derived from the `html` renderer, not from `file.kind` (which maps to `unknown`).
        artifact_kind: 'html',
      }),
    );
    await waitFor(() => {
      expect(trackedEvents('artifact_publish_result')).toContainEqual(
        expect.objectContaining({
          action: 'publish',
          result: 'success',
          publish_duration_ms: expect.any(Number),
          artifact_kind: 'html',
        }),
      );
    });

    const copyButton = await screen.findByRole('button', { name: /copy share link/i });
    fireEvent.click(copyButton);
    expect(trackedEvents('ui_click')).toContainEqual(
      expect.objectContaining({
        area: 'share_option_popover',
        element: 'copy_publish_link',
        artifact_kind: 'html',
      }),
    );
  });

  it('reports a failed publish with the workspace-identity error code', async () => {
    stubFetch({ publishStatus: 403 });
    const publishButton = await openPublishPanel();
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(trackedEvents('artifact_publish_result')).toContainEqual(
        expect.objectContaining({
          action: 'publish',
          result: 'failed',
          error_code: 'workspace_identity_required',
        }),
      );
    });
    // A failed publish must not report a success or render the copy-link state.
    expect(
      trackedEvents('artifact_publish_result').some((p) => p.result === 'success'),
    ).toBe(false);
  });

  it('reports a successful unpublish as action unpublish', async () => {
    stubFetch();
    const publishButton = await openPublishPanel();
    fireEvent.click(publishButton);

    const unpublishButton = await screen.findByRole('button', { name: UNPUBLISH_ROW });
    fireEvent.click(unpublishButton);
    await waitFor(() => {
      expect(trackedEvents('artifact_publish_result')).toContainEqual(
        expect.objectContaining({
          action: 'unpublish',
          result: 'success',
          publish_duration_ms: expect.any(Number),
        }),
      );
    });
  });

  it('reports a failed unpublish with the workspace-identity error code', async () => {
    stubFetch({ unpublishStatus: 403 });
    const publishButton = await openPublishPanel();
    fireEvent.click(publishButton);

    const unpublishButton = await screen.findByRole('button', { name: UNPUBLISH_ROW });
    fireEvent.click(unpublishButton);
    await waitFor(() => {
      expect(trackedEvents('artifact_publish_result')).toContainEqual(
        expect.objectContaining({
          action: 'unpublish',
          result: 'failed',
          error_code: 'workspace_identity_required',
        }),
      );
    });
    // The failed unpublish must not clear the published state's success record.
    expect(
      trackedEvents('artifact_publish_result').filter((p) => p.action === 'unpublish' && p.result === 'success'),
    ).toEqual([]);
  });

  // A publish request can start while this viewer is active and settle after the
  // user has switched to another tab. The retained (inert) viewer must stay
  // silent, so the guard has to read the live `workspaceActive` ref rather than
  // the value the in-flight closure captured at click time. `FileWorkspace`
  // retains BOTH viewer chromes, so both copies of the flow need the guard.
  function inactiveViewerCase(props: ComponentProps<typeof FileViewer>, label: string) {
    it(`stays silent when the viewer goes inactive before the request settles (${label})`, async () => {
      let settlePublish: (() => void) | undefined;
      const publishGate = new Promise<void>((resolve) => {
        settlePublish = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.includes('/api/workspace/context')) {
            return new Response(JSON.stringify({ context: teamWorkspaceContext() }), { status: 200 });
          }
          if (url.includes('publish-public')) {
            if (init?.method === 'POST') {
              await publishGate;
              return new Response(
                JSON.stringify({
                  url: 'https://open-design.ai/p/slug-1',
                  slug: 'slug-1',
                  fileName: 'index.html',
                }),
                { status: 200 },
              );
            }
            return new Response(JSON.stringify({ publication: null }), { status: 200 });
          }
          return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
        }),
      );

      const { rerenderWith } = renderProjectFileViewer(teamWorkspaceContext(), props);
      fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
      fireEvent.click(await screen.findByRole('menuitem', { name: PUBLISH_ROW }));
      expect(trackedEvents('ui_click')).toContainEqual(
        expect.objectContaining({ element: 'publish_file' }),
      );

      // The user switches tabs: the viewer stays mounted but retained/inert.
      rerenderWith({ ...props, workspaceActive: false });

      await act(async () => {
        settlePublish?.();
        await publishGate;
      });

      // Wait for the operation's own completion signal rather than timer turns.
      // The handler clears `publishingPublicFile` in its `finally`, strictly
      // after the point where the result event would have been emitted, so the
      // panel leaving its "Creating link…" state proves the continuation ran
      // past the emission site. A retained viewer renders no chrome at all, so
      // switch back first to observe it — the inactive window has already
      // closed, and an event emitted during it would still be recorded.
      rerenderWith({ ...props, workspaceActive: true });
      const shareButton = await screen.findByRole('button', { name: /^share$/i });
      // Only the HtmlViewer chrome drops its open popover while retained;
      // re-opening the React one would toggle it shut.
      if (shareButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(shareButton);
      // Settled looks different per chrome: HtmlViewer discards the published
      // URL at the request-identity guard that follows the emission site and
      // returns to the idle publish row, while ReactComponentViewer commits it
      // and swaps in the copy-link control. Either one means "no longer busy".
      await screen.findByText(SETTLED_PUBLISH_PANEL);
      expect(screen.queryByText(BUSY_PUBLISH_ROW)).toBeNull();
      expect(trackedEvents('artifact_publish_result')).toEqual([]);
    });
  }

  inactiveViewerCase(
    {
      projectId: 'project-pub',
      projectKind: 'prototype',
      file: htmlFile(),
      liveHtml: '<html><body><h1>Hello</h1></body></html>',
    },
    'HtmlViewer',
  );
  inactiveViewerCase(
    { projectId: 'project-pub', projectKind: 'prototype', file: reactComponentFile() },
    'ReactComponentViewer',
  );

  it('reports the project kind and artifact kind from the ReactComponentViewer copy of the flow', async () => {
    stubFetch();
    const publishButton = await openReactComponentPublishPanel();
    fireEvent.click(publishButton);

    expect(trackedEvents('ui_click')).toContainEqual(
      expect.objectContaining({
        area: 'share_option_popover',
        element: 'publish_file',
        project_kind: 'prototype',
        // Derived from the `react-component` renderer; `file.kind` is `code`,
        // which on its own maps to `unknown`.
        artifact_kind: 'html',
      }),
    );
    await waitFor(() => {
      expect(trackedEvents('artifact_publish_result')).toContainEqual(
        expect.objectContaining({
          action: 'publish',
          result: 'success',
          project_kind: 'prototype',
          artifact_kind: 'html',
        }),
      );
    });

    const copyButton = await screen.findByRole('button', { name: /copy share link/i });
    fireEvent.click(copyButton);
    expect(trackedEvents('ui_click')).toContainEqual(
      expect.objectContaining({
        area: 'share_option_popover',
        element: 'copy_publish_link',
        project_kind: 'prototype',
        artifact_kind: 'html',
      }),
    );
  });
});
