// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import { AutomationRow } from '../../../src/features/automations/components/AutomationRow';

afterEach(() => cleanup());

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    name: 'Routine',
    prompt: 'Do the thing.',
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

function renderRow(routine: Routine, overrides: Partial<Parameters<typeof AutomationRow>[0]> = {}) {
  render(
    <I18nProvider initial="en">
      <AutomationRow
        routine={routine}
        targetLabel="Target"
        isBusy={false}
        isExpanded={false}
        isFocused={false}
        historyTick={0}
        crystallizingRunId={null}
        fireClick={vi.fn()}
        onSetRowRef={vi.fn()}
        onRun={vi.fn()}
        onToggleHistory={vi.fn()}
        onEdit={vi.fn()}
        onTogglePaused={vi.fn()}
        onDelete={vi.fn()}
        onCrystallizeRun={vi.fn()}
        t={(k) => k as string}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe('AutomationRow', () => {
  it('omits the prompt line for a routine with an empty prompt', () => {
    renderRow(makeRoutine({ prompt: '' }));
    expect(screen.queryByText('Do the thing.')).toBeNull();
  });

  it('omits the last-run line for a routine that has never run', () => {
    renderRow(makeRoutine({ lastRun: null }));
    expect(screen.queryByText('automations.openResult')).toBeNull();
  });

  it('renders the prompt and last-run line when both are present', () => {
    renderRow(
      makeRoutine({
        prompt: 'Custom prompt',
        lastRun: {
          runId: 'run-1',
          status: 'succeeded',
          trigger: 'manual',
          startedAt: 1000,
          completedAt: 2000,
          projectId: 'proj-1',
          conversationId: 'conv-1',
          agentRunId: 'agent-1',
        },
      }),
    );
    expect(screen.getByText('Custom prompt')).toBeTruthy();
    expect(screen.getByText('automations.openResult')).toBeTruthy();
  });
});
