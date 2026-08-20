// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: {
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      workspaceType: 'team',
      workspaceName: 'A',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
      permissions: {
        canManageWorkspace: true,
        canManageMembers: true,
        canManageBilling: true,
        canShareProjects: true,
        canWriteSyncedFiles: true,
      },
    },
    loading: false,
  }),
}));

vi.mock('../../src/state/projects', () => ({
  listPlugins: vi.fn(async () => []),
}));

vi.mock('../../src/state/mcp', () => ({
  fetchMcpServers: vi.fn(async () => ({ servers: [], templates: [] })),
}));

import { NewAutomationModal } from '../../src/components/NewAutomationModal';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('NewAutomationModal Workspace scope', () => {
  it('saves create-each-run automation with exact Workspace/member headers and context', async () => {
    const requests: Array<{ body: any; headers: Headers }> = [];
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      });
      return Response.json({
        routine: {
          id: 'routine-a',
          ...JSON.parse(String(init?.body)),
          skillId: null,
          agentId: null,
          nextRunAt: null,
          lastRun: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }, { status: 201 });
    }) as typeof fetch;

    render(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'A digest' },
    });
    fireEvent.change(screen.getByTestId('automation-modal-prompt'), {
      target: { value: 'Summarize A.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.body.context.workspaceScope).toEqual({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    });
    expect(requests[0]!.headers.get('x-od-workspace-id')).toBe('workspace-a');
    expect(requests[0]!.headers.get('x-od-workspace-member-id')).toBe('member-a');
  });
});
