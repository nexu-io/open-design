// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { GenUIInbox } from '../../src/components/GenUIInbox';

const WORKSPACE_CONTEXT = {
  workspaceId: 'workspace-team',
  workspaceType: 'team',
  workspaceMemberId: 'member-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: {
    canShareProjects: true,
    canWriteSyncedFiles: true,
  },
} as WorkspaceCollabContext;

const SURFACE = {
  id: 'row-1',
  surfaceId: 'approval-1',
  projectId: 'project-1',
  kind: 'confirmation',
  persist: 'project',
  status: 'resolved',
  requestedAt: 1,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GenUIInbox Workspace transport', () => {
  it('sends exact Workspace authority for list and revoke', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/revoke')) return Response.json({ ok: true });
      return Response.json({ surfaces: [SURFACE] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GenUIInbox projectId="project-1" workspaceContext={WORKSPACE_CONTEXT} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('x-od-workspace-id')).toBe('workspace-team');
      expect(headers.get('x-od-workspace-member-id')).toBe('member-1');
      expect(headers.get('x-od-workspace-can-write-synced-files')).toBe('true');
    }
  });

  it('keeps legacy unbound requests headerless', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ surfaces: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<GenUIInbox projectId="legacy-project" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('x-od-workspace-id')).toBe(false);
  });
});
