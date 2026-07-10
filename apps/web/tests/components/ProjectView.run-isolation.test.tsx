// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView, mergeSavedPreviewComment } from '../../src/components/ProjectView';
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
const patchPreviewCommentStatus = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const fetchVelaLoginStatus = vi.fn();
const fetchAmrWalletSnapshot = vi.fn();
const launchAntigravityOauth = vi.fn();
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
  GENERIC_DAEMON_DISCONNECT_CODE: 'GENERIC_DAEMON_DISCONNECT',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  fetchVelaLoginStatus: (...args: unknown[]) => fetchVelaLoginStatus(...args),
  fetchAmrWalletSnapshot: (...args: unknown[]) => fetchAmrWalletSnapshot(...args),
  formatVelaBalanceUsd: (raw: string | null | undefined) => (raw == null ? null : `$${raw}`),
  launchAntigravityOauth: (...args: unknown[]) => launchAntigravityOauth(...args),
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
  patchPreviewCommentStatus: (...args: unknown[]) => patchPreviewCommentStatus(...args),
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
  cacheTabsLocally: (_projectId: string, state: unknown) => state,
  persistTabsToDaemonNow: vi.fn(),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: ({
    streaming,
    messages,
    onRetry,
    onAuthorizeAndRetry,
    onLaunchTerminalAuth,
    onSendBoardCommentAttachments,
    onCommentModeChange,
    onFocusModeChange,
  }: {
    streaming: boolean;
    messages?: ChatMessage[];
    onRetry?: (message: ChatMessage) => void;
    onAuthorizeAndRetry?: (message: ChatMessage) => void;
    onLaunchTerminalAuth?: () => void;
    onSendBoardCommentAttachments: (attachments: unknown[]) => void;
    onCommentModeChange?: (active: boolean) => void;
    onFocusModeChange?: (focused: boolean) => void;
  }) => {
    const failedAssistant =
      [...(messages ?? [])]
        .reverse()
        .find((message) => message.role === 'assistant' && message.runStatus === 'failed') ?? null;
    const errorCode = failedAssistant?.events
      ?.filter((event) => event.kind === 'status' && event.label === 'error')
      .map((event) => (event as { code?: string }).code ?? null)
      .filter(Boolean)
      .at(-1) ?? null;
    const showAuthorizeAction = failedAssistant?.agentId === 'amr' && errorCode === 'AMR_AUTH_REQUIRED';
    const showLaunchTerminalAction =
      failedAssistant?.agentId === 'antigravity'
      && (errorCode === 'AGENT_AUTH_REQUIRED' || errorCode === 'RATE_LIMITED');
    const showSwitchToAmrPromotion =
      failedAssistant?.agentId !== 'amr'
      && failedAssistant?.agentId !== 'antigravity'
      && (errorCode === 'AGENT_AUTH_REQUIRED' || errorCode === 'UNAUTHORIZED' || errorCode === 'RATE_LIMITED');
    const showRetryAction = Boolean(
      failedAssistant && onRetry && (
        errorCode == null
        || errorCode === 'AMR_INSUFFICIENT_BALANCE'
        || errorCode === 'UPSTREAM_UNAVAILABLE'
        || showLaunchTerminalAction
        || showSwitchToAmrPromotion
        || (!showAuthorizeAction && !showLaunchTerminalAction)
      ),
    );
    return (
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
      {showRetryAction ? (
        <button
          type="button"
          data-testid="workspace-retry"
          onClick={() => {
            if (failedAssistant && onRetry) onRetry(failedAssistant);
          }}
        >
          retry
        </button>
      ) : null}
      {showAuthorizeAction && onAuthorizeAndRetry ? (
        <button
          type="button"
          data-testid="workspace-authorize"
          onClick={() => {
            if (failedAssistant) onAuthorizeAndRetry(failedAssistant);
          }}
        >
          authorize
        </button>
      ) : null}
      {showSwitchToAmrPromotion && onAuthorizeAndRetry ? (
        <button
          type="button"
          data-testid="workspace-switch-amr"
          onClick={() => {
            if (failedAssistant) onAuthorizeAndRetry(failedAssistant);
          }}
        >
          switch to amr
        </button>
      ) : null}
      {showLaunchTerminalAction && onLaunchTerminalAuth ? (
        <button
          type="button"
          data-testid="workspace-launch-terminal"
          onClick={() => onLaunchTerminalAuth()}
        >
          launch terminal
        </button>
      ) : null}
    </>
    );
  },
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
    queuedItems?: Array<{
      id: string;
      prompt: string;
      attachments?: unknown[];
      commentAttachments?: unknown[];
    }>;
    previewComments?: PreviewComment[];
    attachedComments?: PreviewComment[];
    messages?: ChatMessage[];
    error: string | null;
    onAttachComment?: (comment: PreviewComment) => void;
    onSelectConversation: (id: string) => void;
    onSend: (
      prompt: string,
      attachments: unknown[],
      commentAttachments: unknown[],
      meta?: unknown,
    ) => void;
    onSendQueuedNow?: (id: string) => void;
    onNewConversation: () => void;
  }) => {
    const attached = attachedComments ?? [];
    return (
      <section>
        <output data-testid="active-conversation">{activeConversationId}</output>
        <output data-testid="streaming-state">{streaming ? 'streaming' : 'idle'}</output>
        <output data-testid="chat-error">{error}</output>
        <output data-testid="conversation-latest-runs">
          {conversations
            .map((conversation) => `${conversation.id}:${conversation.latestRun?.status ?? ''}`)
            .join('\n')}
        </output>
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
        <output data-testid="assistant-summary">
          {(messages ?? [])
            .filter((message) => message.role === 'assistant')
            .map((message) =>
              [
                message.id,
                message.runStatus ?? '',
                message.content,
                ...(message.producedFiles ?? []).map((file) => file.name),
              ].join('|'),
            )
            .join('\n')}
        </output>
        <output data-testid="attached-comment-count">{attached.length}</output>
        {queuedItems?.map((item, index) => (
          <div key={item.id}>
            <button
              type="button"
              data-testid={`send-queued-${index}`}
              onClick={() => onSendQueuedNow?.(item.id)}
            >
              {item.prompt}
            </button>
            <output data-testid={`queued-attachment-count-${index}`}>
              {item.attachments?.length ?? 0}
            </output>
            <output data-testid={`queued-comment-count-${index}`}>
              {item.commentAttachments?.length ?? 0}
            </output>
          </div>
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
        <button
          type="button"
          data-testid="send-message-with-context"
          onClick={() =>
            onSend(
              'hello with staged context',
              [],
              [],
              {
                skillIds: ['deck-builder'],
                context: {
                  skillIds: ['deck-builder'],
                  mcpServerIds: ['slack'],
                  connectorIds: ['github'],
                },
              },
            )
          }
          disabled={sendDisabled}
        >
          send with context
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

describe('mergeSavedPreviewComment', () => {
  it('appends newly saved comments after existing comments', () => {
    expect(mergeSavedPreviewComment([previewComment], secondPreviewComment).map((comment) => comment.id))
      .toEqual(['comment-1', 'comment-2']);
  });

  it('replaces existing comments without moving them', () => {
    const updatedFirst = { ...previewComment, note: 'updated first', updatedAt: 10 };

    const next = mergeSavedPreviewComment([previewComment, secondPreviewComment], updatedFirst);

    expect(next.map((comment) => comment.id)).toEqual(['comment-1', 'comment-2']);
    expect(next[0]?.note).toBe('updated first');
  });
});

describe('ProjectView conversation run isolation', () => {
  let resolveConversationBMessages: ((messages: ChatMessage[]) => void) | null = null;
  let conversationAMessages: ChatMessage[] = [runningAssistant];

  beforeEach(() => {
    window.localStorage.clear();
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
    fetchVelaLoginStatus.mockResolvedValue({ loggedIn: false });
    // Positive wallet balance so the pre-run AMR balance gate lets sends
    // through; the gate's own behavior is covered in
    // tests/runtime/amr-balance-gate.test.ts.
    fetchAmrWalletSnapshot.mockResolvedValue({
      status: 'available',
      profile: 'prod',
      user: null,
      balanceUsd: '10.00',
      updatedAt: null,
      fetchedAt: '2026-07-02T00:00:00.000Z',
      stale: false,
      source: 'vela_api',
    });
    launchAntigravityOauth.mockResolvedValue({ ok: true });
    streamViaDaemon.mockImplementation(async () => {});
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
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

  it('hard-blocks the AMR send and shows the balance dialog when the wallet is empty', async () => {
    conversationAMessages = [];
    // Both the cached read and the refresh confirmation report an empty
    // wallet, so the send must be hard-blocked before any run spawns.
    fetchAmrWalletSnapshot.mockResolvedValue({
      status: 'available',
      profile: 'prod',
      user: null,
      balanceUsd: '0',
      updatedAt: null,
      fetchedAt: '2026-07-02T00:00:00.000Z',
      stale: false,
      source: 'vela_api',
    });
    renderProjectView(
      { ...config, agentId: 'amr' },
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

    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  it('soft-warns on a low AMR wallet and proceeds with the same send on confirmation', async () => {
    conversationAMessages = [];
    fetchAmrWalletSnapshot.mockResolvedValue({
      status: 'available',
      profile: 'prod',
      user: null,
      balanceUsd: '1.20',
      updatedAt: null,
      fetchedAt: '2026-07-02T00:00:00.000Z',
      stale: false,
      source: 'vela_api',
    });
    renderProjectView(
      { ...config, agentId: 'amr' },
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

    // The reminder holds the send: no run yet.
    await waitFor(() => expect(screen.getByTestId('amr-low-balance-dialog')).toBeTruthy());
    expect(streamViaDaemon).not.toHaveBeenCalled();

    // "Start anyway" resolves the pending send — the run starts without a re-submit.
    fireEvent.click(screen.getByTestId('amr-low-balance-dialog-proceed'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'amr' }),
    );
  });

  it('keeps an AMR send queued when the user switches conversations during the gate check', async () => {
    conversationAMessages = [];
    fetchPreviewComments.mockResolvedValue([previewComment]);
    let resolveWallet: (snapshot: unknown) => void = () => {};
    fetchAmrWalletSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWallet = resolve;
        }),
    );
    renderProjectView(
      { ...config, agentId: 'amr' },
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

    fireEvent.click(screen.getByTestId('attach-first-comment'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('1'));

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(fetchAmrWalletSnapshot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    await waitFor(() => {
      if (!resolveConversationBMessages) throw new Error('Expected conv-b message load to be pending');
    });
    await act(async () => {
      resolveConversationBMessages?.([]);
    });
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    await act(async () => {
      resolveWallet({
        status: 'available',
        profile: 'prod',
        user: null,
        balanceUsd: '10.00',
        updatedAt: null,
        fetchedAt: '2026-07-02T00:00:00.000Z',
        stale: false,
        source: 'vela_api',
      });
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem('od:chat-queued-sends:project-1:v1');
      expect(raw).toBeTruthy();
      const queued = JSON.parse(raw ?? '[]') as Array<{
        conversationId?: string;
        prompt?: string;
        commentAttachments?: Array<{ id?: string }>;
      }>;
      expect(queued).toEqual([
        expect.objectContaining({
          conversationId: 'conv-a',
          prompt: 'hello from b',
          commentAttachments: [expect.objectContaining({ id: previewComment.id })],
        }),
      ]);
    });
    expect(streamViaDaemon).not.toHaveBeenCalled();
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

  it('interrupts the active run and flushes the prioritized queued send when send-now is clicked while busy', async () => {
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
    expect(streamViaDaemon).not.toHaveBeenCalled();

    // Send-now on the second queued item while the conversation is still
    // busy. The chosen UX is "interrupt the running turn and send this item
    // now" — so this must stop the in-flight run and flush the prioritized
    // send WITHOUT waiting for the active run to finish on its own. Stopping
    // first keeps runs from overlapping. The reattach promise is never
    // resolved here on purpose: a regression that only reorders the queue
    // (without stopping) would leave the conversation busy forever and never
    // call streamViaDaemon.
    fireEvent.click(screen.getByTestId('send-queued-1'));

    // The in-flight turn is canceled (interrupted), not left running.
    await waitFor(() =>
      expect(screen.getByTestId('assistant-summary').textContent).toContain('canceled'),
    );

    // ...and the prioritized queued send flushes immediately afterward, with
    // no manual completion of the reattach run.
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    const payload = streamViaDaemon.mock.calls[0]?.[0] as {
      history?: Array<{ role: string; content: string }>;
    };
    expect(payload.history?.at(-1)).toMatchObject({ role: 'user', content: 'hello from c' });
  });

  it('ignores completion side effects when the interrupted run reports canceled and done late', async () => {
    const queuedSend = {
      id: 'queued-1',
      conversationId: 'conv-a',
      prompt: 'hello from c',
      attachments: [],
      commentAttachments: [],
      createdAt: 1,
    };
    window.localStorage.setItem(
      'od:chat-queued-sends:project-1:v1',
      JSON.stringify([queuedSend]),
    );

    conversationAMessages = [];
    fetchPreviewComments.mockResolvedValue([previewComment]);
    const daemonRuns: Array<{
      handlers: { onDone: (fullText?: string) => void };
      onRunCreated?: (runId: string) => void;
      onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
    }> = [];
    streamViaDaemon.mockImplementation(async (input: unknown) => {
      const options = input as {
        handlers: { onDone: (fullText?: string) => void };
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
      };
      daemonRuns.push(options);
      options.onRunCreated?.(`run-${daemonRuns.length}`);
      options.onRunStatus?.('running');
    });

    renderProjectView(
      config,
      project,
      [{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('attach-first-comment'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('1'));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));
    await waitFor(() => expect(screen.getByTestId('send-queued-0')).toBeTruthy());

    fireEvent.click(screen.getByTestId('send-queued-0'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('conversation-latest-runs').textContent).toContain('conv-a:running'),
    );
    await waitFor(() =>
      expect(patchPreviewCommentStatus).toHaveBeenCalledWith(
        'project-1',
        'conv-a',
        previewComment.id,
        'applying',
      ),
    );
    patchPreviewCommentStatus.mockClear();
    fetchProjectFiles.mockClear();

    await act(async () => {
      daemonRuns[0]?.onRunStatus?.('canceled');
      daemonRuns[0]?.handlers.onDone('interrupted done');
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));
    expect(screen.getByTestId('workspace-streaming-state').textContent).toBe('streaming');
    expect(screen.getByTestId('conversation-latest-runs').textContent).toContain('conv-a:running');
    expect(patchPreviewCommentStatus).not.toHaveBeenCalledWith(
      'project-1',
      'conv-a',
      previewComment.id,
      'needs_review',
    );
    expect(fetchProjectFiles).not.toHaveBeenCalled();
    expect(streamViaDaemon).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationId: 'conv-a',
      history: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'hello from c' }),
      ]),
    }));
  });

  it('does not surface a stale failure banner when the interrupted run errors late', async () => {
    const queuedSend = {
      id: 'queued-1',
      conversationId: 'conv-a',
      prompt: 'hello from c',
      attachments: [],
      commentAttachments: [],
      createdAt: 1,
    };
    window.localStorage.setItem(
      'od:chat-queued-sends:project-1:v1',
      JSON.stringify([queuedSend]),
    );

    conversationAMessages = [];
    const daemonRuns: Array<{
      handlers: { onDone: (fullText?: string) => void; onError: (err: Error) => void };
      onRunCreated?: (runId: string) => void;
      onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
    }> = [];
    streamViaDaemon.mockImplementation(async (input: unknown) => {
      const options = input as {
        handlers: { onDone: (fullText?: string) => void; onError: (err: Error) => void };
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
      };
      daemonRuns.push(options);
      options.onRunCreated?.(`run-${daemonRuns.length}`);
      options.onRunStatus?.('running');
    });

    renderProjectView(
      config,
      project,
      [{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('send-queued-0')).toBeTruthy());

    // Interrupt: send-now stops the first run and flushes the queued send.
    fireEvent.click(screen.getByTestId('send-queued-0'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    // The superseded run loses its terminal SSE and surfaces a late error. It
    // must not paint a global failure banner over the live replacement run.
    await act(async () => {
      daemonRuns[0]?.handlers.onError(new Error('daemon stream disconnected before run completed'));
    });

    expect(screen.getByTestId('chat-error').textContent).toBe('');
    expect(screen.getByTestId('streaming-state').textContent).toBe('streaming');
    expect(screen.getByTestId('conversation-latest-runs').textContent).toContain('conv-a:running');
  });

  it('does not surface a stale failure banner when an interrupted reattached run errors late', async () => {
    // conv-a starts with a reattached run in flight (the screenshot scenario:
    // the agent was already streaming when the user queued a turn).
    let reattachHandlers: { onError: (err: Error) => void } | null = null;
    reattachDaemonRun.mockImplementation(async (input: unknown) => {
      reattachHandlers = (input as { handlers: { onError: (err: Error) => void } }).handlers;
      return new Promise<void>(() => {});
    });
    streamViaDaemon.mockImplementation(async (input: unknown) => {
      const options = input as {
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
      };
      options.onRunCreated?.('run-replacement');
      options.onRunStatus?.('running');
    });

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(screen.getByTestId('send-queued-0').textContent).toBe('hello from b'));

    // Interrupt the reattached run; the queued send flushes as the replacement.
    fireEvent.click(screen.getByTestId('send-queued-0'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('streaming-state').textContent).toBe('streaming');

    // The superseded reattached run errors late (lost terminal SSE). It must
    // not paint a global failure banner over the live replacement run.
    await act(async () => {
      reattachHandlers?.onError(new Error('daemon stream disconnected before run completed'));
    });

    expect(screen.getByTestId('chat-error').textContent).toBe('');
    expect(screen.getByTestId('streaming-state').textContent).toBe('streaming');
  });

  it('runs a normal run completion even after its terminal status cleared the active refs', async () => {
    // The daemon emits the terminal onRunStatus *before* onDone, and that
    // terminal status clears the run's active refs. onDone must still apply the
    // normal completion flow (file refresh, artifact/produced-file attach) — the
    // superseded-run guard must not mistake a cleared slot for a takeover.
    conversationAMessages = [];
    const daemonRuns: Array<{
      handlers: { onDone: (fullText?: string) => void };
      onRunCreated?: (runId: string) => void;
      onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
    }> = [];
    streamViaDaemon.mockImplementation(async (input: unknown) => {
      const options = input as {
        handlers: { onDone: (fullText?: string) => void };
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
      };
      daemonRuns.push(options);
      options.onRunCreated?.(`run-${daemonRuns.length}`);
      options.onRunStatus?.('running');
    });

    renderProjectView(
      config,
      project,
      [{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    fetchProjectFiles.mockClear();

    await act(async () => {
      // Terminal status first (clears the active refs), then onDone.
      daemonRuns[0]?.onRunStatus?.('succeeded');
      daemonRuns[0]?.handlers.onDone('completed output');
    });

    // The completion flow ran: it refetches the file list to attach produced
    // files, and the conversation's latest run reflects success.
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalled());
    expect(screen.getByTestId('conversation-latest-runs').textContent).toContain('conv-a:succeeded');
  });

  it('skips an interrupted reattached run\'s completion side effects when it finishes late', async () => {
    // The interrupted run is tagged superseded synchronously at send-now time
    // (before handleStop clears the refs), so its late onDone — which the
    // daemon still delivers for the canceled run — must not run the completion
    // flow (file refresh, artifact persist, produced-file attach) even though
    // it could land before the replacement send attaches.
    let reattachHandlers: { onDone: () => void } | null = null;
    reattachDaemonRun.mockImplementation(async (input: unknown) => {
      reattachHandlers = (input as { handlers: { onDone: () => void } }).handlers;
      return new Promise<void>(() => {});
    });
    streamViaDaemon.mockImplementation(async (input: unknown) => {
      const options = input as {
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
      };
      options.onRunCreated?.('run-replacement');
      options.onRunStatus?.('running');
    });

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(screen.getByTestId('send-queued-0').textContent).toBe('hello from b'));

    fireEvent.click(screen.getByTestId('send-queued-0'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    fetchProjectFiles.mockClear();

    // The superseded reattached run finishes late.
    await act(async () => {
      reattachHandlers?.onDone();
    });

    // Its completion side effects (which refetch the file list) did not run.
    expect(fetchProjectFiles).not.toHaveBeenCalled();
  });

  it('does not reset a queued send\'s own comment status when send-now flushes it', async () => {
    fetchPreviewComments.mockResolvedValue([previewComment]);
    streamViaDaemon.mockImplementation(async (input: unknown) => {
      const options = input as {
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
      };
      options.onRunCreated?.('run-replacement');
      options.onRunStatus?.('running');
    });

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    // Attach a comment and send while busy: the turn is queued and its comment
    // attachment is reserved as 'applying'.
    fireEvent.click(screen.getByTestId('attach-first-comment'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('1'));
    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() =>
      expect(patchPreviewCommentStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        previewComment.id,
        'applying',
      ),
    );
    await waitFor(() => expect(screen.getByTestId('send-queued-0')).toBeTruthy());

    patchPreviewCommentStatus.mockClear();

    // Send-now flushes that queued comment-bearing item. Its comment belongs to
    // the send being dispatched (the replacement re-applies it), so the
    // interrupt's stale-comment cleanup must NOT reset it to 'open' — that would
    // race the replacement's 'applying' write and reopen a reserved comment.
    fireEvent.click(screen.getByTestId('send-queued-0'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalled());

    expect(patchPreviewCommentStatus).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      previewComment.id,
      'open',
    );
  });

  it('auto-starts queued sends one at a time after the active run completes', async () => {
    let finishReattach: (() => void) | null = null;
    let reattachHandlers: { onDone: () => void } | null = null;
    const daemonRuns: Array<{
      handlers: { onDone: (fullText?: string) => void };
      onRunCreated?: (runId: string) => void;
      onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
    }> = [];

    reattachDaemonRun.mockImplementation(async (input: unknown) => {
      reattachHandlers = (input as { handlers: { onDone: () => void } }).handlers;
      return new Promise<void>((resolve) => {
        finishReattach = resolve;
      });
    });
    streamViaDaemon.mockImplementation(async (input: unknown) => {
      const options = input as {
        handlers: { onDone: (fullText?: string) => void };
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (status: NonNullable<ChatMessage['runStatus']>) => void;
      };
      daemonRuns.push(options);
      options.onRunCreated?.(`run-${daemonRuns.length}`);
    });

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('send-message'));
    fireEvent.click(screen.getByTestId('send-message-alt'));

    await waitFor(() => expect(screen.getByTestId('send-queued-1').textContent).toBe('hello from c'));

    await act(async () => {
      reattachHandlers?.onDone();
      finishReattach?.();
    });

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'hello from b' }),
        ]),
      }),
    );
    expect(screen.getByTestId('send-queued-0').textContent).toBe('hello from c');
    expect(screen.queryByTestId('send-queued-1')).toBeNull();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);

    await act(async () => {
      daemonRuns[0]?.onRunStatus?.('succeeded');
      daemonRuns[0]?.handlers.onDone('first done');
    });

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    expect(streamViaDaemon.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'hello from c' }),
        ]),
      }),
    );
    expect(screen.queryByTestId('send-queued-0')).toBeNull();
  });

  it('restores queued sends after the project view remounts', async () => {
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));

    const firstRender = renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(screen.getByTestId('send-queued-0').textContent).toBe('hello from b'));

    firstRender.unmount();
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-queued-0').textContent).toBe('hello from b'));
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

  it('replaces a raw prompt-head project name with the first prompt summary', async () => {
    const promptNamedProject: Project = {
      ...project,
      name: 'hello from b',
      metadata: { kind: 'prototype', nameSource: 'prompt' },
    };
    const emptyConversation: Conversation = {
      id: 'conv-empty',
      projectId: promptNamedProject.id,
      title: null,
      createdAt: 1,
      updatedAt: 1,
    };
    listConversations.mockResolvedValue([emptyConversation]);
    listMessages.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue(null);

    renderProjectView(config, promptNamedProject);

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-empty'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() =>
      expect(patchConversation).toHaveBeenCalledWith(
        promptNamedProject.id,
        emptyConversation.id,
        { title: 'Hello From B' },
      ),
    );
    await waitFor(() =>
      expect(patchProject).toHaveBeenCalledWith(
        promptNamedProject.id,
        expect.objectContaining({
          name: 'Hello From B',
          metadata: expect.objectContaining({ nameSource: 'prompt' }),
        }),
      ),
    );
  });

  it('replaces the first-turn fallback title with an agent-generated title', async () => {
    const promptNamedProject: Project = {
      ...project,
      name: 'hello from b',
      metadata: { kind: 'prototype', nameSource: 'prompt' },
    };
    const emptyConversation: Conversation = {
      id: 'conv-empty',
      projectId: promptNamedProject.id,
      title: null,
      createdAt: 1,
      updatedAt: 1,
    };
    listConversations.mockResolvedValue([emptyConversation]);
    listMessages.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(async (input: {
      handlers: { onAgentEvent: (event: { kind: 'conversation_title'; title: string }) => void };
    }) => {
      input.handlers.onAgentEvent({ kind: 'conversation_title', title: 'Agent Title' });
    });

    renderProjectView(config, promptNamedProject);

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-empty'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      titleGeneration: { enabled: true },
    }));
    await waitFor(() =>
      expect(patchConversation).toHaveBeenCalledWith(
        promptNamedProject.id,
        emptyConversation.id,
        { title: 'Agent Title' },
      ),
    );
    await waitFor(() =>
      expect(patchProject).toHaveBeenCalledWith(
        promptNamedProject.id,
        expect.objectContaining({
          name: 'Agent Title',
          metadata: expect.objectContaining({ nameSource: 'agent' }),
        }),
      ),
    );
  });

  it('forwards staged skill and external context selections into the next daemon run payload', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    act(() => {
      resolveConversationBMessages?.([]);
    });
    await waitFor(() => expect(screen.getByTestId('send-message-with-context')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message-with-context'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      skillId: null,
      skillIds: ['deck-builder'],
      context: {
        skillIds: ['deck-builder'],
        mcpServerIds: ['slack'],
        connectorIds: ['github'],
      },
      history: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'hello with staged context' }),
      ]),
    }));
  });

  it('notifies when a BYOK OpenCode chat completes without a daemon run status transition', async () => {
    listMessages.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDelta: (delta: string) => void; onDone: () => void };
    }) => {
      options.handlers.onDelta('api response');
      options.handlers.onDone();
    });

    renderProjectView({
      ...config,
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: 'test-key',
      model: 'api-model',
    });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'byok-opencode',
      byokProvider: expect.objectContaining({ protocol: 'openai', apiKey: 'test-key' }),
      model: 'api-model',
    }));
    await waitFor(() => expect(playSound).toHaveBeenCalledWith('success-sound'));
  });

  it('routes keyless local Ollama BYOK chats through OpenCode with provider metadata', async () => {
    listMessages.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    renderProjectView({
      ...config,
      mode: 'api',
      apiProtocol: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'byok-opencode',
      byokProvider: {
        protocol: 'ollama',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        requiresApiKey: false,
        apiVersion: '',
      },
      model: 'llama3.2',
    }));
  });

  it('routes the keyless vLLM BYOK preset through OpenCode with provider metadata', async () => {
    listMessages.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    renderProjectView({
      ...config,
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiProviderBaseUrl: 'http://127.0.0.1:8000/v1',
      model: 'model',
    });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'byok-opencode',
      byokProvider: {
        protocol: 'openai',
        apiKey: '',
        baseUrl: 'http://127.0.0.1:8000/v1',
        requiresApiKey: false,
        apiVersion: '',
      },
      model: 'model',
    }));
  });

  it('keeps Bedrock BYOK chats on the client-side unsupported path', async () => {
    listMessages.mockResolvedValue([]);

    renderProjectView({
      ...config,
      mode: 'api',
      apiProtocol: 'bedrock',
      apiKey: '',
      model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() =>
      expect(screen.getByTestId('chat-error').textContent).toBe(
        'AWS Bedrock BYOK chat requires AWS credential signing and is not supported by the current API-key proxy.',
      ),
    );
    expect(streamViaDaemon).not.toHaveBeenCalled();
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

  it('keeps retry available after a structured AMR insufficient-balance error', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        if (streamViaDaemon.mock.calls.length > 1) return;
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
    await waitFor(() => expect(screen.getByTestId('workspace-retry')).toBeTruthy());
    expect(screen.getByTestId('streaming-state').textContent).toBe('idle');

    fireEvent.click(screen.getByTestId('workspace-retry'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
  });

  it('preserves the failed attempt transcript when retry starts a replacement run', async () => {
    const userMessage: ChatMessage = {
      id: 'user-retry',
      role: 'user',
      content: 'make an editorial landing page',
      createdAt: 1,
    };
    const failedAssistant: ChatMessage = {
      id: 'assistant-failed',
      role: 'assistant',
      content: 'Partial plan before the crash',
      createdAt: 2,
      runStatus: 'failed',
      events: [{ kind: 'text', text: 'I will build the page' }],
      producedFiles: [
        {
          name: 'partial.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 2,
          size: 100,
        },
      ],
    };
    conversationAMessages = [userMessage, failedAssistant];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(async () => {});

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('workspace-retry')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-retry'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    const retryCall = streamViaDaemon.mock.calls[0]?.[0] as {
      assistantMessageId?: string;
      history?: ChatMessage[];
    };
    expect(retryCall.assistantMessageId).toBeTruthy();
    expect(retryCall.assistantMessageId).not.toBe('assistant-failed');
    expect(retryCall.history).toEqual([userMessage]);

    await waitFor(() => {
      const summary = screen.getByTestId('assistant-summary').textContent ?? '';
      expect(summary).toContain('assistant-failed|failed|Partial plan before the crash|partial.html');
      expect(summary).toContain(`${retryCall.assistantMessageId}|running|`);
    });
  });

  it('routes workspace authorize recovery through AMR mode switching for structured auth failures', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    const onModeChange = vi.fn();
    const onAgentChange = vi.fn();
    const onOpenAmrSettings = vi.fn();
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

    renderProjectView(
      {
        ...config,
        agentId: 'amr',
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
      { onModeChange, onAgentChange, onOpenAmrSettings },
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('workspace-authorize')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-authorize'));

    expect(onModeChange).toHaveBeenCalledWith('daemon');
    expect(onAgentChange).toHaveBeenCalledWith('amr');
    expect(onOpenAmrSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('streaming-state').textContent).toBe('idle');
  });

  it('auto-retries after AMR authorization succeeds', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    fetchVelaLoginStatus.mockResolvedValue({ loggedIn: true });
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        if (streamViaDaemon.mock.calls.length > 1) return;
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

    renderProjectView(
      {
        ...config,
        agentId: 'amr',
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
      { onOpenAmrSettings: vi.fn() },
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('workspace-authorize')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-authorize'));

    await waitFor(() => expect(fetchVelaLoginStatus).toHaveBeenCalled());
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
  });

  it('routes workspace retry and terminal launch recovery for antigravity auth failures', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        if (streamViaDaemon.mock.calls.length > 1) return;
        options.onRunCreated?.('run-antigravity-auth');
        const error = new Error('Sign in to Antigravity before retrying this run.') as Error & {
          code: string;
        };
        error.code = 'AGENT_AUTH_REQUIRED';
        options.handlers.onError(error);
      },
    );

    renderProjectView(
      {
        ...config,
        agentId: 'antigravity',
      },
      project,
      [
        {
          id: 'antigravity',
          name: 'Antigravity',
          bin: 'agy',
          available: true,
          models: [{ id: 'claude-4.6', label: 'Claude 4.6' }],
        },
      ],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('workspace-launch-terminal')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('workspace-retry')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-launch-terminal'));
    await waitFor(() => expect(launchAntigravityOauth).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('workspace-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
  });

  it('routes workspace retry and terminal launch recovery for antigravity rate limits', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        if (streamViaDaemon.mock.calls.length > 1) return;
        options.onRunCreated?.('run-antigravity-rate-limit');
        const error = new Error('Switch to another Antigravity model before retrying this run.') as Error & {
          code: string;
        };
        error.code = 'RATE_LIMITED';
        options.handlers.onError(error);
      },
    );

    renderProjectView(
      {
        ...config,
        agentId: 'antigravity',
      },
      project,
      [
        {
          id: 'antigravity',
          name: 'Antigravity',
          bin: 'agy',
          available: true,
          models: [{ id: 'claude-4.6', label: 'Claude 4.6' }],
        },
      ],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('workspace-launch-terminal')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('workspace-retry')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-launch-terminal'));
    await waitFor(() => expect(launchAntigravityOauth).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('workspace-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
  });

  it('does not promote switching to AMR for upstream outages', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    streamViaDaemon.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        handlers: { onError: (error: Error) => void };
      }) => {
        if (streamViaDaemon.mock.calls.length > 1) return;
        options.onRunCreated?.('run-upstream-unavailable');
        const error = new Error('The model provider is temporarily unavailable.') as Error & {
          code: string;
        };
        error.code = 'UPSTREAM_UNAVAILABLE';
        options.handlers.onError(error);
      },
    );

    renderProjectView(
      {
        ...config,
        agentId: 'claude',
      },
      project,
      [
        {
          id: 'claude',
          name: 'Claude',
          bin: 'claude',
          available: true,
          models: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
        },
      ],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('workspace-retry')).toBeTruthy());
    expect(screen.queryByTestId('workspace-switch-amr')).toBeNull();
    expect(screen.queryByTestId('workspace-authorize')).toBeNull();
    expect(screen.queryByTestId('workspace-launch-terminal')).toBeNull();
  });
});

function renderProjectView(
  renderConfig = config,
  renderProject: Project = project,
  renderAgents: AgentInfo[] = [
    { id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] },
    { id: 'byok-opencode', name: 'BYOK OpenCode', bin: 'opencode', available: true, models: [] },
  ],
  handlers: {
    onModeChange?: (mode: 'daemon' | 'api') => void;
    onAgentChange?: (agentId: string) => void;
    onOpenAmrSettings?: () => void;
  } = {},
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
      onModeChange={handlers.onModeChange ?? (() => {})}
      onAgentChange={handlers.onAgentChange ?? (() => {})}
      onAgentModelChange={() => {}}
      onRefreshAgents={() => {}}
      onOpenSettings={() => {}}
      onOpenAmrSettings={handlers.onOpenAmrSettings}
      onBack={() => {}}
      onClearPendingPrompt={() => {}}
      onTouchProject={() => {}}
      onProjectChange={() => {}}
      onProjectsRefresh={() => {}}
    />,
  );
}
