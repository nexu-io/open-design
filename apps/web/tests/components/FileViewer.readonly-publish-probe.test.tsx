// @vitest-environment jsdom

// Red-spec for the readonly publish-public probe (Batch A §4.4).
//
// Evidence baseline (electron-project-waterfall-20260727): a readonly shared
// project opened by a non-owner member issued
// GET /files/:file/publish-public on mount and received a fixed 403 after
// 2.103 s. The viewer's capability state (`viewerOnly`, which fails closed
// from the local catalog/status snapshot while ownership is unknown) already
// says the publish surface is disabled — the probe must be skipped up front,
// not inferred from the failing response.

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    viewerOnly: props.viewerOnly === true,
    writerAuthority: props.viewerOnly === true ? 'denied' : 'allowed',
    isOwner: props.viewerOnly !== true,
    isEffectiveOwner: props.viewerOnly !== true,
    isSharedNonOwner: props.viewerOnly === true,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => {},
    requestPublish: () => {},
    refreshPresence: () => {},
    checkStatusNow: () => {},
  };
  return render(
    <CollabProvider value={collab}>
      <FileViewer {...props} />
    </CollabProvider>,
  );
}

function stubFetch(context: WorkspaceCollabContext) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/workspace/context')) {
      return new Response(JSON.stringify({ context }), { status: 200 });
    }
    if (url.includes('publish-public')) {
      return new Response(JSON.stringify({ publication: null }), { status: 200 });
    }
    return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([input]) =>
    typeof input === 'string' ? input : String(input),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('readonly viewers skip the publish-public probe (Batch A §4.4)', () => {
  it('issues no publish-public read for a viewer-only shared project', async () => {
    const fetchMock = stubFetch(teamWorkspaceContext());
    renderProjectFileViewer(teamWorkspaceContext(), {
      projectId: 'project-ro',
      projectKind: 'prototype',
      file: htmlFile(),
      liveHtml: '<html><body><h1>Hello</h1></body></html>',
      viewerOnly: true,
    });
    // Let the mount-time effects (workspace context, deployments) settle.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      requestedUrls(fetchMock).some((url) => url.includes('publish-public')),
    ).toBe(false);
  });

  it('still hydrates the published state for a writable viewer', async () => {
    const fetchMock = stubFetch(teamWorkspaceContext());
    renderProjectFileViewer(teamWorkspaceContext(), {
      projectId: 'project-rw',
      projectKind: 'prototype',
      file: htmlFile(),
      liveHtml: '<html><body><h1>Hello</h1></body></html>',
    });
    await waitFor(() =>
      expect(
        requestedUrls(fetchMock).some((url) => url.includes('publish-public')),
      ).toBe(true),
    );
    const publicationCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('publish-public'),
    );
    expect(publicationCall).toBeTruthy();
    const headers = new Headers(publicationCall?.[1]?.headers);
    expect(headers.get('x-od-workspace-id')).toBe('ws-1');
    expect(headers.get('x-od-workspace-member-id')).toBe('wm-1');
  });
});
