// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';

import { TasksView } from '../../src/components/TasksView';
import * as router from '../../src/router';

// Capture every analytics event the tab emits. The page_view + ui_click
// instrumentation lives in TasksView; this suite is the acceptance gate for
// the Automations tab tracking (埋点文档 row 25), which previously reported
// only page_view with zero in-tab clicks.
const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
  newRequestId: vi.fn(() => 'request-1'),
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: analyticsMocks.track,
    newRequestId: analyticsMocks.newRequestId,
    setConfigureGlobals: vi.fn(),
    setConsent: vi.fn(),
    setIdentity: vi.fn(),
  }),
}));

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
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
    ...overrides,
  } as Routine;
}

function mockFetch({ routines = [] as Routine[] } = {}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const isGet = !init || init.method === undefined;
    if (url === '/api/routines' && isGet) {
      return new Response(JSON.stringify({ routines }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects' && isGet) {
      return new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-templates' && isGet) {
      return new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-proposals?status=pending-review' && isGet) {
      return new Response(JSON.stringify({ proposals: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/routines/routine-1/run' && init?.method === 'POST') {
      return new Response(JSON.stringify({}), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/routines/routine-1' && init?.method === 'PATCH') {
      return new Response(JSON.stringify({ routine: routine({ enabled: false }) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/routines/routine-1' && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
}

function clicks() {
  return analyticsMocks.track.mock.calls.filter(([event]) => event === 'ui_click');
}

function lastClick() {
  const all = clicks();
  return all[all.length - 1]?.[1];
}

describe('TasksView analytics', () => {
  beforeEach(() => {
    analyticsMocks.track.mockReset();
    vi.spyOn(router, 'navigate').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    vi.restoreAllMocks();
  });

  it('fires page_view=automations once on mount', async () => {
    mockFetch();
    render(<TasksView />);
    await screen.findByRole('heading', { name: 'Automations' });

    const pageViews = analyticsMocks.track.mock.calls.filter(([event]) => event === 'page_view');
    expect(pageViews).toHaveLength(1);
    expect(pageViews[0]?.[1]).toMatchObject({ page_name: 'automations' });
  });

  it('tracks the new-automation hero click', async () => {
    mockFetch();
    render(<TasksView />);
    fireEvent.click(await screen.findByTestId('automations-new'));

    expect(lastClick()).toMatchObject({
      page_name: 'automations',
      area: 'automations',
      element: 'new_automation',
    });
  });

  // Run / Pause / Delete each trigger a refresh + re-render, so each row
  // action gets an isolated render to avoid asserting against a stale node.
  it.each([
    { button: 'Run', element: 'run_now' },
    { button: 'Pause', element: 'pause' },
    { button: 'History', element: 'history' },
    { button: 'Edit', element: 'edit' },
    { button: 'Delete automation', element: 'delete' },
  ])('tracks the $element row action', async ({ button, element }) => {
    window.confirm = vi.fn(() => true);
    mockFetch({ routines: [routine()] });
    render(<TasksView />);
    const row = (await screen.findByText('Orbit digest')).closest('li')!;

    fireEvent.click(within(row).getByRole('button', { name: button }));
    expect(lastClick()).toMatchObject({
      page_name: 'automations',
      area: 'automations',
      element,
    });
  });

  it('tracks open_artifact from the last-run link', async () => {
    const startedAt = new Date('2026-05-25T09:29:00.000Z').getTime();
    mockFetch({
      routines: [
        routine({
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
        } as Partial<Routine>),
      ],
    });
    render(<TasksView />);
    const row = (await screen.findByText('Orbit digest')).closest('li')!;

    fireEvent.click(within(row).getByRole('button', { name: 'Open result' }));
    expect(lastClick()).toMatchObject({ element: 'open_artifact' });
  });

  it('tracks the template filter tab with its filter_id', async () => {
    mockFetch();
    render(<TasksView />);
    const tabs = await screen.findByRole('tablist', { name: 'Template filters' });

    fireEvent.click(within(tabs).getByRole('tab', { name: /Orbit/i }));
    expect(lastClick()).toMatchObject({ element: 'filter_tab', filter_id: 'orbit' });
  });

  it('tracks a template card click with its template_kind', async () => {
    mockFetch();
    render(<TasksView />);
    // Fallback orbit template ("Daily connector digest") is always rendered.
    fireEvent.click(await screen.findByRole('button', { name: /Daily connector digest/i }));

    expect(lastClick()).toMatchObject({ element: 'type_card', template_kind: 'orbit' });
  });
});
