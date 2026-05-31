// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane, retryableAssistantMessage } from '../../src/components/ChatPane';
import { DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX } from '../../src/design-system-auto-prompt';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';
import type { ChatMessage, Conversation, ProjectMetadata } from '../../src/types';

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

const translations: Record<string, string> = {
  'chat.queuedHeader': 'Queued',
  'chat.queuedToSend': 'to Send',
  'chat.queuedEditQueuedTaskAria': 'Edit queued task',
  'chat.queuedSave': 'Save',
  'chat.queuedCancel': 'Cancel',
  'chat.queuedEdit': 'Edit',
  'chat.queuedMore': 'more queued',
  'chat.queuedFollowUpFallback': 'Queued follow-up',
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => translations[key] ?? key,
  }),
  useT: () => (key: string) => translations[key] ?? key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ streaming, message }: { streaming: boolean; message: ChatMessage }) => (
    <output data-testid={`assistant-streaming-${message.id}`}>{streaming ? 'streaming' : 'idle'}</output>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef(({ streaming }: { streaming: boolean }, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return <output data-testid="composer-streaming">{streaming ? 'streaming' : 'idle'}</output>;
  }),
}));

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  callback: ResizeObserverCallback;
  observed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe = (target: Element) => {
    this.observed.add(target);
  };

  unobserve = (target: Element) => {
    this.observed.delete(target);
  };

  disconnect = () => {
    this.observed.clear();
  };

  trigger(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ChatPane streaming state', () => {
  it('keeps queued-send strip styles compact above the composer', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.chat-queued-send-strip');
    expect(css).toContain('display: flex;');
    expect(css).toContain('.chat-queued-send-row');
    expect(css).toContain('align-items: center;');
    expect(css).toContain('.chat-queued-send-title');
    expect(css).toContain('text-overflow: ellipsis;');
    expect(css).toContain('.chat-queued-send-action');
    expect(css).toContain('width: 26px;');
    expect(css).toContain('height: 26px;');
  });

  it('exposes retry only for the last failed assistant when the pane is idle', () => {
    const failed: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Generation failed',
      createdAt: 1,
      runStatus: 'failed',
    };
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Create a login page', createdAt: 0 },
      failed,
    ];

    expect(retryableAssistantMessage(messages, failed.id, false)).toBe(failed);
    expect(retryableAssistantMessage(messages, failed.id, true)).toBeNull();
    expect(retryableAssistantMessage([...messages, { ...messages[0]!, id: 'user-2' }], failed.id, false))
      .toBeNull();
  });

  it('renders user turns with the chat bubble styling hook', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Generate a simple sign-in page',
        createdAt: 1,
      },
    ];

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const bubble = screen.getByText('Generate a simple sign-in page');
    expect(bubble.classList.contains('user-bubble')).toBe(true);
    expect(bubble.closest('.msg.user')).not.toBeNull();
  });

  it('hides internal path ids from comment attachment chips', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '',
        createdAt: 1,
        commentAttachments: [
          {
            id: 'comment-1',
            order: 1,
            filePath: 'preview.html',
            elementId: 'path-0-0-0-0-1',
            selector: '[data-od-id="path-0-0-0-0-1"]',
            label: '',
            comment: '222',
            currentText: '',
            pagePosition: { x: 10, y: 20, width: 30, height: 40 },
            htmlHint: '<div>',
          },
        ],
      },
    ];

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('Annotation')).toBeTruthy();
    expect(screen.getByText('222')).toBeTruthy();
    expect(screen.queryByText('path-0-0-0-0-1')).toBeNull();
  });

  it('summarizes auto-sent design-system workspace prompts', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: `${DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX}
Use the files in this project as the design system source for future projects.
Expected output:
- A clear DESIGN.md with all generated rules.`,
        createdAt: 1,
      },
    ];

    render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('Creating design system workspace')).toBeTruthy();
    expect(screen.queryByText(DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX, { exact: false })).toBeNull();
    expect(screen.queryByRole('button', { name: 'chat.copyPrompt' })).toBeNull();
  });

  it('keeps composer idle while active-run messages still render as streaming', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'still running',
        createdAt: 1,
        runId: 'run-1',
        runStatus: 'running',
      },
    ];

    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByTestId('composer-streaming').textContent).toBe('idle');
    expect(screen.getByTestId('assistant-streaming-assistant-1').textContent).toBe('streaming');
  });

  it('renders a stopped pinned todo after a terminal run without a final TodoWrite', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        createdAt: 1,
        startedAt: 1,
        endedAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                {
                  content: 'Build prototype',
                  status: 'in_progress',
                  activeForm: 'Building prototype',
                },
                { content: 'Run QA', status: 'pending' },
              ],
            },
          },
        ],
      },
    ];

    const { container } = render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('0/2')).toBeTruthy();
    expect(container.querySelector('.todo-stopped')?.textContent).toContain('Build prototype');
    expect(container.querySelector('.todo-in_progress')).toBeNull();
    expect(container.querySelector('.op-todo-current')).toBeNull();
  });
  it('shows several queued prompts above the composer before collapsing overflow', () => {
    const onRemoveQueuedSend = vi.fn();
    const onSendQueuedNow = vi.fn();
    const onUpdateQueuedSend = vi.fn();
    const { container } = render(
      <ChatPane
        messages={[]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[
          {
            id: 'queued-1',
            prompt: 'Make the export button larger and use a warmer accent',
            attachments: [{ path: 'brief.md', name: 'brief.md', kind: 'file' }],
            commentAttachments: [
              {
                id: 'comment-1',
                order: 1,
                filePath: 'preview.html',
                elementId: 'hero',
                selector: '#hero',
                label: 'Hero',
                comment: 'Use a warmer accent',
                currentText: 'Export',
                pagePosition: { x: 10, y: 20, width: 30, height: 40 },
                htmlHint: '<section id="hero">',
              },
            ],
          },
          { id: 'queued-2', prompt: 'Then adjust the title spacing' },
          { id: 'queued-3', prompt: 'Reduce the subtitle size' },
          { id: 'queued-4', prompt: 'Switch to a lighter font weight' },
          { id: 'queued-5', prompt: 'Add hover polish' },
        ]}
        onRemoveQueuedSend={onRemoveQueuedSend}
        onSendQueuedNow={onSendQueuedNow}
        onUpdateQueuedSend={onUpdateQueuedSend}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const strip = container.querySelector('.chat-queued-send-strip');
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('5 Queued');
    expect(strip?.textContent).toContain('to Send');
    expect(strip?.textContent).not.toContain('Start Multitasking');
    expect(container.querySelectorAll('.chat-queued-send-row')).toHaveLength(4);
    expect(strip?.textContent).toContain('Make the export button larger and use a warmer accent');
    expect(strip?.textContent).toContain('Then adjust the title spacing');
    expect(strip?.textContent).toContain('Reduce the subtitle size');
    expect(strip?.textContent).toContain('Switch to a lighter font weight');
    expect(strip?.textContent).toContain('+1');
    expect(container.querySelector('.chat-queued-send-overflow')?.textContent).toContain('+1');
    expect(strip?.textContent).not.toContain('Add hover polish');

    const sendNowButtons = screen.getAllByRole('button', { name: 'chat.send' });
    fireEvent.click(sendNowButtons[1]!);
    expect(onSendQueuedNow).toHaveBeenCalledWith('queued-2');

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]!);
    const editInput = screen.getByRole('textbox', { name: 'Edit queued task' });
    expect((editInput as HTMLInputElement).value).toBe(
      'Make the export button larger and use a warmer accent',
    );
    fireEvent.change(editInput, { target: { value: 'Use a bolder export button' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdateQueuedSend).toHaveBeenCalledWith('queued-1', 'Use a bolder export button');

    const removeButtons = screen.getAllByRole('button', { name: 'chat.comments.remove' });
    fireEvent.click(removeButtons[1]!);
    expect(onRemoveQueuedSend).toHaveBeenCalledWith('queued-2');
  });

  it('falls back to the localized queued follow-up label for blank prompts', () => {
    render(
      <ChatPane
        messages={[]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[{ id: 'queued-1', prompt: '   ' }]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByText('Queued follow-up')).toBeTruthy();
  });

  it('auto-follows when the queued strip resizes while pinned to bottom', () => {
    const { container } = render(
      <ChatPane
        messages={[]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[{ id: 'queued-1', prompt: 'First queued follow-up' }]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const log = container.querySelector('.chat-log') as HTMLDivElement | null;
    const strip = screen.getByTestId('chat-queued-send-strip');
    expect(log).not.toBeNull();
    expect(strip).toBeTruthy();

    Object.defineProperty(log!, 'scrollHeight', { configurable: true, get: () => 600 });
    Object.defineProperty(log!, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(log!, 'scrollTop', {
      configurable: true,
      get() {
        return (this as HTMLDivElement).dataset.scrollTop
          ? Number((this as HTMLDivElement).dataset.scrollTop)
          : 400;
      },
      set(value: number) {
        (this as HTMLDivElement).dataset.scrollTop = String(value);
      },
    });

    MockResizeObserver.instances[0]?.trigger(strip);

    expect(log!.scrollTop).toBe(600);
  });
});

const conversations: Conversation[] = [
  {
    id: 'conv-1',
    projectId: 'project-1',
    title: 'Conversation 1',
    createdAt: 1,
    updatedAt: 1,
  },
];

const projectMetadata: ProjectMetadata = {
  kind: 'prototype',
};
