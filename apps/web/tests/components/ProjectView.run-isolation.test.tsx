// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { AppConfig, ChatMessage, Conversation, Project } from '../../src/types';

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
  useT: () => (key: string) => key,
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: (...args: unknown[]) => streamMessage(...args),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
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
  }: {
    streaming: boolean;
    onSendBoardCommentAttachments: (attachments: unknown[]) => void;
  }) => (
    <>
      <output data-testid="workspace-streaming-state">{streaming ? 'streaming' : 'idle'}</output>
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
    onSelectConversation,
    onSend,
    onNewConversation,
    error,
  }: {
    activeConversationId: string | null;
    conversations: Conversation[];
    streaming: boolean;
    sendDisabled?: boolean;
    error: string | null;
    onSelectConversation: (id: string) => void;
    onSend: (prompt: string, attachments: unknown[], commentAttachments: unknown[]) => void;
    onNewConversation: () => void;
  }) => (
    <section>
      <output data-testid="active-conversation">{activeConversationId}</output>
      <output data-testid="streaming-state">{streaming ? 'streaming' : 'idle'}</output>
      <output data-testid="chat-error">{error}</output>
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
        data-testid="send-message"
        onClick={() => onSend('hello from b', [], [])}
        disabled={sendDisabled}
      >
        send
      </button>
      <button type="button" data-testid="new-conversation" onClick={onNewConversation}>
        new
      </button>
    </section>
  ),
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
});

function renderProjectView(renderConfig = config) {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      config={renderConfig}
      agents={[{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
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
