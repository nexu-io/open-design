// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { createBufferedTextUpdates, mergeServerMessagesIntoConversation } from '../../../src/components/ProjectView';
import { I18nProvider } from '../../../src/i18n';
import type { AgentEvent, ChatMessage } from '../../../src/types';
import fixture from '../../fixtures/chat/clarification-hydration.json';

const RAW = fixture.events as AgentEvent[];
const TEXT = RAW.filter((event) => event.kind === 'text').map((event) => event.text).join('');
const READING = 'Reading of the brief';
const seed = (): ChatMessage => ({
  id: 'fixture-assistant', role: 'assistant', content: '', events: [],
  runId: fixture.runId, runStatus: 'running', createdAt: 1000,
});

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function coalescedSnapshot(events: AgentEvent[]): ChatMessage {
  let message = seed();
  const buffer = createBufferedTextUpdates({
    updateMessage: (updater) => { message = updater(message); }, persistSoon: () => {},
  });
  try {
    for (const event of events) {
      if (event.kind === 'text') buffer.appendContent(event.text);
      buffer.appendEvent(structuredClone(event));
    }
    buffer.flush();
  } finally { buffer.cancel(); }
  return message;
}

describe('release023 question prose during server hydration and pending local flush', () => {
  it('does not append a pending earlier prose prefix after a newer complete server form', () => {
    const firstText = RAW.findIndex((event) => event.kind === 'text');
    let message = coalescedSnapshot(RAW.slice(0, firstText));
    const server = { ...coalescedSnapshot(RAW), runStatus: 'succeeded' as const, endedAt: 2000 };
    const prefix = TEXT.slice(0, TEXT.indexOf('<question-form'));
    expect(prefix).toContain(READING);
    expect(server.content).toBe(TEXT);

    const buffer = createBufferedTextUpdates({
      updateMessage: (updater) => { message = updater(message); }, persistSoon: () => {},
    });
    try {
      // Local arrival is already buffered; the authoritative GET can be ahead
      // of React's next frame. Both sources carry the same synthetic transcript in its original order.
      buffer.appendContent(prefix);
      buffer.appendEvent({ kind: 'text', text: prefix });
      expect(message.content).toBe('');
      message = mergeServerMessagesIntoConversation([message], [server], {
        liveAssistantMessageIds: new Set([message.id]),
      })[0]!;
      buffer.flush();
      // The stream subsequently delivers the form already present in GET.
      // It must remain the sole writer; no legitimate suffix can be dropped.
      const suffix = TEXT.slice(prefix.length);
      buffer.appendContent(suffix);
      buffer.appendEvent({ kind: 'text', text: suffix });
      buffer.flush();
    } finally { buffer.cancel(); }

    const { container } = render(<I18nProvider initial="en">
      <AssistantMessage message={message} streaming={false} isLast
        projectId="release023-project" conversationId="release023-conversation" />
    </I18nProvider>);
    const form = container.querySelector(`[data-form-id="${fixture.formId}"]`);
    expect(form).not.toBeNull();
    // This is the observed failure shape: collapsed history shows a form and
    // then duplicated earlier prose, while its original copy stays in shell.
    expect(container.querySelector('.prose-block')?.textContent).not.toContain(READING);
    for (const details of container.querySelectorAll<HTMLDetailsElement>('.assistant-flow details')) {
      details.open = true;
      fireEvent(details, new Event('toggle', { bubbles: false }));
    }
    expect(within(container).getAllByText(READING, { exact: true })).toHaveLength(1);
    expect(message.content).toBe(TEXT);
  });

  it('accepts the full server transcript after live ownership ends', () => {
    const local = coalescedSnapshot(RAW.slice(0, RAW.findIndex((event) => event.kind === 'text')));
    const server = coalescedSnapshot(RAW);
    const merged = mergeServerMessagesIntoConversation([local], [server])[0]!;
    expect(merged.content).toBe(TEXT);
    expect(merged.events).toEqual(server.events);
  });

  it('does not preserve an old run transcript over its authoritative successor', () => {
    const local = seed();
    const server = { ...coalescedSnapshot(RAW), runId: 'successor-run' };
    const merged = mergeServerMessagesIntoConversation([local], [server], {
      liveAssistantMessageIds: new Set([local.id]),
    })[0]!;
    expect(merged.content).toBe(TEXT);
    expect(merged.events).toEqual(server.events);
  });
});
