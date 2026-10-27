// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { foldStrategyTaskTurns } from '../../src/components/ChatPane';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage } from '../../src/types';

const PLAN_KEY = 'aaaaaaaaaaaaaaaa';
const PRODUCTION_KEY = 'bbbbbbbbbbbbbbbb';
const REMAINING = 'Finish the page';
const QUESTION_FORM = [
  '<question-form id="folded-brief" title="Brand brief">',
  '{"questions":[{"id":"brand_name","label":"Brand name","type":"text","required":true}]}',
  '</question-form>',
].join('\n');

function taskRuns(
  productionText: string,
  planningText = 'The page plan is ready.',
  productionKey: string | null = PRODUCTION_KEY,
): ChatMessage[] {
  return [
    {
      id: 'planning-message', role: 'assistant', content: planningText,
      runId: 'planning-run', runStatus: 'succeeded', createdAt: 1000, endedAt: 2000,
      strategyTaskExecutionId: 'folded-task', strategyTaskRunIndex: 0,
      events: [
        { kind: 'done_key', key: PLAN_KEY },
        { kind: 'text', text: planningText },
      ],
    },
    {
      id: 'production-message', role: 'assistant', content: productionText,
      runId: 'production-run', runStatus: 'succeeded', createdAt: 3000, endedAt: 4000,
      strategyTaskExecutionId: 'folded-task', strategyTaskRunIndex: 1,
      producedFiles: [{ name: 'index.html', path: 'index.html', size: 100, mtime: 4000, kind: 'html', mime: 'text/html' }],
      events: [
        ...(productionKey === null ? [] : [{ kind: 'done_key' as const, key: productionKey }]),
        {
          kind: 'tool_use', id: 'production-todo', name: 'TodoWrite',
          input: { todos: [{ content: REMAINING, status: 'pending' }] },
        },
        { kind: 'text', text: productionText },
      ],
    },
  ];
}

function foldedReply(rows: ChatMessage[]): ChatMessage {
  return foldStrategyTaskTurns(rows).filter(message => message.role === 'assistant').at(-1)!;
}

function renderReply(message: ChatMessage, nextUserContent?: string) {
  const onContinue = vi.fn();
  render(
    <I18nProvider initial="en">
      <AssistantMessage message={message} streaming={false} isLast
        projectId="folded-project" conversationId="folded-conversation"
        nextUserContent={nextUserContent}
        onContinueRemainingTasks={onContinue} />
    </I18nProvider>,
  );
  return onContinue;
}

function expectRemainingWork() {
  expect(screen.getByText('Task not finished yet')).toBeInTheDocument();
  expect(screen.getByTestId('assistant-footer')).toHaveAttribute('data-unfinished', 'true');
  expect(screen.getByTestId('assistant-continue-remaining')).toBeInTheDocument();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html><html><body>Page</body></html>')));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OPEND-3740 completion belongs to the final physical Run', () => {
  it.each([false, undefined])('does not inherit a planning verdict when the final verdict is %s', verdict => {
    const rows = taskRuns('The page still needs work.');
    rows[0] = { ...rows[0]!, strategyTaskDelivered: true };
    rows[1] = { ...rows[1]!, strategyTaskDelivered: verdict };
    const message = foldedReply(rows);
    expect(message.strategyTaskDelivered).toBe(verdict);
    renderReply(message);
    expectRemainingWork();
  });

  it('keeps a production completion after folding planning and production', () => {
    const rows = taskRuns(`<od-done key="${PRODUCTION_KEY}"/>The page is delivered.`);
    // The same successful production must not acquire remaining work on reload.
    renderReply(rows[1]!);
    expect(screen.queryByTestId('assistant-continue-remaining')).toBeNull();
    cleanup();

    renderReply(foldedReply(rows));
    expect(screen.queryByText('Task not finished yet')).toBeNull();
    expect(screen.queryByTestId('assistant-continue-remaining')).toBeNull();
  });

  it('does not let a planning completion finish pending production', () => {
    const message = foldedReply(taskRuns(
      'The page still needs work.',
      `<od-done key="${PLAN_KEY}"/>The plan is complete.`,
    ));
    const onContinue = renderReply(message);
    expectRemainingWork();
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('assistant-continue-remaining'));
    expect(onContinue).toHaveBeenCalledExactlyOnceWith([{ content: REMAINING, status: 'pending', activeForm: undefined }]);
  });

  it.each([
    ['no marker', 'The page still needs work.'],
    ['wrong key', `<od-done key="${PLAN_KEY}"/>The page is delivered.`],
    ['inline example', `Example: \`<od-done key="${PRODUCTION_KEY}"/>\` The page still needs work.`],
    ['fenced example', `\`\`\`html\n<od-done key="${PRODUCTION_KEY}"/>\n\`\`\`\nThe page still needs work.`],
  ])('retains continuation for pending production with %s', (_label, productionText) => {
    renderReply(foldedReply(taskRuns(productionText)));
    expectRemainingWork();
  });

  it('does not borrow the next Run prose as a marker-only Run conclusion', () => {
    const message = foldedReply(taskRuns(
      'Production still needs work.',
      `<od-done key="${PLAN_KEY}"/>`,
    ));
    renderReply(message);
    expectRemainingWork();
  });

  it('does not let terminal legacy production without a done_key borrow planning completion', () => {
    const message = foldedReply(taskRuns(
      'Legacy production still needs work.',
      `<od-done key="${PLAN_KEY}"/>The plan is complete.`,
      null,
    ));
    renderReply(message);
    expectRemainingWork();
  });

  it.each([true, false])('uses live accumulated message boundaries when production completed=%s', completed => {
    const rows = taskRuns(
      completed ? `<od-done key="${PRODUCTION_KEY}"/>The page is delivered.` : 'The page still needs work.',
      completed ? 'The plan is ready.' : `<od-done key="${PLAN_KEY}"/>The plan is complete.`,
    );
    const planning = rows[0]!;
    const production = rows[1]!;
    // ProjectView can accumulate both Runs in a single message before history reload.
    const prefix = `${planning.content}\n\n`;
    renderReply({
      ...production,
      content: prefix + production.content,
      events: [...(planning.events ?? []), ...(production.events ?? [])],
      strategyTaskPrefixLength: prefix.length,
      strategyTaskPrefixEventCount: planning.events!.length,
    });
    if (completed) {
      expect(screen.queryByText('Task not finished yet')).toBeNull();
      expect(screen.queryByTestId('assistant-continue-remaining')).toBeNull();
    } else {
      expectRemainingWork();
    }
  });

  it.each([true, false])('uses the third Run completion after two earlier Run boundaries (completed=%s)', completed => {
    const rows = taskRuns('The intermediate attempt still needs work.', `<od-done key="${PLAN_KEY}"/>The plan is complete.`);
    const thirdKey = 'cccccccccccccccc';
    const finalText = completed ? `<od-done key="${thirdKey}"/>The page is delivered.` : 'The page still needs work.';
    const final: ChatMessage = {
      ...rows[1]!, id: 'final-message', runId: 'final-run', strategyTaskRunIndex: 2,
      content: finalText,
      events: [
        { kind: 'done_key', key: thirdKey },
        { kind: 'text', text: finalText },
      ],
    };
    renderReply(foldedReply([...rows, final]));
    if (completed) {
      expect(screen.queryByText('Task not finished yet')).toBeNull();
      expect(screen.queryByTestId('assistant-continue-remaining')).toBeNull();
    } else {
      expectRemainingWork();
    }
  });

  it.each(['failed', 'canceled'] as const)('keeps pending production continuable when its Run %s despite a done marker', runStatus => {
    const rows = taskRuns(`<od-done key="${PRODUCTION_KEY}"/>The page is delivered.`);
    rows[1] = { ...rows[1]!, runStatus };
    renderReply(foldedReply(rows));
    expect(screen.getByTestId('assistant-continue-remaining')).toBeInTheDocument();
  });

  it('waits for the current production question instead of offering generic continuation', () => {
    renderReply(foldedReply(taskRuns(QUESTION_FORM)));
    expect(screen.queryByText('Task not finished yet')).toBeNull();
    expect(screen.queryByTestId('assistant-continue-remaining')).toBeNull();
  });

  it('does not let an answered predecessor question hide unfinished production', () => {
    renderReply(
      foldedReply(taskRuns('The page still needs work.', QUESTION_FORM)),
      '[form answers — folded-brief]\n- Brand name: Northwind',
    );
    expectRemainingWork();
  });
});
