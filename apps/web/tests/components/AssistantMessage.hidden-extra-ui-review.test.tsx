// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage } from '../../src/types';

const KEY = 'a7f3c91ed2b40561';
const BEFORE = 'Visible prose before the reminder.';
const AFTER = 'Visible prose after the reminder.';
const CARD = `<od-card type="memory-applied">${JSON.stringify({
  kind: 'memory-applied', summary: 'NESTED_MEMORY_SENTINEL', used: [],
})}</od-card>`;
const FORM = `<question-form id="reminder-review" title="Nested form">${JSON.stringify({
  submitLabel: 'Send answers',
  questions: [{ id: 'audience', label: 'NESTED_QUESTION_SENTINEL', type: 'text' }],
})}</question-form>`;

function ui(text: string, streaming: boolean) {
  const content = `Working.\n<od-done key="${KEY}"/>${text}`;
  const message: ChatMessage = {
    id: 'assistant-reminder-review', role: 'assistant', content, createdAt: 1000,
    startedAt: 1000, runId: 'run-reminder-review',
    runStatus: streaming ? 'running' : 'succeeded',
    ...(streaming ? {} : { endedAt: 2000 }),
    events: [{ kind: 'done_key', key: KEY }, { kind: 'text', text: content }],
  };
  return <I18nProvider initial="en"><AssistantMessage message={message} streaming={streaming} isLast projectId="project-1" conversationId="conversation-1" /></I18nProvider>;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('hidden reminder ownership across protocol boundaries', () => {
  it('holds the pre-hyphen opener frame and restores unrelated text when the prefix diverges', () => {
    const { container, rerender } = render(ui(`${BEFORE}\n\n<system`, true));
    expect(container.textContent).toContain(BEFORE);
    expect(container.textContent).not.toContain('<system');
    rerender(ui(`${BEFORE}\n\n<system-example>ordinary literal`, true));
    expect(container.textContent).toContain('<system-example>ordinary literal');
    rerender(ui(`${BEFORE}\n\n<system`, false));
    expect(container.textContent).toContain('<system');
  });

  for (const streaming of [true, false]) {
    it(`does not render a memory card owned by a complete reminder (streaming=${streaming})`, () => {
      const { container } = render(ui(`${BEFORE}\n\n<system-reminder>${CARD}</system-reminder>\n\n${AFTER}`, streaming));
      expect(container.textContent).toContain(BEFORE);
      expect(container.querySelector('[data-od-card="memory-applied"]')).toBeNull();
      expect(container.textContent).not.toContain('NESTED_MEMORY_SENTINEL');
      expect(container.textContent).not.toContain('system-reminder');
      expect(container.textContent).toContain(AFTER);
    });

    it(`does not render a question form owned by a complete reminder (streaming=${streaming})`, () => {
      const { container } = render(ui(`${BEFORE}\n\n<system-reminder>${FORM}</system-reminder>\n\n${AFTER}`, streaming));
      expect(container.textContent).toContain(BEFORE);
      expect(within(container).queryByText('NESTED_QUESTION_SENTINEL')).toBeNull();
      expect(within(container).queryByRole('textbox')).toBeNull();
      expect(container.textContent).not.toContain('system-reminder');
      expect(container.textContent).toContain(AFTER);
    });
  }

  it('retains reminder-like text inside a real memory-card JSON string', () => {
    const summary = 'Literal <system-reminder>retained data</system-reminder> in memory';
    const card = `<od-card type="memory-applied">${JSON.stringify({ kind: 'memory-applied', summary, used: [] })}</od-card>`;
    const { container } = render(ui(`${BEFORE}\n\n${card}\n\n${AFTER}`, false));
    expect(container.querySelector('[data-od-card="memory-applied"]')?.textContent).toContain(summary);
    expect(container.textContent).toContain(BEFORE);
    expect(container.textContent).toContain(AFTER);
  });

  it('keeps a real question form outside a hidden reminder', () => {
    const { container } = render(ui(`${BEFORE}\n\n<system-reminder>Hidden payload</system-reminder>\n\n${FORM}\n\n${AFTER}`, false));
    expect(within(container).getByText('NESTED_QUESTION_SENTINEL')).toBeTruthy();
    expect(within(container).getByRole('textbox')).toBeTruthy();
    expect(container.textContent).not.toContain('Hidden payload');
    expect(container.textContent).toContain(BEFORE);
    expect(container.textContent).toContain(AFTER);
  });

  it.each(['inline', 'fenced'] as const)('retains the shorter opener in live %s code', (style) => {
    const text = style === 'inline' ? '`<system`' : '```xml\n<system';
    const { container } = render(ui(`${BEFORE}\n\n${text}`, true));
    expect(container.querySelector('code')?.textContent).toContain('<system');
    expect(container.textContent).toContain(BEFORE);
  });
});
