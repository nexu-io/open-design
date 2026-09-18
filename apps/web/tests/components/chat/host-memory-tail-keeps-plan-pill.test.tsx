// @vitest-environment jsdom
/**
 * OPEND-2944, pill-only: a host memory message is not a new planning turn.
 * Uses real ChatPane and an explicitly stamped host memory message.
 * This suite focuses on turn ownership around new host memory notifications;
 * retained memory visibility is verified separately in root's real Chrome acceptance. Rerender and
 * remount exercise component message input, not daemon persistence or layout.
 * Avatar placement / message ordering remain separate, unproven QA claims.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../../src/components/ChatPane';
import { memoryWrittenCardContent } from '../../../src/runtime/useMemoryWrittenCard';
import type { ChatMessage } from '../../../src/types';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const user: ChatMessage = {
  id: 'user-plan', role: 'user', content: 'Prepare the lesson', createdAt: 1000,
};

function planEvents(secondComplete = false): NonNullable<ChatMessage['events']> {
  return [{
    kind: 'tool_use', id: 'todo-current', name: 'TodoWrite', input: {
      todos: [
        { content: 'Read the brief', status: 'completed' },
        { content: 'Draw the scenes', status: secondComplete ? 'completed' : 'in_progress' },
        { content: 'Check the lesson', status: secondComplete ? 'in_progress' : 'pending' },
      ],
    },
  }];
}

function runningTurn(): ChatMessage {
  return {
    id: 'assistant-current', role: 'assistant', content: 'Preparing the lesson.',
    createdAt: 2000, startedAt: 2000, runId: 'run-current', runStatus: 'running',
    events: planEvents(),
  };
}

type OriginMessage = ChatMessage & { messageOrigin?: 'host_memory' };

function hostMemory(): OriginMessage {
  const content = memoryWrittenCardContent({
    key: 'memory-extraction-2944', count: 1,
    entries: [{ id: 'rule-lesson', name: 'Keep illustrations simple', type: 'rule' }],
  }, 'Remembered the lesson preference');
  return {
    id: 'host-memory', role: 'assistant', content, createdAt: 3000, messageOrigin: 'host_memory',
    events: [{ kind: 'text', text: content }],
  };
}

function pane(messages: ChatMessage[], streaming = true) {
  return <ChatPane
    messages={messages} streaming={streaming} error={null}
    projectId="project-pill-2944" projectFiles={[]}
    onEnsureProject={async () => 'project-pill-2944'}
    onSend={() => {}} onStop={() => {}} conversations={[]}
    activeConversationId={null} onSelectConversation={() => {}}
    onDeleteConversation={() => {}}
  />;
}

function expectPlan(step: number) {
  const pill = screen.getByTestId('chat-plan-pill');
  expect(pill).toHaveTextContent(`Step ${step} of 3`);
  expect(screen.getAllByTestId('chat-plan-pill')).toHaveLength(1);
}


const nextUser: ChatMessage = {
  id: 'user-next', role: 'user', content: 'What font is this?', createdAt: 4000,
};

function nextPlaceholder(api = false): ChatMessage {
  return {
    id: 'assistant-next', role: 'assistant', content: '', events: [],
    createdAt: 5000, startedAt: 5000,
    ...(api ? {} : { runId: 'run-next', runStatus: 'running' as const }),
  };
}

describe('OPEND-2944 current plan survives a trailing host memory message', () => {
  it('keeps the current pill when a stamped host memory message is appended', () => {
    const turn = runningTurn();
    const view = render(pane([user, turn]));
    expectPlan(2);
    view.rerender(pane([user, turn, hostMemory()]));
    expectPlan(2);
  });

  it.each([false, true])('keeps an unmarked legacy card visible without borrowing a plan (events omitted=%s)', (omitEvents) => {
    const legacy = hostMemory();
    delete legacy.messageOrigin;
    if (omitEvents) delete legacy.events;
    render(pane([user, runningTurn(), legacy]));
    expect(screen.getByText('Remembered the lesson preference')).toBeTruthy();
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });

  it('reads an updated TodoWrite from the same run while memory remains last', () => {
    const turn = runningTurn();
    const view = render(pane([user, turn]));
    expectPlan(2);
    view.rerender(pane([user, { ...turn, events: planEvents(true) }, hostMemory()]));
    expectPlan(3);
  });

  it('rebuilds the pill on remount from active run history without local streaming', () => {
    const messages = [user, runningTurn(), hostMemory()];
    const view = render(pane([user, runningTurn()], false));
    expectPlan(2);
    view.unmount();
    render(pane(messages, false));
    expectPlan(2);
  });

  it('keeps an API/BYOK plan with startedAt but no physical run identity', () => {
    const turn = runningTurn();
    delete turn.runId;
    delete turn.runStatus;
    const view = render(pane([user, turn]));
    expectPlan(2);
    view.rerender(pane([user, turn, hostMemory()]));
    expectPlan(2);
  });

  it.each([false, true])('does not inherit a plan across a new real placeholder (API=%s)', (api) => {
    const turn = { ...runningTurn(), runStatus: 'canceled' as const, endedAt: 3500 };
    render(pane([user, turn, nextUser, nextPlaceholder(api), hostMemory()]));
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });

  it('retains an actual legacy TodoWrite even when all run metadata is absent', () => {
    const turn: ChatMessage = {
      id: 'legacy-plan', role: 'assistant', content: 'Preparing the lesson.',
      createdAt: 2000, events: planEvents(),
    };
    const view = render(pane([user, turn]));
    expectPlan(2);
    view.rerender(pane([user, turn, hostMemory()]));
    expectPlan(2);
  });

  it('does not skip a legacy ordinary reply to recover an older plan', () => {
    const legacyReply: ChatMessage = {
      id: 'legacy-reply', role: 'assistant', content: 'The font is Inter.',
      createdAt: 5000, events: [{ kind: 'text', text: 'The font is Inter.' }],
    };
    render(pane([user, runningTurn(), nextUser, legacyReply, hostMemory()]));
    expect(screen.getByText('The font is Inter.')).toBeTruthy();
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });

  it('does not show a stopped turn plan even with a later memory card', () => {
    render(pane([user, {
      ...runningTurn(), runStatus: 'canceled', endedAt: 3500,
    }, hostMemory()], false));
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });

  it('keeps the pill hidden when the current snapshot is entirely completed', () => {
    const turn = runningTurn();
    turn.events = [{
      kind: 'tool_use', id: 'todo-complete', name: 'TodoWrite', input: {
        todos: [{ content: 'Complete the lesson', status: 'completed' }],
      },
    }];
    render(pane([user, turn, hostMemory()]));
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });
});
