// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoutineRun } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import { AutomationRunHistory } from '../../../src/features/automations/components/AutomationRunHistory';
import type { AutomationHistoryController } from '../../../src/features/automations/hooks/useAutomationHistory.hooks';

afterEach(() => cleanup());

function makeRun(overrides: Partial<RoutineRun> = {}): RoutineRun {
  return {
    id: 'run-1',
    routineId: 'routine-1',
    trigger: 'manual',
    status: 'succeeded',
    projectId: 'proj-1',
    conversationId: 'conv-1',
    agentRunId: 'agent-1',
    startedAt: 1000,
    completedAt: 2000,
    summary: null,
    error: null,
    errorCode: null,
    ...overrides,
  };
}

function renderHistory(
  runs: RoutineRun[] | null,
  overrides: Partial<Parameters<typeof AutomationRunHistory>[0]> = {},
) {
  const useHistory = (): AutomationHistoryController => ({ runs });
  const onCrystallizeRun = vi.fn();
  const onFireClick = vi.fn();
  render(
    <I18nProvider initial="en">
      <AutomationRunHistory
        routineId="routine-1"
        refreshKey={0}
        crystallizingRunId={null}
        onCrystallizeRun={onCrystallizeRun}
        onFireClick={onFireClick}
        t={(k) => k as string}
        useHistory={useHistory}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onCrystallizeRun, onFireClick };
}

describe('AutomationRunHistory', () => {
  it('shows a loading state while runs is null', () => {
    renderHistory(null);
    expect(screen.getByText('automations.runHistoryLoading')).toBeTruthy();
  });

  it('shows an empty state for zero runs', () => {
    renderHistory([]);
    expect(screen.getByText('automations.runHistoryEmpty')).toBeTruthy();
  });

  it('omits the message row when a run has neither summary nor error', () => {
    renderHistory([makeRun({ summary: null, error: null })]);
    expect(screen.queryByText(/is-error/)).toBeNull();
  });

  it('marks the message row as an error and prefers the error text over the summary', () => {
    renderHistory([makeRun({ summary: 'Summary text', error: 'Error text' })]);
    expect(screen.getByText('Error text')).toBeTruthy();
    expect(screen.queryByText('Summary text')).toBeNull();
  });

  it('hides the crystallize action for a non-succeeded run', () => {
    renderHistory([makeRun({ status: 'failed' })]);
    expect(screen.queryByRole('button', { name: /crystallize/i })).toBeNull();
  });

  it('disables the crystallize button while that run is crystallizing', () => {
    renderHistory([makeRun({ id: 'run-1' })], { crystallizingRunId: 'run-1' });
    expect(screen.getByRole('button', { name: 'automations.crystallizing' })).toBeDisabled();
  });

  it('fires crystallize and view_progress with the right analytics element', () => {
    const { onCrystallizeRun, onFireClick } = renderHistory([makeRun()]);
    fireEvent.click(screen.getByRole('button', { name: /crystallize/i }));
    expect(onFireClick).toHaveBeenCalledWith('crystallize');
    expect(onCrystallizeRun).toHaveBeenCalledWith('routine-1', 'run-1');

    fireEvent.click(screen.getByText('automations.openConversation'));
    expect(onFireClick).toHaveBeenCalledWith('view_progress');
  });
});
