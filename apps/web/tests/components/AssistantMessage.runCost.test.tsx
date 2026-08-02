// @vitest-environment jsdom

/**
 * Entry point for the per-run cost decomposition: the footer disclosure that
 * reveals `RunCostPanel`. What the panel renders once open is covered by
 * `RunCostPanel.test.tsx`; this file covers only when the affordance exists
 * and what opening it does.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';
import { en } from '../../src/i18n/locales/en';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function finishedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Here is the deck.',
    runId: 'run-42',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000090,
    events: [],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

/**
 * The panel fetches on mount, so opening the disclosure needs a stub. A
 * `report: null` body is the cheapest valid response — these tests assert that
 * the request happened and carried the right run, not what came back.
 */
function stubCostFetch() {
  const fetchMock = vi.fn(async (url: string) =>
    String(url).includes('/cost')
      ? new Response(JSON.stringify({ runId: 'run-42', report: null }), { status: 200 })
      : new Response('{}', { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderMessage(message: ChatMessage, streaming = false) {
  return render(
    <AssistantMessage
      message={message}
      streaming={streaming}
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
    />,
  );
}

function costRequests(fetchMock: ReturnType<typeof stubCostFetch>) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/cost'));
}

describe('AssistantMessage — run cost disclosure', () => {
  it('offers the cost breakdown on a finished run', () => {
    stubCostFetch();
    renderMessage(finishedMessage());
    const toggle = screen.getByTestId('assistant-run-cost-toggle');
    expect(toggle.getAttribute('aria-label')).toBe(en['runCost.toggle']);
  });

  it('withholds it mid-stream, when the run has no final cost to decompose', () => {
    // The decomposition is derived from a completed event log; offering it on a
    // turn that is still producing tokens would report a moving figure as final.
    stubCostFetch();
    renderMessage(finishedMessage(), true);
    expect(screen.queryByTestId('assistant-run-cost-toggle')).toBeNull();
  });

  it('withholds it on a message with no run to point at', () => {
    // History predating run-id persistence still renders; it just has nothing
    // to decompose, and must not offer a control that cannot resolve.
    stubCostFetch();
    renderMessage(finishedMessage({ runId: undefined }));
    expect(screen.queryByTestId('assistant-run-cost-toggle')).toBeNull();
  });

  it('costs nothing until the user asks — no request while the disclosure is closed', async () => {
    // Load-bearing: a conversation renders every finished turn at once, so a
    // panel that fetched on mount would fire one request per message on open.
    const fetchMock = stubCostFetch();
    renderMessage(finishedMessage());

    expect(screen.getByTestId('assistant-run-cost-toggle')).toBeTruthy();
    await waitFor(() => expect(costRequests(fetchMock)).toHaveLength(0));
  });

  it('reads the cost of its own run when opened', async () => {
    const fetchMock = stubCostFetch();
    renderMessage(finishedMessage());

    fireEvent.click(screen.getByTestId('assistant-run-cost-toggle'));
    await waitFor(() => expect(costRequests(fetchMock)).toHaveLength(1));
    expect(String(costRequests(fetchMock)[0]?.[0])).toBe('/api/runs/run-42/cost');
  });

  it('reports its expanded state to assistive tech', async () => {
    stubCostFetch();
    renderMessage(finishedMessage());

    const toggle = screen.getByTestId('assistant-run-cost-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-expanded')).toBe('true'));

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-expanded')).toBe('false'));
  });

  it('keeps the collapsible mounted when closed so the exit transition can play', async () => {
    // Per AGENTS.md's animation philosophy: conditionally shown elements stay
    // mounted and toggle a class, because a React unmount skips the exit
    // transition entirely. Only the panel inside is torn down.
    stubCostFetch();
    const { container } = renderMessage(finishedMessage());

    const collapsible = container.querySelector('.accordion-collapsible');
    expect(collapsible).toBeTruthy();
    expect(collapsible?.classList.contains('open')).toBe(false);

    const toggle = screen.getByTestId('assistant-run-cost-toggle');
    fireEvent.click(toggle);
    await waitFor(() => expect(collapsible?.classList.contains('open')).toBe(true));

    fireEvent.click(toggle);
    await waitFor(() => expect(collapsible?.classList.contains('open')).toBe(false));
    // Still in the DOM — the transition needs something to animate out.
    expect(container.querySelector('.accordion-collapsible')).toBe(collapsible);
  });
});
