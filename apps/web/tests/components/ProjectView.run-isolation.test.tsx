// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  PreviewComment,
  Project,
} from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const streamViaDaemon = vi.fn();
const streamMessage = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();
const playSound = vi.fn();
const showCompletionNotification = vi.fn();

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    setLocale: () => undefined,
    t: (key: string) => key,
  }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: (...args: unknown[]) => streamMessage(...args),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/utils/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/notifications')>()),
  playSound: (...args: unknown[]) => playSound(...args),
  showCompletionNotification: (...args: unknown[]) => showCompletionNotification(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: (...args: unknown[]) => saveTabs(...args),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: ({
    streaming,
    onSendBoardCommentAttachments,
    onCommentModeChange,
    onFocusModeChange,
  }: {
    streaming: boolean;
    onSendBoardCommentAttachments: (attachments: unknown[]) => void;
    onCommentModeChange?: (active: boolean) => void;
    onFocusModeChange?: (focused: boolean) => void;
  }) => (
    <>
      <output data-testid="workspace-streaming-state">{streaming ? 'streaming' : 'idle'}</output>
      <button
        type="button"
        data-testid="workspace-open-comments"
        onClick={() => onCommentModeChange?.(true)}
      >
        open comments
      </button>
      <button
        type="button"
        data-testid="workspace-focus-mode"
        onClick={() => onFocusModeChange?.(true)}
      >
        focus workspace
      </button>
      <button
        type="button"
        data-testid="workspace-send-comment"
        onClick={() => onSendBoardCommentAttachments([{ id: 'comment-1' }])}
      >
        workspace send
      </button>
    </>
  ),
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({
    activeConversationId,
    conversations,
    streaming,
    sendDisabled,
    queuedItems,
    previewComments,
    attachedComments,
    messages,
    onAttachComment,
    onSelectConversation,
    onSend,
    onSendQueuedNow,
    onNewConversation,
    error,
  }: {
    activeConversationId: string | null;
    conversations: Conversation[];
    streaming: boolean;
    sendDisabled?: boolean;
    queuedItems?: Array<{ id: string; prompt: string }>;
    previewComments?: PreviewComment[];
    attachedComments?: PreviewComment[];
    messages?: ChatMessage[];
    error: string | null;
    onAttachComment?: (comment: PreviewComment) => void;
    onSelectConversation: (id: string) => void;
    onSend: (prompt: string, attachments: unknown[], commentAttachments: unknown[]) => void;
    onSendQueuedNow?: (id: string) => void;
    onNewConversation: () => void;
  }) => {
    const attached = attachedComments ?? [];
    return (
      <section>
        <output data-testid="active-conversation">{activeConversationId}</output>
        <output data-testid="streaming-state">{streaming ? 'streaming' : 'idle'}</output>
        <output data-testid="chat-error">{error}</output>
        <output data-testid="assistant-events">
          {(messages ?? [])
            .filter((message) => message.role === 'assistant')
            .flatMap((message) => message.events ?? [])
            .map((event) => {
              if (event.kind === 'text') return event.text;
              if (event.kind === 'status') {
                const code = (event as { code?: string }).code;
                return `${code ? code + ' ' : ''}${event.detail ?? event.label}`;
              }
              return '';
            })
            .filter(Boolean)
            .join('\n')}
        </output>
        <output data-testid="attached-comment-count">{attached.length}</output>
        {queuedItems?.map((item, index) => (
          <button
            key={item.id}
            type="button"
            data-testid={`send-queued-${index}`}
            onClick={() => onSendQueuedNow?.(item.id)}
          >
            {item.prompt}
          </button>
        ))}
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            data-testid={`conversation-select-${conversation.id}`}
            onClick={() => onSelectConversation(conversation.id)}
          >
            {conversation.id}
          </button>
        ))}
        <button
          type="button"
          data-testid="attach-first-comment"
          onClick={() => {
            const first = previewComments?.[0];
            if (first) onAttachComment?.(first);
          }}
        >
          attach comment
        </button>
        <button
          type="button"
          data-testid="attach-second-comment"
          onClick={() => {
            const second = previewComments?.[1];
            if (second) onAttachComment?.(second);
          }}
        >
          attach second comment
        </button>
        <button
          type="button"
          data-testid="send-message"
          onClick={() =>
            onSend(
              'hello from b',
              [],
              attached.map((comment, index) => ({
                id: comment.id,
                order: index + 1,
                filePath: comment.filePath,
                elementId: comment.elementId,
                selector: comment.selector,
                label: comment.label,
                comment: comment.note,
                currentText: comment.text,
                pagePosition: comment.position,
                htmlHint: comment.htmlHint,
                selectionKind: comment.selectionKind ?? 'element',
                source: 'saved-comment',
              })),
            )
          }
          disabled={sendDisabled}
        >
          send
        </button>
        <button
          type="button"
          data-testid="send-message-alt"
          onClick={() =>
            onSend(
              'hello from c',
              [],
              attached.map((comment, index) => ({
                id: comment.id,
                order: index + 1,
                filePath: comment.filePath,
                elementId: comment.elementId,
                selector: comment.selector,
                label: comment.label,
                comment: comment.note,
                currentText: comment.text,
                pagePosition: comment.position,
                htmlHint: comment.htmlHint,
                selectionKind: comment.selectionKind ?? 'element',
                source: 'saved-comment',
              })),
            )
          }
          disabled={sendDisabled}
        >
          send alt
        </button>
        <button type="button" data-testid="new-conversation" onClick={onNewConversation}>
          new
        </button>
      </section>
    );
  },
}));

const config: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: 'agent-1',
  agentModels: {},
  skillId: null,
  designSystemId: null,
  notifications: {
    soundEnabled: true,
    successSoundId: 'success-sound',
    failureSoundId: 'failure-sound',
    desktopEnabled: false,
  },
};

const project: Project = {
  id: 'project-1',
  name: 'Project',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const conversations: Conversation[] = [
  { id: 'conv-a', projectId: project.id, title: 'A', createdAt: 1, updatedAt: 1 },
  { id: 'conv-b', projectId: project.id, title: 'B', createdAt: 1, updatedAt: 1 },
];

const createdConversation: Conversation = {
  id: 'conv-c',
  projectId: project.id,
  title: null,
  createdAt: 2,
  updatedAt: 2,
};

const runningAssistant: ChatMessage = {
  id: 'assistant-a',
  role: 'assistant',
  content: 'still running',
  createdAt: 1,
  runId: 'run-a',
  runStatus: 'running',
};

const succeededAssistant: ChatMessage = {
  ...runningAssistant,
  content: 'done',
  runStatus: 'succeeded',
  endedAt: 2,
};

const previewComment: PreviewComment = {
  id: 'comment-1',
  projectId: project.id,
  conversationId: 'conv-a',
  filePath: 'index.html',
  elementId: 'hero',
  selector: '[data-od-id="hero"]',
  label: 'Hero',
  text: 'Hero copy',
  position: { x: 1, y: 2, width: 30, height: 40 },
  htmlHint: '<section data-od-id="hero">Hero copy</section>',
  note: 'tighten this area',
  status: 'open',
  createdAt: 1,
  updatedAt: 1,
};

const secondPreviewComment: PreviewComment = {
  ...previewComment,
  id: 'comment-2',
  elementId: 'cta',
  selector: '[data-od-id="cta"]',
  label: 'CTA',
  text: 'Start now',
  note: 'keep this attached',
};

describe('ProjectView conversation run isolation', () => {
  let resolveConversationBMessages: ((messages: ChatMessage[]) => void) | null = null;
  let conversationAMessages: ChatMessage[] = [runningAssistant];

  beforeEach(() => {
    resolveConversationBMessages = null;
    conversationAMessages = [runningAssistant];
    listConversations.mockResolvedValue(conversations);
    listMessages.mockImplementation(async (_projectId: string, conversationId: string) => {
      if (conversationId === 'conv-a') return conversationAMessages;
      if (conversationId === 'conv-b') {
        return new Promise<ChatMessage[]>((resolve) => {
          resolveConversationBMessages = resolve;
        });
      }
      return new Promise<ChatMessage[]>(() => {});
    });
    createConversation.mockResolvedValue(createdConversation);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], active: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    listProjectRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-a',
      status: 'running',
      createdAt: 1,
      updatedAt: 1,
      exitCode: null,
      signal: null,
    });
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));
    streamViaDaemon.mockImplementation(async () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('allows sending in another conversation while the previous conversation has an active run', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByTestId('send-message'));
    expect(streamViaDaemon).not.toHaveBeenCalled();

    if (!resolveConversationBMessages) throw new Error('Expected conv-b message load to be pending');
    resolveConversationBMessages([]);

    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        conversationId: 'conv-b',
        locale: 'zh-CN',
      }),
    );
  });

  it('submits the live AMR fallback model when the saved AMR model is stale', async () => {
    conversationAMessages = [];
    renderProjectView(
      {
        ...config,
        agentId: 'amr',
        agentModels: {
          amr: { model: 'gpt-5.4-mini', reasoning: 'medium' },
        },
      },
      project,
      [
        {
          id: 'amr',
          name: 'AMR',
          bin: 'amr',
          available: true,
          models: [{ id: 'glm-5', label: 'GLM 5' }],
        },
      ],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'amr',
        model: 'glm-5',
        reasoning: 'medium',
      }),
    );
  });

  it('does not create duplicate empty conversations while a fresh conversation is loading', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));

    fireEvent.click(screen.getByTestId('new-conversation'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-c'));

    fireEvent.click(screen.getByTestId('new-conversation'));

    expect(createConversation).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate new conversations while creation is in flight', async () => {
    let resolveCreate!: (conversation: Conversation) => void;
    createConversation.mockImplementationOnce(
      () => new Promise<Conversation>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));

    fireEvent.click(screen.getByTestId('new-conversation'));
    fireEvent.click(screen.getByTestId('new-conversation'));

    expect(createConversation).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(createdConversation);
    });
  });

  it('notifies when a detached active run is terminal after returning to its conversation', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    if (!resolveConversationBMessages) throw new Error('Expected conv-b message load to be pending');
    resolveConversationBMessages([]);
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));

    conversationAMessages = [succeededAssistant];
    fireEvent.click(screen.getByTestId('conversation-select-conv-a'));

    await waitFor(() => expect(playSound).toHaveBeenCalledWith('success-sound'));
    expect(showCompletionNotification).not.toHaveBeenCalled();
  });

  it('does not reload or reattach when selecting the active streaming conversation', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    listMessages.mockClear();
    reattachDaemonRun.mockClear();

    fireEvent.click(screen.getByTestId('conversation-select-conv-a'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId('streaming-state').textContent).toBe('streaming');
    expect(listMessages).not.toHaveBeenCalled();
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('keeps Stop hidden and Send disabled until active-run cancellation is attached', async () => {
    fetchChatRunStatus.mockImplementation(async () => new Promise(() => {}));

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByTestId('send-message'));
    fireEvent.click(screen.getByTestId('workspace-send-comment'));

    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('returns to chat after sending board comments from the comment surface', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    if (!resolveConversationBMessages) throw new Error('Expected conv-b message load to be pending');
    resolveConversationBMessages([]);
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('workspace-focus-mode'));
    await waitFor(() =>
      expect(screen.getByTestId('active-conversation').closest('.split-chat-slot')?.hasAttribute('hidden')).toBe(true),
    );
    fireEvent.click(screen.getByTestId('workspace-open-comments'));
    fireEvent.click(screen.getByTestId('workspace-send-comment'));

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    expect(screen.getByTestId('active-conversation').closest('.split-chat-slot')?.hasAttribute('hidden')).toBe(false);
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-b',
      projectId: 'project-1',
    }));
  });
  it('detaches saved comment attachments after queueing them for a busy conversation', async () => {
    fetchPreviewComments.mockResolvedValue([previewComment]);

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('attach-first-comment'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('1'));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('0'));

    fireEvent.click(screen.getByTestId('send-message'));

    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(screen.getByTestId('attached-comment-count').textContent).toBe('0');
  });

  it('keeps newer attached comments when a queued send flushes older comment attachments', async () => {
    let finishReattach: (() => void) | null = null;
    let reattachHandlers: { onDone: () => void } | null = null;
    fetchPreviewComments.mockResolvedValue([previewComment, secondPreviewComment]);
    reattachDaemonRun.mockImplementation(async (input: unknown) => {
      reattachHandlers = (input as { handlers: { onDone: () => void } }).handlers;
      return new Promise<void>((resolve) => {
        finishReattach = resolve;
      });
    });

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('attach-first-comment'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('1'));
    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('0'));

    fireEvent.click(screen.getByTestId('attach-second-comment'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('1'));

    await act(async () => {
      reattachHandlers?.onDone();
      finishReattach?.();
    });

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('attached-comment-count').textContent).toBe('1');
    expect(streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        commentAttachments: [
          expect.objectContaining({ id: previewComment.id }),
        ],
      }),
    );
  });

  it('does not overlap active runs when send-now is clicked for a queued item', async () => {
    let finishReattach: (() => void) | null = null;
    let reattachHandlers: { onDone: () => void } | null = null;
    reattachDaemonRun.mockImplementation(async (input: unknown) => {
      reattachHandlers = (input as { handlers: { onDone: () => void } }).handlers;
      return new Promise<void>((resolve) => {
        finishReattach = resolve;
      });
    });

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('send-message'));
    fireEvent.click(screen.getByTestId('send-message-alt'));

    await waitFor(() => expect(screen.getByTestId('send-queued-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('send-queued-1'));

    expect(streamViaDaemon).not.toHaveBeenCalled();

    await act(async () => {
      reattachHandlers?.onDone();
      finishReattach?.();
    });

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    const payload = streamViaDaemon.mock.calls[0]?.[0] as {
      history?: Array<{ role: string; content: string }>;
    };
    expect(payload.history?.at(-1)).toMatchObject({ role: 'user', content: 'hello from c' });
  });
  it('surfaces conversation message load errors and keeps sends disabled until messages load', async () => {
    let conversationBLoadAttempts = 0;
    listMessages.mockImplementation(async (_projectId: string, conversationId: string) => {
      if (conversationId === 'conv-a') return [];
      if (conversationId === 'conv-b') {
        conversationBLoadAttempts += 1;
        if (conversationBLoadAttempts === 1) throw new Error('messages unavailable');
        return [];
      }
      return [];
    });

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));

    await waitFor(() => expect(screen.getByTestId('chat-error').textContent).toBe('messages unavailable'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('workspace-streaming-state').textContent).toBe('streaming');

    fireEvent.click(screen.getByTestId('send-message'));

    expect(streamViaDaemon).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));

    await waitFor(() => expect(conversationBLoadAttempts).toBe(2));
    await waitFor(() => expect(screen.getByTestId('chat-error').textContent).toBe(''));
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false);
  });

  it('does not rename an existing named project when sending the first message in an empty conversation', async () => {
    const namedProject: Project = {
      ...project,
      name: 'Imported Client Folder',
      metadata: { kind: 'prototype', nameSource: 'user' },
    };
    const emptyConversation: Conversation = {
      id: 'conv-empty',
      projectId: namedProject.id,
      title: null,
      createdAt: 1,
      updatedAt: 1,
    };
    listConversations.mockResolvedValue([emptyConversation]);
    listMessages.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue(null);

    renderProjectView(config, namedProject);

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-empty'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(patchProject).not.toHaveBeenCalledWith(
      namedProject.id,
      expect.objectContaining({ name: expect.any(String) }),
    );
  });

  it('notifies when an API-mode chat completes without a daemon run status transition', async () => {
    listMessages.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    streamMessage.mockImplementation(
      async (
        _config: unknown,
        _systemPrompt: unknown,
        _history: unknown,
        _signal: unknown,
        handlers: { onDelta: (delta: string) => void; onDone: () => void },
      ) => {
        handlers.onDelta('api response');
        handlers.onDone();
      },
    );

    renderProjectView({
      ...config,
      mode: 'api',
      apiKey: 'test-key',
      model: 'api-model',
    });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(playSound).toHaveBeenCalledWith('success-sound'));
  });

  it('converges a daemon chat back to idle when the first AMR run fails authentication', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        options.onRunCreated?.('run-auth-expired');
        options.handlers.onError(
          new Error('Your authentication token has expired. Please sign in again.'),
        );
      },
    );

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('chat-error').textContent).toBe(
        'Your authentication token has expired. Please sign in again.',
      ),
    );
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
  });

  it('renders recharge guidance for structured AMR insufficient-balance errors', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        options.onRunCreated?.('run-amr-balance');
        const error = new Error(
          'AMR Cloud reported insufficient balance for this model. Recharge your AMR wallet at https://open-design.ai/amr/wallet, then retry this run.',
        ) as Error & { code: string; details: unknown };
        error.code = 'AMR_INSUFFICIENT_BALANCE';
        error.details = {
          kind: 'amr_account',
          action: 'recharge',
          actionUrl: 'https://open-design.ai/amr/wallet',
        };
        options.handlers.onError(error);
      },
    );

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('chat-error').textContent).toContain('insufficient balance'),
    );
    // The structured code rides on the error event; ChatPane keys the recharge
    // affordance off it.
    expect(screen.getByTestId('assistant-events').textContent).toContain(
      'AMR_INSUFFICIENT_BALANCE',
    );
    expect(screen.getByTestId('streaming-state').textContent).toBe('idle');
  });

  it('renders re-login guidance for structured AMR auth-required errors', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        options.onRunCreated?.('run-amr-auth');
        const error = new Error(
          'AMR sign-in is required. Sign in to AMR Cloud again, then retry this run.',
        ) as Error & { code: string; details: unknown };
        error.code = 'AMR_AUTH_REQUIRED';
        error.details = {
          kind: 'amr_account',
          action: 'relogin',
        };
        options.handlers.onError(error);
      },
    );

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('chat-error').textContent).toContain(
        'AMR sign-in is required',
      ),
    );
    // The structured code rides on the error event; ChatPane keys the
    // authorize-and-retry affordance off it.
    expect(screen.getByTestId('assistant-events').textContent).toContain(
      'AMR_AUTH_REQUIRED',
    );
    expect(screen.getByTestId('streaming-state').textContent).toBe('idle');
  });
});

function renderProjectView(
  renderConfig = config,
  renderProject: Project = project,
  renderAgents: AgentInfo[] = [
    { id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] },
  ],
) {
  return render(
    <ProjectView
      project={renderProject}
      routeFileName={null}
      config={renderConfig}
      agents={renderAgents}
      skills={[]}
      designTemplates={[]}
      designSystems={[]}
      daemonLive
      onModeChange={() => {}}
      onAgentChange={() => {}}
      onAgentModelChange={() => {}}
      onRefreshAgents={() => {}}
      onOpenSettings={() => {}}
      onBack={() => {}}
      onClearPendingPrompt={() => {}}
      onTouchProject={() => {}}
      onProjectChange={() => {}}
      onProjectsRefresh={() => {}}
    />,
  );
}
