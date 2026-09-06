// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppliedPluginSnapshot, SkillSummary } from '@open-design/contracts';
import { ChatPane, buildRunErrorDiagnosticText, retryableAssistantMessage } from '../../src/components/ChatPane';
import { DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX } from '../../src/design-system-auto-prompt';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';
import type { ChatMessage, Conversation, ProjectMetadata } from '../../src/types';

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

const clipboardMocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async (_text: string) => true),
}));

const translations: Record<string, string> = {
  'chat.mode.chat.label': 'Ask',
  'chat.mode.design.label': 'Design Agent',
  'chat.queuedHeader': 'Queued',
  'chat.queuedToSend': 'to Send',
  'chat.queuedEditQueuedTaskAria': 'Edit queued task',
  'chat.queuedSave': 'Save',
  'chat.queuedCancel': 'Cancel',
  'chat.queuedReorder': 'Drag to reorder',
  'chat.queuedEdit': 'Edit',
  'chat.queuedMore': 'more queued',
  'chat.queuedFollowUpFallback': 'Queued follow-up',
  'chat.designToolbox.kind.plugin': 'Plugin',
  'chat.plus.designSystem': 'Design system',
  'avatar.useLocal': 'Use Local CLI',
  'chat.copyDone': 'Copied!',
};

function translate(key: string, vars?: Record<string, unknown>): string {
  if (key === 'brand.appliedToChat') return `Using ${String(vars?.name ?? '')}`;
  return translations[key] ?? key;
}

function skillSummary(id: string): SkillSummary {
  return {
    id,
    name: id,
    description: `${id} test skill`,
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
  };
}

// An OD Next apply — the daemon binds the internal strategy package and stamps
// `strategy` on the snapshot. Ordinary plugin applies leave that field unset.
function odNextStrategySnapshot(): AppliedPluginSnapshot {
  const digest = 'b'.repeat(64);
  return {
    snapshotId: 'snap-od-next',
    pluginId: 'od-next-strategy',
    pluginVersion: '2.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 1,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
    pluginTitle: 'OD Next Strategy V2',
    strategy: {
      schema: 'open-design.applied-strategy/v2',
      id: 'od-next-strategy',
      version: '2.0.0',
      packageHash: digest,
      assetDigests: [{ path: './assets/task-profiles/prototype.md', sha256: digest }],
      selectedTaskProfile: {
        taskType: 'prototype',
        path: './assets/task-profiles/prototype.md',
        sha256: digest,
        version: '2',
      },
      taskProfileVersions: ['2'],
      promptRecipe: 'od-next-plan-build-v2',
    },
  } as AppliedPluginSnapshot;
}

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: translate,
  }),
  useT: () => translate,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({
    streaming,
    message,
    isLast,
    onShareToOpenDesign,
    shareToOpenDesignBusy,
    showConversationTodoCard,
    conversationTodoInput,
    showRole,
  }: {
    streaming: boolean;
    message: ChatMessage;
    isLast?: boolean;
    onShareToOpenDesign?: () => void;
    shareToOpenDesignBusy?: boolean;
    showConversationTodoCard?: boolean;
    conversationTodoInput?: {
      todos?: Array<{ content: string; status?: string }>;
      plan?: Array<{ content?: string; step?: string; status?: string }>;
    } | null;
    showRole?: boolean;
  }) => (
    <>
      <output data-testid={`assistant-role-${message.id}`}>{showRole === false ? 'continued' : 'shown'}</output>
      <output data-testid={`assistant-streaming-${message.id}`}>{streaming ? 'streaming' : 'idle'}</output>
      <output data-testid={`assistant-last-${message.id}`}>{isLast ? 'last' : 'not-last'}</output>
      {showConversationTodoCard && conversationTodoInput ? (
        <div className="op-card op-todo">
          {(conversationTodoInput.todos ?? conversationTodoInput.plan ?? []).map((todo, index) => {
            const content = 'content' in todo ? todo.content : todo.step;
            return (
              <div key={`${content}-${index}`} className={`todo-${todo.status ?? 'pending'}`}>
                <span className="todo-text">{content}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {onShareToOpenDesign ? (
        <button
          type="button"
          data-testid={`share-to-od-${message.id}`}
          disabled={shareToOpenDesignBusy}
          onClick={onShareToOpenDesign}
        >
          {shareToOpenDesignBusy ? 'Preparing package…' : 'Share to OpenDesign'}
        </button>
      ) : null}
    </>
  ),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: clipboardMocks.copyToClipboard,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef(({
    onSend,
    streaming,
  }: {
    onSend?: (
      prompt: string,
      attachments: Array<{ path: string; name: string; kind: 'file' }>,
      commentAttachments: Array<{ id: string; order: number; filePath: string; comment: string }>,
    ) => void;
    streaming: boolean;
  }, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return (
      <>
        <output data-testid="composer-streaming">{streaming ? 'streaming' : 'idle'}</output>
        <button
          type="button"
          data-testid="composer-submit"
          onClick={() => onSend?.(
            'Use a bolder export button',
            [{ path: 'edited.md', name: 'edited.md', kind: 'file' }],
            [{ id: 'edited-comment', order: 1, filePath: 'preview.html', comment: 'Bolder' }],
          )}
        >
          submit composer
        </button>
      </>
    );
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

  static triggerObserved(target: Element) {
    for (const instance of MockResizeObserver.instances) {
      if (instance.observed.has(target)) instance.trigger(target);
    }
  }
}

function mockDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn((type?: string) => {
      if (type) store.delete(type);
      else store.clear();
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    setData: vi.fn((type: string, data: string) => {
      store.set(type, data);
    }),
    setDragImage: vi.fn(),
  };
}

beforeEach(() => {
  sessionStorage.clear();
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
    expect(css).toContain('.chat-queued-send-list');
    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('.chat-queued-send-row');
    expect(css).toContain('display: grid;');
    expect(css).toContain('grid-template-columns: 24px minmax(0, 1fr) max-content;');
    expect(css).toContain('.chat-queued-send-title');
    expect(css).toContain('text-overflow: ellipsis;');
    expect(css).toContain('.chat-queued-send-drag-handle');
    expect(css).toContain('align-self: auto;');
    expect(css).toContain('.pane {');
    expect(css).toContain('--chat-composer-inline-inset: 16px;');
    expect(css).toContain('.split-chat-slot > .pane');
    expect(css).toContain('--chat-composer-inline-inset: 10px;');
    expect(css).toContain('width: calc(100% - (var(--chat-composer-inline-inset, 16px) * 2));');
    expect(css).toContain('margin: 0 var(--chat-composer-inline-inset, 16px) 2px;');
    expect(css).toContain('max-width: none;');
    expect(css).toContain('.chat-queued-send-action');
    expect(css).toContain('width: 24px;');
    expect(css).toContain('height: 24px;');
    expect(css).toContain('.chat-queued-send-overflow');
    expect(css).toContain('.chat-log.is-balanced-transcript > .msg:first-of-type');
    expect(css).toContain('margin-top: auto;');
  });

  it('balances finished transcripts near the composer without affecting active turns', () => {
    const baseProps = {
      projectKindForTracking: 'prototype' as const,
      streaming: false,
      error: null,
      projectId: 'project-1',
      projectFiles: [],
      onEnsureProject: async () => 'project-1',
      onSend: vi.fn(),
      onStop: vi.fn(),
      conversations,
      activeConversationId: 'conv-1',
      onSelectConversation: vi.fn(),
      onDeleteConversation: vi.fn(),
      projectMetadata,
    };
    const { container, rerender } = render(
      <ChatPane
        {...baseProps}
        messages={[
          { id: 'user-1', role: 'user', content: 'Make the landing page', createdAt: 1 },
          { id: 'assistant-1', role: 'assistant', content: 'Done', createdAt: 2 },
        ]}
      />,
    );

    expect(screen.getByTestId('chat-log').getAttribute('data-balanced')).toBe('true');

    rerender(
      <ChatPane
        {...baseProps}
        streaming
        messages={[
          { id: 'user-1', role: 'user', content: 'Make the landing page', createdAt: 1 },
          { id: 'assistant-1', role: 'assistant', content: 'Done', createdAt: 2 },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            createdAt: 3,
            runStatus: 'running',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('chat-log').getAttribute('data-balanced')).toBe('false');
  });

  it('keeps composer popovers above the chat jump button', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.chat-jump-btn');
    expect(css).toContain('z-index: 6;');
    expect(css).toContain('.composer:has(.composer-tools-menu)');
    expect(css).toContain('.composer:has(.composer-design-toolbox-menu)');
    expect(css).toContain('.composer:has(.composer-import-menu)');
    expect(css).toContain('z-index: 80;');
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

  it('hides a stale run-recovery card after a later assistant run succeeds', () => {
    const restartError = 'Run interrupted because the daemon restarted.';
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Build the report', createdAt: 0 },
      {
        id: 'assistant-failed',
        role: 'assistant',
        content: 'I started the report.',
        createdAt: 1,
        endedAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: restartError,
            code: 'DAEMON_RESTARTED',
          },
        ],
      },
      { id: 'user-2', role: 'user', content: 'Continue', createdAt: 3 },
      {
        id: 'assistant-succeeded',
        role: 'assistant',
        content: 'The report is complete.',
        createdAt: 4,
        endedAt: 5,
        runStatus: 'succeeded',
      },
    ];

    const { container } = render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={restartError}
        errorSourceAssistantId="assistant-failed"
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

    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });

  it('keeps a repeated current daemon-restart error visible before its failure is persisted', () => {
    const restartError = 'Run interrupted because the daemon restarted.';
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Build the report', createdAt: 0 },
      {
        id: 'assistant-failed',
        role: 'assistant',
        content: 'I started the report.',
        createdAt: 1,
        endedAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: restartError,
            code: 'DAEMON_RESTARTED',
          },
        ],
      },
      { id: 'user-2', role: 'user', content: 'Continue', createdAt: 3 },
      {
        id: 'assistant-succeeded',
        role: 'assistant',
        content: 'The report is complete.',
        createdAt: 4,
        endedAt: 5,
        runStatus: 'succeeded',
      },
      { id: 'user-3', role: 'user', content: 'Make one more change', createdAt: 6 },
    ];

    const { container } = render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={restartError}
        errorSourceAssistantId="assistant-current"
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

    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeTruthy();
  });

  it('keeps a current non-run error visible after an assistant run succeeds', () => {
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Build the report', createdAt: 0 },
      {
        id: 'assistant-succeeded',
        role: 'assistant',
        content: 'The report is complete.',
        createdAt: 1,
        endedAt: 2,
        runStatus: 'succeeded',
      },
    ];

    const { container } = render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error="Could not load the conversation."
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

    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeTruthy();
  });

  it('prefers a current non-run error over the latest failed-run detail', () => {
    const currentError = 'Could not load the conversation.';
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Build the report', createdAt: 0 },
      {
        id: 'assistant-failed',
        role: 'assistant',
        content: 'I started the report.',
        createdAt: 1,
        endedAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'Run interrupted because the daemon restarted.',
            code: 'DAEMON_RESTARTED',
          },
        ],
      },
    ];

    const { container } = render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={false}
        error={currentError}
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

    const recoveryCard = container.querySelector<HTMLElement>(
      '[data-user-action-card="run-recovery"]',
    );
    expect(recoveryCard).toBeTruthy();
    expect(within(recoveryCard!).getByText(currentError)).toBeTruthy();
  });

  it.each(['no_result', 'delivery_failed'] as const)(
    'exposes retry for a %s delivery failure',
    (resultDeliveryState) => {
      const deliveryFailure: ChatMessage = {
        id: `assistant-${resultDeliveryState}`,
        role: 'assistant',
        content: 'The design result was not delivered.',
        createdAt: 1,
        runStatus: 'succeeded',
        resultDeliveryState,
      };
      const messages: ChatMessage[] = [
        { id: 'user-1', role: 'user', content: 'Create a login page', createdAt: 0 },
        deliveryFailure,
      ];

      expect(retryableAssistantMessage(messages, deliveryFailure.id, false)).toBe(deliveryFailure);
    },
  );

  it('formats run error diagnostics with a raw error when guidance copy differs', () => {
    const text = buildRunErrorDiagnosticText({
      message: 'Service unavailable. Try again.',
      rawMessage: 'json-rpc id 4: Connection reset by server',
      errorCode: 'UPSTREAM_UNAVAILABLE',
      traceId: 'run-abc',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      agentId: 'amr',
    });

    expect(text).toMatch(/^json-rpc id 4: Connection reset by server\n\nOpenDesign run error diagnostics/);
    expect(text).not.toContain('raw_error:');
    expect(text).toContain('error_code: UPSTREAM_UNAVAILABLE');
    expect(text).not.toContain('\nerror:\n');
  });

  it('falls back to the display message when raw error text is unavailable', () => {
    const text = buildRunErrorDiagnosticText({
      message: 'Connection dropped. Try again.',
      rawMessage: '  ',
      errorCode: 'AGENT_CONNECTION_DROPPED',
      traceId: 'run-abc',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      agentId: 'amr',
    });

    expect(text).toMatch(/^Connection dropped\. Try again\.\n\nOpenDesign run error diagnostics/);
    expect(text).not.toContain('raw_error:');
    expect(text).toContain('error_code: AGENT_CONNECTION_DROPPED');
    expect(text).not.toContain('\nerror:\n');
  });

  // The diagnostics body used to hold only the daemon's generic sentence and a
  // pile of ids, while the agent's own stderr — captured, persisted, and
  // carrying the actual cause — was surfaced nowhere at all.
  // Shapes below are lifted from a real failed run's persisted error event.
  // NOTE: the failure card no longer renders this string anywhere (the
  // 「view details」 disclosure was removed on 2026-08-27); these cases now
  // pin the builder only.
  it('puts the captured agent stderr in the diagnostics body', () => {
    const text = buildRunErrorDiagnosticText({
      message: 'DeepSeek Harness profile exited without a terminal result.',
      rawMessage: 'DeepSeek Harness profile exited without a terminal result.',
      errorCode: 'DSH_PROFILE_MISSING_RESULT',
      stderrTail: DSH_STDERR_TAIL,
      traceId: '60d39320-f154-4974-855b-47cf9da2ef47',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      agentId: 'deepseek-harness',
    });

    expect(text).toContain('agent_stderr_tail:');
    expect(text).toContain(DSH_REAL_CAUSE);
    // The generic sentence still leads, and the id block still follows: the
    // stderr is added to the body, it does not displace what was there.
    expect(text).toMatch(/^DeepSeek Harness profile exited without a terminal result\./);
    expect(text).toContain('error_code: DSH_PROFILE_MISSING_RESULT');
  });

  it('grows no stderr section for a failure that captured no stderr', () => {
    const text = buildRunErrorDiagnosticText({
      message: 'Connection dropped. Try again.',
      rawMessage: 'json-rpc id 4: Connection reset by server',
      errorCode: 'AGENT_CONNECTION_DROPPED',
      traceId: 'run-abc',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      agentId: 'amr',
    });

    expect(text).not.toContain('agent_stderr_tail');
    expect(text).toMatch(
      /^json-rpc id 4: Connection reset by server\n\nOpenDesign run error diagnostics/,
    );
  });

  it('ignores a blank stderr tail rather than emitting an empty section', () => {
    const text = buildRunErrorDiagnosticText({
      message: 'Connection dropped. Try again.',
      rawMessage: 'json-rpc id 4: Connection reset by server',
      errorCode: 'AGENT_CONNECTION_DROPPED',
      stderrTail: '   \n  ',
      traceId: 'run-abc',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      agentId: 'amr',
    });

    expect(text).not.toContain('agent_stderr_tail');
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

    // 正文现在包在气泡【里面那层】(`-webkit-line-clamp` 的裁切边界是 padding box,
    // 直接折在气泡上会从下内边距里露半条字),所以从文字往上找气泡,不再是文字自己。
    const text = screen.getByText('Generate a simple sign-in page');
    expect(text.closest('.user-bubble')).not.toBeNull();
    expect(text.closest('.msg.user')).not.toBeNull();
  });

  it('offers a Local CLI recovery action on BYOK error states', () => {
    const onSwitchToLocalCli = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Create a login page',
        createdAt: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        createdAt: 2,
        runStatus: 'failed',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'Missing API key — open Settings and paste one in.',
          },
        ],
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
        showByokRecoveryAction
        onSwitchToLocalCli={onSwitchToLocalCli}
        projectMetadata={projectMetadata}
      />,
    );

    const action = screen.getByRole('button', { name: 'Use Local CLI' });
    fireEvent.click(action);

    expect(onSwitchToLocalCli).toHaveBeenCalledTimes(1);
  });

  it('keeps workspace/plugin context off the transcript while preserving the user turn', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Generate the refinement glow-up deck',
        createdAt: 1,
        sessionMode: 'design',
        runContext: {
          skillIds: ['visual-explain'],
          workspaceItems: [
            {
              id: 'browser:tab-1',
              kind: 'browser',
              label: 'Dribbble',
              tabId: 'tab-1',
              url: 'https://dribbble.com/',
            },
          ],
        },
        appliedPluginSnapshot: {
          snapshotId: 'snap-refinement',
          pluginId: 'refinement-plugin',
          pluginVersion: '1.0.0',
          manifestSourceDigest: 'a'.repeat(64),
          inputs: {},
          resolvedContext: {
            items: [
              {
                kind: 'asset',
                path: 'template.json',
                label: 'template.json',
              },
            ],
          },
          capabilitiesGranted: ['prompt:inject'],
          capabilitiesRequired: ['prompt:inject'],
          assetsStaged: [],
          taskKind: 'new-generation',
          appliedAt: 1,
          connectorsRequired: [],
          connectorsResolved: [],
          mcpServers: [],
          status: 'fresh',
          pluginTitle: 'A Decade of Refinement Glow-Up',
        },
      },
    ];

    const activeDesignSystem = {
      id: 'neutral-modern',
      title: 'Neutral Modern',
      category: 'Starter',
      source: 'bundled',
      updatedAt: 1,
    } as never;

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
        activeDesignSystem={activeDesignSystem}
        skills={[skillSummary('visual-explain')]}
      />,
    );

    expect(screen.getByText('Generate the refinement glow-up deck')).toBeTruthy();
    expect(screen.queryByTestId('msg-run-context-row')).toBeNull();
    expect(screen.queryByTestId('msg-session-mode-chip')).toBeNull();
    expect(screen.queryByTestId('msg-workspace-context-chip')).toBeNull();
    expect(screen.queryByTestId('msg-applied-context')).toBeNull();
    expect(screen.queryByText('template.json')).toBeNull();
  });

  it('shows one identity header for consecutive replies from the same assistant', () => {
    const messages: ChatMessage[] = [
      { id: 'assistant-1', role: 'assistant', content: 'First stage', createdAt: 1, agentId: 'claude' },
      { id: 'assistant-2', role: 'assistant', content: 'Second stage', createdAt: 2, agentId: 'claude' },
      { id: 'assistant-3', role: 'assistant', content: 'Different assistant', createdAt: 3, agentId: 'codex' },
      { id: 'user-1', role: 'user', content: 'Continue', createdAt: 4 },
      { id: 'assistant-4', role: 'assistant', content: 'After user turn', createdAt: 5, agentId: 'codex' },
    ] as ChatMessage[];

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

    expect(screen.getByTestId('assistant-role-assistant-1').textContent).toBe('shown');
    expect(screen.getByTestId('assistant-role-assistant-2').textContent).toBe('continued');
    expect(screen.getByTestId('assistant-role-assistant-3').textContent).toBe('shown');
    expect(screen.getByTestId('assistant-role-assistant-4').textContent).toBe('shown');
  });

  it('does not render applied-context chrome even when the configuration changes', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'First request',
        createdAt: 1,
        runContext: { skillIds: ['visual-explain'] },
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Same setup',
        createdAt: 2,
        runContext: { skillIds: ['visual-explain'] },
      },
      {
        id: 'user-3',
        role: 'user',
        content: 'Changed setup',
        createdAt: 3,
        runContext: { skillIds: ['imagegen'] },
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
        skills={[skillSummary('visual-explain'), skillSummary('imagegen')]}
      />,
    );

    expect(screen.queryByTestId('msg-run-context-row')).toBeNull();
    expect(screen.queryByTestId('msg-applied-context')).toBeNull();
  });

  // OD Next is applied by the daemon, not picked by the user: the strategy
  // package (and the version in its title) is internal plumbing, and the
  // "Design Agent" chip only restates what the strategy already is. A
  // strategy-owned design turn therefore opens with the prompt itself.
  it('keeps a strategy-owned design turn free of run-context chrome', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'A minimal reading app with adaptive phone and desktop layouts',
        createdAt: 1,
        sessionMode: 'design',
        runContext: { pluginIds: ['od-next-strategy'] },
        appliedPluginSnapshot: odNextStrategySnapshot(),
      },
    ] as ChatMessage[];

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

    expect(
      screen.getByText('A minimal reading app with adaptive phone and desktop layouts'),
    ).toBeTruthy();
    expect(screen.queryByTestId('msg-run-context-row')).toBeNull();
    expect(screen.queryByTestId('msg-session-mode-chip')).toBeNull();
    expect(screen.queryByTestId('msg-applied-context')).toBeNull();
    expect(screen.queryByText(/OD Next Strategy V2/)).toBeNull();
    expect(screen.queryByText(/od-next-strategy/)).toBeNull();
  });

  it('never flashes the mode chip on a design turn awaiting its strategy binding', () => {
    // The optimistic user message renders before POST /api/runs answers, so it
    // has no appliedPluginSnapshot yet — the state the acceptance run caught
    // showing "Design" for a beat and then dropping it.
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'A minimal reading app',
        createdAt: 1,
        sessionMode: 'design',
      },
    ] as ChatMessage[];

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

    expect(screen.queryByTestId('msg-run-context-row')).toBeNull();
    expect(screen.queryByTestId('msg-session-mode-chip')).toBeNull();
  });

  it('keeps user-chosen strategy context in data but not transcript chrome', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Same app, softer shelves',
        createdAt: 1,
        sessionMode: 'design',
        runContext: { skillIds: ['visual-explain'] },
        appliedPluginSnapshot: odNextStrategySnapshot(),
      },
    ] as ChatMessage[];

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
        skills={[skillSummary('visual-explain')]}
      />,
    );

    expect(screen.getByText('Same app, softer shelves')).toBeTruthy();
    expect(screen.queryByTestId('msg-run-context-row')).toBeNull();
    expect(screen.queryByTestId('msg-applied-context')).toBeNull();
    expect(screen.queryByTestId('msg-session-mode-chip')).toBeNull();
  });

  /*
   * NOTE(sync/main): origin/main (#7016) landed this as "Design is the default
   * so it carries no chip, but the opt-outs Ask / Plan still get one". This
   * branch's ruling (2026-08-26, user on a real build: 「把这个东西干掉」) is one
   * step further — the mode chip is not rendered on the run-context row at ALL,
   * for any mode. So main's half of the behaviour is void here and the chip
   * assertion is inverted.
   *
   * The other half of main's point is untouched and still guarded below: a
   * strategy-owned turn shows no applied-context chrome either, because the
   * OD Next package is daemon plumbing rather than something the user picked.
   */
  it('keeps a strategy-owned Ask turn free of run-context chrome', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'What changed in the shelf layout?',
        createdAt: 1,
        sessionMode: 'chat',
        appliedPluginSnapshot: odNextStrategySnapshot(),
      },
    ] as ChatMessage[];

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

    expect(screen.queryByTestId('msg-session-mode-chip')).toBeNull();
    expect(screen.queryByTestId('msg-applied-context')).toBeNull();
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

    /*
     * ⚠️ 这里的断言**翻转过一次**,两次决定是相反的,别只看现在这一版:
     *
     *   旧:这条系统写的摘要走「类型化的语言字典 + 标准用户气泡」,而不是一张
     *       一次性的灰色状态卡 —— 于是这里断言 `.user-status-card` 必须不存在,
     *       并断言正文是 `designFiles.createDesignSystemFromProject`(菜单那句)。
     *   新:**2026-09-02 用户裁决**「设计系统状态卡 也和设计稿 1:1 对齐」。
     *       稿子 `729fa43ce7:docs/design/chat-panel/src/body-components.html:45-53`
     *       这一格画的就是一张状态卡(调色盘图标 + 标题 + 一句说明),
     *       所以卡加回来,「必须不存在」翻成「必须渲染出来」。
     *
     * 卡片本体的逐值判据在 `tests/components/chat/w88-design-system-status-card.test.tsx`;
     * 这里只守两件事:命中那个 prompt 时**换的是卡不是气泡**,以及内部长 prompt
     * 一个字都不上屏。文案换成了状态卡自己的两句(`chat.designSystemStatus.*`),
     * 菜单那句 `designFiles.createDesignSystemFromProject` 仍归菜单项与首轮会话标题用。
     */
    const cardRoot = document.querySelector('[data-testid="design-system-generation-status"]');
    expect(cardRoot).toBeTruthy();
    expect(screen.getByText('chat.designSystemStatus.title')).toBeTruthy();
    expect(screen.getByText('chat.designSystemStatus.description')).toBeTruthy();
    expect(document.querySelector('.user-bubble')).toBeNull();
    expect(screen.queryByText(DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX, { exact: false })).toBeNull();
    expect(screen.getByRole('button', { name: 'chat.copyPrompt' })).toBeTruthy();
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

  it('keeps Share to OpenDesign busy on the assistant turn that started packaging', () => {
    const onShareToOpenDesign = vi.fn();
    const completedAssistant: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Done',
      createdAt: 2,
      startedAt: 2,
      endedAt: 3,
      runStatus: 'succeeded',
    };
    const initialMessages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'Make the landing page', createdAt: 1 },
      completedAssistant,
    ];
    const commonProps = {
      projectKindForTracking: 'prototype' as const,
      streaming: false,
      error: null,
      projectId: 'project-1',
      projectFiles: [],
      onEnsureProject: async () => 'project-1',
      onSend: vi.fn(),
      onStop: vi.fn(),
      conversations,
      activeConversationId: 'conv-1',
      onSelectConversation: vi.fn(),
      onDeleteConversation: vi.fn(),
      projectMetadata,
      onShareToOpenDesign,
    };

    const { rerender } = render(
      <ChatPane
        {...commonProps}
        messages={initialMessages}
        shareToOpenDesignBusyMessageId={null}
      />,
    );

    fireEvent.click(screen.getByTestId('share-to-od-assistant-1'));
    expect(onShareToOpenDesign).toHaveBeenCalledWith('assistant-1');

    rerender(
      <ChatPane
        {...commonProps}
        messages={[
          ...initialMessages,
          { id: 'user-2', role: 'user', content: 'Share to OpenDesign', createdAt: 4 },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            createdAt: 5,
            runId: 'run-share-to-od',
            runStatus: 'running',
          },
        ]}
        shareToOpenDesignBusyMessageId="assistant-1"
      />,
    );

    const sourceAction = screen.getByTestId<HTMLButtonElement>('share-to-od-assistant-1');
    expect(screen.getByTestId('assistant-last-assistant-1').textContent).toBe('not-last');
    expect(sourceAction.disabled).toBe(true);
    expect(sourceAction.textContent).toBe('Preparing package…');
  });

  it('clears stale anchor spacer before sending another local turn', () => {
    const onSend = vi.fn();
    const { container } = render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={[
          { id: 'user-1', role: 'user', content: 'Make the landing page', createdAt: 1 },
          { id: 'assistant-1', role: 'assistant', content: 'Done', createdAt: 2 },
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const spacer = container.querySelector<HTMLElement>('.chat-log-tail-spacer');
    expect(spacer).not.toBeNull();
    spacer!.style.height = '320px';

    fireEvent.click(screen.getByTestId('composer-submit'));

    expect(onSend).toHaveBeenCalledOnce();
    expect(spacer!.style.height).toBe('0px');
  });

  it('shows several queued prompts above the composer with compact controls', () => {
    const onRemoveQueuedSend = vi.fn();
    const onSendQueuedNow = vi.fn();
    const onUpdateQueuedSend = vi.fn();
    const onReorderQueuedSends = vi.fn();
    const onSendEdited = vi.fn();
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
        onReorderQueuedSends={onReorderQueuedSends}
        onEnsureProject={async () => 'project-1'}
        onSend={onSendEdited}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const strip = screen.getByTestId('chat-queued-send-strip');
    // 稿子里队列**没有卡头**:它贴在输入框底下,是什么一目了然,
    // 不再单起一行写「排队中 · N 条」。行首改成序号。
    expect(strip?.textContent).not.toContain('Queued');
    expect(strip?.textContent).not.toContain('Start Multitasking');
    expect(
      screen.getAllByTestId('chat-queued-send-index').map((el) => el.textContent),
    ).toEqual(['1', '2', '3', '4', '5']);
    expect(screen.getAllByTestId('chat-queued-send-row')).toHaveLength(5);
    expect(strip?.textContent).toContain('Make the export button larger and use a warmer accent');
    expect(strip?.textContent).toContain('Then adjust the title spacing');
    expect(strip?.textContent).toContain('Reduce the subtitle size');
    expect(strip?.textContent).toContain('Switch to a lighter font weight');
    expect(strip?.textContent).toContain('Add hover polish');
    // 限的是高度不是条数:超出的部分整块滚动,不再折成「+N more」那一行。
    // 这条**故意**还按类名查:它钉的是「那段 DOM 已经删掉了」,类名就是被删的东西本身,
    // 换成 testid 反而钉不住(删掉的元素不会有 testid)。
    expect(container.querySelector('.chat-queued-send-overflow')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Drag to reorder' })).toHaveLength(5);

    const sendNowButtons = screen.getAllByRole('button', { name: 'chat.send' });
    fireEvent.click(sendNowButtons[1]!);
    expect(onSendQueuedNow).toHaveBeenCalledWith('queued-2');

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]!);
    expect(composerMocks.restoreDraft).toHaveBeenCalledWith({
      text: 'Make the export button larger and use a warmer accent',
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
      // 这一条排队时没带引用,所以取回来是空的 —— 空也要显式传:
      // 输入框拿它**替换**当前的引用芯片,不传就会把上一条编辑留下的芯片
      // 漏进这一发的正文里。
      quotes: [],
      meta: undefined,
    });
    // 「编辑」= 把这一条**从队列里取出来**放回输入框(产品拍板 2026-08),
    // 所以点下去的同时它就出队了 —— 屏幕上不会再有同一条话的两个副本。
    expect(onRemoveQueuedSend).toHaveBeenCalledWith('queued-1');
    // 出队之后再发,走的就是普通的发送那条路。它**不能**回头去「就地更新」
    // 一个已经不在队列里的条目 —— 那样这条话会被静默吞掉。
    fireEvent.click(screen.getByTestId('composer-submit'));
    expect(onUpdateQueuedSend).not.toHaveBeenCalled();
    // 第四个参数是 meta,这个 mock 的提交按钮不带,所以显式写 undefined ——
    // 省略它会让断言在「多传了一个 meta」时照样通过。
    expect(onSendEdited).toHaveBeenCalledWith(
      'Use a bolder export button',
      [{ path: 'edited.md', name: 'edited.md', kind: 'file' }],
      [{ id: 'edited-comment', order: 1, filePath: 'preview.html', comment: 'Bolder' }],
      undefined,
    );

    const removeButtons = screen.getAllByRole('button', { name: 'chat.comments.remove' });
    fireEvent.click(removeButtons[1]!);
    expect(onRemoveQueuedSend).toHaveBeenCalledWith('queued-2');
  });

  it('reorders queued prompts with the drag handle', () => {
    const onReorderQueuedSends = vi.fn();
    const { container } = render(
      <ChatPane
        messages={[]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[
          { id: 'queued-1', prompt: 'First queued follow-up' },
          { id: 'queued-2', prompt: 'Second queued follow-up' },
          { id: 'queued-3', prompt: 'Third queued follow-up' },
        ]}
        onReorderQueuedSends={onReorderQueuedSends}
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

    const rows = screen.getAllByTestId('chat-queued-send-row');
    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const dataTransfer = mockDataTransfer();
    const targetRect = {
      top: 0,
      height: 30,
      bottom: 30,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    Object.defineProperty(rows[2]!, 'getBoundingClientRect', {
      configurable: true,
      value: () => targetRect,
    });

    fireEvent.dragStart(handles[0]!, { dataTransfer });
    fireEvent.dragOver(rows[2]!, { dataTransfer, clientY: 29 });
    fireEvent.drop(rows[2]!, { dataTransfer, clientY: 29 });

    expect(onReorderQueuedSends).toHaveBeenCalledWith([
      'queued-2',
      'queued-3',
      'queued-1',
    ]);
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

    const log = screen.getByTestId('chat-log') as HTMLDivElement;
    const strip = screen.getByTestId('chat-queued-send-strip');

    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => 600 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(log, 'scrollTop', {
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

    MockResizeObserver.triggerObserved(strip);

    expect(log.scrollTop).toBe(600);
  });
});

// Verbatim from a real failed run's persisted `status:error` event
// (`.od/runs/60d39320-…/events.jsonl`): the bounded, redacted tail of what the
// agent actually printed. The account name is the only substitution.
const DSH_REAL_CAUSE =
  'credentials-local: the value for "version" in /Users/tester/.dsh/.credentials.yaml must be a string';

const DSH_STDERR_TAIL = `    at boot (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js:1186:9)
    at async runProfile (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/lib/profile-boot-DG5t9aNs.js:247:14)
    at async file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/lib/bin.js:133:3 {
  [cause]: Error: failed to apply loader entry include (cordis:include): failed to apply loader entry credentials (@deepseek-ai/dsh-credentials-local): credentials-local: the value for "version" in /Users/tester/.dsh/.credentials.yaml must be a string
      at updateError (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js:299:9)
      at Entry._init (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js:519:10) {
    [cause]: Error: failed to apply loader entry credentials (@deepseek-ai/dsh-credentials-local): credentials-local: the value for "version" in /Users/tester/.dsh/.credentials.yaml must be a string
        at updateError (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js:299:9)
        at Entry._init (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js:519:10) {
      [cause]: TypeError: credentials-local: the value for "version" in /Users/tester/.dsh/.credentials.yaml must be a string
          at parseCredentialsDocument (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js:132:40)
          at LocalCredentialProvider.loadInitial (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js:344:17)
          at async [cordis.init] (file:///Users/tester/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js:207:3)
          at file:///Users/tester/.dsh/profiles/open-design/#credentials
          at file:///Users/tester/.dsh/profiles/open-design/#include
    }
  }
}

Node.js v24.18.0`;

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
