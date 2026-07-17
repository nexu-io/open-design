// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextCompactionActivity } from '../../src/components/ContextCompactionActivity';
import type { AgentEvent } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: analyticsMocks.track }),
}));

function activity(
  phase: 'started' | 'completed',
  overrides: Partial<Extract<AgentEvent, { kind: 'activity' }>> = {},
): Extract<AgentEvent, { kind: 'activity' }> {
  return {
    kind: 'activity',
    activity: 'context_compaction',
    activityId: 'compact-1',
    phase,
    startedAt: Date.now() - 2_000,
    ...overrides,
  } as Extract<AgentEvent, { kind: 'activity' }>;
}

beforeEach(() => {
  analyticsMocks.track.mockReset();
  vi.stubGlobal('IntersectionObserver', undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ContextCompactionActivity observability', () => {
  it('reports matching visible phases across a live compact lifecycle', async () => {
    const props = {
      runId: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      renderSource: 'live_stream' as const,
    };
    const { rerender } = render(
      <ContextCompactionActivity activity={activity('started')} {...props} />,
    );

    await waitFor(() => expect(analyticsMocks.track).toHaveBeenCalledTimes(1));
    expect(analyticsMocks.track.mock.calls[0]).toMatchObject([
      'context_compaction_ui_result',
      {
        result: 'visible',
        event_phase: 'started',
        rendered_phase: 'started',
        phase_match: true,
        render_source: 'live_stream',
        active_seen_before_terminal: true,
      },
      { insertId: 'compact-1:ui:started:live_stream' },
    ]);

    rerender(
      <ContextCompactionActivity
        activity={activity('completed', { elapsedMs: 2_500 })}
        {...props}
      />,
    );

    await waitFor(() => expect(analyticsMocks.track).toHaveBeenCalledTimes(2));
    expect(analyticsMocks.track.mock.calls[1]).toMatchObject([
      'context_compaction_ui_result',
      {
        event_phase: 'completed',
        rendered_phase: 'completed',
        phase_match: true,
        elapsed_ms: 2_500,
        active_seen_before_terminal: true,
      },
      { insertId: 'compact-1:ui:completed:live_stream' },
    ]);
  });

  it('marks a completion loaded from history without inventing an active view', async () => {
    render(
      <ContextCompactionActivity
        activity={activity('completed', { elapsedMs: 4_000 })}
        runId="run-1"
        projectId="project-1"
        conversationId="conversation-1"
        renderSource="persisted_history"
      />,
    );

    await waitFor(() => expect(analyticsMocks.track).toHaveBeenCalledTimes(1));
    expect(analyticsMocks.track.mock.calls[0]?.[1]).toMatchObject({
      event_phase: 'completed',
      rendered_phase: 'completed',
      phase_match: true,
      render_source: 'persisted_history',
      active_seen_before_terminal: false,
      elapsed_displayed: true,
      elapsed_ms: 4_000,
    });
  });
});
