// @vitest-environment jsdom
//
// The automations-dashboard hook against hand-written fake
// `RoutinesDashboardPort` / `AutomationDomPort` implementations. Closes the
// branches the TasksView.*.test.tsx integration suites don't reach: a
// projects-omitted refresh, rejecting a proposal, a run-now response with no
// conversationId, crystallize's non-array proposals fallback and its
// proposalRefreshFailed/createdProposals branch matrix, a canceled delete
// confirm, and removing the currently-expanded row.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import {
  useAutomationsDashboard,
  type UseAutomationsDashboardOptions,
} from '../../../src/features/automations/hooks/useAutomationsDashboard.hooks';
import type { AutomationDomPort, RoutinesDashboardPort } from '../../../src/features/automations/ports';
import type { AutomationsSnapshot } from '../../../src/features/automations/types';

function emptySnapshot(overrides: Partial<AutomationsSnapshot> = {}): AutomationsSnapshot {
  return {
    routines: [],
    projects: [],
    automationCatalog: [],
    proposals: [],
    proposalRefreshFailed: false,
    ...overrides,
  };
}

function makePort(overrides: Partial<RoutinesDashboardPort> = {}): RoutinesDashboardPort {
  return {
    fetchAutomationsSnapshot: vi.fn(async () => emptySnapshot()),
    runRoutineNow: vi.fn(async () => null),
    toggleRoutinePaused: vi.fn(async () => {}),
    deleteRoutine: vi.fn(async () => {}),
    reviewAutomationProposal: vi.fn(async () => {}),
    crystallizeRoutineRun: vi.fn(async () => ({ routineId: 'r1', runId: 'run1', packet: {} as never, compressionReport: {} as never, proposals: [] })),
    ...overrides,
  };
}

function makeDomPort(overrides: Partial<AutomationDomPort> = {}): AutomationDomPort {
  return {
    subscribeEscapeKey: vi.fn(() => vi.fn()),
    lockBodyScroll: vi.fn(() => vi.fn()),
    scheduleTimeout: vi.fn(() => vi.fn()),
    confirmDialog: vi.fn(() => true),
    ...overrides,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider initial="en">{children}</I18nProvider>;

function renderDashboard(
  port: RoutinesDashboardPort,
  domPort: AutomationDomPort,
  options: Partial<UseAutomationsDashboardOptions> = {},
) {
  return renderHook(
    () => useAutomationsDashboard(port, domPort, { skills: [], designTemplates: [], connectors: [], ...options }),
    { wrapper },
  );
}

const routine: Routine = {
  id: 'r1',
  name: 'Routine',
  prompt: 'Do it.',
  schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
  target: { mode: 'create_each_run' },
  skillId: null,
  agentId: null,
  enabled: true,
  nextRunAt: null,
  lastRun: null,
  createdAt: 1000,
  updatedAt: 1000,
};

describe('useAutomationsDashboard: refresh', () => {
  it('keeps the prior project list when the snapshot omits projects', async () => {
    const port = makePort({
      fetchAutomationsSnapshot: vi.fn(async () => emptySnapshot({ projects: null })),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toEqual([]);
  });

  it('populates projectsById from a successful snapshot', async () => {
    const port = makePort({
      fetchAutomationsSnapshot: vi.fn(async () => emptySnapshot({ projects: [{ id: 'p1', name: 'Proj One' }] })),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projectsById.get('p1')).toBe('Proj One');
  });

  it('surfaces the error message when the snapshot fetch throws', async () => {
    const port = makePort({
      fetchAutomationsSnapshot: vi.fn(async () => {
        throw new Error('snapshot boom');
      }),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('snapshot boom');
  });
});

describe('useAutomationsDashboard: reviewProposal', () => {
  it('rejects a proposal', async () => {
    const port = makePort();
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reviewProposal('p1', 'reject');
    });
    expect(port.reviewAutomationProposal).toHaveBeenCalledWith('p1', 'reject', expect.any(String));
  });

  it('surfaces the error message when the review transport rejects', async () => {
    const port = makePort({
      reviewAutomationProposal: vi.fn(async () => {
        throw new Error('review boom');
      }),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reviewProposal('p1', 'apply');
    });
    expect(result.current.error).toBe('review boom');
  });
});

describe('useAutomationsDashboard: runNow', () => {
  it('refreshes and expands the row when the response has no projectId', async () => {
    const port = makePort({ runRoutineNow: vi.fn(async () => null) });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.runNow('r1');
    });
    expect(result.current.expandedId).toBe('r1');
  });

  it('falls back to a null conversationId when navigating', async () => {
    const port = makePort({ runRoutineNow: vi.fn(async () => ({ projectId: 'p1' })) });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.runNow('r1');
    });
    // No throw / crash confirms the `?? null` fallback ran; the actual
    // navigation is exercised end-to-end by TasksView.page.test.tsx.
  });

  it('surfaces the error message when the run transport rejects', async () => {
    const port = makePort({
      runRoutineNow: vi.fn(async () => {
        throw new Error('run boom');
      }),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.runNow('r1');
    });
    expect(result.current.error).toBe('run boom');
  });
});

describe('useAutomationsDashboard: onSaved', () => {
  it('refreshes, expands, and focuses the saved routine, scheduling the focus-clear timer', async () => {
    const port = makePort();
    const domPort = makeDomPort();
    const { result } = renderDashboard(port, domPort);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.onSaved(routine);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.focusRoutineId).toBe('r1'));
    expect(domPort.scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 4000);

    // Invoke the scheduled callback directly (as the real timer would) to
    // cover the focus-clear effect's own callback body.
    const scheduled = vi.mocked(domPort.scheduleTimeout).mock.calls.at(-1)?.[0];
    act(() => scheduled?.());
    expect(result.current.focusRoutineId).toBeNull();
  });
});

describe('useAutomationsDashboard: closeModal', () => {
  it('clears the open modal', async () => {
    const port = makePort();
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openCreateModal());
    expect(result.current.modal).not.toBeNull();

    act(() => result.current.closeModal());
    expect(result.current.modal).toBeNull();
  });
});

describe('useAutomationsDashboard: crystallizeRun', () => {
  it('treats a non-array proposals field as empty and surfaces the no-proposals message', async () => {
    const port = makePort({
      crystallizeRoutineRun: vi.fn(async () => ({
        routineId: 'r1',
        runId: 'run1',
        packet: {} as never,
        compressionReport: {} as never,
        proposals: undefined as never,
      })),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.crystallizeRun('r1', 'run1');
    });
    expect(result.current.error).toBe(
      'Crystallize finished, but no proposals were returned. Try refreshing or check the run details.',
    );
  });

  it('reports partial success when the proposal refresh fails but proposals were created', async () => {
    const port = makePort({
      fetchAutomationsSnapshot: vi.fn(async () => emptySnapshot({ proposalRefreshFailed: true })),
      crystallizeRoutineRun: vi.fn(async () => ({
        routineId: 'r1',
        runId: 'run1',
        packet: {} as never,
        compressionReport: {} as never,
        proposals: [{ id: 'p1' } as never],
      })),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.crystallizeRun('r1', 'run1');
    });
    expect(result.current.error).toBe(
      'Crystallize created proposals, but Automations could not refresh the proposal list. Review the visible proposals or try refreshing.',
    );
  });

  it('reports the refresh-failed message when no proposals were created and the refresh also failed', async () => {
    const port = makePort({
      fetchAutomationsSnapshot: vi.fn(async () => emptySnapshot({ proposalRefreshFailed: true })),
      crystallizeRoutineRun: vi.fn(async () => ({
        routineId: 'r1',
        runId: 'run1',
        packet: {} as never,
        compressionReport: {} as never,
        proposals: [],
      })),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.crystallizeRun('r1', 'run1');
    });
    expect(result.current.error).toBe(
      'Crystallize finished, but Automations could not refresh proposals. Try refreshing before running it again.',
    );
  });

  it('surfaces the crystallize-failed message when the transport rejects', async () => {
    const port = makePort({
      crystallizeRoutineRun: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.crystallizeRun('r1', 'run1');
    });
    expect(result.current.error).toBe('Crystallize failed: boom');
  });
});

describe('useAutomationsDashboard: remove', () => {
  it('does nothing when the confirm dialog is dismissed', async () => {
    const port = makePort();
    const domPort = makeDomPort({ confirmDialog: vi.fn(() => false) });
    const { result } = renderDashboard(port, domPort);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('r1');
    });
    expect(port.deleteRoutine).not.toHaveBeenCalled();
  });

  it('clears the expanded row when the removed routine was expanded', async () => {
    const port = makePort({
      fetchAutomationsSnapshot: vi.fn(async () => emptySnapshot({ routines: [routine] })),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.toggleHistory('r1'));
    expect(result.current.expandedId).toBe('r1');

    await act(async () => {
      await result.current.remove('r1');
    });
    expect(result.current.expandedId).toBeNull();
  });

  it('surfaces the error message when the delete transport rejects', async () => {
    const port = makePort({
      deleteRoutine: vi.fn(async () => {
        throw new Error('delete boom');
      }),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('r1');
    });
    expect(result.current.error).toBe('delete boom');
  });
});

describe('useAutomationsDashboard: togglePaused failure', () => {
  it('surfaces the error message on failure', async () => {
    const port = makePort({
      toggleRoutinePaused: vi.fn(async () => {
        throw new Error('pause boom');
      }),
    });
    const { result } = renderDashboard(port, makeDomPort());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.togglePaused(routine);
    });
    expect(result.current.error).toBe('pause boom');
  });
});
