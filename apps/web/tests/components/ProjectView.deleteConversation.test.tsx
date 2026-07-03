// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { QuestionFormOpenRequest } from '../../src/components/AssistantMessage';
import type { QuestionForm } from '../../src/artifacts/question-form';

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
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  activeConversationId?: string | null;
  conversations?: Array<{ id: string; title?: string | null }>;
} = {};

const fileWorkspaceProps: {
  questionFormInteractive?: boolean;
  questionFormSubmittedAnswers?: Record<string, string | string[]>;
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

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: vi.fn(),
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
    onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
    activeConversationId?: string | null;
    conversations?: Array<{ id: string; title?: string | null }>;
  }) => {
    chatPaneProps.onDeleteConversation = props.onDeleteConversation;
    chatPaneProps.onOpenQuestions = props.onOpenQuestions;
    chatPaneProps.activeConversationId = props.activeConversationId;
    chatPaneProps.conversations = props.conversations;
    return null;
  },
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: (props: {
    questionFormInteractive?: boolean;
    questionFormSubmittedAnswers?: Record<string, string | string[]>;
  }) => {
    fileWorkspaceProps.questionFormInteractive = props.questionFormInteractive;
    fileWorkspaceProps.questionFormSubmittedAnswers = props.questionFormSubmittedAnswers;
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
    chatPaneProps.onDeleteConversation = undefined;
    chatPaneProps.onOpenQuestions = undefined;
    chatPaneProps.activeConversationId = undefined;
    chatPaneProps.conversations = undefined;
    fileWorkspaceProps.questionFormInteractive = undefined;
    fileWorkspaceProps.questionFormSubmittedAnswers = undefined;
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

    expect(deleteConversation).toHaveBeenCalledWith('project-1', 'conv-1');
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

    expect(deleteConversation).toHaveBeenCalledWith('project-1', 'conv-1');
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

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith('project-1'));
    await waitFor(() => expect(chatPaneProps.activeConversationId).toBe('conv-fresh'));
    expect(chatPaneProps.conversations?.map((conversation) => conversation.id)).toEqual(['conv-fresh']);
  });

  it('keeps the latest unanswered question form editable after opening it from the chat banner', async () => {
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

    await waitFor(() => expect(fileWorkspaceProps.questionFormInteractive).toBe(true));
    expect(fileWorkspaceProps.questionFormSubmittedAnswers).toBeUndefined();
    await waitFor(() => expect(chatPaneProps.onOpenQuestions).toBeDefined());

    act(() => {
      chatPaneProps.onOpenQuestions?.({
        form: {
          id: form.id,
          title: form.title,
          questions: [...form.questions],
        },
        messageId: assistantMessage.id,
      });
    });

    expect(fileWorkspaceProps.questionFormSubmittedAnswers).toBeUndefined();
    expect(fileWorkspaceProps.questionFormInteractive).toBe(true);
  });
});
