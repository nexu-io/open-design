// @vitest-environment jsdom

// OPEND-3205: switching a failed CLI/BYOK turn to Cloud stays in the project;
// the user, rather than a Settings continuation, sends the next task.

import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { buildWorkspacePermissions, type WorkspaceCollabContext } from '@open-design/contracts';
import { forwardRef, useImperativeHandle, useState, type ComponentProps, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { SideChatTab, type ActiveConversationChatState } from '../../src/components/workspace/SideChatTab';
import { I18nProvider } from '../../src/i18n';
import type { RecoveryActionBlockReason } from '../../src/runtime/chat/recovery-gating';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { fetchVelaLoginStatus, streamViaDaemon } from '../../src/providers/daemon';
import {
  createConversation,
  listConversations,
  listMessages,
} from '../../src/state/projects';
import type { AgentInfo, AppConfig, ChatMessage, Conversation, Project } from '../../src/types';

const workspace = vi.hoisted(() => ({
  caller: null as WorkspaceCollabContext | null,
  scope: { loading: false, scope: null } as ProjectWorkspaceScopeState,
  sideConversationId: null as string | null,
  viewerOnly: false,
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
  }) => workspace.sideConversationId ? (
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
  ) : <div />,
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

describe('ProjectView OPEND-3205 in-project Cloud switch', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    workspace.caller = OWNER;
    workspace.scope = readableScope();
    workspace.sideConversationId = null;
    workspace.viewerOnly = false;
    vi.mocked(listConversations).mockReset().mockResolvedValue([conversation]);
    vi.mocked(createConversation).mockReset().mockResolvedValue(conversation);
    vi.mocked(listMessages).mockReset().mockResolvedValue([history]);
    vi.mocked(streamViaDaemon).mockReset().mockResolvedValue(undefined);
    vi.mocked(fetchVelaLoginStatus).mockReset().mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    ['main CLI', false, 'daemon'],
    ['main BYOK', false, 'api'],
    ['inactive side CLI', true, 'daemon'],
  ] as const)('%s switches in place without arming or sending an automatic retry', async (_label, side, mode) => {
    const targetConversation: Conversation = side
      ? { ...conversation, id: 'inactive-side-conversation', sessionMode: 'chat' }
      : conversation;
    const prompt: ChatMessage = {
      id: 'original-user', role: 'user', content: 'Original failed request', createdAt: 1,
    };
    const failure: ChatMessage = {
      id: 'failed-local-turn', role: 'assistant', content: 'Retained local failure', createdAt: 2,
      agentId: 'codex', runId: 'original-local-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Controlled local failure' }],
    };
    const transcript = [prompt, failure];
    const original = structuredClone(transcript);
    workspace.sideConversationId = side ? targetConversation.id : null;
    vi.mocked(listConversations).mockResolvedValue(side ? [conversation, targetConversation] : [conversation]);
    vi.mocked(listMessages).mockImplementation(async (_projectId, conversationId) =>
      conversationId === targetConversation.id ? transcript : [history]);
    const openSettings = vi.fn();
    const arm = vi.fn();
    const changeMode = vi.fn();
    const changeAgent = vi.fn();
    function InProjectConfigurationOwner() {
      const [currentConfig, setCurrentConfig] = useState<AppConfig>({ ...config, mode, agentId: 'codex' });
      return <I18nProvider initial="zh-CN">
        <output data-testid="selected-runtime">{currentConfig.mode}:{currentConfig.agentId}</output>
        {projectView({
          routeConversationId: conversation.id, config: currentConfig,
          onOpenAmrSettings: openSettings, onArmAmrAuthRetryContinuation: arm,
          onSwitchToCloud: async () => {
            setCurrentConfig((current) => ({ ...current, mode: 'daemon', agentId: 'amr' }));
          },
          onModeChange: (next) => {
            changeMode(next);
            setCurrentConfig((current) => ({ ...current, mode: next }));
          },
          onAgentChange: (next) => {
            changeAgent(next);
            setCurrentConfig((current) => ({ ...current, agentId: next }));
          },
        })}
      </I18nProvider>;
    }
    const view = render(<InProjectConfigurationOwner />);
    const host = side ? await view.findByTestId('side-chat-recovery-host') : view.container;
    await within(host).findByText(failure.content);
    const card = within(host).getByTestId('chat-run-error-card');
    const switchButton = within(card).getByRole('button', { name: '切换到 OpenDesign Cloud' });
    expect(switchButton).not.toBeDisabled();
    await act(async () => { fireEvent.click(switchButton); });

    // This rejects the previous Settings handoff at the real ProjectView host.
    expect(openSettings).not.toHaveBeenCalled();
    expect(arm).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByTestId('selected-runtime')).toHaveTextContent('daemon:amr'));
    // Literal approved by the current OPEND-3205 body, not read back from Dict.
    expect(await view.findByText('已切换到 OpenDesign Cloud，请重新发送任务。')).toBeVisible();
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
    expect(transcript).toEqual(original);
    if (side) expect(host.getAttribute('data-primary-conversation')).toBe(conversation.id);

    // A fresh user send, after the visible switch, is the first permitted run.
    fireEvent.click(within(host).getByTestId('composer-fixture-send'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledOnce());
    expect(vi.mocked(streamViaDaemon).mock.calls[0]![0]).toEqual(expect.objectContaining({
      projectId: project.id, conversationId: targetConversation.id, agentId: 'amr',
    }));
    expect(vi.mocked(streamViaDaemon).mock.calls[0]![0].history.at(-1)).toEqual(
      expect.objectContaining({ content: 'Follow-up prompt' }),
    );
  });
  it.each(['pending double click', 'save failure', 'authority changed', 'view unmounted'] as const)(
    'keeps the Cloud success receipt honest when %s', async (scenario) => {
      const failure: ChatMessage = {
        id: 'failed-awaiting-switch', role: 'assistant', content: 'History must survive switching', createdAt: 2,
        agentId: 'codex', runId: 'old-local-run', runStatus: 'failed',
        events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
          failureDetail: 'process_crashed', detail: 'Controlled local failure' }],
      };
      const transcript = [history, failure];
      vi.mocked(listMessages).mockResolvedValue(transcript);
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const receipt = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
      const persistCloud = vi.fn(() => receipt);
      const settings = vi.fn();
      const arm = vi.fn();
      const host = () => <I18nProvider initial="zh-CN">{projectView({
        routeConversationId: conversation.id,
        config: { ...config, agentId: 'codex' },
        onSwitchToCloud: persistCloud,
        onOpenAmrSettings: settings,
        onArmAmrAuthRetryContinuation: arm,
      })}</I18nProvider>;
      const view = render(host());
      await view.findByText(failure.content);
      const card = view.getByTestId('chat-run-error-card');
      const action = within(card).getByRole('button', { name: '切换到 OpenDesign Cloud' });
      try {
        await act(async () => {
          fireEvent.click(action);
          if (scenario === 'pending double click') fireEvent.click(action);
        });
        expect(persistCloud).toHaveBeenCalledOnce();
        expect(settings).not.toHaveBeenCalled();
        expect(arm).not.toHaveBeenCalled();
        expect(streamViaDaemon).not.toHaveBeenCalled();
        expect(view.queryByText('已切换到 OpenDesign Cloud，请重新发送任务。')).toBeNull();
        expect(view.getByTestId('chat-run-error-card')).toBeVisible();
        expect(view.getByText(failure.content)).toBeVisible();
        if (scenario === 'view unmounted') view.unmount();
        if (scenario === 'authority changed') {
          workspace.scope = readableScope({ ...MEMBER, workspaceMemberId: 'another-project-member' });
          view.rerender(host());
        }
        await act(async () => {
          if (scenario === 'save failure') reject(new Error('Controlled app-config PUT 503'));
          else resolve();
          await receipt.catch(() => undefined);
        });
        if (scenario === 'pending double click') {
          expect(await view.findByText('已切换到 OpenDesign Cloud，请重新发送任务。')).toBeVisible();
        } else {
          expect(document.body.textContent).not.toContain('已切换到 OpenDesign Cloud，请重新发送任务。');
        }
        if (scenario === 'save failure') {
          expect(await view.findByText('保存更改失败。本地 daemon 可能不在线。')).toBeVisible();
          expect(view.getByTestId('chat-run-error-card')).toBeVisible();
          // A rejected receipt releases the lock so the same visible action is usable again.
          await act(async () => { fireEvent.click(action); });
          expect(persistCloud).toHaveBeenCalledTimes(2);
        }
        expect(streamViaDaemon).not.toHaveBeenCalled();
        expect(createConversation).not.toHaveBeenCalled();
      } finally {
        await act(async () => { resolve(); await receipt.catch(() => undefined); });
      }
    },
  );

  it.each([
    ['editable local main', false, false],
    ['editable local side', true, false],
    ['read-only local main', false, true],
    ['read-only local side', true, true],
  ] as const)('%s does not confuse a missing Cloud account with write authority', async (_label, side, readOnly) => {
    const localProject: Project = { ...project, workspaceId: null };
    const target: Conversation = side ? { ...conversation, id: 'local-side', sessionMode: 'chat' } : conversation;
    const failure: ChatMessage = {
      id: 'local-failure', role: 'assistant', content: 'Local failure without a Cloud login', createdAt: 2,
      agentId: 'codex', runId: 'local-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Controlled local failure' }],
    };
    workspace.caller = null;
    workspace.scope = {
      loading: false,
      scope: { kind: 'unbound', projectId: project.id, workspaceId: null, context: null },
    };
    workspace.viewerOnly = readOnly;
    workspace.sideConversationId = side ? target.id : null;
    vi.mocked(listConversations).mockResolvedValue(side ? [conversation, target] : [conversation]);
    vi.mocked(listMessages).mockImplementation(async (_project, id) => id === target.id ? [history, failure] : [history]);
    const receipt = vi.fn().mockResolvedValue(undefined);
    const settings = vi.fn();
    const arm = vi.fn();
    const view = render(<I18nProvider initial="zh-CN">{projectView({
      project: localProject, routeConversationId: conversation.id,
      config: { ...config, agentId: 'codex' },
      onSwitchToCloud: receipt, onOpenAmrSettings: settings,
      onArmAmrAuthRetryContinuation: arm,
    })}</I18nProvider>);
    const host = side ? await view.findByTestId('side-chat-recovery-host') : view.container;
    await within(host).findByText(failure.content);
    const action = within(within(host).getByTestId('chat-run-error-card')).getByRole('button', { name: '切换到 OpenDesign Cloud' });
    if (readOnly) {
      expect(action).toBeDisabled();
      fireEvent.click(action);
      expect(receipt).not.toHaveBeenCalled();
    } else {
      expect(action).not.toBeDisabled();
      await act(async () => { fireEvent.click(action); });
      expect(receipt).toHaveBeenCalledOnce();
      expect(await view.findByText('已切换到 OpenDesign Cloud，请重新发送任务。')).toBeVisible();
    }
    expect(settings).not.toHaveBeenCalled();
    expect(arm).not.toHaveBeenCalled();
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

});
