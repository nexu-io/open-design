// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProjectView,
  listConversationsWithRetry,
  mergeSavedPreviewComment,
} from '../../src/components/ProjectView';
import { ProjectConversationsHttpError } from '../../src/state/projects';
import type { SettingsSection } from '../../src/components/SettingsDialog';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { AmrAuthRetryContinuation } from '../../src/runtime/amr-auth-retry-continuation';
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
const publishDaemonRunFinishedEvent = vi.fn();
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
const analyticsTrackMock = vi.fn();
/** What the inline question form was told about each answer it handed over. */
const questionFormSubmitOutcomes: Array<boolean | void> = [];
const useProjectFileEvents = vi.fn();
const workspaceScopeMocks = vi.hoisted(() => {
  const personalContext = (): WorkspaceCollabContext & {
    workspaceType: 'personal';
  } => ({
    workspaceId: 'workspace-personal',
    workspaceMemberId: 'member-personal',
    workspaceType: 'personal',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 1,
      usedSeats: 1,
      availableSeats: 0,
      isSeatFull: true,
    },
    permissions: {
      canManageMembers: true,
      canManageBilling: true,
      canInviteMembers: true,
      canManageAutoRecharge: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
  });
  return {
    personalContext,
    ambientContext: null as WorkspaceCollabContext | null,
    ambientLoading: false,
    ambientFailure: null as 'unsupported' | 'unavailable' | null,
    projectScope: {
      loading: false,
      scope: {
        kind: 'personal' as const,
        projectId: 'project-1',
        workspaceId: 'workspace-personal',
        visibility: 'personal' as const,
        context: personalContext(),
      },
    } as ProjectWorkspaceScopeState,
  };
});

function stubAuthoritativePersonalWorkspaceBalance(balanceUsd: string): void {
  const observedAt = '2026-07-26T00:00:00.000Z';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname !== '/api/workspace/billing') {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }
    return new Response(JSON.stringify({
      summary: null,
      workspaceBalance: {
        workspaceId: 'workspace-personal',
        workspaceMemberId: 'member-personal',
        balanceUsd,
        billingScopeVersion: 2,
        expiresAt: null,
        updatedAt: observedAt,
      },
      workspaceRuntime: {
        workspaceId: 'workspace-personal',
        workspaceMemberId: 'member-personal',
        status: 'fresh',
        revision: '1',
        observedAt,
        softExpiresAt: '2099-07-26T00:00:30.000Z',
        hardExpiresAt: '2099-07-26T00:02:00.000Z',
        retryAt: null,
        errorCode: null,
        reason: 'authoritative-action-read',
        sourceGapDetected: false,
      },
      authoritativeWorkspaceRead: {
        workspaceId: 'workspace-personal',
        workspaceMemberId: 'member-personal',
        observedAt,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}
const projectCollabMocks = vi.hoisted(() => ({
  enabled: false,
  syncState: 'local_only' as 'local_only' | 'synced' | null,
  viewerOnly: false,
  isOwner: false,
  writerAuthority: 'allowed' as 'allowed' | 'denied' | 'pending',
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: analyticsTrackMock,
  }),
}));

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

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspaceScopeMocks.ambientContext,
    loading: workspaceScopeMocks.ambientLoading,
    ...(workspaceScopeMocks.ambientFailure
      ? { failure: workspaceScopeMocks.ambientFailure }
      : {}),
  }),
  // This suite exercises run/conversation isolation, not remote collaboration.
  // An authoritative empty catalog proves the fixture project is unshared so
  // the collab status request's initial unknown window does not disable Chat.
  lastResolvedTeamProjects: () => [],
  lastResolvedWorkspaceContext: () => workspaceScopeMocks.ambientContext,
  // Mirrors the real predicate: only a settled, authoritative "no workspace"
  // read means AMR has no wallet.
  workspaceIdentityCanBillAmr: (state: {
    context: unknown;
    loading: boolean;
    failure?: string;
  }) => state.context !== null || state.loading || Boolean(state.failure),
  useWorkspaceBilling: () => null,
}));

// Only the HOOK is stubbed; every pure helper comes from the real module.
//
// This factory used to hand-list each export, and that cost three separate
// debugging rounds: adding ONE export to `useProjectWorkspaceScope` made all 64
// tests in this file fail with "not a function" at render, and the hand-written
// copies were free to drift from the semantics under test. `importOriginal`
// removes the whole failure mode — a new export is picked up automatically and
// is always the real implementation.
vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspaceScopeMocks.projectScope,
}));

vi.mock('../../src/collab/useProjectCollab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectCollab')>()),
  useProjectCollab: () => ({
    enabled: projectCollabMocks.enabled,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: projectCollabMocks.syncState,
    viewerOnly: projectCollabMocks.viewerOnly,
    isOwner: projectCollabMocks.isOwner,
    writerAuthority: projectCollabMocks.writerAuthority,
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: vi.fn(),
    applyContentTransferState: vi.fn(),
  }),
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
  publishDaemonRunFinishedEvent: (...args: unknown[]) => publishDaemonRunFinishedEvent(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: (...args: unknown[]) => useProjectFileEvents(...args),
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

vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/projects')>()),
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
    onAuthorizeAndRetry,
    onLaunchTerminalAuth,
    onSendBoardCommentAttachments,
    onCommentModeChange,
    onFocusModeChange,
  }: {
    streaming: boolean;
    messages?: ChatMessage[];
    onAuthorizeAndRetry?: (message: ChatMessage) => void;
    onLaunchTerminalAuth?: () => void;
    onSendBoardCommentAttachments: (attachments: unknown[]) => void;
    onCommentModeChange?: (active: boolean) => void;
    onFocusModeChange?: (focused: boolean) => void;
  }) => {
    const failedAssistant =
      [...(messages ?? [])]
        .reverse()
        .find(
          (message) =>
            message.role === 'assistant' &&
            (
              message.runStatus === 'failed' ||
              message.resultDeliveryState === 'no_result' ||
              message.resultDeliveryState === 'delivery_failed'
            ),
        ) ?? null;
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
    onRetry,
    onSubmitQuestionForm,
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
    onRetry?: (message: ChatMessage) => void;
    onSubmitQuestionForm?: (
      text: string,
      attachments?: unknown[],
      context?: unknown,
      sourceAssistantMessageId?: string,
      formId?: string,
    ) => boolean | void | Promise<boolean | void>;
  }) => {
    const attached = attachedComments ?? [];
    const retryTarget = [...(messages ?? [])]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant'
          && (
            message.runStatus === 'failed'
            || message.resultDeliveryState === 'no_result'
            || message.resultDeliveryState === 'delivery_failed'
          ),
      );
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
        <output data-testid="user-messages">
          {(messages ?? [])
            .filter((message) => message.role === 'user')
            .map((message) => message.content)
            .join('\n')}
        </output>
        <output data-testid="attached-comment-count">{attached.length}</output>
        {retryTarget && onRetry ? (
          <button type="button" data-testid="chat-retry" onClick={() => onRetry(retryTarget)}>
            retry
          </button>
        ) : null}
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
        <button
          type="button"
          data-testid="send-message-stable-request"
          onClick={() =>
            onSend(
              'hello from stable request',
              [],
              [],
              { clientRequestId: 'submission-1' },
            )
          }
          disabled={sendDisabled}
        >
          send stable request
        </button>
        <button
          type="button"
          data-testid="submit-question-form"
          onClick={() => {
            void Promise.resolve(
              onSubmitQuestionForm?.(
                'Audience: Designers',
                [],
                undefined,
                'assistant-brief',
                'travel_app_brief',
              ),
            ).then((accepted) => {
              questionFormSubmitOutcomes.push(accepted);
            });
          }}
        >
          submit question form
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

type TeamProjectWorkspaceContext = Extract<
  NonNullable<ProjectWorkspaceScopeState['scope']>,
  { kind: 'team' }
>['context'];

function teamWorkspaceContext(
  workspaceId: string,
  workspaceMemberId: string,
): TeamProjectWorkspaceContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_pro',
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 2,
      availableSeats: 3,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
    teamId: workspaceId,
    teamName: workspaceId,
  };
}

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
  // Realistic terminal timestamp: a synthetic epoch value would read as years
  // old to designDeliveryReconciliationStale's age bound and suppress the
  // reload reconciliation these suites exercise.
  endedAt: Date.now(),
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

describe('listConversationsWithRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
    listConversations.mockReset();
  });

  it('fails permanent authorization errors immediately', async () => {
    listConversations.mockRejectedValueOnce(
      new ProjectConversationsHttpError(403),
    );

    await expect(listConversationsWithRetry('project-1')).rejects.toMatchObject({
      status: 403,
    });
    expect(listConversations).toHaveBeenCalledTimes(1);
  });

  it('retries a transient materialization 404 on the bounded schedule', async () => {
    vi.useFakeTimers();
    const teamContext = teamWorkspaceContext('workspace-team', 'member-team');
    listConversations
      .mockRejectedValueOnce(new ProjectConversationsHttpError(404))
      .mockResolvedValueOnce(conversations);

    const result = listConversationsWithRetry('project-1', teamContext);
    await Promise.resolve();
    expect(listConversations).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(119);
    expect(listConversations).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual(conversations);
    expect(listConversations).toHaveBeenCalledTimes(2);
  });

  it('does not retry a missing Personal project', async () => {
    listConversations.mockRejectedValueOnce(
      new ProjectConversationsHttpError(404),
    );

    await expect(listConversationsWithRetry('project-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(listConversations).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectView conversation run isolation', () => {
  let resolveConversationBMessages: ((messages: ChatMessage[]) => void) | null = null;
  let conversationAMessages: ChatMessage[] = [runningAssistant];

  beforeEach(() => {
    window.localStorage.clear();
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.ambientLoading = false;
    workspaceScopeMocks.ambientFailure = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'personal',
        projectId: project.id,
        workspaceId: 'workspace-personal',
        visibility: 'personal',
        context: workspaceScopeMocks.personalContext(),
      },
    };
    projectCollabMocks.enabled = false;
    projectCollabMocks.syncState = 'local_only';
    projectCollabMocks.viewerOnly = false;
    projectCollabMocks.isOwner = false;
    projectCollabMocks.writerAuthority = 'allowed';
    resolveConversationBMessages = null;
    conversationAMessages = [runningAssistant];
    questionFormSubmitOutcomes.length = 0;
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
    stubAuthoritativePersonalWorkspaceBalance('10.00');
    launchAntigravityOauth.mockResolvedValue({ ok: true });
    streamViaDaemon.mockImplementation(async () => {});
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it.each([
    ['an old daemon', 'unsupported' as const],
    ['a revoked scope response', 'forbidden' as const],
    ['a workspace-directory outage', 'unavailable' as const],
  ])('keeps non-AMR runs available with %s', async (_label, failure) => {
    conversationAMessages = [];
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: null,
      failure,
    };

    renderProjectView();

    await waitFor(() =>
      expect(screen.getByTestId('active-conversation').textContent).toBe(
        'conv-a',
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('send-message')).toHaveProperty(
        'disabled',
        false,
      ),
    );
    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
  });

  const signedOutUnboundNonAmrCases: Array<{
    label: string;
    renderConfig: AppConfig;
    renderAgents: AgentInfo[];
    expectedAgentId: string;
  }> = [
    {
      label: 'Claude',
      renderConfig: { ...config, agentId: 'claude' },
      renderAgents: [{
        id: 'claude',
        name: 'Claude',
        bin: 'claude',
        available: true,
        models: [],
      }],
      expectedAgentId: 'claude',
    },
    {
      label: 'Codex',
      renderConfig: { ...config, agentId: 'codex' },
      renderAgents: [{
        id: 'codex',
        name: 'Codex',
        bin: 'codex',
        available: true,
        models: [],
      }],
      expectedAgentId: 'codex',
    },
    {
      label: 'OpenCode',
      renderConfig: { ...config, agentId: 'opencode' },
      renderAgents: [{
        id: 'opencode',
        name: 'OpenCode',
        bin: 'opencode',
        available: true,
        models: [],
      }],
      expectedAgentId: 'opencode',
    },
    {
      label: 'BYOK',
      renderConfig: {
        ...config,
        mode: 'api',
        apiProtocol: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-test',
      },
      renderAgents: [{
        id: 'byok-opencode',
        name: 'BYOK OpenCode',
        bin: 'opencode',
        available: true,
        models: [],
      }],
      expectedAgentId: 'byok-opencode',
    },
  ];

  it.each(signedOutUnboundNonAmrCases)(
    'keeps signed-out, headerless, unbound $label runs outside the AMR gates',
    async ({ renderConfig, renderAgents, expectedAgentId }) => {
      conversationAMessages = [];
      workspaceScopeMocks.ambientContext = null;
      workspaceScopeMocks.ambientLoading = false;
      workspaceScopeMocks.ambientFailure = null;
      workspaceScopeMocks.projectScope = {
        loading: false,
        scope: {
          kind: 'unbound',
          projectId: project.id,
          workspaceId: null,
          context: null,
        },
      };
      // BYOK's best-effort memory extraction stays entirely in-process.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      renderProjectView(renderConfig, project, renderAgents);

      await waitFor(() =>
        expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'),
      );
      expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false);
      fireEvent.click(screen.getByTestId('send-message'));

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expect(fetchAmrWalletSnapshot).not.toHaveBeenCalled();
      expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
      expect(screen.queryByTestId('amr-low-balance-dialog')).toBeNull();
      expect(streamViaDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: expectedAgentId,
          workspaceContext: null,
        }),
      );
    },
  );

  it('preserves the configured system notification for a background completion', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);

    renderProjectView({
      ...config,
      notifications: {
        ...config.notifications!,
        desktopEnabled: true,
      },
    });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    resolveConversationBMessages?.([]);
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));

    conversationAMessages = [succeededAssistant];
    fireEvent.click(screen.getByTestId('conversation-select-conv-a'));

    await waitFor(() => expect(playSound).toHaveBeenCalledWith('success-sound'));
    expect(showCompletionNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded', body: 'done' }),
    );
  });

  // An OpenDesign Cloud run is billed to the CALLER's own wallet. The gate must
  // therefore ask about the caller's identity, not about this project's
  // workspace scope — a project whose scope is unresolved says nothing about
  // whether the signed-in user can pay, and holding the send closed there just
  // produced a dead button (21f452ffe). Cases below pin the narrowed rule.
  const amrAgents = [{
    id: 'amr',
    name: 'AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'glm-5', label: 'GLM 5' }],
  }];

  it.each([
    [
      'an unbound project',
      {
        loading: false,
        scope: {
          kind: 'unbound' as const,
          projectId: project.id,
          workspaceId: null,
          context: null,
        },
      },
    ],
    [
      'a project pinned to a workspace the caller is not in',
      {
        loading: false,
        scope: {
          kind: 'unavailable' as const,
          projectId: project.id,
          workspaceId: 'workspace-elsewhere',
          visibility: 'personal' as const,
          context: null,
        },
      },
    ],
    [
      'a workspace-directory outage',
      { loading: false, scope: null, failure: 'unavailable' as const },
    ],
  ])(
    'lets a signed-in user send an AMR run with %s — they are spending their own quota',
    async (_label, projectScope) => {
      conversationAMessages = [];
      // Signed in: there IS a wallet. This is the whole difference from the
      // signed-out case below.
      workspaceScopeMocks.ambientContext = teamWorkspaceContext(
        'workspace-team',
        'member-team',
      );
      workspaceScopeMocks.projectScope = projectScope;

      renderProjectView({ ...config, agentId: 'amr' }, project, amrAgents);

      await waitFor(() =>
        expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'),
      );
      await waitFor(() =>
        expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false),
      );
      fireEvent.click(screen.getByTestId('send-message'));
      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    },
  );

  it('lets the daemon explicitly reject unbound adoption for a genuinely signed-out caller', async () => {
    conversationAMessages = [];
    // An unbound project has no safe wallet for a client-side preflight. Do not
    // reinterpret it as the account wallet or dead-button the request: the
    // daemon owns the explicit adoption/authentication rejection.
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.ambientLoading = false;
    workspaceScopeMocks.ambientFailure = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: project.id,
        workspaceId: null,
        context: null,
      },
    };

    renderProjectView({ ...config, agentId: 'amr' }, project, amrAgents);

    await waitFor(() =>
      expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'),
    );
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(fetchAmrWalletSnapshot).not.toHaveBeenCalled();
    expect(streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceContext: null }),
    );
  });

  it.each([
    ['an identity read still in flight', { loading: true, failure: null }],
    ['a transient identity outage', { loading: false, failure: 'unavailable' as const }],
    ['an old daemon with no workspace endpoint', { loading: false, failure: 'unsupported' as const }],
  ])(
    'does not disable the AMR send on %s — an unsettled read is not a signed-out user',
    async (_label, identity) => {
      conversationAMessages = [];
      workspaceScopeMocks.ambientContext = null;
      workspaceScopeMocks.ambientLoading = identity.loading;
      workspaceScopeMocks.ambientFailure = identity.failure;
      workspaceScopeMocks.projectScope = {
        loading: false,
        scope: {
          kind: 'unbound',
          projectId: project.id,
          workspaceId: null,
          context: null,
        },
      };

      renderProjectView({ ...config, agentId: 'amr' }, project, amrAgents);

      await waitFor(() =>
        expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'),
      );
      await waitFor(() =>
        expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false),
      );
    },
  );

  it.each([
    [
      'an old daemon',
      { loading: false, scope: null, failure: 'unsupported' as const },
    ],
    [
      'a workspace-directory outage',
      { loading: false, scope: null, failure: 'unavailable' as const },
    ],
  ])(
    'fails closed for a SIGNED-OUT AMR caller when project authority is %s',
    async (_label, projectScope) => {
    conversationAMessages = [];
    // `ambientContext` stays null from beforeEach: no cloud identity, so no
    // wallet. The project's own scope is not what closes the gate here.
    workspaceScopeMocks.projectScope = projectScope;

    renderProjectView(
      { ...config, agentId: 'amr' },
      project,
      [{
        id: 'amr',
        name: 'AMR',
        bin: 'amr',
        available: true,
        models: [{ id: 'glm-5', label: 'GLM 5' }],
      }],
    );

    await waitFor(() =>
      expect(screen.getByTestId('active-conversation').textContent).toBe(
        'conv-a',
      ),
    );
    expect(screen.getByTestId('send-message')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('send-message'));
    expect(streamViaDaemon).not.toHaveBeenCalled();
  },
  );

  it('uses the project-bound workspace instead of the ambient workspace for run authorization', async () => {
    conversationAMessages = [];
    const workspaceA = teamWorkspaceContext('workspace-a', 'member-a');
    const workspaceB = teamWorkspaceContext('workspace-b', 'member-b');
    workspaceScopeMocks.ambientContext = workspaceB;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: project.id,
        workspaceId: workspaceA.workspaceId,
        visibility: 'personal',
        context: workspaceA,
      },
    };

    renderProjectView(config, { ...project, workspaceId: workspaceA.workspaceId });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        workspaceContext: workspaceA,
      }),
    );
  });

  it('checks the project-bound team wallet instead of the ambient workspace wallet', async () => {
    conversationAMessages = [];
    const workspaceA = teamWorkspaceContext('workspace-a', 'member-a');
    const workspaceB = teamWorkspaceContext('workspace-b', 'member-b');
    workspaceScopeMocks.ambientContext = workspaceB;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: project.id,
        workspaceId: workspaceA.workspaceId,
        visibility: 'personal',
        context: workspaceA,
      },
    };
    // A team-scoped preflight only accepts a wallet whose epoch is proven for
    // the exact workspace/member it asked about: the daemon must echo a fresh
    // `workspaceRuntime` plus the `authoritativeWorkspaceRead` that proves this
    // very response completed the requested refresh (e65b168c3). Anything less
    // fails closed, so the fixture has to speak that shape.
    const observedAt = '2026-07-26T00:00:00.000Z';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/billing')) {
        const workspaceId = new URL(url, 'http://localhost').searchParams.get('workspaceId');
        const workspaceMemberId = workspaceId === workspaceA.workspaceId ? 'member-a' : 'member-b';
        return new Response(JSON.stringify({
          summary: null,
          workspaceBalance: {
            workspaceId,
            workspaceMemberId,
            balanceUsd: '10.00',
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: observedAt,
          },
          workspaceRuntime: {
            workspaceId,
            workspaceMemberId,
            status: 'fresh',
            revision: '4',
            observedAt,
            softExpiresAt: '2099-07-26T00:00:30.000Z',
            hardExpiresAt: '2099-07-26T00:02:00.000Z',
            retryAt: null,
            errorCode: null,
            reason: 'authoritative-action-read',
            sourceGapDetected: false,
          },
          authoritativeWorkspaceRead: {
            workspaceId,
            workspaceMemberId,
            observedAt,
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProjectView(
      { ...config, agentId: 'amr' },
      { ...project, workspaceId: workspaceA.workspaceId },
      [{
        id: 'amr',
        name: 'AMR',
        bin: 'amr',
        available: true,
        models: [{ id: 'glm-5', label: 'GLM 5' }],
      }],
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`workspaceId=${encodeURIComponent(workspaceA.workspaceId)}`),
      { cache: 'no-store' },
    );
    // The ambient workspace must never be consulted for a project bound to
    // another one, and the run has to spawn under the same workspace the
    // wallet was checked against.
    const billingUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/workspace/billing'));
    expect(billingUrls.length).toBeGreaterThan(0);
    expect(
      billingUrls.filter((url) =>
        url.includes(`workspaceId=${encodeURIComponent(workspaceB.workspaceId)}`),
      ),
    ).toHaveLength(0);
    expect(streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceContext: workspaceA }),
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
      codingPlanModels: [],
      updatedAt: null,
      fetchedAt: '2026-07-02T00:00:00.000Z',
      stale: false,
      source: 'vela_api',
    });
    stubAuthoritativePersonalWorkspaceBalance('0');
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
      user: { id: 'u-paid', plan: 'plus' },
      balanceUsd: '1.20',
      codingPlanModels: [],
      updatedAt: null,
      fetchedAt: '2026-07-02T00:00:00.000Z',
      stale: false,
      source: 'vela_api',
    });
    stubAuthoritativePersonalWorkspaceBalance('1.20');
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

  it('does not soft-block a Free user with a low AMR wallet', async () => {
    conversationAMessages = [];
    fetchAmrWalletSnapshot.mockResolvedValue({
      status: 'available',
      profile: 'prod',
      user: { id: 'u-free', plan: 'free' },
      balanceUsd: '1.20',
      updatedAt: null,
      fetchedAt: '2026-07-13T00:00:00.000Z',
      stale: false,
      source: 'vela_api',
    });
    stubAuthoritativePersonalWorkspaceBalance('1.20');
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

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('amr-low-balance-dialog')).toBeNull();
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

  it('identifies a question-form answer by its occurrence, not by a fresh id', async () => {
    // "At most one user answer message and one non-failed run per
    // sourceAssistantMessageId + formId" cannot be a property of the form's
    // own lock: a second tab, a denied-storage reload, or a queue replay all
    // reach the host without it. Deriving the send's ids from the occurrence
    // makes the guarantee a property of the request instead — the queue dedupes
    // on `clientRequestId`, the answer row keeps one `userMessageId`, and the
    // daemon's createOrReuse collapses the second send onto the first run.
    conversationAMessages = [];

    renderProjectView();
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByTestId('submit-question-form'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    const first = streamViaDaemon.mock.calls[0]![0] as Record<string, unknown>;

    // Leaving the project and coming back is the reported path back into the
    // same form. A freshly mounted view must not mint a fresh identity for it.
    cleanup();
    renderProjectView();
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByTestId('submit-question-form'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    const second = streamViaDaemon.mock.calls[1]![0] as Record<string, unknown>;

    // The run key is the occurrence: `createOrReuse` collapses the second
    // send onto the first run instead of spawning another.
    expect(first.clientRequestId).toBeTruthy();
    expect(second.clientRequestId).toBe(first.clientRequestId);
    // The answer row carries the same identity and is written `createOnly`,
    // so the daemon — not this view — decides which answer survives.
    expect(second.userMessageId).toBe(first.userMessageId);
    const claims = saveMessage.mock.calls.filter(
      (call) => (call[3] as { createOnly?: boolean } | undefined)?.createOnly === true,
    );
    expect(claims).toHaveLength(2);
    expect(claims.every((call) => (call[2] as { id: string }).id === first.userMessageId)).toBe(true);
  });

  it('adopts the answer that actually ran when another submitter claimed the occurrence first', async () => {
    // The losing tab must not keep showing an answer no run ever read.
    conversationAMessages = [];
    saveMessage.mockImplementation(async (_p: string, _c: string, message: ChatMessage) => ({
      ...message,
      content: '[form answers — travel_app_brief]\n- Audience: Founders',
    }));

    renderProjectView();
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByTestId('submit-question-form'));

    await waitFor(() =>
      expect(screen.getByTestId('user-messages').textContent).toContain('Audience: Founders'),
    );
    expect(screen.getByTestId('user-messages').textContent).not.toContain('Audience: Designers');
  });

  it('reports a question-form answer parked in the queue as accepted', async () => {
    // The inline form holds the only copy of its answer. Leaving the project
    // while the pre-run gate is still deciding parks that answer in the
    // conversation queue — a durable acceptance, not a refusal. Reporting a
    // refusal instead re-opens the form (and rolls back any file it uploaded
    // for a send the queue still points at), so the user answers a second
    // time and the drain sends the same brief twice.
    conversationAMessages = [];
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

    fireEvent.click(screen.getByTestId('submit-question-form'));
    await waitFor(() => expect(fetchAmrWalletSnapshot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    await waitFor(() => {
      if (!resolveConversationBMessages) throw new Error('Expected conv-b message load to be pending');
    });
    await act(async () => {
      resolveConversationBMessages?.([]);
    });

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
      }>;
      expect(queued).toEqual([
        expect.objectContaining({
          conversationId: 'conv-a',
          prompt: 'Audience: Designers',
        }),
      ]);
    });
    await waitFor(() => expect(questionFormSubmitOutcomes).toEqual([true]));
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

  it('does not create a conversation for a read-only member of a shared project', async () => {
    const teamContext = teamWorkspaceContext('workspace-team', 'member-team');
    workspaceScopeMocks.ambientContext = teamContext;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: project.id,
        workspaceId: teamContext.workspaceId,
        visibility: 'team',
        context: teamContext,
      },
    };
    listConversations.mockResolvedValue([]);
    projectCollabMocks.enabled = true;
    projectCollabMocks.syncState = 'synced';
    projectCollabMocks.viewerOnly = true;
    projectCollabMocks.isOwner = false;
    projectCollabMocks.writerAuthority = 'denied';

    renderProjectView(config, { ...project, workspaceId: teamContext.workspaceId });

    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(createConversation).not.toHaveBeenCalled();
    expect(screen.queryByTestId('chat-pane-loading')).toBeNull();
    expect(screen.getByTestId('active-conversation').textContent).toBe('');
  });

  it('seeds an empty explicitly Personal project without Team ownership status', async () => {
    listConversations.mockResolvedValue([]);
    projectCollabMocks.writerAuthority = 'pending';

    renderProjectView();

    await waitFor(() => expect(createConversation).toHaveBeenCalledTimes(1));
    expect(createConversation).toHaveBeenCalledWith(
      project.id,
      undefined,
      expect.objectContaining({
        workspaceContext: workspaceScopeMocks.personalContext(),
      }),
    );
  });

  it('seeds an empty Team project after positive writer authority settles', async () => {
    const teamContext = teamWorkspaceContext('workspace-team', 'owner-member');
    workspaceScopeMocks.ambientContext = teamContext;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: project.id,
        workspaceId: teamContext.workspaceId,
        visibility: 'team',
        context: teamContext,
      },
    };
    listConversations.mockResolvedValue([]);
    projectCollabMocks.enabled = true;
    projectCollabMocks.syncState = 'synced';
    projectCollabMocks.viewerOnly = false;
    projectCollabMocks.isOwner = true;
    projectCollabMocks.writerAuthority = 'allowed';

    renderProjectView(config, { ...project, workspaceId: teamContext.workspaceId });

    await waitFor(() => expect(createConversation).toHaveBeenCalledTimes(1));
    expect(createConversation).toHaveBeenCalledWith(
      project.id,
      undefined,
      expect.objectContaining({ workspaceContext: teamContext }),
    );
  });

  it('does not seed during unknown ownership even when provisional viewerOnly is false', async () => {
    const teamContext = teamWorkspaceContext('workspace-team', 'member-team');
    workspaceScopeMocks.ambientContext = teamContext;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: project.id,
        workspaceId: teamContext.workspaceId,
        visibility: 'team',
        context: teamContext,
      },
    };
    listConversations.mockResolvedValue([]);
    projectCollabMocks.enabled = true;
    projectCollabMocks.syncState = null;
    projectCollabMocks.viewerOnly = false;
    projectCollabMocks.isOwner = false;
    projectCollabMocks.writerAuthority = 'pending';

    const teamProject = { ...project, workspaceId: teamContext.workspaceId };
    const view = renderProjectView(config, teamProject);

    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(createConversation).not.toHaveBeenCalled();

    projectCollabMocks.syncState = 'synced';
    projectCollabMocks.viewerOnly = true;
    projectCollabMocks.writerAuthority = 'denied';
    view.rerender(projectViewElement(config, teamProject));

    await act(async () => {
      await Promise.resolve();
    });
    expect(createConversation).not.toHaveBeenCalled();
    expect(screen.queryByText('Could not create a conversation for this project.')).toBeNull();
  });

  it('does not seed after explicit other-owner status revokes provisional writer authority', async () => {
    const teamContext = teamWorkspaceContext('workspace-team', 'member-team');
    workspaceScopeMocks.ambientContext = teamContext;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: project.id,
        workspaceId: teamContext.workspaceId,
        visibility: 'team',
        context: teamContext,
      },
    };
    let resolveConversations!: (value: Conversation[]) => void;
    listConversations.mockImplementationOnce(
      () => new Promise<Conversation[]>((resolve) => {
        resolveConversations = resolve;
      }),
    );
    projectCollabMocks.enabled = true;
    projectCollabMocks.syncState = null;
    projectCollabMocks.viewerOnly = false;
    projectCollabMocks.isOwner = false;
    projectCollabMocks.writerAuthority = 'allowed';
    const teamProject = { ...project, workspaceId: teamContext.workspaceId };
    const view = renderProjectView(config, teamProject);

    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
    projectCollabMocks.syncState = 'synced';
    projectCollabMocks.viewerOnly = true;
    projectCollabMocks.writerAuthority = 'denied';
    view.rerender(projectViewElement(config, teamProject));

    await act(async () => {
      resolveConversations([]);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(createConversation).not.toHaveBeenCalled();
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

  it.each([
    {
      label: 'run failure',
      terminalMessage: { ...succeededAssistant, runStatus: 'failed' as const },
    },
    {
      label: 'delivery failure',
      terminalMessage: {
        ...succeededAssistant,
        resultDeliveryState: 'delivery_failed' as const,
      },
    },
  ])(
    'keeps the foreground $label system notification silent while preserving its sound',
    async ({ terminalMessage }) => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);

      renderProjectView({
        ...config,
        notifications: {
          ...config.notifications!,
          desktopEnabled: true,
        },
      });

      await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
      await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

      fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
      await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
      resolveConversationBMessages?.([]);
      await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('idle'));

      conversationAMessages = [terminalMessage];
      fireEvent.click(screen.getByTestId('conversation-select-conv-a'));

      await waitFor(() => expect(playSound).toHaveBeenCalledWith('failure-sound'));
      expect(showCompletionNotification).not.toHaveBeenCalled();
    },
  );

  it('downgrades a reloaded terminal Design run whose file writes never landed', async () => {
    conversationAMessages = [
      {
        ...succeededAssistant,
        content: '',
        sessionMode: 'design',
        events: [
          { kind: 'text', text: 'I finished the design.' },
          {
            kind: 'tool_use',
            id: 'write-1',
            name: 'Write',
            input: { file_path: 'index.html', content: '<!doctype html>' },
          },
        ],
        preTurnFileNames: [],
        producedFiles: undefined,
        traceObjectFiles: undefined,
      },
    ];
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-a',
      status: 'succeeded',
      createdAt: 1,
      updatedAt: 2,
      exitCode: 0,
      signal: null,
    });

    renderProjectView();

    await waitFor(() => {
      const recoveredMessage = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .find((message) => message.id === succeededAssistant.id && message.resultDeliveryState === 'no_result');
      expect(recoveredMessage).toMatchObject({
        runStatus: 'succeeded',
        resultDeliveryState: 'no_result',
        producedFiles: [],
        traceObjectFiles: [],
      });
      expect(recoveredMessage?.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'status',
            label: 'error',
            code: 'ARTIFACT_NOT_FOUND',
          }),
        ]),
      );
    });
    expect(screen.getByTestId('chat-error').textContent).toMatch(
      /finished without producing a deliverable project file/i,
    );
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('trusts the daemon artifact count when browser file reconciliation misses delivered output', async () => {
    conversationAMessages = [
      {
        ...succeededAssistant,
        content: '',
        sessionMode: 'design',
        events: [
          { kind: 'text', text: 'I finished the design.' },
          {
            kind: 'tool_use',
            id: 'write-1',
            name: 'Write',
            input: { file_path: 'index.html', content: '<!doctype html>' },
          },
        ],
        preTurnFileNames: [],
        producedFiles: undefined,
        traceObjectFiles: undefined,
      },
    ];
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-a',
      status: 'succeeded',
      createdAt: 1,
      updatedAt: 2,
      exitCode: 0,
      signal: null,
      artifactCount: 1,
    });

    renderProjectView();

    await waitFor(() => {
      const recoveredMessage = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .find(
          (message) =>
            message.id === succeededAssistant.id
            && message.resultDeliveryState === 'delivered',
        );
      expect(recoveredMessage).toMatchObject({
        runStatus: 'succeeded',
        resultDeliveryState: 'delivered',
        producedFiles: [],
        traceObjectFiles: [],
      });
      expect(recoveredMessage?.events).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ARTIFACT_NOT_FOUND' }),
        ]),
      );
    });
    expect(screen.getByTestId('chat-error').textContent).toBe('');
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('keeps a reloaded report-only Design run without file writes on the success path', async () => {
    // Prose-only turns (image analysis, audits) are legitimate zero-file
    // Design results (#5714, #5718); reload must not downgrade them.
    conversationAMessages = [
      {
        ...succeededAssistant,
        content: '',
        sessionMode: 'design',
        events: [{ kind: 'text', text: 'The hero image contrast is too low.' }],
        preTurnFileNames: [],
        producedFiles: undefined,
        traceObjectFiles: undefined,
      },
    ];
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-a',
      status: 'succeeded',
      createdAt: 1,
      updatedAt: 2,
      exitCode: 0,
      signal: null,
    });

    renderProjectView();

    await waitFor(() => {
      const recoveredMessage = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .find(
          (message) =>
            message.id === succeededAssistant.id && message.producedFiles !== undefined,
        );
      expect(recoveredMessage).toMatchObject({
        runStatus: 'succeeded',
        producedFiles: [],
        traceObjectFiles: [],
      });
      expect(recoveredMessage?.resultDeliveryState).toBeUndefined();
      expect(recoveredMessage?.events).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ARTIFACT_NOT_FOUND' }),
        ]),
      );
    });
    expect(screen.getByTestId('chat-error').textContent).toBe('');
    expect(reattachDaemonRun).not.toHaveBeenCalled();
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
    // Focus mode hides the collapsed chat visually only: the native `hidden`
    // attribute would drop the first grid item and shift FileWorkspace into
    // the handle track, so the slot keeps its box and is marked `aria-hidden`
    // once the collapse settles (3284f36c0).
    await waitFor(() => {
      const chatSlot = screen.getByTestId('active-conversation').closest('.split-chat-slot');
      expect(chatSlot?.getAttribute('aria-hidden')).toBe('true');
      expect(chatSlot?.classList.contains('split-chat-slot-hidden')).toBe(true);
      expect(chatSlot?.hasAttribute('hidden')).toBe(false);
    });
    fireEvent.click(screen.getByTestId('workspace-open-comments'));
    fireEvent.click(screen.getByTestId('workspace-send-comment'));

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    const restoredChatSlot = screen.getByTestId('active-conversation').closest('.split-chat-slot');
    expect(restoredChatSlot?.hasAttribute('aria-hidden')).toBe(false);
    expect(restoredChatSlot?.classList.contains('split-chat-slot-hidden')).toBe(false);
    expect(restoredChatSlot?.hasAttribute('hidden')).toBe(false);
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-b',
      projectId: 'project-1',
    }));
  });

  it('refreshes the active conversation when a project comment event arrives', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    if (!resolveConversationBMessages) throw new Error('Expected conv-b message load to be pending');
    resolveConversationBMessages([]);
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fetchPreviewComments.mockClear();
    fetchPreviewComments.mockResolvedValue([previewComment]);
    const handleProjectEvent = useProjectFileEvents.mock.calls.at(-1)?.[2] as
      | ((event: { type: 'comment-changed'; projectId: string }) => void)
      | undefined;
    await act(async () => {
      handleProjectEvent?.({ type: 'comment-changed', projectId: project.id });
    });

    await waitFor(() => {
      expect(fetchPreviewComments).toHaveBeenCalledWith(
        project.id,
        'conv-b',
        expect.anything(),
      );
    });
    // The daemon GET is project-scoped for a Team share, so a comment whose
    // local FK anchor is conv-a is intentionally accepted by the conv-b view.
    expect(previewComment.conversationId).toBe('conv-a');
  });

  it('sends a project-scoped comment through the active chat when its local anchor belongs to another conversation', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    fireEvent.click(screen.getByTestId('conversation-select-conv-b'));
    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-b'));
    if (!resolveConversationBMessages) throw new Error('Expected conv-b message load to be pending');
    resolveConversationBMessages([]);
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fetchPreviewComments.mockClear();
    fetchPreviewComments.mockResolvedValue([previewComment]);
    const handleProjectEvent = useProjectFileEvents.mock.calls.at(-1)?.[2] as
      | ((event: { type: 'comment-changed'; projectId: string }) => void)
      | undefined;
    await act(async () => {
      handleProjectEvent?.({ type: 'comment-changed', projectId: project.id });
    });
    await waitFor(() => expect(fetchPreviewComments).toHaveBeenCalledWith(
      project.id,
      'conv-b',
      expect.anything(),
    ));

    fireEvent.click(screen.getByTestId('attach-first-comment'));
    await waitFor(() => expect(screen.getByTestId('attached-comment-count').textContent).toBe('1'));
    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      projectId: project.id,
      conversationId: 'conv-b',
      commentAttachments: [expect.objectContaining({
        id: previewComment.id,
        comment: previewComment.note,
      })],
    })));
    expect(previewComment.conversationId).toBe('conv-a');
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

  it('queues a logical submission only once when its stable request id is retried', async () => {
    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('streaming-state').textContent).toBe('streaming'));

    fireEvent.click(screen.getByTestId('send-message-stable-request'));
    fireEvent.click(screen.getByTestId('send-message-stable-request'));

    await waitFor(() => expect(screen.getByTestId('send-queued-0')).toBeTruthy());
    expect(screen.queryByTestId('send-queued-1')).toBeNull();
  });

  it('reuses a queued submission request id when the daemon run starts', async () => {
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

    fireEvent.click(screen.getByTestId('send-message-stable-request'));
    await waitFor(() => expect(screen.getByTestId('send-queued-0')).toBeTruthy());

    await act(async () => {
      reattachHandlers?.onDone();
      finishReattach?.();
    });

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      clientRequestId: 'submission-1',
    }));
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
        workspaceScopeMocks.personalContext(),
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
    // The workspace-context argument matters MOST on a negative assertion: a
    // four-argument matcher can never match the real five-argument call, so
    // omitting it would make this pass no matter what the code did.
    expect(patchPreviewCommentStatus).not.toHaveBeenCalledWith(
      'project-1',
      'conv-a',
      previewComment.id,
      'needs_review',
      null,
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
        workspaceScopeMocks.personalContext(),
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

    // Arity matters on the negative assertion — see the note above.
    expect(patchPreviewCommentStatus).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      previewComment.id,
      'open',
      null,
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

  it('restores only one queued send for each stable request id', async () => {
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));
    const duplicateQueuedSend = {
      id: 'submission-1',
      conversationId: 'conv-a',
      prompt: 'hello from stable request',
      attachments: [],
      commentAttachments: [],
      meta: { clientRequestId: 'submission-1' },
      createdAt: 1,
    };
    window.localStorage.setItem(
      'od:chat-queued-sends:project-1:v1',
      JSON.stringify([duplicateQueuedSend, duplicateQueuedSend]),
    );

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('send-queued-0')).toBeTruthy());
    expect(screen.queryByTestId('send-queued-1')).toBeNull();
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
        expect.objectContaining({
          workspaceId: 'workspace-personal',
          workspaceMemberId: 'member-personal',
        }),
      ),
    );
    await waitFor(() =>
      expect(patchProject).toHaveBeenCalledWith(
        promptNamedProject.id,
        expect.objectContaining({
          name: 'Hello From B',
          metadata: expect.objectContaining({ nameSource: 'prompt' }),
        }),
        expect.objectContaining({
          workspaceId: 'workspace-personal',
          workspaceMemberId: 'member-personal',
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
        expect.objectContaining({
          workspaceId: 'workspace-personal',
          workspaceMemberId: 'member-personal',
        }),
      ),
    );
    await waitFor(() =>
      expect(patchProject).toHaveBeenCalledWith(
        promptNamedProject.id,
        expect.objectContaining({
          name: 'Agent Title',
          metadata: expect.objectContaining({ nameSource: 'agent' }),
        }),
        expect.objectContaining({
          workspaceId: 'workspace-personal',
          workspaceMemberId: 'member-personal',
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
    listConversations.mockResolvedValue(
      conversations.map((conversation) => ({ ...conversation, sessionMode: 'chat' as const })),
    );
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
      apiKey: 'byok-test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'api-model',
    });

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(streamViaDaemon).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'byok-opencode',
      byokProvider: expect.objectContaining({
        protocol: 'openai',
        apiKey: 'byok-test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'api-model',
      }),
      model: 'api-model',
    }));
    await waitFor(() => expect(playSound).toHaveBeenCalledWith('success-sound'));
  });

  it.each([
    {
      mode: 'api' as const,
      agentId: 'agent-1',
      missing: 'API key',
      apiKey: '',
      model: 'api-model',
      reason: 'api_key_required' as const,
    },
    {
      mode: 'api' as const,
      agentId: 'agent-1',
      missing: 'model',
      apiKey: 'test-key',
      model: '',
      reason: 'model_required' as const,
    },
    {
      mode: 'daemon' as const,
      agentId: 'byok-opencode',
      missing: 'API key through the daemon selector',
      apiKey: '',
      model: 'api-model',
      reason: 'api_key_required' as const,
    },
  ])(
    'opens Settings and blocks a BYOK send with a missing $missing',
    async ({ mode, agentId, apiKey, model, reason }) => {
      listMessages.mockResolvedValue([]);
      const onOpenSettings = vi.fn();

      renderProjectView(
        {
          ...config,
          mode,
          agentId,
          apiProtocol: 'openai',
          apiKey,
          baseUrl: 'https://api.openai.com/v1',
          model,
        },
        project,
        undefined,
        { onOpenSettings },
      );

      await waitFor(() =>
        expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'),
      );
      await waitFor(() =>
        expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false),
      );

      fireEvent.click(screen.getByTestId('send-message'));

      await waitFor(() => expect(onOpenSettings).toHaveBeenCalledWith('execution'));
      expect(analyticsTrackMock).toHaveBeenCalledWith(
        'byok_preflight_blocked',
        {
          source: 'run',
          reason,
          provider_id: 'openai',
          active_execution_mode: mode === 'api' ? 'byok' : 'local_cli',
        },
        undefined,
      );
      expect(analyticsTrackMock).toHaveBeenCalledWith(
        'surface_view',
        expect.objectContaining({
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'run_start_blocked',
          task_execution_id: expect.any(String),
          recovery_action_instance_id: expect.stringMatching(/^blocked:/),
          block_reason: reason,
          agent_provider_id: 'openai',
          model_id: model.trim() || 'default',
        }),
        undefined,
      );
      expect(streamViaDaemon).not.toHaveBeenCalled();
      expect(saveMessage).not.toHaveBeenCalled();
    },
  );

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
      byokProvider: expect.objectContaining({
        protocol: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'llama3.2',
        requiresApiKey: false,
      }),
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
      byokProvider: expect.objectContaining({
        protocol: 'openai',
        baseUrl: 'http://127.0.0.1:8000/v1',
        model: 'model',
        requiresApiKey: false,
      }),
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

  it('keeps Chat retry available after a structured AMR insufficient-balance error', async () => {
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
          'AMR Cloud reported insufficient balance for this model. Top up your AMR balance at https://open-design.ai/amr/dashboard, then retry this run.',
        ) as Error & { code: string; details: unknown };
        error.code = 'AMR_INSUFFICIENT_BALANCE';
        error.details = {
          kind: 'amr_account',
          action: 'recharge',
          actionUrl: 'https://open-design.ai/amr/dashboard',
        };
        options.handlers.onError(error);
      },
    );

    renderProjectView();

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('chat-retry')).toBeTruthy());
    expect(screen.getByTestId('streaming-state').textContent).toBe('idle');

    fireEvent.click(screen.getByTestId('chat-retry'));

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
    await waitFor(() => expect(screen.getByTestId('chat-retry')).toBeTruthy());

    fireEvent.click(screen.getByTestId('chat-retry'));

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

  it.each(['no_result', 'delivery_failed'] as const)(
    'starts a replacement run when retrying a %s delivery failure',
    async (resultDeliveryState) => {
      const userMessage: ChatMessage = {
        id: `user-${resultDeliveryState}`,
        role: 'user',
        content: 'make an editorial landing page',
        createdAt: 1,
      };
      const deliveryFailure: ChatMessage = {
        id: `assistant-${resultDeliveryState}`,
        role: 'assistant',
        content: 'The design result was not delivered.',
        createdAt: 2,
        runStatus: 'succeeded',
        resultDeliveryState,
        sessionMode: 'design',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'The design result was not delivered.',
            code: 'ARTIFACT_NOT_FOUND',
          },
        ],
      };
      conversationAMessages = [userMessage, deliveryFailure];
      fetchChatRunStatus.mockResolvedValue(null);
      streamViaDaemon.mockImplementation(async () => {});

      renderProjectView();

      await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
      await waitFor(() => expect(screen.getByTestId('chat-retry')).toBeTruthy());

      fireEvent.click(screen.getByTestId('chat-retry'));

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      const retryCall = streamViaDaemon.mock.calls[0]?.[0] as {
        assistantMessageId?: string;
        history?: ChatMessage[];
      };
      expect(retryCall.assistantMessageId).toBeTruthy();
      expect(retryCall.assistantMessageId).not.toBe(deliveryFailure.id);
      expect(retryCall.history).toEqual([userMessage]);
    },
  );

  it('routes workspace authorize recovery through AMR mode switching for structured auth failures', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    const onModeChange = vi.fn();
    const onAgentChange = vi.fn();
    const onOpenAmrSettings = vi.fn();
    const onArmAmrAuthRetryContinuation = vi.fn();
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
      {
        onModeChange,
        onAgentChange,
        onOpenAmrSettings,
        onArmAmrAuthRetryContinuation,
      },
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
    expect(onArmAmrAuthRetryContinuation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: project.id,
      conversationId: 'conv-a',
      assistantId: expect.any(String),
      originMountId: expect.any(String),
      workspaceIdentityKey: expect.any(String),
    }));
    expect(onArmAmrAuthRetryContinuation.mock.invocationCallOrder[0]).toBeLessThan(
      onModeChange.mock.invocationCallOrder[0]!,
    );
    expect(onArmAmrAuthRetryContinuation.mock.invocationCallOrder[0]).toBeLessThan(
      onOpenAmrSettings.mock.invocationCallOrder[0]!,
    );
    expect(screen.getByTestId('streaming-state').textContent).toBe('idle');
  });

  it('leaves retry ownership with the App continuation while Settings is open', async () => {
    conversationAMessages = [];
    fetchChatRunStatus.mockResolvedValue(null);
    fetchVelaLoginStatus.mockResolvedValue({ loggedIn: true });
    const onArmAmrAuthRetryContinuation = vi.fn();
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
      {
        onOpenAmrSettings: vi.fn(),
        onArmAmrAuthRetryContinuation,
      },
    );

    await waitFor(() => expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'));
    await waitFor(() => expect(screen.getByTestId('send-message')).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('workspace-authorize')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-authorize'));

    expect(onArmAmrAuthRetryContinuation).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
  });

  it('routes Chat retry and terminal launch recovery for antigravity auth failures', async () => {
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
    await waitFor(() => expect(screen.getByTestId('chat-retry')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-launch-terminal'));
    await waitFor(() => expect(launchAntigravityOauth).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('chat-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
  });

  it('routes Chat retry and terminal launch recovery for antigravity rate limits', async () => {
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
    await waitFor(() => expect(screen.getByTestId('chat-retry')).toBeTruthy());

    fireEvent.click(screen.getByTestId('workspace-launch-terminal'));
    await waitFor(() => expect(launchAntigravityOauth).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('chat-retry'));
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
    await waitFor(() => expect(screen.getByTestId('chat-retry')).toBeTruthy());
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
    onOpenSettings?: (section?: SettingsSection) => void;
    onOpenAmrSettings?: () => void;
    onArmAmrAuthRetryContinuation?: (
      continuation: Omit<AmrAuthRetryContinuation, 'accountIdAtArm' | 'createdAtMs'>,
    ) => void;
  } = {},
) {
  return render(projectViewElement(renderConfig, renderProject, renderAgents, handlers));
}

function projectViewElement(
  renderConfig = config,
  renderProject: Project = project,
  renderAgents: AgentInfo[] = [
    { id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] },
    { id: 'byok-opencode', name: 'BYOK OpenCode', bin: 'opencode', available: true, models: [] },
  ],
  handlers: {
    onModeChange?: (mode: 'daemon' | 'api') => void;
    onAgentChange?: (agentId: string) => void;
    onOpenSettings?: (section?: SettingsSection) => void;
    onOpenAmrSettings?: () => void;
    onArmAmrAuthRetryContinuation?: (
      continuation: Omit<AmrAuthRetryContinuation, 'accountIdAtArm' | 'createdAtMs'>,
    ) => void;
  } = {},
) {
  return (
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
      onOpenSettings={handlers.onOpenSettings ?? (() => {})}
      onOpenAmrSettings={handlers.onOpenAmrSettings}
      onArmAmrAuthRetryContinuation={handlers.onArmAmrAuthRetryContinuation}
      onBack={() => {}}
      onClearPendingPrompt={() => {}}
      onTouchProject={() => {}}
      onProjectChange={() => {}}
      onProjectsRefresh={() => {}}
    />
  );
}
