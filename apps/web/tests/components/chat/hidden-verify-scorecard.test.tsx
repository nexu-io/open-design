// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OdCard } from '@open-design/contracts';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { listMessages } from '../../../src/state/projects';
import type { ChatMessage } from '../../../src/types';

const KEY = 'a7f3c91ed2b40561';
const BEFORE = 'Visible prose before verification.';
const AFTER = 'Visible prose after verification.';
const MEMORY = { kind: 'memory-applied', summary: 'Remembered palette preference', used: [{ type: 'rule', name: 'Use the saved palette' }] } satisfies OdCard;
const SCORES = (['pass', 'partial', 'fail'] as const).map((status) => ({
  kind: 'verify-scorecard', status, summary: `HIDDEN_VERIFY_SUMMARY_${status}`,
  rows: [{ rule: `HIDDEN_VERIFY_RULE_${status}`, status: 'fail', note: `HIDDEN_VERIFY_NOTE_${status}` }],
} satisfies OdCard));

function markup(card: OdCard): string {
  return `<od-card type="${card.kind}">${JSON.stringify(card)}</od-card>`;
}

function message(text: string, lane: 'shell' | 'prose', history: boolean): ChatMessage {
  const content = lane === 'shell'
    ? `${text}${history ? `\n<od-done key="${KEY}"/>Historical conclusion.` : ''}`
    : `Working.\n<od-done key="${KEY}"/>${text}`;
  return {
    id: 'assistant-hidden-verify', role: 'assistant', content,
    events: [{ kind: 'done_key', key: KEY }, { kind: 'text', text: content }],
    runId: 'hidden-verify-run', runStatus: history ? 'succeeded' : 'running',
    agentId: 'claude', agentName: 'Claude', createdAt: 1000, startedAt: 1000,
    ...(history ? { endedAt: 2000 } : {}),
  };
}

function openDetails(details: HTMLDetailsElement | null) {
  if (details && !details.open) {
    details.open = true;
    fireEvent(details, new Event('toggle', { bubbles: false }));
  }
}

function show(value: ChatMessage, streaming: boolean) {
  const result = render(
    <I18nProvider initial="en">
      <AssistantMessage message={value} streaming={streaming} projectId="project-1" conversationId="conversation-1" isLast />
    </I18nProvider>,
  );
  // Open the real execution disclosure: a deferred collapsed body must not
  // make absence of the scorecard appear to pass.
  openDetails(result.container.querySelector<HTMLDetailsElement>('[data-testid="assistant-flow"] details'));
  return result;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe.each(['shell', 'prose'] as const)('hidden verification scorecards in %s', (lane) => {
  describe.each([false, true])('history=%s', (history) => {
    it('consumes passing, partial, and failed cards without showing their UI or payload, retaining prose and memory', async () => {
      const text = [BEFORE, ...SCORES.map(markup), markup(MEMORY), AFTER].join('\n\n');
      const fixture = message(text, lane, history);
      let loaded = fixture;
      if (history) {
        const endpoint = '/api/projects/project-1/conversations/conversation-1/messages';
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
          if (String(input) !== endpoint) throw new Error(`Unexpected request: ${String(input)}`);
          return new Response(JSON.stringify({ messages: [fixture] }), { status: 200, headers: { 'content-type': 'application/json' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        // Exercise the real message client/DTO replay, not a daemon/database E2E.
        const rows = await listMessages('project-1', 'conversation-1');
        expect(fetchMock).toHaveBeenCalledWith(endpoint, undefined);
        const row = rows[0];
        if (!row) throw new Error('Missing verification history fixture');
        loaded = row;
      }
      const { container } = show(loaded, !history);
      await waitFor(() => expect(container.textContent).toContain(BEFORE));
      expect(container.textContent).toContain(AFTER);
      const memory = container.querySelector<HTMLDetailsElement>('[data-od-card="memory-applied"]');
      expect(memory).not.toBeNull();
      expect(memory?.textContent).toContain(MEMORY.summary);
      openDetails(memory);
      expect(memory?.textContent).toContain('Use the saved palette');

      expect(container.querySelector('[data-od-card="verify-scorecard"]')).toBeNull();
      expect(within(container).queryByRole('button', { name: /Self-check/ })).toBeNull();
      for (const hidden of ['<od-card', '"rows"', 'HIDDEN_VERIFY_SUMMARY_', 'HIDDEN_VERIFY_RULE_', 'HIDDEN_VERIFY_NOTE_']) {
        expect(container.textContent).not.toContain(hidden);
      }
    });

    it('keeps inline and fenced scorecard examples verbatim instead of consuming code', async () => {
      const card = SCORES[0];
      if (!card) throw new Error('Missing scorecard example');
      const quoted = markup(card);
      const text = `${BEFORE}\n\n\`${quoted}\`\n\n\`\`\`xml\n${quoted}\n\`\`\`\n\n${AFTER}`;
      const { container } = show(message(text, lane, history), !history);
      await waitFor(() => expect(container.textContent).toContain(BEFORE));
      expect(container.textContent).toContain(AFTER);
      expect(Array.from(container.querySelectorAll('code'), (node) => node.textContent)).toEqual([quoted, quoted]);
      expect(container.querySelector('[data-od-card="verify-scorecard"]')).toBeNull();
    });
  });
});

describe('unrelated ChatPanel capabilities stay available', () => {
  it.each([false, true])('keeps the actual Thinking disclosure and memory with history=%s', async (history) => {
    const fixture = message(`${BEFORE}\n\n${markup(MEMORY)}\n\n${AFTER}`, 'prose', history);
    fixture.events = [{ kind: 'thinking', text: 'Thinking content remains visible.' }, ...(fixture.events ?? [])];
    const { container } = show(fixture, !history);
    const thoughts = await waitFor(() => within(container).getByText('Thoughts'));
    const disclosure = thoughts.closest('details');
    expect(disclosure).not.toBeNull();
    openDetails(disclosure);
    await waitFor(() => expect(disclosure?.textContent).toContain('Thinking content remains visible.'));
    expect(container.querySelector('[data-od-card="memory-applied"]')?.textContent).toContain(MEMORY.summary);
    expect(container.textContent).toContain(BEFORE);
    expect(container.textContent).toContain(AFTER);
  });
});
