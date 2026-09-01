// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { QuestionForm } from '../../src/artifacts/question-form';
import type { ChatMessage } from '../../src/types';
import { ProjectConversationsHttpError } from '../../src/state/projects';

const analyticsMocks = vi.hoisted(() => ({
  newRequestId: vi.fn(() => 'fork-request-1'),
  track: vi.fn(),
}));

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
const deleteConversation = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveMessage = vi.fn();
const saveTabs = vi.fn();

// Capture the props ChatPane receives so the test can drive
// `onDeleteConversation` directly — ChatPane itself is mocked to a
// no-op renderer (the real component pulls in markdown + chat
// streaming machinery that isn't relevant to the projects-refresh
// regression we want to pin).
const chatPaneProps: {
  onDeleteConversation?: (id: string) => Promise<void> | void;
  onForkFromMessage?: (message: ChatMessage) => Promise<void> | void;
  onSubmitQuestionForm?: (
    text: string,
    attachments?: unknown[],
    context?: unknown,
    sourceAssistantMessageId?: string,
  ) => boolean | Promise<boolean>;
  questionFormSubmitDisabled?: boolean;
  activeConversationId?: string | null;
  conversations?: Array<{ id: string; title?: string | null }>;
  messages?: ChatMessage[];
} = {};

const fileWorkspaceProps: {
  questionForm?: QuestionForm | null;
} = {};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (value: string) => value,
  }),
  useT: () => ((value: string) => value),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    newRequestId: analyticsMocks.newRequestId,
    setConfigureGlobals: vi.fn(),
    setConsent: vi.fn(),
    setIdentity: vi.fn(),
    track: analyticsMocks.track,
  }),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
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
  ProjectConversationsHttpError: class ProjectConversationsHttpError extends Error {
    constructor(readonly status: number, message = `conversations ${status}`) {
      super(message);
    }
  },
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: (...args: unknown[]) => deleteConversation(...args),
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
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    onDeleteConversation?: (id: string) => Promise<void> | void;
    onForkFromMessage?: (message: ChatMessage) => Promise<void> | void;
    onSubmitQuestionForm?: (
      text: string,
      attachments?: unknown[],
      context?: unknown,
      sourceAssistantMessageId?: string,
    ) => boolean | Promise<boolean>;
    questionFormSubmitDisabled?: boolean;
    activeConversationId?: string | null;
    conversations?: Array<{ id: string; title?: string | null }>;
    messages?: ChatMessage[];
  }) => {
    chatPaneProps.onDeleteConversation = props.onDeleteConversation;
    chatPaneProps.onForkFromMessage = props.onForkFromMessage;
    chatPaneProps.onSubmitQuestionForm = props.onSubmitQuestionForm;
    chatPaneProps.questionFormSubmitDisabled = props.questionFormSubmitDisabled;
    chatPaneProps.activeConversationId = props.activeConversationId;
    chatPaneProps.conversations = props.conversations;
    chatPaneProps.messages = props.messages;
    return null;
  },
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: (props: {
    questionForm?: QuestionForm | null;
  }) => {
    fileWorkspaceProps.questionForm = props.questionForm;
    return null;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

function renderProjectView(onProjectsRefresh: () => void) {
  return render(
    <ProjectView
      project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
      routeFileName={null}
      config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
      agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
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
      onProjectsRefresh={onProjectsRefresh}
    />,
  );
}

describe('ProjectView conversation delete', () => {
  beforeEach(() => {
    listProjectRuns.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    analyticsMocks.newRequestId.mockReturnValue('fork-request-1');
    chatPaneProps.onDeleteConversation = undefined;
    chatPaneProps.onForkFromMessage = undefined;
    chatPaneProps.onSubmitQuestionForm = undefined;
    chatPaneProps.questionFormSubmitDisabled = undefined;
    chatPaneProps.activeConversationId = undefined;
    chatPaneProps.conversations = undefined;
    chatPaneProps.messages = undefined;
    fileWorkspaceProps.questionForm = undefined;
  });

  // Issue #1202: the home `Needs input` badge is rendered from the
  // cached `/api/projects` payload (App.tsx owns the `projects` state).
  // Deleting a conversation that owned an unanswered question-form
  // flips the daemon-side flag, but without calling onProjectsRefresh
  // here the home view keeps the stale flag until the next manual
  // reload. All the other state-changing branches in ProjectView
  // already call onProjectsRefresh (run end, live artifact events,
  // etc.) — this pins that the delete-conversation branch joins them.
  it('triggers onProjectsRefresh after deleting a conversation', async () => {
    listConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Conversation 1' },
      { id: 'conv-2', title: 'Conversation 2' },
    ]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);
    deleteConversation.mockResolvedValue(true);

    const onProjectsRefresh = vi.fn();

    renderProjectView(onProjectsRefresh);

    // ChatPane mount is async (ProjectView loads conversations in an
    // effect, then renders chat). Wait for the mocked ChatPane to
    // surface its `onDeleteConversation` prop.
    await waitFor(() => expect(chatPaneProps.onDeleteConversation).toBeDefined());

    await act(async () => {
      await chatPaneProps.onDeleteConversation!('conv-1');
    });

    expect(deleteConversation).toHaveBeenCalledWith('project-1', 'conv-1', null);
    expect(onProjectsRefresh).toHaveBeenCalledTimes(1);
  });

  // Defensive complement: if the daemon delete fails, we must not
  // pretend it succeeded — onProjectsRefresh would feed the home view
  // a "deleted" state that isn't actually true on disk, putting the
  // cache MORE out of sync than the bug we're fixing.
  it('does not trigger onProjectsRefresh when the delete request fails', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation 1' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);
    deleteConversation.mockResolvedValue(false);

    const onProjectsRefresh = vi.fn();

    renderProjectView(onProjectsRefresh);

    await waitFor(() => expect(chatPaneProps.onDeleteConversation).toBeDefined());

    await act(async () => {
      await chatPaneProps.onDeleteConversation!('conv-1');
    });

    expect(deleteConversation).toHaveBeenCalledWith('project-1', 'conv-1', null);
    expect(onProjectsRefresh).not.toHaveBeenCalled();
  });

  it('switches the active conversation to the next available history item after deleting the current one', async () => {
    listConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Conversation 1' },
      { id: 'conv-2', title: 'Conversation 2' },
    ]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);
    deleteConversation.mockResolvedValue(true);

    renderProjectView(vi.fn());

    await waitFor(() => expect(chatPaneProps.onDeleteConversation).toBeDefined());
    await waitFor(() => expect(chatPaneProps.activeConversationId).toBe('conv-1'));

    await act(async () => {
      await chatPaneProps.onDeleteConversation!('conv-1');
    });

    await waitFor(() => expect(chatPaneProps.activeConversationId).toBe('conv-2'));
    expect(chatPaneProps.conversations?.map((conversation) => conversation.id)).toEqual(['conv-2']);
  });

  it('re-seeds a fresh conversation when deleting the last remaining history item', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation 1' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);
    deleteConversation.mockResolvedValue(true);
    createConversation.mockResolvedValue({ id: 'conv-fresh', title: 'Fresh conversation' });

    renderProjectView(vi.fn());

    await waitFor(() => expect(chatPaneProps.onDeleteConversation).toBeDefined());
    await waitFor(() => expect(chatPaneProps.activeConversationId).toBe('conv-1'));

    await act(async () => {
      await chatPaneProps.onDeleteConversation!('conv-1');
    });

    await waitFor(() =>
      expect(createConversation).toHaveBeenCalledWith(
        'project-1',
        undefined,
        { workspaceContext: null },
      ),
    );
    await waitFor(() => expect(chatPaneProps.activeConversationId).toBe('conv-fresh'));
    expect(chatPaneProps.conversations?.map((conversation) => conversation.id)).toEqual(['conv-fresh']);
  });

  it('keeps the latest unanswered question form in chat instead of the workspace panel', async () => {
    const form: QuestionForm = {
      id: 'task-type',
      title: 'Choose the task type',
      questions: [
        {
          id: 'taskType',
          label: 'What should we make?',
          type: 'radio',
          required: true,
          options: [
            { label: 'Prototype', value: 'prototype' },
            { label: 'Image', value: 'image' },
          ],
        },
      ],
    };
    const assistantMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: [
        '<question-form id="task-type" title="Choose the task type">',
        JSON.stringify({ questions: form.questions }),
        '</question-form>',
      ].join('\n'),
      runStatus: 'succeeded',
      events: [],
      producedFiles: [],
    };

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation 1' }]);
    listMessages.mockResolvedValue([assistantMessage]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);

    renderProjectView(vi.fn());

    await waitFor(() => expect(chatPaneProps.onSubmitQuestionForm).toBeDefined());
    await waitFor(() => expect(chatPaneProps.questionFormSubmitDisabled).toBe(false));
    expect(fileWorkspaceProps.questionForm).toBeUndefined();
  });

  it('passes the daemon-issued task handle when answering its inline question form', async () => {
    const assistantMessage: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: '<question-form id="task-type">{"questions":[]}</question-form>',
      runId: 'run-request',
      runStatus: 'succeeded',
      strategyTaskExecutionId: 'task-strategy-1',
      taskAnalytics: {
        taskExecutionId: 'analytics-task-1',
        taskRunIndex: 0,
      },
    };
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation 1' }]);
    listMessages.mockResolvedValue([assistantMessage]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);
    streamViaDaemon.mockResolvedValue(undefined);

    renderProjectView(vi.fn());
    await waitFor(() => expect(chatPaneProps.onSubmitQuestionForm).toBeDefined());
    // The handler refuses (returns false) while the conversation is still
    // settling, so gate on it actually being submittable — not just defined.
    await waitFor(() => expect(chatPaneProps.questionFormSubmitDisabled).toBe(false));

    await act(async () => {
      await expect(chatPaneProps.onSubmitQuestionForm!(
        'Prototype',
        [],
        undefined,
        'assistant-1',
      )).resolves.toBe(true);
    });

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon.mock.calls[0]?.[0]).toMatchObject({
      taskExecutionId: 'task-strategy-1',
    });
  });
});

describe('ProjectView conversation fork analytics', () => {
  const sourceMessages: ChatMessage[] = [
    { id: 'user-1', role: 'user', content: 'First request' },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'First response',
      agentId: 'claude',
      runId: 'run-1',
      runStatus: 'succeeded',
    },
    { id: 'user-2', role: 'user', content: 'Second request' },
    {
      id: 'assistant-2',
      role: 'assistant',
      content: 'Second response',
      agentId: 'claude',
      runId: 'run-2',
      runStatus: 'succeeded',
    },
  ];

  beforeEach(() => {
    analyticsMocks.newRequestId.mockReturnValue('fork-request-1');
    analyticsMocks.track.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    chatPaneProps.onForkFromMessage = undefined;
    chatPaneProps.messages = undefined;
  });

  function prepareForkHarness() {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation 1' }]);
    listMessages.mockResolvedValue(sourceMessages);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    listProjectRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);
  }

  it('tracks the fork click and successful result with one request id', async () => {
    prepareForkHarness();
    createConversation.mockResolvedValue({ id: 'conv-fork', title: 'Conversation 1 fork' });

    renderProjectView(vi.fn());

    await waitFor(() => expect(chatPaneProps.messages).toEqual(sourceMessages));
    await act(async () => {
      await chatPaneProps.onForkFromMessage?.(sourceMessages[1]!);
    });

    expect(analyticsMocks.newRequestId).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({
        page_name: 'chat_panel',
        area: 'chat_panel',
        element: 'assistant_fork_button',
        action: 'fork_conversation',
        project_id: 'project-1',
        conversation_id: 'conv-1',
        assistant_message_id: 'assistant-1',
        source_run_id: 'run-1',
        source_agent_id: 'claude',
        agent_provider_id: 'claude_code',
        fork_point: 'historical',
        seed_message_count: 2,
        conversation_message_count: 4,
        messages_after_fork_count: 2,
        session_mode: 'design',
      }),
      { requestId: 'fork-request-1' },
    );
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'conversation_fork_result',
      expect.objectContaining({
        result: 'success',
        target_conversation_id: 'conv-fork',
        duration_ms: expect.any(Number),
      }),
      { requestId: 'fork-request-1' },
    );
  });

  it('tracks a failed fork result without reporting success', async () => {
    prepareForkHarness();
    createConversation.mockRejectedValue(new TypeError('Failed to fetch'));

    renderProjectView(vi.fn());

    await waitFor(() => expect(chatPaneProps.messages).toEqual(sourceMessages));
    await act(async () => {
      await chatPaneProps.onForkFromMessage?.(sourceMessages[3]!);
    });

    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'conversation_fork_result',
      expect.objectContaining({
        fork_point: 'latest',
        seed_message_count: 4,
        messages_after_fork_count: 0,
        result: 'failed',
        target_conversation_id: null,
        error_code: 'network_error',
        duration_ms: expect.any(Number),
      }),
      { requestId: 'fork-request-1' },
    );
    expect(
      analyticsMocks.track.mock.calls.filter(([event]) => event === 'conversation_fork_result'),
    ).toHaveLength(1);
  });

  it('classifies daemon body-limit failures for rollout monitoring', async () => {
    prepareForkHarness();
    createConversation.mockRejectedValue(
      new ProjectConversationsHttpError(413, 'request body too large'),
    );

    renderProjectView(vi.fn());

    await waitFor(() => expect(chatPaneProps.messages).toEqual(sourceMessages));
    await act(async () => {
      await chatPaneProps.onForkFromMessage?.(sourceMessages[3]!);
    });

    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'conversation_fork_result',
      expect.objectContaining({
        result: 'failed',
        error_code: 'payload_too_large',
      }),
      { requestId: 'fork-request-1' },
    );
  });
});
