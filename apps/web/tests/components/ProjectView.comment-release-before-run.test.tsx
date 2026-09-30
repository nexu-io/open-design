// @vitest-environment jsdom
/**
 * A saved comment handed to the agent is written 'applying' when its send is
 * queued, which is before any run exists. These cases pin the other half of
 * that reservation: every way a queued send can end without a run puts the
 * comments it carried back to 'open', so the comment list shows them again.
 *
 * The runs that do start, and then fail or are stopped, are pinned in
 * `ProjectView.api-empty-response.test.tsx`. The harness here is the one from
 * `opend-2614-send-paints-before-preflight.test.tsx`, because the paths in
 * question sit behind the OpenDesign Cloud pre-run gate and the send queue.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { streamViaDaemon } from '../../src/providers/daemon';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import {
  deletePreviewComment,
  fetchPreviewComments,
  fetchProjectFiles,
  patchPreviewCommentStatus,
} from '../../src/providers/registry';
import { fetchBrands } from '../../src/runtime/brands';
import type {
  AgentInfo,
  AppConfig,
  ChatCommentAttachment,
  ChatMessage,
  Conversation,
  DesignSystemSummary,
  PreviewComment,
  Project,
  SkillSummary,
} from '../../src/types';

const PROJECT_ID = 'comment-release-project';
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const TEAM_MEMBER = 'member-sender';
const PROMPT = 'draft a landing page';

const CALLER_CONTEXT: WorkspaceCollabContext = {
  workspaceId: TEAM_WORKSPACE,
  workspaceType: 'team',
  workspaceMemberId: TEAM_MEMBER,
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team_pro',
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
} as WorkspaceCollabContext;

const workspaceScopeMocks = vi.hoisted(() => ({
  projectScope: { loading: true, scope: null } as ProjectWorkspaceScopeState,
  ambientContext: null as WorkspaceCollabContext | null,
  billingResponse: null as unknown,
}));
const savedCommentAttachment = vi.hoisted(
  () => ({
    id: 'comment-1',
    order: 1,
    filePath: 'index.html',
    elementId: 'hero-title',
    selector: '#hero-title',
    label: 'Hero title',
    comment: 'Make this clearer',
    currentText: 'Old title',
    pagePosition: { x: 0, y: 0, width: 100, height: 24 },
    htmlHint: '<h1 id="hero-title">Old title</h1>',
    source: 'saved-comment',
  }) as ChatCommentAttachment,
);
const projectCollabMocks = vi.hoisted(() => ({
  writerAuthority: 'allowed' as 'allowed' | 'denied' | 'pending',
  viewerOnly: false,
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({ navigate: vi.fn() }));

vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspaceScopeMocks.ambientContext,
    loading: false,
  }),
  useWorkspaceBillingResponse: () => workspaceScopeMocks.billingResponse,
}));

vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspaceScopeMocks.projectScope,
}));

vi.mock('../../src/collab/useProjectCollab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectCollab')>()),
  useProjectCollab: () => ({
    enabled: true,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: projectCollabMocks.viewerOnly,
    writerAuthority: projectCollabMocks.writerAuthority,
    isOwner: projectCollabMocks.writerAuthority === 'allowed',
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => undefined,
    requestPublish: () => undefined,
    refreshPresence: () => undefined,
    checkStatusNow: () => undefined,
  }),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  formatVelaBalanceUsd: (value: string | null) => `$${value ?? '0'}`,
  fetchVelaLoginStatus: vi.fn().mockResolvedValue({ loggedIn: true }),
  startVelaLogin: vi.fn(),
  cancelVelaLogin: vi.fn(),
  canUpgradeVelaPlan: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/runtime/amr-balance-gate', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/amr-balance-gate')>(
    '../../src/runtime/amr-balance-gate',
  );
  return { ...actual, checkAmrBalanceGate: vi.fn().mockResolvedValue({ kind: 'allow' }) };
});

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/runtime/amr-low-balance-plan', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/runtime/amr-low-balance-plan')
  >('../../src/runtime/amr-low-balance-plan');
  return { ...actual, resolveAmrPlan: vi.fn().mockResolvedValue('pro') };
});

vi.mock('../../src/runtime/brands', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/brands')>(
    '../../src/runtime/brands',
  );
  return { ...actual, fetchBrands: vi.fn().mockResolvedValue([]) };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn().mockResolvedValue([]),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    persistTabsToDaemonNow: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: (props: {
    previewComments?: PreviewComment[];
    onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[]) => unknown;
  }) => (
    <div
      data-testid="file-workspace"
      data-preview-comments={(props.previewComments ?? [])
        .map((comment) => `${comment.id}:${comment.status}`)
        .join(',')}
    >
      <button
        type="button"
        data-testid="send-comment-to-chat"
        onClick={() => void props.onSendBoardCommentAttachments?.([savedCommentAttachment])}
      >
        send to chat
      </button>
    </div>
  ),
}));
vi.mock('../../src/components/AmrBalanceDialog', () => ({
  AmrBalanceDialog: (props: { onClose: () => void; onResolved: () => void }) => (
    <div data-testid="balance-dialog">
      <button type="button" data-testid="balance-dialog-dismiss" onClick={props.onClose}>
        dismiss
      </button>
      <button type="button" data-testid="balance-dialog-resolved" onClick={props.onResolved}>
        resolved
      </button>
    </div>
  ),
}));
vi.mock('../../src/components/chat/AmrOwnerTopUpDialog', () => ({
  AmrOwnerTopUpDialog: (props: { onClose: () => void }) => (
    <div data-testid="balance-dialog">
      <button type="button" data-testid="balance-dialog-dismiss" onClick={props.onClose}>
        dismiss
      </button>
    </div>
  ),
}));
vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

/**
 * The real ChatPane brings half the app with it. This stand-in reports the
 * queue and the in-progress state, and exposes the queue row actions.
 */
vi.mock('../../src/components/ChatPane', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/components/ChatPane')>()),
  ChatPane: (props: {
    messages?: ChatMessage[];
    streaming?: boolean;
    sendDisabled?: boolean;
    onStop?: () => void;
    queuedItems?: Array<{
      id: string;
      prompt: string;
      attachments?: [];
      commentAttachments?: ChatCommentAttachment[];
    }>;
    onRemoveQueuedSend?: (id: string) => void;
    onUpdateQueuedSend?: (
      id: string,
      update: { prompt: string; attachments: []; commentAttachments: ChatCommentAttachment[] },
    ) => void;
    onSend?: (
      prompt: string,
      attachments: [],
      commentAttachments: ChatCommentAttachment[],
    ) => unknown;
  }) => {
    const firstQueued = props.queuedItems?.[0];
    return (
      <div>
        <div data-testid="streaming">{props.streaming ? 'yes' : 'no'}</div>
        <div data-testid="queued-count">{props.queuedItems?.length ?? 0}</div>
        <button
          type="button"
          data-testid="normal-send"
          disabled={props.sendDisabled}
          onClick={() => props.onSend?.(PROMPT, [], [])}
        >
          send
        </button>
        <button
          type="button"
          data-testid="send-with-comment"
          disabled={props.sendDisabled}
          onClick={() => props.onSend?.(PROMPT, [], [savedCommentAttachment])}
        >
          send with comment
        </button>
        <button type="button" data-testid="stop" onClick={() => props.onStop?.()}>
          stop
        </button>
        <button
          type="button"
          data-testid="remove-first-queued"
          onClick={() => {
            if (firstQueued) props.onRemoveQueuedSend?.(firstQueued.id);
          }}
        >
          remove queued
        </button>
        <button
          type="button"
          data-testid="strip-comments-from-first-queued"
          onClick={() => {
            if (!firstQueued) return;
            props.onUpdateQueuedSend?.(firstQueued.id, {
              prompt: firstQueued.prompt,
              attachments: [],
              commentAttachments: [],
            });
          }}
        >
          edit queued
        </button>
      </div>
    );
  },
}));

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedFetchBrands = vi.mocked(fetchBrands);
const mockedPatchPreviewCommentStatus = vi.mocked(patchPreviewCommentStatus);
const mockedDeletePreviewComment = vi.mocked(deletePreviewComment);

/** AMR on a daemon runtime — 报告里的那套配置(Agent 为 OpenDesign)。 */
const config: AppConfig = {
  mode: 'daemon',
  apiProtocol: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'deepseek-v4-flash',
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
};

const conversation = (projectId: string): Conversation => ({
  id: `conv-${projectId}`,
  projectId,
  title: null,
  createdAt: 1,
  updatedAt: 1,
});

const project = (): Project => ({
  id: PROJECT_ID,
  name: 'Caustic Pool',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  metadata: { kind: 'prototype' },
  workspaceId: TEAM_WORKSPACE,
});

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return new Response(JSON.stringify({ context: CALLER_CONTEXT }), { status: 200 });
      }
      if (url.includes('/workspace-scope')) {
        return new Promise<Response>(() => {});
      }
      return new Response('{}', { status: 200 });
    }),
  );
}

function renderProjectView() {
  return render(
    <ProjectView
      project={project()}
      routeFileName={null}
      config={config}
      agents={[{ id: 'amr', name: 'amr', available: true }] as unknown as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

const CONVERSATION_ID = `conv-${PROJECT_ID}`;

const savedComment: PreviewComment = {
  id: 'comment-1',
  projectId: PROJECT_ID,
  conversationId: CONVERSATION_ID,
  filePath: 'index.html',
  elementId: 'hero-title',
  selector: '#hero-title',
  label: 'Hero title',
  text: 'Old title',
  position: { x: 0, y: 0, width: 100, height: 24 },
  htmlHint: '<h1 id="hero-title">Old title</h1>',
  note: 'Make this clearer',
  status: 'open',
  createdAt: 1,
  updatedAt: 1,
};

const walletSnapshot = {
  status: 'available',
  profile: 'prod',
  user: { plan: 'pro' },
  balanceUsd: '0',
  updatedAt: null,
  fetchedAt: '2026-09-29T00:00:00.000Z',
  stale: false,
  source: 'vela_api',
};

type GateResult = Awaited<ReturnType<typeof checkAmrBalanceGate>>;

const EMPTY_WALLET = { kind: 'hard', reason: 'insufficient', snapshot: walletSnapshot } as GateResult;
const SIGNED_OUT = { kind: 'hard', reason: 'signed_out', snapshot: walletSnapshot } as GateResult;
const UNREADABLE_BILLING = { kind: 'unavailable' } as GateResult;

function deferredGate() {
  let settle: (result: GateResult) => void = () => {};
  let fail: (error: Error) => void = () => {};
  mockedCheckAmrBalanceGate.mockReturnValue(
    new Promise<GateResult>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    }),
  );
  return { settle: (result: GateResult) => settle(result), fail: (error: Error) => fail(error) };
}

function listedComments() {
  return screen.getByTestId('file-workspace').getAttribute('data-preview-comments');
}

function writtenStatuses() {
  return mockedPatchPreviewCommentStatus.mock.calls.map((call) => call[3]);
}

async function renderWithSavedComment() {
  renderProjectView();
  await waitFor(() => expect(listedComments()).toBe('comment-1:open'));
  await waitFor(() =>
    expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
  );
}

async function sendCommentToChat() {
  fireEvent.click(screen.getByTestId('send-comment-to-chat'));
  await waitFor(() => expect(listedComments()).toBe('comment-1:applying'));
}

async function expectCommentReleasedToOpen() {
  await waitFor(() => expect(listedComments()).toBe('comment-1:open'));
  expect(mockedPatchPreviewCommentStatus).toHaveBeenLastCalledWith(
    PROJECT_ID,
    CONVERSATION_ID,
    'comment-1',
    'open',
    expect.anything(),
  );
  expect(writtenStatuses()).not.toContain('failed');
  expect(writtenStatuses()).not.toContain('needs_review');
  expect(mockedDeletePreviewComment).not.toHaveBeenCalled();
  expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
}

describe('a saved comment whose queued send never becomes a run', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    stubFetch();
    mockedListConversations.mockImplementation(async (projectId: string) => [
      conversation(projectId),
    ]);
    mockedCreateConversation.mockImplementation(async (projectId: string) =>
      conversation(projectId),
    );
    mockedListMessages.mockResolvedValue([]);
    mockedFetchProjectFiles.mockResolvedValue([]);
    mockedFetchBrands.mockResolvedValue([]);
    mockedStreamViaDaemon.mockResolvedValue(undefined);
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    workspaceScopeMocks.billingResponse = null;
    projectCollabMocks.writerAuthority = 'allowed';
    projectCollabMocks.viewerOnly = false;
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    // The registry double keeps the one status the daemon would hold, so a
    // refresh reads back whatever was written last.
    let storedStatus: PreviewComment['status'] = 'open';
    mockedFetchPreviewComments.mockImplementation(async () => [
      { ...savedComment, status: storedStatus },
    ]);
    mockedPatchPreviewCommentStatus.mockImplementation(
      async (_project, _conversation, _id, status) => {
        storedStatus = status;
        return { ...savedComment, status };
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  it('control: holds the comment as applying once its run starts', async () => {
    await renderWithSavedComment();

    await sendCommentToChat();

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    expect(listedComments()).toBe('comment-1:applying');
    expect(writtenStatuses()).not.toContain('open');
  });

  it.each([
    ['the wallet is empty', EMPTY_WALLET],
    ['the account is signed out', SIGNED_OUT],
    ['the billing read is unavailable', UNREADABLE_BILLING],
  ])('returns the comment to open when the pre-run gate holds the send because %s', async (_name, result) => {
    const gate = deferredGate();
    await renderWithSavedComment();
    await sendCommentToChat();
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));

    gate.settle(result);

    await expectCommentReleasedToOpen();
  });

  it('leaves the comment open when the user dismisses the balance dialog', async () => {
    mockedCheckAmrBalanceGate.mockResolvedValue(EMPTY_WALLET);
    await renderWithSavedComment();
    fireEvent.click(screen.getByTestId('send-comment-to-chat'));
    await screen.findByTestId('balance-dialog');

    fireEvent.click(screen.getByTestId('balance-dialog-dismiss'));

    await waitFor(() => expect(screen.queryByTestId('balance-dialog')).toBeNull());
    await expectCommentReleasedToOpen();
  });

  it('holds the comment again when the held send resumes and its run starts', async () => {
    mockedCheckAmrBalanceGate.mockResolvedValueOnce(SIGNED_OUT);
    await renderWithSavedComment();
    fireEvent.click(screen.getByTestId('send-comment-to-chat'));
    await screen.findByTestId('balance-dialog-resolved');
    await waitFor(() => expect(listedComments()).toBe('comment-1:open'));

    fireEvent.click(screen.getByTestId('balance-dialog-resolved'));

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listedComments()).toBe('comment-1:applying'));
    expect(screen.getByTestId('queued-count').textContent).toBe('0');
  });

  it('returns the comment to open when the user stops before the run is created', async () => {
    const gate = deferredGate();
    await renderWithSavedComment();
    await sendCommentToChat();
    await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('yes'));

    fireEvent.click(screen.getByTestId('stop'));
    await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('no'));
    gate.settle({ kind: 'allow' });

    await expectCommentReleasedToOpen();
    // Releasing the comment must not send the stopped turn off again.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1);
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
  });

  it('returns the comment to open when the send throws before the run is created', async () => {
    const gate = deferredGate();
    await renderWithSavedComment();
    await sendCommentToChat();
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));

    gate.fail(new Error('wallet endpoint unreachable'));

    await expectCommentReleasedToOpen();
  });

  describe('while an earlier run keeps the send waiting in the queue', () => {
    async function queueCommentBehindRunningTurn() {
      await renderWithSavedComment();
      fireEvent.click(screen.getByTestId('normal-send'));
      await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
      await sendCommentToChat();
      await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
      mockedStreamViaDaemon.mockClear();
    }

    it('returns the comment to open when the user removes the send from the queue', async () => {
      await queueCommentBehindRunningTurn();

      fireEvent.click(screen.getByTestId('remove-first-queued'));

      await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('0'));
      await expectCommentReleasedToOpen();
    });

    it('returns the comment to open when an edit takes it off the queued send', async () => {
      await queueCommentBehindRunningTurn();

      fireEvent.click(screen.getByTestId('strip-comments-from-first-queued'));

      await expectCommentReleasedToOpen();
      expect(screen.getByTestId('queued-count').textContent).toBe('1');
    });

    it('control: keeps the comment applying while its send only waits for the running turn', async () => {
      await queueCommentBehindRunningTurn();

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(listedComments()).toBe('comment-1:applying');
      expect(writtenStatuses()).not.toContain('open');
    });
  });

  it('never marks the comment applying when a composer send is held by the pre-run gate', async () => {
    mockedCheckAmrBalanceGate.mockResolvedValue(UNREADABLE_BILLING);
    await renderWithSavedComment();

    fireEvent.click(screen.getByTestId('send-with-comment'));

    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
    expect(listedComments()).toBe('comment-1:open');
    expect(writtenStatuses()).not.toContain('applying');
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
  });
});
