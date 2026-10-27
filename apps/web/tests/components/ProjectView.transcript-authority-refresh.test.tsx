// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { buildWorkspacePermissions, type WorkspaceCollabContext } from '@open-design/contracts';
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { streamViaDaemon } from '../../src/providers/daemon';
import {
  createConversation,
  listConversations,
  listMessages,
  ProjectConversationsHttpError,
  ProjectMessageListError,
} from '../../src/state/projects';
import type { AgentInfo, AppConfig, ChatMessage, Conversation, Project } from '../../src/types';

const workspace = vi.hoisted(() => ({
  caller: null as WorkspaceCollabContext | null,
  scope: { loading: false, scope: null } as ProjectWorkspaceScopeState,
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));
vi.mock('../../src/router', () => ({ navigate: vi.fn() }));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  fetchVelaLoginStatus: vi.fn().mockResolvedValue(null),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));
vi.mock('../../src/providers/project-events', () => ({ useProjectFileEvents: vi.fn() }));
vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>()),
  checkAmrBalanceGate: vi.fn().mockResolvedValue({ kind: 'allow' }),
}));
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({ context: workspace.caller, loading: false }),
}));
vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspace.scope,
}));
vi.mock('../../src/collab/useProjectCollab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectCollab')>()),
  useProjectCollab: () => ({
    enabled: true, member: null, present: [], publishedVersion: null,
    // Until initial scope/ownership confirmation, the real collab hook is
    // read-only. Otherwise a restored queue legitimately drains immediately
    // after the first history read, before this fixture can change scope.
    syncState: null, viewerOnly: workspace.scope.loading,
    writerAuthority: workspace.scope.loading ? 'pending' : 'allowed',
    isOwner: !workspace.scope.loading, ownerDisplayName: null, ownerRole: null, downloadPending: false,
    reportChange: () => undefined, requestPublish: () => undefined,
    refreshPresence: () => undefined, checkStatusNow: () => undefined,
  }),
}));
vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/registry')>()),
  deletePreviewComment: vi.fn(), fetchDesignSystem: vi.fn(), fetchSkill: vi.fn(),
  fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
  fetchPreviewComments: vi.fn().mockResolvedValue([]),
  fetchProjectFiles: vi.fn().mockResolvedValue([]),
  getTemplate: vi.fn(), patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(), writeProjectTextFile: vi.fn(),
}));
vi.mock('../../src/runtime/brands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/brands')>()),
  fetchBrands: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/projects')>()),
  createConversation: vi.fn(), listConversations: vi.fn(), listMessages: vi.fn(),
  loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
  patchConversation: vi.fn(), patchProject: vi.fn(),
  persistTabsToDaemonNow: vi.fn(), saveMessage: vi.fn(), saveTabs: vi.fn(),
}));
vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__', FileWorkspace: () => <div />,
}));
// Keep ProjectView, ChatPane, its loading UI and message rows real. The editor's
// Lexical lifecycle and assistant Markdown are outside this read-lifetime test.
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((props: {
    sendDisabled?: boolean;
    onSend?: (prompt: string, attachments: [], comments: []) => unknown;
  }, ref) => {
    useImperativeHandle(ref, () => ({
      focus: () => undefined, restoreDraft: () => undefined, setDraft: () => undefined,
    }));
    return (
      <button
        type="button"
        data-testid="composer-fixture-send"
        disabled={props.sendDisabled}
        onClick={() => { void props.onSend?.('Follow-up prompt', [], []); }}
      >
        Send fixture prompt
      </button>
    );
  }),
}));
vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => <div>{message.content}</div>,
}));

const OWNER = {
  workspaceId: 'transcript-workspace', workspaceType: 'team',
  workspaceMemberId: 'transcript-member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active',
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
} as WorkspaceCollabContext;
const MEMBER = {
  ...OWNER, role: 'member',
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
} as WorkspaceCollabContext;
const project: Project = {
  id: 'transcript-authority-project', name: 'Transcript authority fixture',
  workspaceId: OWNER.workspaceId, skillId: null, designSystemId: null,
  createdAt: 1, updatedAt: 1, metadata: { kind: 'prototype' },
};
const conversation: Conversation = {
  id: 'transcript-conversation', projectId: project.id,
  title: null, createdAt: 1, updatedAt: 1,
};
const history: ChatMessage = {
  id: 'persisted-message', role: 'user', content: 'Existing private conversation', createdAt: 1,
};
const config: AppConfig = {
  mode: 'daemon', apiKey: '', baseUrl: '', model: 'deepseek-v4-flash', agentId: 'amr',
  skillId: null, designSystemId: null,
};

function readableScope(context = MEMBER): ProjectWorkspaceScopeState {
  return {
    loading: false,
    scope: {
      kind: 'team', projectId: project.id, workspaceId: OWNER.workspaceId,
      visibility: 'team', context: context as WorkspaceCollabContext & { workspaceType: 'team' },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function projectView() {
  return (
    <ProjectView
      project={project} routeFileName={null} config={config}
      agents={[{
        id: 'amr', name: 'amr', available: true,
        models: [{ id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', default: true }],
      }] as unknown as AgentInfo[]}
      skills={[]} designTemplates={[]} designSystems={[]} daemonLive
      onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()} onOpenSettings={vi.fn()} onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()} onTouchProject={vi.fn()}
      onProjectChange={vi.fn()} onProjectsRefresh={vi.fn()}
    />
  );
}

describe('ProjectView transcript visibility across authority confirmation', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    workspace.caller = OWNER;
    workspace.scope = readableScope();
    vi.mocked(listConversations).mockReset().mockResolvedValue([conversation]);
    vi.mocked(createConversation).mockReset().mockResolvedValue(conversation);
    vi.mocked(listMessages).mockReset().mockResolvedValue([history]);
    vi.mocked(streamViaDaemon).mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps an existing loading UI through the conversation-list and transcript reads', async () => {
    const conversations = deferred<Conversation[]>();
    const messages = deferred<ChatMessage[]>();
    vi.mocked(listConversations).mockReturnValue(conversations.promise);
    vi.mocked(listMessages).mockReturnValue(messages.promise);
    const view = render(projectView());

    // Before a conversation is selected, ProjectView already owns a loader.
    expect(view.getByTestId('chat-pane-loading').querySelector('[role="status"]')).not.toBeNull();
    expect(view.container.querySelector('.chat-empty-wrap')).toBeNull();
    expect(listMessages).not.toHaveBeenCalled();
    await act(async () => { conversations.resolve([conversation]); });
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1));
    expect(view.container.querySelector('.chat-loading-state')).not.toBeNull();
    expect(view.container.querySelector('.chat-empty-wrap')).toBeNull();

    await act(async () => { messages.resolve([history]); });
    expect(view.getByText(history.content)).toBeTruthy();
    expect(view.container.querySelector('.chat-loading-state')).toBeNull();
  });

  it('shows an actual empty conversation once its authoritative reads settle', async () => {
    const messages = deferred<ChatMessage[]>();
    vi.mocked(listConversations).mockResolvedValue([]);
    vi.mocked(listMessages).mockReturnValue(messages.promise);
    const view = render(projectView());
    await waitFor(() => expect(createConversation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1));
    await act(async () => { messages.resolve([]); });
    expect(view.queryByTestId('chat-pane-loading')).toBeNull();
    expect(view.container.querySelector('.chat-loading-state')).toBeNull();
    expect(view.container.querySelector('.chat-empty-wrap')).not.toBeNull();
  });

  it('exits the initial loading UI when the conversation read is refused', async () => {
    const conversations = deferred<Conversation[]>();
    vi.mocked(listConversations).mockReturnValue(conversations.promise);
    const view = render(projectView());
    await act(async () => {
      conversations.reject(new ProjectConversationsHttpError(403, 'workspace access forbidden'));
    });
    await waitFor(() => expect(view.queryByTestId('chat-pane-loading')).toBeNull());
    expect(view.getByTestId('chat-log')).toBeTruthy();
    expect(view.container.querySelector('.chat-loading-state')).toBeNull();
    expect(listMessages).not.toHaveBeenCalled();
  });

  it('keeps already-visible history while the same readable principal confirms its restricted scope', async () => {
    // The real runWorkspaceIdentity borrows the exact owner while the first
    // scope read is pending, then takes the daemon's readable member scope.
    workspace.scope = { loading: true, scope: null };
    const refresh = deferred<ChatMessage[]>();
    vi.mocked(listMessages).mockResolvedValueOnce([history]).mockReturnValueOnce(refresh.promise);
    const view = render(projectView());
    await waitFor(() => expect(view.getByText(history.content)).toBeTruthy());
    expect(listMessages).toHaveBeenNthCalledWith(1, project.id, conversation.id, OWNER, expect.any(AbortSignal));
    expect(vi.mocked(listMessages).mock.calls[0]?.[3]?.aborted).toBe(false);

    workspace.scope = readableScope();
    await act(async () => { view.rerender(projectView()); });
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
    expect(listMessages).toHaveBeenNthCalledWith(2, project.id, conversation.id, MEMBER, expect.any(AbortSignal));
    expect(vi.mocked(listMessages).mock.calls[1]?.[3]?.aborted).toBe(false);
    try {
      expect(view.queryByText(history.content)).not.toBeNull();
      expect(view.container.querySelector('.chat-loading-state')).toBeNull();
    } finally {
      // Settle the controlled read even when the expected red assertion fails.
      await act(async () => { refresh.resolve([history]); });
    }
    expect(view.getAllByText(history.content)).toHaveLength(1);
  });

  it.each(['different member', 'access refused', 'inactive member', 'deleted workspace'] as const)(
    'hides the old transcript when authority changes: %s',
    async (change) => {
      const refresh = deferred<ChatMessage[]>();
      vi.mocked(listMessages).mockResolvedValueOnce([history]).mockReturnValueOnce(refresh.promise);
      const view = render(projectView());
      await waitFor(() => expect(view.getByText(history.content)).toBeTruthy());

      if (change === 'different member') {
        workspace.caller = { ...MEMBER, workspaceMemberId: 'another-member' };
        workspace.scope = readableScope(workspace.caller);
      } else if (change === 'access refused') {
        workspace.scope = { loading: false, scope: null, failure: 'forbidden' };
      } else {
        const context: WorkspaceCollabContext = change === 'inactive member'
          ? { ...MEMBER, memberStatus: 'removed' }
          : { ...MEMBER, lifecycleState: 'deleted' };
        workspace.scope = readableScope({
          ...context,
          permissions: buildWorkspacePermissions(context),
        });
      }
      await act(async () => { view.rerender(projectView()); });
      expect(view.queryByText(history.content)).toBeNull();

      await act(async () => { refresh.resolve([]); });
      expect(view.queryByText(history.content)).toBeNull();
    },
  );

  it('keeps sends blocked until the background transcript read settles', async () => {
    workspace.scope = { loading: true, scope: null };
    const refresh = deferred<ChatMessage[]>();
    vi.mocked(listMessages).mockResolvedValueOnce([history]).mockReturnValueOnce(refresh.promise);
    const view = render(projectView());
    await waitFor(() => expect(view.getByText(history.content)).toBeTruthy());
    workspace.scope = readableScope();
    await act(async () => { view.rerender(projectView()); });
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
    const send = view.getByTestId('composer-fixture-send');
    try {
      expect(send).toBeDisabled();
      fireEvent.click(send);
      expect(streamViaDaemon).not.toHaveBeenCalled();
    } finally {
      await act(async () => { refresh.resolve([history]); });
    }
    await waitFor(() => expect(send).not.toBeDisabled());
    fireEvent.click(send);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
  });

  it('clears retained history if the background transcript read refuses access', async () => {
    workspace.scope = { loading: true, scope: null };
    const refresh = deferred<ChatMessage[]>();
    vi.mocked(listMessages).mockResolvedValueOnce([history]).mockReturnValueOnce(refresh.promise);
    const view = render(projectView());
    await waitFor(() => expect(view.getByText(history.content)).toBeTruthy());
    workspace.scope = readableScope();
    await act(async () => { view.rerender(projectView()); });
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
    try {
      expect(view.queryByText(history.content)).not.toBeNull();
    } finally {
      await act(async () => {
        refresh.reject(new ProjectMessageListError('workspace access forbidden', 403, null, false));
      });
    }
    expect(view.queryByText(history.content)).toBeNull();
    expect(view.getByTestId('composer-fixture-send')).toBeDisabled();
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  it.each(['success', 'refused'] as const)(
    'does not drain a persisted queue before the same-principal authority read settles: %s',
    async (outcome) => {
      workspace.scope = { loading: true, scope: null };
      const refresh = deferred<ChatMessage[]>();
      const refreshedHistory: ChatMessage = {
        id: 'new-authoritative-message', role: 'user',
        content: 'History visible only after the confirmed scope read', createdAt: 2,
      };
      const queuedPrompt = 'Previously queued follow-up';
      const storageKey = `od:chat-queued-sends:${project.id}:v1`;
      const queued = {
        id: 'authority-queued-request', conversationId: conversation.id,
        prompt: queuedPrompt, attachments: [], commentAttachments: [],
        meta: { clientRequestId: 'authority-queued-request' }, createdAt: 3,
      };
      window.localStorage.setItem(storageKey, JSON.stringify([queued]));
      vi.mocked(listMessages).mockResolvedValueOnce([history]).mockReturnValueOnce(refresh.promise);
      const view = render(projectView());
      await waitFor(() => expect(view.getByText(history.content)).toBeTruthy());
      expect(view.getByTestId('chat-queued-send-strip')).toHaveTextContent(queuedPrompt);
      expect(streamViaDaemon).not.toHaveBeenCalled();

      workspace.scope = readableScope();
      try {
        // Real React effects run here: the scope read starts and the queue
        // drain gets the same commit. No timer or effect-order mock intervenes.
        await act(async () => { view.rerender(projectView()); });
        expect(listMessages).toHaveBeenNthCalledWith(2, project.id, conversation.id, MEMBER, expect.any(AbortSignal));
        expect(vi.mocked(listMessages).mock.calls[1]?.[3]?.aborted).toBe(false);
        expect(streamViaDaemon).not.toHaveBeenCalled();
        expect(view.getByText(history.content)).toBeTruthy();
        expect(view.getByTestId('chat-queued-send-strip')).toHaveTextContent(queuedPrompt);
        expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')).toEqual([queued]);

        if (outcome === 'refused') {
          await act(async () => {
            refresh.reject(new ProjectMessageListError('workspace access forbidden', 403, null, false));
          });
          expect(view.queryByText(history.content)).toBeNull();
          expect(streamViaDaemon).not.toHaveBeenCalled();
          expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')).toEqual([queued]);
          return;
        }

        await act(async () => { refresh.resolve([history, refreshedHistory]); });
        await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
        expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
          clientRequestId: queued.meta.clientRequestId,
          conversationId: conversation.id,
          workspaceContext: MEMBER,
          history: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: refreshedHistory.content }),
            expect.objectContaining({ role: 'user', content: queuedPrompt }),
          ]),
        }));
        await waitFor(() => expect(view.queryByTestId('chat-queued-send-strip')).toBeNull());
        await act(async () => { view.rerender(projectView()); });
        expect(streamViaDaemon).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(storageKey)).toBeNull();
      } finally {
        view.unmount();
        refresh.resolve([history, refreshedHistory]);
      }
    },
  );

  it('does not drain a persisted queue while a different principal transcript is pending', async () => {
    workspace.scope = { loading: true, scope: null };
    const refresh = deferred<ChatMessage[]>();
    window.localStorage.setItem(`od:chat-queued-sends:${project.id}:v1`, JSON.stringify([{
      id: 'other-principal-queued-request', conversationId: conversation.id,
      prompt: 'Queued before changing member', attachments: [], commentAttachments: [], createdAt: 3,
    }]));
    vi.mocked(listMessages).mockResolvedValueOnce([history]).mockReturnValueOnce(refresh.promise);
    const view = render(projectView());
    await waitFor(() => expect(view.getByText(history.content)).toBeTruthy());
    expect(view.getByTestId('chat-queued-send-strip')).toHaveTextContent('Queued before changing member');
    expect(streamViaDaemon).not.toHaveBeenCalled();

    const differentMember = { ...MEMBER, workspaceMemberId: 'new-confirmed-member' };
    workspace.caller = differentMember;
    workspace.scope = readableScope(differentMember);
    try {
      await act(async () => { view.rerender(projectView()); });
      expect(listMessages).toHaveBeenNthCalledWith(2, project.id, conversation.id, differentMember, expect.any(AbortSignal));
      expect(vi.mocked(listMessages).mock.calls[1]?.[3]?.aborted).toBe(false);
      expect(view.queryByText(history.content)).toBeNull();
      expect(streamViaDaemon).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      refresh.resolve([]);
    }
  });
});
