// @vitest-environment jsdom

// A Settings return must retain its one-shot Cloud retry while the directory's
// owner projection is replaced by the same principal's authoritative member
// scope. This suite targets Cloud intent and actual outbound retry behavior;
// keeping historical rows visible during refresh belongs to a separate fix.

import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { buildWorkspacePermissions, type WorkspaceCollabContext } from '@open-design/contracts';
import { forwardRef, useImperativeHandle, useState, type ComponentProps, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { SideChatTab, type ActiveConversationChatState } from '../../src/components/workspace/SideChatTab';
import { workspaceIdentityCacheKey } from '../../src/collab/workspace-identity';
import type { AmrAuthRetryContinuation } from '../../src/runtime/amr-auth-retry-continuation';
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
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
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
    syncState: null, viewerOnly: false, writerAuthority: 'allowed',
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
  }) => workspace.sideConversationId ? (
    <div data-testid="side-chat-recovery-host" data-primary-conversation={props.activeConversationId}>
      <SideChatTab
        projectId={props.projectId} conversationId={workspace.sideConversationId}
        config={props.chatConfig} agentsById={props.chatAgentsById} locale={props.chatLocale}
        projectFiles={[]} conversations={props.conversations}
        activeConversationChat={props.activeConversationChat}
        onSelectConversation={props.onSelectConversation}
        onDeleteConversation={props.onDeleteConversation}
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

describe('ProjectView Cloud retry across authority confirmation', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    workspace.caller = OWNER;
    workspace.scope = readableScope();
    workspace.sideConversationId = null;
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
    ['login arrives during the second transcript read', true, false, 'during-refresh'],
    ['login arrives before scope confirmation', true, false, 'before-scope'],
    ['login arrives before the first transcript read', true, false, 'before-first-read'],
    ['confirmed scope is ready before history', false, false, 'during-refresh'],
    ['settled scope has a genuinely different role', false, true, 'during-refresh'],
  ] as const)('preserves the Settings Cloud retry until it can send: %s', async (_name, scopeSettlesLate, scopeRoleChanged, loginTiming) => {
    const failed: ChatMessage = {
      id: 'failed-local-before-settings', role: 'assistant',
      content: 'Partial work awaiting the requested Cloud retry', createdAt: 2,
      agentId: 'codex', runId: 'previous-local-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_AUTH_REQUIRED', detail: 'Authorization expired.' }],
    };
    const transcript = [history, failed];
    const initialRead = deferred<ChatMessage[]>();
    const refresh = deferred<ChatMessage[]>();
    const login = deferred<Awaited<ReturnType<typeof fetchVelaLoginStatus>>>();
    vi.mocked(fetchVelaLoginStatus).mockReturnValue(login.promise);
    vi.mocked(listMessages).mockReturnValueOnce(initialRead.promise).mockReturnValueOnce(refresh.promise);
    if (scopeSettlesLate) workspace.scope = { loading: true, scope: null };
    if (scopeRoleChanged) workspace.scope = readableScope({
      ...MEMBER, role: 'admin',
      permissions: buildWorkspacePermissions({ role: 'admin', lifecycleState: 'active' }),
    });
    const continuation: AmrAuthRetryContinuation = {
      projectId: project.id, conversationId: conversation.id, assistantId: failed.id,
      workspaceIdentityKey: workspaceIdentityCacheKey(MEMBER),
      workspacePrincipal: {
        workspaceId: MEMBER.workspaceId, workspaceType: MEMBER.workspaceType,
        workspaceMemberId: MEMBER.workspaceMemberId,
      },
      originMountId: 'before-settings', accountIdAtArm: 'signed-in-account', createdAtMs: Date.now(),
    };
    const consumed = vi.fn();
    const discarded = vi.fn();
    function SettingsReturn() {
      const [pending, setPending] = useState<AmrAuthRetryContinuation | null>(continuation);
      return projectView({
        amrAuthRetryContinuation: pending,
        onConsumeAmrAuthRetryContinuation: (candidate) => {
          if (candidate !== pending) return false;
          consumed(candidate);
          setPending(null);
          return true;
        },
        onDiscardAmrAuthRetryContinuation: (candidate) => {
          if (candidate !== pending) return;
          discarded(candidate);
          setPending(null);
        },
      });
    }
    const signedIn = {
      loggedIn: true, profile: 'prod',
      user: { id: 'signed-in-account', email: 'fixture@example.com', plan: 'free' }, configPath: '',
    };
    const view = render(<SettingsReturn />);
    try {
      if (loginTiming === 'before-first-read') {
        await act(async () => { login.resolve(signedIn); });
      }
      await act(async () => { initialRead.resolve(transcript); });
      await waitFor(() => expect(view.getByText(failed.content)).toBeTruthy());
      if (scopeSettlesLate) {
        if (loginTiming === 'before-scope') {
          await act(async () => { login.resolve(signedIn); });
        }
        expect(consumed).not.toHaveBeenCalled();
        expect(streamViaDaemon).not.toHaveBeenCalled();
        workspace.scope = readableScope();
        await act(async () => { view.rerender(<SettingsReturn />); });
        await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
        expect(view.getByTestId('composer-fixture-send')).toBeDisabled();
        expect(streamViaDaemon).not.toHaveBeenCalled();
        // A real scope projection must not discard the Settings intent before
        // the authoritative transcript can admit the eventual retry.
        expect(discarded).not.toHaveBeenCalled();
        await act(async () => {
          login.resolve(signedIn);
        });
        expect(consumed).not.toHaveBeenCalled();
        expect(streamViaDaemon).not.toHaveBeenCalled();
        await act(async () => { refresh.resolve(transcript); });
      } else {
        await act(async () => {
          login.resolve(signedIn);
        });
      }
      if (scopeRoleChanged) {
        await waitFor(() => expect(discarded).toHaveBeenCalledTimes(1));
        expect(consumed).not.toHaveBeenCalled();
        expect(streamViaDaemon).not.toHaveBeenCalled();
        return;
      }
      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expect(consumed).toHaveBeenCalledTimes(1);
      expect(discarded).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      initialRead.resolve(transcript);
      refresh.resolve(transcript);
      login.resolve(null);
      await Promise.all([initialRead.promise, refresh.promise, login.promise]);
    }
  });

  it('switches the clicked side conversation to Cloud without a Settings retry continuation', async () => {
    const sideConversation: Conversation = {
      ...conversation, id: 'inactive-side-conversation', sessionMode: 'chat',
    };
    const sidePrompt: ChatMessage = {
      id: 'side-prompt', role: 'user', content: 'Retry only this side conversation', createdAt: 1,
    };
    const sideFailure: ChatMessage = {
      id: 'side-failed-codex', role: 'assistant', content: 'Side failure retained', createdAt: 2,
      agentId: 'codex', runId: 'side-old-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Controlled side failure' }],
    };
    const sideTranscript = [sidePrompt, sideFailure];
    const originalSideTranscript = structuredClone(sideTranscript);
    workspace.sideConversationId = sideConversation.id;
    vi.mocked(listConversations).mockResolvedValue([conversation, sideConversation]);
    vi.mocked(listMessages).mockImplementation(async (_projectId, conversationId) =>
      conversationId === sideConversation.id ? sideTranscript : [history]);
    const arm = vi.fn();
    const settings = vi.fn();
    const persistCloud = vi.fn().mockResolvedValue(undefined);
    const origin = render(projectView({
      routeConversationId: conversation.id,
      config: { ...config, agentId: 'codex' },
      onArmAmrAuthRetryContinuation: arm,
      onOpenAmrSettings: settings,
      onSwitchToCloud: persistCloud,
    }));
    const sideHost = await origin.findByTestId('side-chat-recovery-host');
    await within(sideHost).findByText(sideFailure.content);
    expect(sideHost.getAttribute('data-primary-conversation')).toBe(conversation.id);
    const card = within(sideHost).getByTestId('chat-run-error-card');
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'chat.amrCard.switchCta' }));
    });
    expect(persistCloud).toHaveBeenCalledOnce();
    expect(arm).not.toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();
    expect(await origin.findByText('chat.amrCard.switchedResend')).toBeVisible();
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(sideTranscript).toEqual(originalSideTranscript);
    expect(sideHost.getAttribute('data-primary-conversation')).toBe(conversation.id);
    // Current native main/side send-after-switch behavior is covered by
    // ProjectView.switch-cloud-in-place; the five independent existing
    // authorization-continuation lifetime cases above remain unchanged.

  });

});
