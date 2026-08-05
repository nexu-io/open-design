// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceA = {
  workspaceId: 'workspace-a',
  workspaceMemberId: 'member-a',
  workspaceType: 'team' as const,
  workspaceName: 'A',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
  permissions: {
    canManageWorkspace: true,
    canManageMembers: true,
    canManageBilling: true,
    canShareProjects: true,
    canWriteSyncedFiles: true,
  },
};
const workspaceB = {
  ...workspaceA,
  workspaceId: 'workspace-b',
  workspaceMemberId: 'member-b',
  workspaceName: 'B',
};
let workspaceContext: any = workspaceA;

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({ context: workspaceContext, loading: false }),
}));

vi.mock('../../src/state/projects', () => ({
  listProjects: vi.fn(async () => []),
}));

import { RoutinesSection } from '../../src/components/RoutinesSection';

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.confirm = originalConfirm;
  workspaceContext = workspaceA;
  vi.restoreAllMocks();
});

describe('RoutinesSection Workspace scope', () => {
  it('persists the exact tab Workspace for create-each-run automations', async () => {
    const creates: Array<{ body: any; headers: Headers }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && !init?.method) {
        return Response.json({ routines: [] });
      }
      if (url === '/api/routines' && init?.method === 'POST') {
        creates.push({
          body: JSON.parse(String(init.body)),
          headers: new Headers(init.headers),
        });
        return Response.json({
          routine: {
            id: 'routine-a',
            ...JSON.parse(String(init.body)),
            skillId: null,
            agentId: null,
            nextRunAt: null,
            lastRun: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        }, { status: 201 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'New automation' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'A digest' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize A.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]!.body.context.workspaceScope).toEqual({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    });
    expect(creates[0]!.headers.get('x-od-workspace-id')).toBe('workspace-a');
    expect(creates[0]!.headers.get('x-od-workspace-member-id')).toBe('member-a');
  });

  it('keeps a stale A card action scoped to A while the shell switches to B', async () => {
    const patches: Headers[] = [];
    const routineA = {
      id: 'routine-a',
      name: 'A digest',
      prompt: 'Summarize A.',
      schedule: { kind: 'daily' as const, time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' as const },
      skillId: null,
      agentId: null,
      context: {
        workspaceScope: {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-a',
        },
      },
      enabled: true,
      nextRunAt: null,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const headers = new Headers(init?.headers);
      if (url === '/api/routines' && !init?.method) {
        if (headers.get('x-od-workspace-id') === 'workspace-b') {
          return await new Promise<Response>(() => {});
        }
        return Response.json({ routines: [routineA] });
      }
      if (url === '/api/routines/routine-a' && init?.method === 'PATCH') {
        patches.push(headers);
        return Response.json({
          routine: { ...routineA, enabled: false },
        });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    const view = render(<RoutinesSection />);
    expect(await screen.findByText('A digest')).toBeTruthy();

    workspaceContext = workspaceB;
    view.rerender(<RoutinesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.get('x-od-workspace-id')).toBe('workspace-a');
    expect(patches[0]!.get('x-od-workspace-member-id')).toBe('member-a');
  });

  it('uses the routine scope for list, run, history, and delete requests', async () => {
    const observed = new Map<string, Headers>();
    const routineA = {
      id: 'routine-a',
      name: 'A digest',
      prompt: 'Summarize A.',
      schedule: { kind: 'daily' as const, time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' as const },
      skillId: null,
      agentId: null,
      context: {
        workspaceScope: {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-a',
        },
      },
      enabled: true,
      nextRunAt: null,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    window.confirm = vi.fn(() => true);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? 'GET';
      observed.set(`${method} ${url}`, new Headers(init?.headers));
      if (url === '/api/routines' && method === 'GET') {
        return Response.json({ routines: [routineA] });
      }
      if (url === '/api/routines/routine-a/run' && method === 'POST') {
        return Response.json({}, { status: 202 });
      }
      if (url === '/api/routines/routine-a/runs?limit=10' && method === 'GET') {
        return Response.json({ runs: [] });
      }
      if (url === '/api/routines/routine-a' && method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);
    expect(await screen.findByText('A digest')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => {
      expect(observed.has('POST /api/routines/routine-a/run')).toBe(true);
    });
    await waitFor(() => {
      expect(observed.has('GET /api/routines/routine-a/runs?limit=10')).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(observed.has('DELETE /api/routines/routine-a')).toBe(true);
    });

    for (const key of [
      'GET /api/routines',
      'POST /api/routines/routine-a/run',
      'GET /api/routines/routine-a/runs?limit=10',
      'DELETE /api/routines/routine-a',
    ]) {
      expect(observed.get(key)?.get('x-od-workspace-id'), key).toBe('workspace-a');
      expect(observed.get(key)?.get('x-od-workspace-member-id'), key).toBe('member-a');
    }
  });
});
