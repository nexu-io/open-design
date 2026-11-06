// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type Routine,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceState = vi.hoisted(() => ({
  context: null as WorkspaceCollabContext | null,
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: workspaceState.context,
    loading: false,
    failure: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../src/state/projects', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
}));

import { TasksView } from '../../src/components/TasksView';

function workspace(memberId: string): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-shared-id',
    workspaceType: 'team',
    workspaceMemberId: memberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    providerMode: 'platform_credits',
    planId: null,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
    teamId: 'team-1',
  };
}

function routine(): Routine {
  return {
    id: 'routine-1',
    name: 'Scoped routine',
    prompt: 'Run scheduled work.',
    schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
    target: { mode: 'create_each_run' },
    skillId: null,
    agentId: null,
    enabled: true,
    nextRunAt: null,
    lastRun: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TasksView exact Workspace routine scope', () => {
  afterEach(() => {
    cleanup();
    workspaceState.context = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('scopes every routine request and refreshes for a full identity change', async () => {
    workspaceState.context = workspace('member-a');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/routines') return response({ routines: [routine()] });
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return response({
          runs: [{
            id: 'run-1',
            routineId: 'routine-1',
            trigger: 'manual',
            status: 'succeeded',
            projectId: 'project-1',
            conversationId: 'conversation-1',
            agentRunId: 'agent-run-1',
            startedAt: 1,
            completedAt: 2,
            summary: 'Done',
            error: null,
            errorCode: null,
          }],
        });
      }
      if (url.endsWith('/crystallize')) return response({ proposals: [] });
      if (url.startsWith('/api/routines/')) return response({});
      if (url === '/api/automation-templates') return response({ templates: [] });
      if (url === '/api/automation-proposals?status=pending-review') {
        return response({ proposals: [] });
      }
      return response({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const rendered = render(<TasksView />);
    const row = (await screen.findByText('Scoped routine')).closest('li')!;

    fireEvent.click(within(row).getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/run'))).toBe(true);
      expect(within(row).getByRole('button', { name: 'Pause' })).not.toBeDisabled();
    });
    await screen.findByLabelText('Automation run history');
    fireEvent.click(screen.getByRole('button', { name: 'Crystallize' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/crystallize'))).toBe(true);
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
      expect(within(row).getByRole('button', { name: 'Delete automation' })).not.toBeDisabled();
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Delete automation' }));

    await waitFor(() => {
      const routineCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith('/api/routines'),
      );
      expect(routineCalls.some(([input]) => String(input).endsWith('/run'))).toBe(true);
      expect(routineCalls.some(([input]) => String(input).includes('/runs?limit=10'))).toBe(true);
      expect(routineCalls.some(([input]) => String(input).endsWith('/crystallize'))).toBe(true);
      expect(routineCalls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
      expect(routineCalls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
      for (const [, init] of routineCalls) {
        const headers = new Headers(init?.headers);
        expect(headers.get('x-od-workspace-id')).toBe('workspace-shared-id');
        expect(headers.get('x-od-workspace-member-id')).toBe('member-a');
      }
    });

    workspaceState.context = workspace('member-b');
    rendered.rerender(<TasksView />);

    await waitFor(() => {
      const memberBLists = fetchMock.mock.calls.filter(([input, init]) => {
        const headers = new Headers(init?.headers);
        return String(input) === '/api/routines'
          && headers.get('x-od-workspace-member-id') === 'member-b';
      });
      expect(memberBLists.length).toBeGreaterThan(0);
    });
  });
});
