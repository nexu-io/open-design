// @vitest-environment jsdom

// OPEND-3205: switching a failed CLI/BYOK turn to Cloud stays in the project;
// the user, rather than a Settings continuation, sends the next task.

import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { buildWorkspacePermissions, type ChatRunStatusResponse, type WorkspaceCollabContext } from '@open-design/contracts';
import { forwardRef, useImperativeHandle, useState, type ComponentProps, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { SideChatTab, type ActiveConversationChatState } from '../../src/components/workspace/SideChatTab';
import { I18nProvider } from '../../src/i18n';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import type { RecoveryActionBlockReason } from '../../src/runtime/chat/recovery-gating';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { fetchChatRunStatus, fetchVelaLoginStatus, streamViaDaemon } from '../../src/providers/daemon';
import {
  createConversation,
  listConversations,
  listMessages,
  saveMessage,
} from '../../src/state/projects';
import type { AgentInfo, AppConfig, ChatCommentAttachment, ChatMessage, Conversation, Project } from '../../src/types';

const workspace = vi.hoisted(() => ({
  caller: null as WorkspaceCollabContext | null,
  scope: { loading: false, scope: null } as ProjectWorkspaceScopeState,
  sideConversationId: null as string | null,
  viewerOnly: false,
  sendBoardComments: null as null | ((comments: ChatCommentAttachment[]) => Promise<{ status: string; commentIds: string[] }>),
}));

vi.mock('../../src/router', () => ({ navigate: vi.fn() }));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/daemon')>()),
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
    syncState: null, viewerOnly: workspace.viewerOnly, writerAuthority: workspace.viewerOnly ? 'denied' : 'allowed',
    isOwner: true, ownerDisplayName: null, ownerRole: null, downloadPending: false,
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
  DESIGN_SYSTEM_TAB: '__design_system__',
  // Keep the editor outside this run-authority suite, but render the actual
  // side-chat host with the real ProjectView-owned recovery callback. The
  // FileWorkspace forwarding itself is covered separately at its boundary.
  FileWorkspace: (props: {
    projectId: string;
    chatConfig: AppConfig;
    chatAgentsById: Map<string, AgentInfo>;
    chatLocale: string;
    conversations: Conversation[];
    activeConversationId?: string | null;
    activeConversationChat?: ActiveConversationChatState;
    onSelectConversation: (id: string) => void;
    onDeleteConversation: (id: string) => void;
    onSwitchConversationToCloud?: (conversationId: string, message: ChatMessage) => void;
    chatRecoveryActionsBlockedReason?: RecoveryActionBlockReason | null;
    onSendBoardCommentAttachments?: (comments: ChatCommentAttachment[]) => Promise<{ status: string; commentIds: string[] }>;
  }) => {
    workspace.sendBoardComments = props.onSendBoardCommentAttachments ?? null;
    return workspace.sideConversationId ? (
    <div data-testid="side-chat-recovery-host" data-primary-conversation={props.activeConversationId}>
      <SideChatTab
        projectId={props.projectId} conversationId={workspace.sideConversationId}
        config={props.chatConfig} agentsById={props.chatAgentsById} locale={props.chatLocale}
        projectFiles={[]} conversations={props.conversations}
        activeConversationChat={props.activeConversationChat}
        onSelectConversation={props.onSelectConversation}
        onDeleteConversation={props.onDeleteConversation}
        recoveryActionsBlockedReason={props.chatRecoveryActionsBlockedReason}
        {...{ onSwitchConversationToCloud: props.onSwitchConversationToCloud }}
      />
    </div>
  ) : <div />;
  },
}));
// Keep the real ProjectView retry guard and ChatPane continuation effects.
// The editor and assistant Markdown are outside this authority-lifetime test.
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

function projectView(extra: Partial<ComponentProps<typeof ProjectView>> = {}) {
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
      {...extra}
    />
  );
}

function insufficientWallet() {
  return {
    kind: 'hard' as const, reason: 'insufficient' as const,
    snapshot: {
      status: 'available' as const, profile: 'prod', user: { plan: 'free' }, balanceUsd: '0',
      updatedAt: null, fetchedAt: '2026-09-16T00:00:00.000Z', stale: false, source: 'vela_api' as const,
    },
  };
}

describe('OPEND-3205 new send owns the current failure presentation', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    workspace.caller = OWNER;
    workspace.scope = readableScope();
    workspace.sideConversationId = null;
    workspace.viewerOnly = false;
    workspace.sendBoardComments = null;
    vi.mocked(listConversations).mockReset().mockResolvedValue([conversation]);
    vi.mocked(createConversation).mockReset().mockResolvedValue(conversation);
    vi.mocked(listMessages).mockReset().mockResolvedValue([history]);
    vi.mocked(streamViaDaemon).mockReset().mockResolvedValue(undefined);
    vi.mocked(checkAmrBalanceGate).mockReset().mockResolvedValue({ kind: 'allow' });
    vi.mocked(fetchVelaLoginStatus).mockReset().mockResolvedValue(null);
    vi.mocked(fetchChatRunStatus).mockReset().mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });


  it.each([
    ['main balance preflight', false, true],
    ['main new Cloud failure', false, false],
    ['inactive side new Cloud failure', true, false],
  ] as const)('%s keeps the old failed history but replaces its action card', async (_label, side, balanceBlocked) => {
    const target = side ? { ...conversation, id: 'side-current-failure', sessionMode: 'chat' as const } : conversation;
    const oldFailure: ChatMessage = {
      id: 'old-local-failure', role: 'assistant', content: 'Original local failed history', createdAt: 2,
      agentId: 'codex', runId: 'old-local-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Original local diagnostic' }],
    };
    const originalFailure = structuredClone(oldFailure);
    workspace.sideConversationId = side ? target.id : null;
    vi.mocked(listConversations).mockResolvedValue(side ? [conversation, target] : [conversation]);
    vi.mocked(listMessages).mockImplementation(async (_project, id) => id === target.id ? [history, oldFailure] : [history]);
    if (balanceBlocked) {
      vi.mocked(checkAmrBalanceGate).mockResolvedValue({
        kind: 'hard', reason: 'insufficient',
        snapshot: {
          status: 'available', profile: 'prod', user: { plan: 'free' }, balanceUsd: '0',
          updatedAt: null, fetchedAt: '2026-09-16T00:00:00.000Z', stale: false, source: 'vela_api',
        },
      });
    } else {
      vi.mocked(streamViaDaemon).mockImplementation(async (options) => {
        options.onRunCreated?.('new-cloud-failed-run');
        options.onRunStatus?.('failed');
        options.handlers.onError(Object.assign(new Error('New Cloud authorization failed'), { code: 'AMR_AUTH_REQUIRED' }));
      });
    }
    function Owner() {
      const [selectedConfig, setSelectedConfig] = useState<AppConfig>({ ...config, agentId: 'codex' });
      return <I18nProvider initial="zh-CN">{projectView({
        config: selectedConfig, routeConversationId: conversation.id,
        onSwitchToCloud: async () => setSelectedConfig((current) => ({ ...current, mode: 'daemon', agentId: 'amr' })),
      })}</I18nProvider>;
    }
    const view = render(<Owner />);
    const host = side ? await view.findByTestId('side-chat-recovery-host') : view.container;
    await within(host).findByText(oldFailure.content);
    const oldCard = within(host).getByTestId('chat-run-error-card');
    await act(async () => {
      fireEvent.click(within(oldCard).getByRole('button', { name: '切换到 OpenDesign Cloud' }));
    });
    expect(await view.findByText('已切换到 OpenDesign Cloud，请重新发送任务。')).toBeVisible();
    expect(streamViaDaemon).not.toHaveBeenCalled();
    fireEvent.click(within(host).getByTestId('composer-fixture-send'));
    if (balanceBlocked) {
      expect(await within(host).findByTestId('chat-upgrade-card')).toBeVisible();
      expect(checkAmrBalanceGate).toHaveBeenCalledOnce();
      expect(streamViaDaemon).not.toHaveBeenCalled();
      // Real regression: a rejected new Send restores the old transcript;
      // that must not reactivate the obsolete local recovery action card.
      expect(within(host).queryByTestId('chat-run-error-card')).toBeNull();
    } else {
      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledOnce());
      await waitFor(() => expect(within(host).getAllByTestId('chat-run-error-card')).toHaveLength(1));
      const currentCard = within(host).getByTestId('chat-run-error-card');
      expect(within(currentCard).getByRole('button', { name: '重试' })).toBeVisible();
      expect(within(currentCard).queryByRole('button', { name: '切换到 OpenDesign Cloud' })).toBeNull();
      expect(within(host).queryByTestId('chat-upgrade-card')).toBeNull();
    }
    expect(within(host).getByText(oldFailure.content)).toBeVisible();
    expect(oldFailure).toEqual(originalFailure);
    for (const call of vi.mocked(saveMessage).mock.calls) {
      const saved = call[2];
      if (saved.id === oldFailure.id) expect(saved).toEqual(originalFailure);
    }
  });
  it('keeps consumption across a same-tab remount but renders a genuinely new failed attempt', async () => {
    const oldFailure: ChatMessage = {
      id: 'persisted-old-failure', role: 'assistant', content: 'Persisted old history remains', createdAt: 2,
      agentId: 'codex', runId: 'original-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Old diagnostic' }],
    };
    const original = structuredClone(oldFailure);
    vi.mocked(listMessages).mockResolvedValue([history, oldFailure]);
    vi.mocked(checkAmrBalanceGate).mockResolvedValue(insufficientWallet());
    const host = () => <I18nProvider initial="zh-CN">{projectView({
      config, routeConversationId: conversation.id, onSwitchToCloud: vi.fn().mockResolvedValue(undefined),
    })}</I18nProvider>;
    const first = render(host());
    await first.findByText(oldFailure.content);
    expect(first.getByTestId('chat-run-error-card')).toBeVisible();
    fireEvent.click(first.getByTestId('composer-fixture-send'));
    expect(await first.findByTestId('chat-upgrade-card')).toBeVisible();
    expect(first.queryByTestId('chat-run-error-card')).toBeNull();
    first.unmount();

    // No seeding of the consumption store: remount reads the exact original
    // failed history after the preceding real preflight wrote presentation state.
    const restored = render(host());
    await restored.findByText(oldFailure.content);
    expect(restored.queryByTestId('chat-run-error-card')).toBeNull();
    // The pre-run quota cue has no durable run/message; do not claim it survives reload.
    vi.mocked(checkAmrBalanceGate).mockResolvedValue({ kind: 'allow' });
    vi.mocked(streamViaDaemon).mockImplementation(async (options) => {
      options.onRunCreated?.('new-run-after-remount');
      options.onRunStatus?.('failed');
      options.handlers.onError(Object.assign(new Error('New Cloud failure'), { code: 'AMR_AUTH_REQUIRED' }));
    });
    fireEvent.click(restored.getByTestId('composer-fixture-send'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledOnce());
    const current = await restored.findByTestId('chat-run-error-card');
    expect(within(current).getByRole('button', { name: '重试' })).toBeVisible();
    expect(within(current).queryByRole('button', { name: '切换到 OpenDesign Cloud' })).toBeNull();
    expect(restored.getByText(oldFailure.content)).toBeVisible();
    expect(oldFailure).toEqual(original);
    expect(vi.mocked(saveMessage).mock.calls.some(([, , message]) =>
      message.role === 'assistant' && message.id !== oldFailure.id && message.runStatus === 'failed')).toBe(true);
  });

  it('consumes the displayed strategy head and its failed physical tail without rewriting either history row', async () => {
    const head: ChatMessage = {
      id: 'strategy-plan-head', role: 'assistant', content: 'Planning history stays', createdAt: 2,
      agentId: 'codex', runId: 'planning-run', runStatus: 'succeeded',
      strategyTaskExecutionId: 'one-strategy-task', strategyTaskRunIndex: 0,
      strategyTaskBlocked: true, strategyTaskBlockedText: null,
    };
    const tail: ChatMessage = {
      id: 'strategy-failed-tail', role: 'assistant', content: 'Physical failure history stays', createdAt: 3,
      agentId: 'codex', runId: 'production-run', runStatus: 'failed',
      strategyTaskExecutionId: 'one-strategy-task', strategyTaskRunIndex: 1,
      strategyTaskBlocked: true, strategyTaskBlockedText: null,
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Physical tail diagnostic' }],
    };
    const original = structuredClone([head, tail]);
    // Real hydration probes a physically succeeded strategy predecessor even
    // before Send. Supply its terminal task projection and the persisted
    // sibling's exact physical status, rather than a missing-run response.
    // These history rows already carry the settled task stamp; recovery may
    // re-save identical rows, but neither hydration nor consumption may rewrite
    // the original physical status, content, events, or identity.
    vi.mocked(fetchChatRunStatus).mockImplementation(async (runId) => {
      const message = [head, tail].find((row) => row.runId === runId);
      if (!message?.runStatus) return null;
      return {
        id: runId, projectId: project.id, conversationId: conversation.id,
        assistantMessageId: message.id, agentId: message.agentId ?? null,
        status: message.runStatus,
        createdAt: message.id === head.id ? 2 : 3, updatedAt: message.id === head.id ? 2 : 3,
        strategyTask: {
          taskExecutionId: 'one-strategy-task',
          strategy: {
            id: 'od-next-strategy', version: '2.0.0',
            packageHash: 'b'.repeat(64), snapshotId: 'one-strategy-snapshot',
          },
          inputStage: 'production', outcome: 'blocked', route: 'full_plan',
          executionMode: 'simple', activeRunId: 'production-run', terminal: true,
        },
      } satisfies ChatRunStatusResponse;
    });
    vi.mocked(listMessages).mockResolvedValue([history, head, tail]);
    vi.mocked(checkAmrBalanceGate).mockResolvedValue(insufficientWallet());
    const host = () => <I18nProvider initial="zh-CN">{projectView({
      config, routeConversationId: conversation.id, onSwitchToCloud: vi.fn().mockResolvedValue(undefined),
    })}</I18nProvider>;
    const view = render(host());
    await view.findByText(/Planning history stays.*Physical failure history stays/s);
    expect(view.getAllByTestId('chat-run-error-card')).toHaveLength(1);
    // Wait for the actual initial hydration save before sending. This isolates
    // missing-run reconciliation from the subsequent balance-gate operation
    // without clearing its save history or relaxing the full-row assertion.
    await waitFor(() => expect(vi.mocked(saveMessage).mock.calls.some(([, , saved]) =>
      saved.id === head.id)).toBe(true));
    expect(checkAmrBalanceGate).not.toHaveBeenCalled();
    for (const [, , saved] of vi.mocked(saveMessage).mock.calls) {
      const source = original.find((message) => message.id === saved.id);
      if (source) expect(saved).toEqual(source);
    }
    fireEvent.click(view.getByTestId('composer-fixture-send'));
    expect(await view.findByTestId('chat-upgrade-card')).toBeVisible();
    expect(view.queryByTestId('chat-run-error-card')).toBeNull();
    expect(view.getByText(/Planning history stays.*Physical failure history stays/s)).toBeVisible();
    expect([head, tail]).toEqual(original);
    for (const [, , saved] of vi.mocked(saveMessage).mock.calls) {
      const source = original.find((message) => message.id === saved.id);
      if (source) expect(saved).toEqual(source);
    }
    view.unmount();
    const restored = render(host());
    await restored.findByText(/Planning history stays.*Physical failure history stays/s);
    expect(restored.queryByTestId('chat-run-error-card')).toBeNull();
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  it('does not consume another conversation failure when an old preflight finishes after navigation', async () => {
    const secondConversation: Conversation = { ...conversation, id: 'second-conversation' };
    const failure = (id: string): ChatMessage => ({
      id, role: 'assistant', content: `Failure history ${id}`, createdAt: 2,
      agentId: 'codex', runId: `run-${id}`, runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: `Diagnostic ${id}` }],
    });
    const firstFailure = failure('failed-A');
    const secondFailure = failure('failed-B');
    vi.mocked(listConversations).mockResolvedValue([conversation, secondConversation]);
    vi.mocked(listMessages).mockImplementation(async (_project, id) => [history, id === conversation.id ? firstFailure : secondFailure]);
    let release!: (gate: ReturnType<typeof insufficientWallet>) => void;
    const pending = new Promise<ReturnType<typeof insufficientWallet>>((resolve) => { release = resolve; });
    vi.mocked(checkAmrBalanceGate).mockReturnValue(pending);
    const host = (id: string) => <I18nProvider initial="zh-CN">{projectView({
      config, routeConversationId: id, onSwitchToCloud: vi.fn().mockResolvedValue(undefined),
    })}</I18nProvider>;
    const view = render(host(conversation.id));
    await view.findByText(firstFailure.content);
    try {
      fireEvent.click(view.getByTestId('composer-fixture-send'));
      await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalledOnce());
      view.rerender(host(secondConversation.id));
      await view.findByText(secondFailure.content);
      await act(async () => { release(insufficientWallet()); await pending; });
      const secondCard = view.getByTestId('chat-run-error-card');
      expect(within(secondCard).getByRole('button', { name: '切换到 OpenDesign Cloud' })).toBeVisible();
      expect(view.queryByTestId('chat-upgrade-card')).toBeNull();
      expect(view.getByText(secondFailure.content)).toBeVisible();
      expect(streamViaDaemon).not.toHaveBeenCalled();
    } finally {
      await act(async () => { release(insufficientWallet()); await pending; });
    }
  });

  it('does not consume a side conversation failure when a non-composer board task is queued in the primary conversation', async () => {
    const sideConversation: Conversation = { ...conversation, id: 'unrelated-side', sessionMode: 'chat' };
    const sideFailure: ChatMessage = {
      id: 'unrelated-side-failure', role: 'assistant', content: 'Unrelated side failure stays actionable', createdAt: 2,
      agentId: 'codex', runId: 'side-old-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Side diagnostic' }],
    };
    const original = structuredClone(sideFailure);
    workspace.sideConversationId = sideConversation.id;
    vi.mocked(listConversations).mockResolvedValue([conversation, sideConversation]);
    vi.mocked(listMessages).mockImplementation(async (_project, id) => id === sideConversation.id ? [history, sideFailure] : [history]);
    vi.mocked(checkAmrBalanceGate).mockResolvedValue(insufficientWallet());
    const view = render(<I18nProvider initial="zh-CN">{projectView({
      config, routeConversationId: conversation.id, onSwitchToCloud: vi.fn().mockResolvedValue(undefined),
    })}</I18nProvider>);
    const sideHost = await view.findByTestId('side-chat-recovery-host');
    await within(sideHost).findByText(sideFailure.content);
    await waitFor(() => expect(workspace.sendBoardComments).toBeTypeOf('function'));
    // FileWorkspace's actual board-comment callback is a non-composer public
    // entry: ProjectView sets queueOnly and entryFrom=comment itself. The test
    // does not forge composerOwnedDraft or call private handleSend directly.
    await act(async () => {
      const result = await workspace.sendBoardComments!([{
        id: 'primary-board-note', order: 1, filePath: 'index.html', elementId: 'heading',
        selector: 'h1', label: 'Heading', comment: 'Update this heading', currentText: 'Old heading',
        pagePosition: { x: 0, y: 0, width: 100, height: 24 }, htmlHint: '<h1>Old heading</h1>',
      }]);
      expect(result).toEqual({ status: 'queued', commentIds: ['primary-board-note'] });
    });
    await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalled());
    expect(await view.findByTestId('chat-upgrade-card')).toBeVisible();
    const sideCard = within(sideHost).getByTestId('chat-run-error-card');
    expect(within(sideCard).getByRole('button', { name: '切换到 OpenDesign Cloud' })).toBeVisible();
    expect(within(sideHost).queryByTestId('chat-upgrade-card')).toBeNull();
    expect(within(sideHost).getByText(sideFailure.content)).toBeVisible();
    expect(sideFailure).toEqual(original);
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

});
