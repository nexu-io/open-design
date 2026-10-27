// @vitest-environment jsdom

// entry-index-conflict: the share panel explains the refusal and copies the
// daemon's agent prompt. Real fetch/provider parsing; only HTTP is stubbed.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type SharePlanSummary,
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
  const tree = (next: ComponentProps<typeof FileViewer>, nextContext = context) => (
    <CollabProvider value={{ ...collab, workspaceContext: nextContext }}>
      <FileViewer {...next} />
    </CollabProvider>
  );
  const result = render(tree(props));
  return {
    ...result,
    rerenderWith: (next: ComponentProps<typeof FileViewer>, nextContext = context) => result.rerender(tree(next, nextContext)),
  };
}

function stubFetch(
  options: { publishStatus?: number; publishBody?: unknown; unpublishStatus?: number; sharePlan?: () => SharePlanSummary } = {},
) {
  const { publishStatus = 200, publishBody, unpublishStatus = 200 } = options;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/workspace/context')) {
      return new Response(JSON.stringify({ context: teamWorkspaceContext() }), { status: 200 });
    }
    if (url.includes('/share-plan') && options.sharePlan) {
      return Response.json(options.sharePlan());
    }
    if (url.includes('publish-public')) {
      if (init?.method === 'POST') {
        const body =
          publishBody ??
          (publishStatus === 200
            ? { status: 'published', url: 'https://open-design.ai/p/slug-1', receipt: { filePath: 'index.html', slug: 'slug-1', publishedAt: 1, version: 1, versionId: 'v1' } }
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

const props: ComponentProps<typeof FileViewer> = {
  projectKind: 'prototype', projectId: 'conflict-project', file: htmlFile(),
  liveHtml: '<html><body>Two</body></html>',
};
const conflict = {
  path: 'index.html' as const, entryPath: 'index.html', referencedFrom: 'pages/page2.html', suggestedName: 'home.html',
  referrers: [{ file: 'pages/page2.html', reference: '../index.html', attribute: '<iframe src>', line: 3, replacement: '../home.html' }],
  agentPrompt: 'Open Design cannot share "pages/page2.html" yet.\n1. Rename the project\'s root file "index.html" to "home.html".',
};
const conflictMessage = /“pages\/page2\.html” references the project's root index\.html/;
const genericMessage = /Could not create the share link/i;
let write: ReturnType<typeof vi.fn>;
beforeEach(() => {
  analytics.track.mockReset();
  write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function posts(fetch: ReturnType<typeof vi.fn>) {
  return fetch.mock.calls.filter(([url, init]) => String(url).includes('publish-public') && init?.method === 'POST');
}

it('a share-plan blocker explains the conflict, disables publishing and copies the agent prompt', async () => {
  const fetch = stubFetch({ sharePlan: () => ({
    fileCount: 1, totalBytes: 10, exceedsSizeLimit: false, exclusions: [],
    blockers: [{ code: 'entry-index-conflict', ...conflict }],
  }) });
  renderProjectFileViewer(teamWorkspaceContext(), props);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const generate = await screen.findByRole('menuitem', { name: /generate and copy link/i });
  expect(await screen.findByText(conflictMessage)).toBeTruthy();
  expect(screen.getByText(/home\.html/)).toBeTruthy();
  expect(generate).toBeDisabled();
  fireEvent.click(generate);
  expect(posts(fetch)).toHaveLength(0);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy fix for agent/i })); });
  expect(write).toHaveBeenCalledExactlyOnceWith(conflict.agentPrompt);
  expect(screen.getByRole('button', { name: /^copied$/i })).toBeTruthy();
});

it('shows the prompt for manual copy when the clipboard is unavailable', async () => {
  stubFetch({ sharePlan: () => ({
    fileCount: 1, totalBytes: 10, exceedsSizeLimit: false, exclusions: [],
    blockers: [{ code: 'entry-index-conflict', ...conflict }],
  }) });
  write.mockRejectedValue(new Error('denied'));
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
  renderProjectFileViewer(teamWorkspaceContext(), props);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  await screen.findByText(conflictMessage);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy fix for agent/i })); });
  expect(screen.getByText(/couldn't copy/i)).toBeTruthy();
  expect(document.querySelector('pre')?.textContent).toBe(conflict.agentPrompt);
});

it('a 409 SHARE_ENTRY_INDEX_CONFLICT publish refusal shows the conflict, not the generic failure', async () => {
  const { referencedFrom: _from, ...rest } = conflict;
  const fetch = stubFetch({ publishStatus: 409, publishBody: {
    error: { code: 'SHARE_ENTRY_INDEX_CONFLICT', message: 'refused', data: { referencedFrom: 'pages/page2.html', ...rest } },
  } });
  renderProjectFileViewer(teamWorkspaceContext(), props);
  fireEvent.click(await screen.findByRole('button', { name: /^share$/i }));
  const generate = await screen.findByRole('menuitem', { name: /generate and copy link/i });
  await act(async () => { fireEvent.click(generate); });
  await vi.waitFor(() => expect(screen.getByText(conflictMessage)).toBeTruthy());
  expect(screen.queryByText(genericMessage)).toBeNull();
  expect(posts(fetch)).toHaveLength(1);
  expect(write).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy fix for agent/i })); });
  expect(write).toHaveBeenCalledExactlyOnceWith(conflict.agentPrompt);
});
