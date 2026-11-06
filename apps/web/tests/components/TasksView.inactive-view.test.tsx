// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TasksView } from '../../src/components/TasksView';

const originalFetch = globalThis.fetch;

const LAUNCH_ENDPOINTS = [
  '/api/automation-templates',
  '/api/automation-proposals?status=pending-review',
  '/api/routines',
];

function trackedFetch(seen: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    seen.push(url);
    if (url.startsWith('/api/routines')) {
      return new Response(JSON.stringify({ routines: [] }), { status: 200 });
    }
    if (url.startsWith('/api/automation-templates')) {
      return new Response(JSON.stringify({ templates: [] }), { status: 200 });
    }
    if (url.startsWith('/api/automation-proposals')) {
      return new Response(JSON.stringify({ proposals: [] }), { status: 200 });
    }
    if (url.startsWith('/api/projects') || url.includes('/projects')) {
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('TasksView inactive view', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does not fetch automation data while the view is hidden', async () => {
    // `EntryShell` keeps every entry view mounted and hides the inactive ones
    // with `display: none` + `inert`, so Automations loads its catalog, its
    // proposals, its routines and the project picker on every Home launch —
    // for a tab the user has not opened. Worse, the whole set runs twice,
    // because `tasksWorkspaceIdentity` changes when `/api/workspace/context`
    // resolves and `refresh` is keyed on it.
    const seen: string[] = [];
    globalThis.fetch = trackedFetch(seen);

    render(<TasksView isActive={false} />);

    // Give the mount effects a chance to run before asserting the absence.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Automations' })).toBeTruthy());
    for (const endpoint of LAUNCH_ENDPOINTS) {
      expect(seen).not.toContain(endpoint);
    }
  });

  it('fetches once the view becomes active', async () => {
    // The gate must not turn into "never loads": opening the tab has to fill it.
    const seen: string[] = [];
    globalThis.fetch = trackedFetch(seen);

    const { rerender } = render(<TasksView isActive={false} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Automations' })).toBeTruthy());
    expect(seen).not.toContain('/api/routines');

    rerender(<TasksView isActive />);
    await waitFor(() => expect(seen).toContain('/api/routines'));
    for (const endpoint of LAUNCH_ENDPOINTS) {
      expect(seen).toContain(endpoint);
    }
  });

  it('still loads for callers that do not pass the flag', async () => {
    // Six existing suites render `<TasksView />` bare, and so may other callers;
    // the gate is opt-in, not a new requirement.
    const seen: string[] = [];
    globalThis.fetch = trackedFetch(seen);

    render(<TasksView />);

    await waitFor(() => expect(seen).toContain('/api/routines'));
  });
});
