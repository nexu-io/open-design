// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';

import { sortRoutinesNewestFirst, TasksView } from '../../src/components/TasksView';

const originalFetch = globalThis.fetch;

function makeRoutine(overrides: Partial<Routine> & Pick<Routine, 'id' | 'name'>): Routine {
  return {
    prompt: 'Run scheduled work.',
    schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
    target: { mode: 'create_each_run' },
    skillId: null,
    agentId: null,
    enabled: true,
    nextRunAt: null,
    lastRun: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

vi.mock('../../src/components/NewAutomationModal', () => ({
  NewAutomationModal: ({
    open,
    onSaved,
  }: {
    open: boolean;
    onSaved: (routine: Routine) => void;
  }) => {
    if (!open) return null;
    return (
      <button
        type="button"
        data-testid="mock-save-routine"
        onClick={() =>
          onSaved(
            makeRoutine({
              id: 'routine-new',
              name: 'Fresh automation',
              createdAt: 9000,
              updatedAt: 9000,
            }),
          )
        }
      >
        Mock save
      </button>
    );
  },
  describeScheduleSummary: () => 'Daily at 9:00',
}));

function mockTasksFetch(routines: Routine[]) {
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
    if (url === '/api/automation-templates') {
      return new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-proposals?status=pending-review') {
      return new Response(JSON.stringify({ proposals: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-source-packets?limit=3') {
      return new Response(JSON.stringify({ packets: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/routines/routine-new/runs?limit=10') {
      return new Response(JSON.stringify({ runs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
}

describe('TasksView routine ordering and focus', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sortRoutinesNewestFirst orders by createdAt descending', () => {
    const older = makeRoutine({ id: 'older', name: 'Older', createdAt: 1000 });
    const newer = makeRoutine({ id: 'newer', name: 'Newer', createdAt: 5000 });

    expect(sortRoutinesNewestFirst([older, newer]).map((routine) => routine.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('renders saved automations newest first', async () => {
    mockTasksFetch([
      makeRoutine({ id: 'older', name: 'Older automation', createdAt: 1000 }),
      makeRoutine({ id: 'newer', name: 'Newer automation', createdAt: 5000 }),
    ]);

    render(<TasksView />);

    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]?.textContent).toContain('Newer automation');
    expect(rows[1]?.textContent).toContain('Older automation');
  });

  it('focuses and expands a routine after create save', async () => {
    const existingRoutine = makeRoutine({
      id: 'routine-existing',
      name: 'Existing automation',
      createdAt: 1000,
    });
    const savedRoutine = makeRoutine({
      id: 'routine-new',
      name: 'Fresh automation',
      createdAt: 9000,
      updatedAt: 9000,
    });
    let routinesFetchCount = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        routinesFetchCount += 1;
        const routines =
          routinesFetchCount >= 2 ? [savedRoutine, existingRoutine] : [existingRoutine];
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
      if (url === '/api/automation-templates') {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review') {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3') {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-new/runs?limit=10') {
        return new Response(JSON.stringify({ runs: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);
    await screen.findByText('Existing automation');

    fireEvent.click(screen.getByTestId('automations-new'));
    fireEvent.click(screen.getByTestId('mock-save-routine'));

    const focusedRow = await waitFor(() => {
      const row = screen.getByTestId('automation-row-routine-new');
      expect(row.className).toContain('is-focused');
      return row;
    });
    expect(focusedRow.textContent).toContain('Fresh automation');
    expect(screen.getByRole('button', { name: 'Hide history' })).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
