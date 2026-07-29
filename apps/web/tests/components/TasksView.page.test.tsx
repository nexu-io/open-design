// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';

import { TasksView } from '../../src/components/TasksView';
import * as router from '../../src/router';

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;

function mockTasksViewFetch({ routines = [] }: { routines?: Routine[] } = {}) {
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
    if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ proposals: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ packets: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
}

describe('TasksView page shell', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    vi.restoreAllMocks();
  });

  it('renders the automations page hero and summary metrics', async () => {
    const routines: Routine[] = [
      {
        id: 'routine-active-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'routine-active-2',
        name: 'Live artifact refresh',
        prompt: 'Refresh the artifact.',
        schedule: { kind: 'daily', time: '12:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'routine-paused-1',
        name: 'Weekly release notes',
        prompt: 'Draft release notes.',
        schedule: { kind: 'weekly', weekday: 1, time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: false,
        nextRunAt: null,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockTasksViewFetch({ routines });

    render(<TasksView />);

    expect(await screen.findByRole('heading', { name: 'Automations' })).toBeTruthy();
    expect(
      screen.getByText(
        'Plan recurring conversations for project work, Orbit digests, and live artifacts.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('automations-new')).toBeTruthy();
    expect(screen.getByLabelText('Your automations')).toBeTruthy();

    const summary = screen.getByLabelText('Automation summary');
    await waitFor(() => {
      expect(summary.textContent ?? '').toContain('2');
      expect(summary.textContent ?? '').toContain('Active');
      expect(summary.textContent ?? '').toContain('1');
      expect(summary.textContent ?? '').toContain('Paused');
      expect(summary.textContent ?? '').toContain('8');
      expect(summary.textContent ?? '').toContain('Templates');
    });
  });

  it('shows the empty state and opens the create modal from it', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    const emptyState = await screen.findByRole('button', { name: /No automations yet/i });
    expect(within(emptyState).getByText('Create one from a template or start with a blank schedule.')).toBeTruthy();

    fireEvent.click(emptyState);

    await waitFor(() => {
      expect(screen.getByLabelText('Automation title')).toBeTruthy();
    });
  });

  it('opens the create modal from the hero action', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    fireEvent.click(await screen.findByTestId('automations-new'));

    await waitFor(() => {
      expect(screen.getByLabelText('Automation title')).toBeTruthy();
    });
  });

  it('shows the template empty state when switching to an empty category', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    const tabs = await screen.findByRole('tablist', { name: 'Template filters' });
    fireEvent.click(within(tabs).getByRole('tab', { name: /Skills/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent ?? '').toContain('No templates in this category yet.');
    });

    fireEvent.click(within(tabs).getByRole('tab', { name: /^All/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Daily connector digest/i })).toBeTruthy();
    });
  });

  it('runs an automation and opens its project conversation when the daemon returns one', async () => {
    const routines: Routine[] = [
      {
        id: 'routine-run-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const runCalls: string[] = [];
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
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-run-1/run' && init?.method === 'POST') {
        runCalls.push(url);
        return new Response(JSON.stringify({
          projectId: 'proj-run',
          conversationId: 'conv-run',
          agentRunId: 'agent-run-1',
        }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Daily digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({
        kind: 'project',
        projectId: 'proj-run',
        conversationId: 'conv-run',
        fileName: null,
      });
    });
    expect(runCalls).toEqual(['/api/routines/routine-run-1/run']);
  });

  it('pauses and resumes an automation through PATCH updates', async () => {
    let routines: Routine[] = [
      {
        id: 'routine-pause-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const patchBodies: unknown[] = [];
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
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-pause-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patchBodies.push(body);
        routines = [{ ...routines[0]!, enabled: body.enabled, updatedAt: Date.now() }];
        return new Response(JSON.stringify({ routine: routines[0] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Daily digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(within(row).getByRole('button', { name: 'Resume' })).toBeTruthy();
    });

    fireEvent.click(within(row).getByRole('button', { name: 'Resume' }));

    await waitFor(() => {
      expect(within(row).getByRole('button', { name: 'Pause' })).toBeTruthy();
    });

    expect(patchBodies).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it('deletes an automation after confirmation and returns to the empty state', async () => {
    let routines: Routine[] = [
      {
        id: 'routine-delete-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const deletedUrls: string[] = [];
    window.confirm = vi.fn(() => true);
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
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-delete-1' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        routines = [];
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Daily digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete automation' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /No automations yet/i })).toBeTruthy();
    });

    expect(deletedUrls).toEqual(['/api/routines/routine-delete-1']);
  });

  it('opens the last run result from the saved automation row', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const startedAt = new Date('2026-05-25T09:29:00.000Z').getTime();
    const routines: Routine[] = [
      {
        id: 'routine-result-1',
        name: 'Orbit digest',
        prompt: 'Build the digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: {
          runId: 'run-1',
          status: 'failed',
          trigger: 'scheduled',
          startedAt,
          completedAt: startedAt + 5_000,
          projectId: 'proj-result',
          conversationId: 'conv-result',
          agentRunId: 'agent-run-1',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockTasksViewFetch({ routines });

    render(<TasksView />);

    const row = (await screen.findByText('Orbit digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Open result' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'proj-result',
      conversationId: 'conv-result',
      fileName: null,
    });
  });

  it('expands and collapses automation history from the row action', async () => {
    const startedAt = new Date('2026-05-25T09:29:00.000Z').getTime();
    const routines: Routine[] = [
      {
        id: 'routine-history-1',
        name: 'Orbit digest',
        prompt: 'Build the digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
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
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-history-1/runs?limit=10') {
        return new Response(JSON.stringify({
          runs: [
            {
              id: 'run-1',
              routineId: 'routine-history-1',
              trigger: 'manual',
              status: 'succeeded',
              projectId: 'proj-result',
              conversationId: 'conv-result',
              agentRunId: 'agent-run-1',
              startedAt,
              completedAt: startedAt + 45_000,
              summary: 'Updated orbit digest',
              error: null,
              errorCode: null,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Orbit digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));

    expect(await screen.findByLabelText('Automation run history')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Hide history' })).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'Hide history' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Automation run history')).toBeNull();
    });
  });

  it('opens the edit modal with the routine title prefilled', async () => {
    const routines: Routine[] = [
      {
        id: 'routine-edit-1',
        name: 'Orbit digest',
        prompt: 'Build the digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockTasksViewFetch({ routines });

    render(<TasksView />);

    const row = (await screen.findByText('Orbit digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Automation title') as HTMLInputElement).value).toBe(
        'Orbit digest',
      );
    });
  });

  it('updates the active template filter tab state when switching categories', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    const tabs = await screen.findByRole('tablist', { name: 'Template filters' });
    const allTab = within(tabs).getByRole('tab', { name: /^All/i });
    const orbitTab = within(tabs).getByRole('tab', { name: /Orbit/i });

    expect(allTab.getAttribute('aria-selected')).toBe('true');
    expect(orbitTab.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(orbitTab);

    await waitFor(() => {
      expect(allTab.getAttribute('aria-selected')).toBe('false');
      expect(orbitTab.getAttribute('aria-selected')).toBe('true');
    });
  });
});
