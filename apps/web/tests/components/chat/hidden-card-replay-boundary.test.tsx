// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { OdCard, PersistedAgentEvent } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ChatMessage } from '../../../src/types';

const KEY = 'a7f3c91ed2b40561';
const NEXT_KEY = 'b8e4da2fc3a51672';
const BEFORE = 'Replay prose before the card.';
const AFTER = 'Replay prose after the card.';
const NESTED_FORM = "<question-form id='replay-card-owned'><question-text id='audience' label='REPLAY_HIDDEN_QUESTION'/></question-form>";
const CARD = {
  kind: 'rule-proposal', name: 'REPLAY_HIDDEN_RULE',
  assertion: `REPLAY_HIDDEN_PREFIX ${NESTED_FORM} REPLAY_HIDDEN_SUFFIX`,
  check: 'REPLAY_HIDDEN_CHECK',
} satisfies OdCard;
const RAW_CARD = `<od-card type="rule-proposal">${JSON.stringify(CARD)}</od-card>`;
const FORM_OFFSET = RAW_CARD.indexOf('<question-form');
const REAL_FORM = `<question-form id='next-physical-run'>${JSON.stringify({
  questions: [{ id: 'audience', type: 'text', label: 'Next run audience' }],
})}</question-form>`;

function ui(events: PersistedAgentEvent[]) {
  const message: ChatMessage = {
    id: 'assistant-replay-boundary', role: 'assistant',
    content: events.flatMap((event) => event.kind === 'text' ? [event.text] : []).join(''),
    createdAt: 1000, startedAt: 1000, runId: 'replay-boundary-run',
    runStatus: 'running', events,
  };
  return <I18nProvider initial="en"><AssistantMessage message={message} streaming isLast projectId="project-1" conversationId="conversation-1" /></I18nProvider>;
}

function openExecution(container: HTMLElement) {
  for (const details of container.querySelectorAll<HTMLDetailsElement>('[data-testid="assistant-flow"] details')) {
    if (details.open) continue;
    details.open = true;
    fireEvent(details, new Event('toggle', { bubbles: false }));
  }
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

// Replay compatibility: repeated/current-key and empty metadata do not start
// another physical run in buildTurnBlocks. These are contract boundary cases,
// not claims that a captured production stream contained duplicate metadata.
describe('card ownership across replayed done-key metadata', () => {
  it.each([
    { label: 'the same key', key: KEY },
    { label: 'an empty key', key: '' },
  ])('keeps the card opaque when $label separates its text deltas', async ({ key }) => {
    const initial: PersistedAgentEvent[] = [
      { kind: 'done_key', key: KEY },
      { kind: 'text', text: `${BEFORE}\n\n${RAW_CARD.slice(0, FORM_OFFSET)}` },
    ];
    const { container, rerender } = render(ui(initial));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(BEFORE));
    const replayed: PersistedAgentEvent[] = [
      ...initial,
      { kind: 'done_key', key },
      { kind: 'text', text: `${RAW_CARD.slice(FORM_OFFSET)}\n\n${AFTER}` },
    ];
    const blocks = buildTurnBlocks({ events: replayed, runStatus: 'running' });
    rerender(ui(replayed));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(AFTER));
    // Both the real block builder and rendered UI must retain the boundary:
    // no actual form or completion marker has arrived outside the hidden card.
    expect.soft(blocks.filter((block) => block.kind === 'prose')).toEqual([]);
    expect.soft(container.querySelector('.question-form')).toBeNull();
    expect.soft(within(container).queryByRole('textbox')).toBeNull();
    expect.soft(container.querySelector('[data-od-card="rule-proposal"]')).toBeNull();
    for (const fragment of ['REPLAY_HIDDEN_', '"assertion"', '<od-card']) {
      expect.soft(container.textContent).not.toContain(fragment);
    }
    expect(container.textContent).toContain(BEFORE);
  });

  it('preserves a fenced example across a repeated same-key metadata event', async () => {
    const events: PersistedAgentEvent[] = [
      { kind: 'done_key', key: KEY },
      { kind: 'text', text: `${BEFORE}\n\n\`\`\`xml\n${RAW_CARD.slice(0, FORM_OFFSET)}` },
      { kind: 'done_key', key: KEY },
      { kind: 'text', text: `${RAW_CARD.slice(FORM_OFFSET)}\n\`\`\`\n\n${AFTER}` },
    ];
    const blocks = buildTurnBlocks({ events, runStatus: 'running' });
    const { container } = render(ui(events));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(AFTER));
    expect.soft(blocks.filter((block) => block.kind === 'prose')).toEqual([]);
    expect.soft(Array.from(container.querySelectorAll('code'), (node) => node.textContent)).toEqual([RAW_CARD]);
    expect.soft(container.querySelector('.question-form')).toBeNull();
    expect.soft(within(container).queryByRole('textbox')).toBeNull();
  });

  it('resets the old incomplete card boundary when a different physical-run key arrives', async () => {
    const events: PersistedAgentEvent[] = [
      { kind: 'done_key', key: KEY },
      { kind: 'text', text: `${BEFORE}\n\n${RAW_CARD.slice(0, FORM_OFFSET)}` },
      { kind: 'done_key', key: NEXT_KEY },
      { kind: 'text', text: REAL_FORM },
    ];
    const blocks = buildTurnBlocks({ events, runStatus: 'running' });
    const { container } = render(ui(events));
    openExecution(container);
    await waitFor(() => expect(within(container).getByRole('textbox')).toBeTruthy());
    expect(container.querySelectorAll('.question-form')).toHaveLength(1);
    expect(container.querySelector('[data-form-id="next-physical-run"]')).not.toBeNull();
    expect(container.textContent).toContain('Next run audience');
    expect(blocks.filter((block) => block.kind === 'prose').map((block) => block.text).join('')).toContain(REAL_FORM);
  });
});
