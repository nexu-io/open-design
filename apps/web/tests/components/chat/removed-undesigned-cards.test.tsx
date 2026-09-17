// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OdCard } from '@open-design/contracts';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { listMessages } from '../../../src/state/projects';
import type { ChatMessage } from '../../../src/types';

const KEY = 'a7f3c91ed2b40561';
const RETIRED = [
  { kind: 'task-brief', summary: 'UNDESIGNED_BRIEF', fields: [{ label: 'Format', value: 'UNDESIGNED_FORMAT' }] },
  { kind: 'rule-proposal', name: 'UNDESIGNED_RULE', assertion: 'UNDESIGNED_ASSERTION', check: 'UNDESIGNED_CHECK' },
] satisfies OdCard[];
const MEMORY = { kind: 'memory-applied', summary: 'Retained memory', used: [{ type: 'rule', name: 'Existing palette' }] } satisfies OdCard;
const SCORE = { kind: 'verify-scorecard', status: 'pass', summary: 'Retained verification', rows: [{ rule: 'Existing palette', status: 'pass' }] } satisfies OdCard;
const ASSIST = { kind: 'brand-browser-assist', brandId: 'brand-1', url: 'https://brand.test/', reason: 'Retired browser assistance' } satisfies OdCard;
const PROSE = 'Visible neighboring prose';
const CODE = '<od-demo>literal code guard</od-demo>';

function markup(card: OdCard): string {
  return `<od-card type="${card.kind}">${JSON.stringify(card)}</od-card>`;
}

function message(text: string, lane: 'shell' | 'prose', history: boolean): ChatMessage {
  const content = lane === 'shell'
    ? `${text}${history ? `\n<od-done key="${KEY}"/>History conclusion.` : ''}`
    : `Working.\n<od-done key="${KEY}"/>${text}`;
  return {
    id: 'assistant-retired-card', role: 'assistant', content,
    events: [{ kind: 'done_key', key: KEY }, { kind: 'text', text: content }],
    runId: 'retired-card-run', runStatus: history ? 'succeeded' : 'running',
    agentId: 'claude', agentName: 'Claude', createdAt: 1000, startedAt: 1000,
    ...(history ? { endedAt: 2000 } : {}),
  };
}

function show(value: ChatMessage, streaming: boolean, onConfirm = vi.fn().mockResolvedValue({ ok: true, action: 'opened' })) {
  return render(<I18nProvider initial="en"><AssistantMessage message={value} streaming={streaming} projectId="project-1" conversationId="conversation-1" onBrandBrowserAssistConfirm={onConfirm} isLast /></I18nProvider>);
}

function openExecutionRecord(container: HTMLElement): void {
  const record = container.querySelector<HTMLDetailsElement>('[data-testid="assistant-flow"] details');
  if (record && !record.open) {
    record.open = true;
    fireEvent(record, new Event('toggle', { bubbles: false }));
  }
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

// The user explicitly removed these two ChatPanel card types. This supersedes
// their earlier display expectations, while preserving unrelated cards/content.
describe.each(['shell', 'prose'] as const)('removed ChatPanel cards in %s', (lane) => {
  describe.each([false, true])('history=%s', (history) => {
    it.each(RETIRED)('does not expose $kind UI or payload', async (card) => {
      const text = `${PROSE}\n\n${markup(card)}\n\n${markup(MEMORY)}\n\nExample: \`${CODE}\`\n\nVisible trailing prose`;
      const fixture = message(text, lane, history);
      let loaded = fixture;
      if (history) {
        const endpoint = '/api/projects/project-1/conversations/conversation-1/messages';
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
          if (String(input) !== endpoint) throw new Error(`Unexpected request: ${String(input)}`);
          return new Response(JSON.stringify({ messages: [fixture] }), { status: 200, headers: { 'content-type': 'application/json' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        // Exercise the real web history client against its public HTTP shape;
        // this component test does not claim a real daemon/database round-trip.
        const rows = await listMessages('project-1', 'conversation-1');
        expect(fetchMock).toHaveBeenCalledWith(endpoint, undefined);
        const row = rows[0];
        if (!row) throw new Error('Missing history fixture');
        loaded = row;
      }
      const { container } = show(loaded, !history);
      openExecutionRecord(container);
      await waitFor(() => expect(container.textContent).toContain(PROSE));
      expect(container.textContent).toContain('Visible trailing prose');
      expect(container.querySelector('code')?.textContent).toBe(CODE);
      expect(container.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();
      expect(container.textContent).toContain('Retained memory');

      expect(container.querySelector(`[data-od-card="${card.kind}"]`)).toBeNull();
      expect(container.textContent).not.toContain('UNDESIGNED_');
      expect(container.textContent).not.toContain('<od-card');
      expect(container.textContent).not.toContain('"summary"');
      expect(container.textContent).not.toContain('"assertion"');
      for (const name of ['Keep', 'Edit', 'Discard']) {
        expect(within(container).queryByRole('button', { name })).toBeNull();
      }
    });
  });

  it('preserves explicitly quoted card examples as code', () => {
    const quoted = RETIRED.map(markup).join('\n');
    const text = `${PROSE}\n\n\`\`\`xml\n${quoted}\n\`\`\`\n\n${markup(MEMORY)}`;
    const { container } = show(message(text, lane, false), true);
    openExecutionRecord(container);
    expect(container.textContent).toContain(PROSE);
    expect(container.querySelector('code')?.textContent).toBe(quoted);
    expect(container.querySelector('[data-od-card="task-brief"]')).toBeNull();
    expect(container.querySelector('[data-od-card="rule-proposal"]')).toBeNull();
    expect(container.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();
  });
});

it('also hides the subsequently retired verification card', () => {
  const { container } = show(message(`${PROSE}\n${markup(SCORE)}`, 'prose', false), true);
  expect(container.textContent).toContain(PROSE);
  expect(container.querySelector('[data-od-card="verify-scorecard"]')).toBeNull();
  expect(container.textContent).not.toContain(SCORE.summary);
  expect(container.textContent).not.toContain('<od-card');
});

it('also hides the subsequently retired browser-assist card without invoking its callback', () => {
  const onConfirm = vi.fn().mockResolvedValue({ ok: true, action: 'opened' });
  const { container } = show(message(`${PROSE}\n${markup(ASSIST)}`, 'prose', false), true, onConfirm);
  expect(container.textContent).toContain(PROSE);
  expect(container.querySelector('[data-od-card="brand-browser-assist"]')).toBeNull();
  expect(within(container).queryByRole('button', { name: 'Open browser assist' })).toBeNull();
  expect(container.textContent).not.toContain(ASSIST.reason);
  expect(container.textContent).not.toContain('<od-card');
  expect(onConfirm).not.toHaveBeenCalled();
});
