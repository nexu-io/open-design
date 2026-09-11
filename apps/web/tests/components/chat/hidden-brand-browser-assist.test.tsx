// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OdCard } from '@open-design/contracts';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { listMessages } from '../../../src/state/projects';
import type { ChatMessage } from '../../../src/types';

const KEY = 'a7f3c91ed2b40561';
const BRAND = {
  kind: 'brand-browser-assist',
  brandId: 'hidden-brand-1',
  browserTabId: 'hidden-browser-tab',
  url: 'https://hidden-brand.test/',
  reason: 'HIDDEN_BRAND_REASON',
} satisfies OdCard;
const MEMORY = { kind: 'memory-applied', summary: 'Visible memory', used: [{ type: 'rule', name: 'Existing palette' }] } satisfies OdCard;
const SCORE = { kind: 'verify-scorecard', status: 'pass', summary: 'Visible verification', rows: [{ rule: 'Existing palette', status: 'pass' }] } satisfies OdCard;
const RETIRED = [
  { kind: 'task-brief', summary: 'RETIRED_BRIEF', fields: [{ label: 'Format', value: 'RETIRED_FORMAT' }] },
  { kind: 'rule-proposal', name: 'RETIRED_RULE', assertion: 'RETIRED_ASSERTION', check: 'RETIRED_CHECK' },
] satisfies OdCard[];

function markup(card: OdCard): string {
  return `<od-card type="${card.kind}">${JSON.stringify(card)}</od-card>`;
}

function message(text: string, lane: 'shell' | 'prose', history: boolean): ChatMessage {
  const content = lane === 'shell'
    ? `${text}${history ? `\n<od-done key="${KEY}"/>Historical conclusion.` : ''}`
    : `Working.\n<od-done key="${KEY}"/>${text}`;
  return {
    id: 'assistant-hidden-brand', role: 'assistant', content,
    events: [{ kind: 'done_key', key: KEY }, { kind: 'text', text: content }],
    runId: 'hidden-brand-run', runStatus: history ? 'succeeded' : 'running',
    agentId: 'claude', agentName: 'Claude', createdAt: 1000, startedAt: 1000,
    ...(history ? { endedAt: 2000 } : {}),
  };
}

function show(value: ChatMessage, streaming: boolean) {
  const onConfirm = vi.fn().mockResolvedValue({ ok: true, action: 'opened' });
  const result = render(
    <I18nProvider initial="en">
      <AssistantMessage message={value} streaming={streaming} projectId="project-1" conversationId="conversation-1" onBrandBrowserAssistConfirm={onConfirm} isLast />
    </I18nProvider>,
  );
  // History can defer the execution body's DOM until its real disclosure opens.
  // Open it before checking absence so a collapsed shell cannot make this green.
  const record = result.container.querySelector<HTMLDetailsElement>('[data-testid="assistant-flow"] details');
  if (record && !record.open) {
    record.open = true;
    fireEvent(record, new Event('toggle', { bubbles: false }));
  }
  return { ...result, onConfirm };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe.each(['shell', 'prose'] as const)('hidden brand-browser-assist in %s', (lane) => {
  describe.each([false, true])('history=%s', (history) => {
    it('hides the complete card and payload while preserving surrounding content', async () => {
      const fixture = message(`Visible before.\n\n${markup(BRAND)}\n\n${markup(MEMORY)}\n\nExample: \`<od-demo>literal</od-demo>\`\n\nVisible after.`, lane, history);
      let loaded = fixture;
      if (history) {
        const endpoint = '/api/projects/project-1/conversations/conversation-1/messages';
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
          if (String(input) !== endpoint) throw new Error(`Unexpected request: ${String(input)}`);
          return new Response(JSON.stringify({ messages: [fixture] }), { status: 200, headers: { 'content-type': 'application/json' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        // Real HTTP client/DTO decoding, not a claim of a daemon/database E2E.
        const rows = await listMessages('project-1', 'conversation-1');
        expect(fetchMock).toHaveBeenCalledWith(endpoint, undefined);
        const row = rows[0];
        if (!row) throw new Error('Missing history fixture');
        loaded = row;
      }
      const { container, onConfirm } = show(loaded, !history);
      await waitFor(() => expect(container.textContent).toContain('Visible before.'));
      expect(container.textContent).toContain('Visible after.');
      expect(container.querySelector('code')?.textContent).toBe('<od-demo>literal</od-demo>');
      expect(container.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();
      expect(container.textContent).toContain(MEMORY.summary);

      expect(container.querySelector('[data-od-card="brand-browser-assist"]')).toBeNull();
      expect(within(container).queryByRole('button', { name: 'Open browser assist' })).toBeNull();
      for (const payload of ['<od-card', '"brandId"', BRAND.brandId, BRAND.url, BRAND.reason]) {
        expect(container.textContent).not.toContain(payload);
      }
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('preserves real inline and fenced brand-card code examples', async () => {
      const quoted = markup(BRAND);
      const { container } = show(message(`Visible before.\n\n\`${quoted}\`\n\n\`\`\`xml\n${quoted}\n\`\`\`\n\nVisible after.`, lane, history), !history);
      await waitFor(() => expect(container.textContent).toContain('Visible before.'));
      expect(container.textContent).toContain('Visible after.');
      expect(Array.from(container.querySelectorAll('code'), (node) => node.textContent)).toEqual([quoted, quoted]);
      expect(container.querySelector('[data-od-card="brand-browser-assist"]')).toBeNull();
    });
  });

  it('keeps memory without reviving retired verification, brief, or rule cards', async () => {
    const text = ['Visible before.', markup(MEMORY), markup(SCORE), ...RETIRED.map(markup), 'Visible after.'].join('\n\n');
    const { container } = show(message(text, lane, false), true);
    await waitFor(() => expect(container.textContent).toContain('Visible before.'));
    expect(container.textContent).toContain('Visible after.');
    expect(container.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();
    expect(container.querySelector('[data-od-card="verify-scorecard"]')).toBeNull();
    expect(container.textContent).toContain(MEMORY.summary);
    expect(container.textContent).not.toContain(SCORE.summary);
    expect(container.textContent).not.toContain('<od-card');
    expect(container.querySelector('[data-od-card="task-brief"]')).toBeNull();
    expect(container.querySelector('[data-od-card="rule-proposal"]')).toBeNull();
    expect(container.textContent).not.toContain('RETIRED_');
  });
});
