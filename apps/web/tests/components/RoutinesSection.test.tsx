// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';

import { RoutinesSection } from '../../src/components/RoutinesSection';
import * as router from '../../src/router';

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;

describe('RoutinesSection', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    vi.restoreAllMocks();
  });

  it('creates a weekly routine that reuses an existing project', async () => {
    let routines: Routine[] = [];
    const projects = [{ id: 'proj-1', name: 'Routine Test Project' }];
    const createBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        createBodies.push(body);
        routines = [{
          id: 'routine-1',
          name: body.name,
          prompt: body.prompt,
          schedule: body.schedule,
          target: body.target,
          skillId: null,
          agentId: null,
          enabled: true,
          nextRunAt: Date.now() + 3600_000,
          lastRun: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }];
        return new Response(JSON.stringify({ routine: routines[0] }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'New routine' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Weekly digest' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize GitHub and design activity.' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Weekly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.change(screen.getAllByRole('combobox')[1]!, {
      target: { value: 'proj-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Weekly digest')).toBeTruthy();
    });
    expect(createBodies).toEqual([
      {
        name: 'Weekly digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: {
          kind: 'weekly',
          weekday: 3,
          time: '09:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        target: {
          mode: 'reuse',
          projectId: 'proj-1',
        },
        enabled: true,
      },
    ]);
  });

  it('pauses and resumes an existing routine through PATCH updates', async () => {
    let routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
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
      if (url === '/api/routines/routine-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patchBodies.push(body);
        const current = routines[0]!;
        routines = [{
          ...current,
          enabled: body.enabled,
          updatedAt: Date.now(),
        }];
        return new Response(JSON.stringify({ routine: routines[0] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;

    fireEvent.click(within(card).getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(within(card).getByRole('button', { name: 'Resume' })).toBeTruthy();
    });

    fireEvent.click(within(card).getByRole('button', { name: 'Resume' }));
    await waitFor(() => {
      expect(within(card).getByRole('button', { name: 'Pause' })).toBeTruthy();
    });

    expect(patchBodies).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it('runs a routine now and loads its history', async () => {
    let routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const runBodies: string[] = [];

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
      if (url === '/api/routines/routine-1/run' && init?.method === 'POST') {
        runBodies.push(url);
        const current = routines[0]!;
        routines = [{
          ...current,
          lastRun: {
            runId: 'run-1',
            status: 'queued',
            trigger: 'manual',
            startedAt: Date.now(),
            projectId: 'proj-run',
            conversationId: 'conv-run',
            agentRunId: 'agent-run-1',
          },
        }];
        return new Response(JSON.stringify({
          routine: routines[0],
          run: routines[0]!.lastRun,
          projectId: 'proj-run',
          conversationId: 'conv-run',
          agentRunId: 'agent-run-1',
        }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return new Response(JSON.stringify({
          runs: [
            {
              id: 'run-1',
              routineId: 'routine-1',
              trigger: 'manual',
              status: 'queued',
              projectId: 'proj-run',
              conversationId: 'conv-run',
              agentRunId: 'agent-run-1',
              startedAt: Date.now(),
              completedAt: null,
              summary: null,
              error: null,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;

    fireEvent.click(within(card).getByRole('button', { name: 'Run now' }));

    await waitFor(() => {
      expect(within(card).getByRole('button', { name: 'Hide history' })).toBeTruthy();
    });
    expect(await screen.findByText('manual')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open project' })).toBeTruthy();
    expect(runBodies).toEqual(['/api/routines/routine-1/run']);
  });

  it('shows a validation error when reuse mode is selected without a project', async () => {
    const postBodies: unknown[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [{ id: 'proj-1', name: 'Routine Test Project' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines' && init?.method === 'POST') {
        postBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({}), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'New routine' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Weekly digest' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize GitHub and design activity.' },
    });
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    });
    expect(postBodies).toEqual([]);
  });

  it('deletes a routine after confirmation', async () => {
    let routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
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
      if (url === '/api/routines/routine-1' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        routines = [];
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.getByText('No routines yet.')).toBeTruthy();
    });
    expect(deletedUrls).toEqual(['/api/routines/routine-1']);
  });

  it('opens the project referenced by a routine run from history', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const routines = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

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
        return new Response(JSON.stringify({
          runs: [
            {
              id: 'run-1',
              routineId: 'routine-1',
              trigger: 'manual',
              status: 'succeeded',
              projectId: 'proj-run',
              conversationId: 'conv-run',
              agentRunId: 'agent-run-1',
              startedAt: Date.now(),
              completedAt: Date.now() + 2000,
              summary: 'Done',
              error: null,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open project' }));

    expect(navigateSpy).toHaveBeenCalledWith(
      {
        kind: 'project',
        projectId: 'proj-run',
        conversationId: 'conv-run',
        fileName: null,
      },
    );
  });

  it('shows the empty history state when a routine has never run', async () => {
    const routines = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

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
        return new Response(JSON.stringify({ runs: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No runs yet.')).toBeTruthy();
  });

  it('falls back to the empty history state when loading run history fails', async () => {
    const routines = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

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
        return new Response(JSON.stringify({ error: 'history unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No runs yet.')).toBeTruthy();
  });

  it('shows an error alert when the initial routines load fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/routines') {
        return new Response(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects') {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('routines: 500');
  });

  it('shows an error alert when creating a routine fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [] }), {
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
      if (url === '/api/routines' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'provider unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'New routine' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Weekly digest' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize GitHub and design activity.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect((await screen.findByRole('alert')).textContent).toContain('provider unavailable');
    expect(screen.getByDisplayValue('Weekly digest')).toBeTruthy();
  });

  it('shows an error alert when running a routine now fails', async () => {
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

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
      if (url === '/api/routines/routine-1/run' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'agent unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Run now' }));

    expect((await screen.findByRole('alert')).textContent).toContain('agent unavailable');
    expect(within(card).queryByRole('button', { name: 'Hide history' })).toBeNull();
  });

  it('shows an error alert when pausing a routine fails and keeps the current action', async () => {
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

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
      if (url === '/api/routines/routine-1' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ error: 'scheduler unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Pause' }));

    expect((await screen.findByRole('alert')).textContent).toContain('scheduler unavailable');
    expect(within(card).getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  it('shows an error alert when deleting a routine fails', async () => {
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
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
      if (url === '/api/routines/routine-1' && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ error: 'delete failed upstream' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('delete failed upstream');
    expect(screen.getByText('Morning briefing')).toBeTruthy();
  });
});
