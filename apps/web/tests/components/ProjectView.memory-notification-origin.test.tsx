// @vitest-environment jsdom

// #8200: a completed extraction must persist explicit host provenance on its notification.
// Real ProjectView persistence is observed; only the extraction-completed hook input is controlled.

import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { buildWorkspacePermissions, type WorkspaceCollabContext } from '@open-design/contracts';
import { forwardRef, useImperativeHandle, useState, type ComponentProps, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView, mergeServerMessagesIntoConversation } from '../../src/components/ProjectView';
import { SideChatTab, type ActiveConversationChatState } from '../../src/components/workspace/SideChatTab';
import { I18nProvider } from '../../src/i18n';
import type { RecoveryActionBlockReason } from '../../src/runtime/chat/recovery-gating';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { fetchVelaLoginStatus, streamViaDaemon } from '../../src/providers/daemon';
import {
  createConversation,
  listConversations,
  listMessages,
  saveMessage,
} from '../../src/state/projects';
import type { AgentInfo, AppConfig, ChatMessage, Conversation, Project } from '../../src/types';

const workspace = vi.hoisted(() => ({
  caller: null as WorkspaceCollabContext | null,
  scope: { loading: false, scope: null } as ProjectWorkspaceScopeState,
  sideConversationId: null as string | null,
  viewerOnly: false,
}));

const memory = vi.hoisted(() => ({
  batch: null as null | { key: string; count: number; entries: { id: string; name: string; type: 'rule' }[] },
  dismiss: vi.fn(),
}));
vi.mock('../../src/runtime/useMemoryWrittenCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/useMemoryWrittenCard')>()),
  useMemoryWrittenCard: () => ({ batch: memory.batch, dismiss: memory.dismiss }),
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

describe('ProjectView memory notification provenance', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    workspace.caller = OWNER;
    workspace.scope = readableScope();
    workspace.sideConversationId = null;
    workspace.viewerOnly = false;
    memory.batch = null;
    memory.dismiss.mockReset().mockImplementation(() => { memory.batch = null; });
    vi.mocked(listConversations).mockReset().mockResolvedValue([conversation]);
    vi.mocked(createConversation).mockReset().mockResolvedValue(conversation);
    vi.mocked(listMessages).mockReset().mockResolvedValue([history]);
    vi.mocked(saveMessage).mockReset().mockResolvedValue(null);
    vi.mocked(streamViaDaemon).mockReset().mockResolvedValue(undefined);
    vi.mocked(fetchVelaLoginStatus).mockReset().mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('persists a host origin from the real extraction-completion producer', async () => {
    const element = () => <I18nProvider initial="en">{projectView({ routeConversationId: conversation.id })}</I18nProvider>;
    const view = render(element());
    await view.findByText(history.content);
    // The production client also receives collaboration authority and an
    // AbortSignal; this witness checks the selected resource, not call arity.
    expect(vi.mocked(listMessages).mock.calls.some(([projectId, conversationId]) =>
      projectId === project.id && conversationId === conversation.id)).toBe(true);
    const persistedBefore = vi.mocked(saveMessage).mock.calls.length;
    memory.batch = { key: 'completed-extraction-origin', count: 1,
      entries: [{ id: 'saved-rule-2745', type: 'rule', name: 'OPEND2745_STORED_RULE' }] };
    await act(async () => { view.rerender(element()); });
    expect(view.container.textContent).toContain(history.content);
    // Wait for the actual producer's persistence call before checking origin;
    // a missing call is not a qualified provenance failure.
    await waitFor(() => expect(vi.mocked(saveMessage).mock.calls.slice(persistedBefore))
      .toHaveLength(1));
    const savedCall = vi.mocked(saveMessage).mock.calls[persistedBefore];
    if (!savedCall) throw new Error('Memory producer did not persist its message');
    const [projectId, conversationId, message] = savedCall;
    expect(projectId).toBe(project.id);
    expect(conversationId).toBe(conversation.id);
    expect(message.role).toBe('assistant');
    expect(message.content).toContain('OPEND2745_STORED_RULE');
    expect(message.events).toEqual([{ kind: 'text', text: message.content }]);
    expect(view.container.textContent).toContain('OPEND2745_STORED_RULE');
    expect((message as ChatMessage & { messageOrigin?: string }).messageOrigin).toBe('host_memory');
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });
});

// The production refresh mapper is used directly, not copied. These guards
// should already pass: authoritative unknown must not inherit local provenance.
describe('ProjectView authoritative origin on history refresh', () => {
  type OriginMessage = ChatMessage & { messageOrigin?: 'host_memory' };
  const local: OriginMessage = {
    id: 'host-memory-refresh', role: 'assistant', content: 'Local longer memory body',
    createdAt: 3, messageOrigin: 'host_memory',
  };

  it('retains a marker returned by the authoritative server while merging local stream content', () => {
    const server: OriginMessage = { ...local, content: 'Memory' };
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.content).toBe(local.content);
    expect((merged as OriginMessage).messageOrigin).toBe('host_memory');
  });

  it('does not backfill unknown server provenance from an optimistic local marker', () => {
    const server: OriginMessage = { ...local, content: 'Memory', messageOrigin: undefined };
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.content).toBe(local.content);
    expect((merged as OriginMessage).messageOrigin).toBeUndefined();
  });
});
