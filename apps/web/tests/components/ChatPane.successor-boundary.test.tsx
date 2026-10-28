// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ChatMessage } from '@open-design/contracts';
import { foldStrategyTaskTurns } from '../../src/components/ChatPane';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { I18nProvider } from '../../src/i18n';

const START = 1_790_000_000_000;
const first: ChatMessage = {
  id: 'clarification', role: 'assistant', content: '',
  runId: 'request', runStatus: 'succeeded', startedAt: START, endedAt: START + 29_000,
  strategyTaskExecutionId: 'task', strategyTaskRunIndex: 0,
  events: [{ kind: 'done_key', key: '1111111111111111' }, { kind: 'thinking', text: 'Clarifying the request.' }],
};
const successor: ChatMessage = {
  id: 'answer', role: 'assistant', content: '',
  runId: 'successor', runStatus: 'queued', startedAt: START + 46_000,
  strategyTaskExecutionId: 'task', strategyTaskRunIndex: 1, events: [],
};
const viewOf = (rows: ChatMessage[]) => <I18nProvider initial="en">{foldStrategyTaskTurns(rows).map(m =>
  <AssistantMessage key={m.id} message={m} streaming={m.runStatus === 'running' || m.runStatus === 'queued'} projectId="boundary" />,
)}</I18nProvider>;
afterEach(cleanup);

describe('OPEND-3463 successor boundary arrival', () => {
  it.each(['queued', 'running'] as const)('keeps the completed record settled while the %s successor awaits its boundary', status => {
    const pending = { ...successor, runStatus: status };
    const view = render(viewOf([first]));
    const oldRecord = view.container.querySelector('summary')!;
    expect(oldRecord.textContent).toContain('29s');
    view.rerender(viewOf([first, pending]));
    const records = view.container.querySelectorAll('summary');
    expect(records[0]!.textContent).toContain('Done');
    expect(records[0]!.textContent).toContain('29s');
    expect(foldStrategyTaskTurns([first, pending])).toHaveLength(2);
    view.rerender(viewOf([first, { ...pending, events: [{ kind: 'done_key', key: '2222222222222222' }] }]));
    expect(view.container.querySelector('summary')!.textContent).toContain('Done');
    expect(view.container.querySelector('summary')!.textContent).toContain('29s');
    expect(foldStrategyTaskTurns([first, { ...pending, events: [{ kind: 'done_key', key: '2222222222222222' }] }])).toHaveLength(1);
  });
  it('does not treat an unrelated status event as a physical Run boundary', () => {
    const pending = { ...successor, events: [{ kind: 'status' as const, label: 'starting' }] };
    expect(foldStrategyTaskTurns([first, pending])).toHaveLength(2);
  });
  it.each(['succeeded', 'canceled', 'failed'] as const)('still folds terminal legacy %s history without a boundary event', runStatus => {
    expect(foldStrategyTaskTurns([first, { ...successor, runStatus, endedAt: START + 50_000 }])).toHaveLength(1);
  });
});
