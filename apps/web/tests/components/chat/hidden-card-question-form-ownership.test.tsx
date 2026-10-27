// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { OdCard } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage, type QuestionFormSubmitHandler } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import type { ChatMessage } from '../../../src/types';

const KEY = 'a7f3c91ed2b40561';
const BEFORE = 'Ordinary prose before the opaque card.';
const AFTER = 'Ordinary prose after the opaque card.';
const HIDDEN = 'HIDDEN_CARD_FIELD';
// This is the existing persisted child-tag grammar, not malformed JSON. Its
// single-quoted attributes remain valid after the whole card is JSON.stringify'd.
const LEGACY_FORM = "<question-form id='card-owned-form' title='Nested question'><question-text id='audience' label='HIDDEN_NESTED_QUESTION'/></question-form>";
const JSON_FORM = `<question-form id='card-owned-json'>${JSON.stringify({
  questions: [{ id: 'audience', type: 'text', label: 'HIDDEN_NESTED_JSON_QUESTION' }],
})}</question-form>`;
const REAL_FORM = `<question-form id='real-prose-form'>${JSON.stringify({
  submitLabel: 'Send answers',
  questions: [{ id: 'audience', type: 'text', label: 'Ordinary audience question' }],
})}</question-form>`;
const MEMORY = {
  kind: 'memory-applied', summary: 'Retained memory summary',
  used: [{ type: 'rule', name: 'Retained palette rule' }],
} satisfies OdCard;
const KINDS = ['task-brief', 'rule-proposal', 'verify-scorecard'] as const;
type HiddenKind = typeof KINDS[number];
type Lane = 'shell' | 'prose';

function hiddenCard(kind: HiddenKind, form = LEGACY_FORM): OdCard {
  const payload = `${HIDDEN} ${form} HIDDEN_CARD_SUFFIX`;
  if (kind === 'task-brief') return { kind, summary: payload, fields: [{ label: 'Format', value: 'HIDDEN_FORMAT' }] };
  if (kind === 'rule-proposal') return { kind, name: 'HIDDEN_RULE', assertion: payload, check: 'HIDDEN_CHECK' };
  return { kind, status: 'fail', summary: payload, rows: [{ rule: 'HIDDEN_VERIFY_RULE', status: 'fail' }] };
}

function markup(card: OdCard): string {
  return `<od-card type="${card.kind}">${JSON.stringify(card)}</od-card>`;
}

function ui(chunks: string[], lane: Lane, streaming: boolean, onSubmit?: QuestionFormSubmitHandler, thinking = false) {
  const prefix = lane === 'prose' ? `Working.\n<od-done key="${KEY}"/>` : '';
  const suffix = lane === 'shell' && !streaming ? `\n<od-done key="${KEY}"/>Historical conclusion.` : '';
  const textChunks = [prefix, ...chunks, suffix].filter(Boolean);
  const message: ChatMessage = {
    id: 'assistant-card-form-ownership', role: 'assistant', content: textChunks.join(''),
    createdAt: 1000, startedAt: 1000, runId: 'card-form-ownership-run',
    runStatus: streaming ? 'running' : 'succeeded',
    ...(streaming ? {} : { endedAt: 2000 }),
    events: [
      { kind: 'done_key', key: KEY },
      ...(thinking ? [{ kind: 'thinking' as const, text: 'Retained real Thinking content.' }] : []),
      ...textChunks.map((text) => ({ kind: 'text' as const, text })),
    ],
  };
  return <I18nProvider initial="en"><AssistantMessage message={message} streaming={streaming} isLast projectId="project-1" conversationId="conversation-1" onSubmitQuestionForm={onSubmit} /></I18nProvider>;
}

function openExecution(container: HTMLElement) {
  const details = container.querySelector<HTMLDetailsElement>('[data-testid="assistant-flow"] details');
  if (details && !details.open) {
    details.open = true;
    fireEvent(details, new Event('toggle', { bubbles: false }));
  }
}

function expectOpaque(container: HTMLElement) {
  expect.soft(container.querySelector('.question-form')).toBeNull();
  expect.soft(within(container).queryByRole('textbox')).toBeNull();
  for (const marker of [HIDDEN, 'HIDDEN_CARD_SUFFIX', 'HIDDEN_NESTED_', '"summary"', '"assertion"', '<od-card']) {
    expect.soft(container.textContent).not.toContain(marker);
  }
  for (const kind of KINDS) {
    expect.soft(container.querySelector(`[data-od-card="${kind}"]`)).toBeNull();
  }
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe.each(['shell', 'prose'] as const)('opaque hidden card payloads in %s', (lane) => {
  it.each(KINDS)('does not render nested legacy forms or JSON from a complete %s card', async (kind) => {
    const text = `${BEFORE}\n\n${markup(hiddenCard(kind))}\n\n${markup(MEMORY)}\n\n${AFTER}`;
    const { container } = render(ui([text], lane, false));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(BEFORE));
    expect(container.textContent).toContain(AFTER);
    expect(container.querySelector('[data-od-card="memory-applied"]')?.textContent).toContain(MEMORY.summary);
    expectOpaque(container);
  });

  it.each(KINDS)('keeps a streamed %s payload opaque before and after its close tag arrives', async (kind) => {
    const raw = markup(hiddenCard(kind));
    // Frame one has the outer opener plus an incomplete nested form; frame two
    // completes the form while the outer card/JSON are still incomplete. Frame
    // three closes the real card. Each render carries the actual text deltas.
    const formStart = raw.indexOf('<question-form');
    const formEnd = raw.indexOf('</question-form>') + '</question-form>'.length;
    const cuts = [formStart + '<question-form'.length, formEnd, raw.length];
    const chunks = [`${BEFORE}\n\n`];
    const { container, rerender } = render(ui(chunks, lane, true));
    let at = 0;
    for (const cut of cuts) {
      chunks.push(raw.slice(at, cut));
      at = cut;
      rerender(ui([...chunks], lane, true));
      openExecution(container);
      await waitFor(() => expect(container.textContent).toContain(BEFORE));
      expectOpaque(container);
    }
    chunks.push(`\n\n${markup(MEMORY)}\n\n${AFTER}`);
    rerender(ui(chunks, lane, false));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(AFTER));
    expect(container.querySelector('[data-od-card="memory-applied"]')?.textContent).toContain(MEMORY.summary);
    expectOpaque(container);
  });

  it('does not parse JSON-escaped canonical form text out of a valid card field', async () => {
    // Unlike the legacy case, inner JSON quotes are escaped by the outer JSON.
    // The card is still valid; a fallback parse error must not replace its field.
    const text = `${BEFORE}\n\n${markup(hiddenCard('verify-scorecard', JSON_FORM))}\n\n${AFTER}`;
    const { container } = render(ui([text], lane, false));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(BEFORE));
    expect(container.textContent).toContain(AFTER);
    expectOpaque(container);
    expect(container.textContent).not.toContain('could not be rendered');
  });

  it('does not let a card-owned form id suppress a real following prose form', async () => {
    const nested = LEGACY_FORM.replace('card-owned-form', 'real-prose-form');
    const text = `${BEFORE}\n\n${markup(hiddenCard('rule-proposal', nested))}\n\n${REAL_FORM}\n\n${AFTER}`;
    const { container } = render(ui([text], lane, false));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(AFTER));
    expect.soft(container.textContent).toContain('Ordinary audience question');
    expect.soft(container.textContent).not.toContain('HIDDEN_NESTED_QUESTION');
    expect.soft(container.textContent).not.toContain(HIDDEN);
    expect.soft(container.querySelectorAll('.question-form')).toHaveLength(1);
    expect.soft(within(container).queryAllByRole('textbox')).toHaveLength(1);
  });

  it('preserves inline and fenced examples containing complete nested forms verbatim', async () => {
    const examples = KINDS.map((kind) => markup(hiddenCard(kind)));
    const fenced = examples.join('\n');
    const text = `${BEFORE}\n\n${examples.map((example) => `\`${example}\``).join('\n\n')}\n\n\`\`\`xml\n${fenced}\n\`\`\`\n\n${AFTER}`;
    const { container } = render(ui([text], lane, false));
    openExecution(container);
    await waitFor(() => expect(container.textContent).toContain(BEFORE));
    expect(container.textContent).toContain(AFTER);
    expect(Array.from(container.querySelectorAll('code'), (node) => node.textContent)).toEqual([...examples, fenced]);
    expect(container.querySelector('.question-form')).toBeNull();
    expect(within(container).queryByRole('textbox')).toBeNull();
  });
});

it('retains and submits a real canonical form in ordinary prose', async () => {
  const onSubmit = vi.fn(async (_text: string) => true);
  const { container } = render(ui([`${BEFORE}\n\n${REAL_FORM}\n\n${AFTER}`], 'prose', false, onSubmit));
  const input = await waitFor(() => within(container).getByRole('textbox'));
  expect(container.textContent).toContain('Ordinary audience question');
  fireEvent.change(input, { target: { value: 'Product designers' } });
  fireEvent.click(within(container).getByRole('button', { name: 'Send answers' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0]?.[0]).toContain('Product designers');
});

it('retains the same legacy grammar as an actual form outside any card', async () => {
  const { container } = render(ui([`${BEFORE}\n\n${LEGACY_FORM}\n\n${AFTER}`], 'prose', false));
  await waitFor(() => expect(within(container).getByRole('textbox')).toBeTruthy());
  expect(container.textContent).toContain('HIDDEN_NESTED_QUESTION');
  expect(container.textContent).toContain(AFTER);
});

it('retains the actual Thinking disclosure and expandable memory independently of hidden cards', async () => {
  const { container } = render(ui([`${BEFORE}\n\n${markup(MEMORY)}\n\n${AFTER}`], 'prose', false, undefined, true));
  openExecution(container);
  const thoughts = await waitFor(() => within(container).getByText('Thoughts'));
  const details = thoughts.closest('details');
  expect(details).not.toBeNull();
  if (details) {
    details.open = true;
    fireEvent(details, new Event('toggle', { bubbles: false }));
  }
  await waitFor(() => expect(details?.textContent).toContain('Retained real Thinking content.'));
  const memory = container.querySelector<HTMLDetailsElement>('[data-od-card="memory-applied"]');
  expect(memory).not.toBeNull();
  if (memory) {
    memory.open = true;
    fireEvent(memory, new Event('toggle', { bubbles: false }));
  }
  expect(memory?.textContent).toContain('Retained palette rule');
});
