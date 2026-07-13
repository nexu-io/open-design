// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Routine, RoutineRun } from '@open-design/contracts';

import { TasksView } from '../../src/components/TasksView';
import * as router from '../../src/router';

const originalFetch = globalThis.fetch;

describe('TasksView automation history', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows run history metadata, opens the run conversation, and exposes edit', async () => {
    const startedAt = new Date('2026-05-17T08:00:00.000Z').getTime();
    const completedAt = startedAt + 45_000;
    const routines: Routine[] = [
      {
        id: 'routine-1',
        name: 'Live artifact maintainer',
        prompt: 'Refresh the live status board.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: startedAt + 24 * 60 * 60_000,
        lastRun: {
          runId: 'routine-run-1',
          status: 'succeeded',
          trigger: 'scheduled',
          startedAt,
          completedAt,
          projectId: 'proj-run',
          conversationId: 'conv-run',
          agentRunId: 'agent-run-1',
          summary: 'Updated status_board.md',
        },
        createdAt: startedAt,
        updatedAt: startedAt,
      },
    ];
    const runs: RoutineRun[] = [
      {
        id: 'routine-run-1',
        routineId: 'routine-1',
        trigger: 'scheduled',
        status: 'succeeded',
        projectId: 'proj-run',
        conversationId: 'conv-run',
        agentRunId: 'agent-run-1',
        startedAt,
        completedAt,
        summary: 'Updated status_board.md',
        error: null,
        errorCode: null,
      },
    ];
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return new Response(JSON.stringify({ runs }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/mcp/servers' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Live artifact maintainer')).closest('li')!;
    expect(within(row).getByRole('button', { name: 'Open result' })).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'History' }));

    expect(await screen.findByLabelText('Automation run history')).toBeTruthy();
    expect(screen.getByText('Updated status_board.md')).toBeTruthy();
    expect(screen.getByText('agent-run-1')).toBeTruthy();
    expect(screen.getByText('45s')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'proj-run',
      conversationId: 'conv-run',
      fileName: null,
    });

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect((screen.getByLabelText('Automation title') as HTMLInputElement).value).toBe('Live artifact maintainer');
    });
  });
});
