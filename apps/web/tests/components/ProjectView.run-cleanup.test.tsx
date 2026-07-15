// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectView,
  clearStreamingConversationMarker,
  finalizeActiveAssistantMessagesOnStop,
  findExistingArtifactProjectFile,
  findExistingNonHtmlArtifactProjectFile,
  findSameTurnNonHtmlWriteForRecoveredArtifact,
  hasRecoverableArtifactMessage,
  resolveRetryTarget,
  resolveSucceededRunStatus,
  selectPrimaryProjectFile,
  shouldClearActiveRunRefs,
  shouldReplayTerminalRunMessage,
} from '../../src/components/ProjectView';
import {
  BRAND_BROWSER_TAB_ID,
  registerBrandBrowser,
} from '../../src/runtime/brand-browser-bridge';
import type { Artifact, ChatMessage, ProjectFile } from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const patchPreviewCommentStatus = vi.fn();
const saveTabs = vi.fn();
const writeProjectTextFile = vi.fn();
const fetchProjectFileText = vi.fn();
const cancelBrandExtraction = vi.fn();
const continueBrandExtraction = vi.fn();
const originalFetch = globalThis.fetch;

const replayArtifact: Artifact = {
  identifier: 'real-daemon-smoke',
  artifactType: 'text/html',
  title: 'Real Daemon Smoke',
  html: '<!doctype html><html><body><h1>Real Daemon Smoke</h1></body></html>',
};

function artifactProjectFile(name: string, mtime: number): ProjectFile {
  return {
    artifactManifest: {
      entry: name,
      exports: ['html'],
      kind: 'html',
      metadata: {
        artifactType: 'text/html',
        identifier: 'real-daemon-smoke',
        inferred: false,
      },
      renderer: 'html',
      title: 'Real Daemon Smoke',
      version: 1,
    },
    kind: 'html',
    mime: 'text/html',
    mtime,
    name,
    size: 100,
  };
}

function projectFile(
  name: string,
  kind: ProjectFile['kind'],
  mtime: number,
  artifactManifest?: ProjectFile['artifactManifest'],
): ProjectFile {
  return {
    artifactManifest,
    kind,
    mime: kind === 'html' ? 'text/html' : 'application/octet-stream',
    mtime,
    name,
    size: 100,
  };
}

async function createGenericDisconnectError() {
  const { createGenericDaemonDisconnectError } = await import('../../src/providers/daemon');
  return createGenericDaemonDisconnectError();
}

async function createCodeOnlyGenericDisconnectError(message = 'code-only generic disconnect') {
  const { GENERIC_DAEMON_DISCONNECT_CODE } = await import('../../src/providers/daemon');
  const error = new Error(message) as Error & { code?: string };
  error.code = GENERIC_DAEMON_DISCONNECT_CODE;
  return error;
}

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

vi.mock('../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/daemon')>(
    '../../src/providers/daemon',
  );
  return {
    ...actual,
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
  };
});

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) => fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchProjectFileText: (...args: unknown[]) => fetchProjectFileText(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: (...args: unknown[]) => patchPreviewCommentStatus(...args),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: (...args: unknown[]) => writeProjectTextFile(...args),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/runtime/brands', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/brands')>('../../src/runtime/brands');
  return {
    ...actual,
    cancelBrandExtraction: (...args: unknown[]) => cancelBrandExtraction(...args),
    continueBrandExtraction: (...args: unknown[]) => continueBrandExtraction(...args),
  };
});

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
  cacheTabsLocally: (_projectId: string, state: unknown) => state,
  persistTabsToDaemonNow: vi.fn(),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

const chatPaneSpy = vi.fn();
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: Record<string, unknown>) => {
    chatPaneSpy(props);
    return (
      <div className="pane">
        <div className={`chat-log-wrap${props.chatLogTray ? ' has-chat-log-tray' : ''}`}>
          {props.chatLogTray as ComponentProps<'div'>['children']}
        </div>
      </div>
    );
  },
}));

const fileWorkspaceSpy = vi.fn();
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: (props: Record<string, unknown>) => {
    fileWorkspaceSpy(props);
    return null;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

async function waitForReadyChatPaneProps() {
  await waitFor(() => {
    expect(chatPaneSpy).toHaveBeenCalled();
    expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
  });
  return chatPaneSpy.mock.calls.at(-1)?.[0] as {
    onBrandBrowserAssistConfirm?: (card: {
      brandId: string;
      browserTabId?: string;
      reason?: string;
      url?: string;
    }) => Promise<{ ok: boolean; action?: string; message?: string } | void> | { ok: boolean; action?: string; message?: string } | void;
    onContinueBrandExtraction?: () => void;
    onSend?: (prompt: string, attachments: unknown[], comments: unknown[]) => Promise<void>;
    initialDraft?: string;
  };
}

describe('terminal replay artifact recovery', () => {
  it('only reuses existing artifacts created at or after the current run started', () => {
    const runCreatedAt = 1_000;
    const stale = artifactProjectFile('real-daemon-smoke.html', runCreatedAt - 1);
    const current = artifactProjectFile('real-daemon-smoke-2.html', runCreatedAt + 1);

    expect(findExistingArtifactProjectFile(replayArtifact, [stale], { minMtime: runCreatedAt }))
      .toBeNull();
    expect(findExistingArtifactProjectFile(replayArtifact, [stale, current], { minMtime: runCreatedAt }))
      .toBe(current);
  });

  it('only reuses html pointer targets created at or after the current run started', () => {
    const runCreatedAt = 1_000;
    const pointerArtifact: Artifact = {
      identifier: 'real-daemon-smoke',
      artifactType: 'text/html',
      title: 'Real Daemon Smoke',
      html: 'See index.html',
    };
    const staleTarget = projectFile('index.html', 'html', runCreatedAt - 1);
    const currentTarget = projectFile('index.html', 'html', runCreatedAt + 1);

    expect(
      findExistingArtifactProjectFile(
        pointerArtifact,
        [staleTarget],
        { minMtime: runCreatedAt },
      ),
    ).toBeNull();
    expect(
      findExistingArtifactProjectFile(
        pointerArtifact,
        [staleTarget, currentTarget],
        { minMtime: runCreatedAt },
      ),
    ).toBe(currentTarget);
  });

  it('reuses same-turn non-html artifact files with their declared extension after content matches', async () => {
    const cssArtifact: Artifact = {
      identifier: 'theme',
      artifactType: 'text/css',
      title: 'Theme',
      html: 'body { color: red; }',
    };
    const cssFile = projectFile('theme.css', 'code', 1_000);

    expect(findExistingArtifactProjectFile(cssArtifact, [cssFile])).toBeNull();
    expect(findExistingNonHtmlArtifactProjectFile(cssArtifact, [cssFile])).toBeNull();
    await expect(
      findSameTurnNonHtmlWriteForRecoveredArtifact({
        artifact: cssArtifact,
        producedFiles: [cssFile],
        readProjectText: async () => 'body { color: red; }',
      }),
    ).resolves.toBe(cssFile);
  });

  it('reuses same-turn non-html artifact files with collision suffixes after content matches', async () => {
    const cssArtifact: Artifact = {
      identifier: '',
      artifactType: 'text/css',
      title: 'Theme',
      html: 'body { color: red; }',
    };
    const cssFile = projectFile('theme-2.css', 'code', 1_000);

    expect(findExistingArtifactProjectFile(cssArtifact, [cssFile])).toBeNull();
    expect(findExistingNonHtmlArtifactProjectFile(cssArtifact, [cssFile])).toBeNull();
    await expect(
      findSameTurnNonHtmlWriteForRecoveredArtifact({
        artifact: cssArtifact,
        producedFiles: [cssFile],
        readProjectText: async () => 'body { color: red; }',
      }),
    ).resolves.toBe(cssFile);
  });

  it('does not reuse same-turn non-html filename matches when contents differ', async () => {
    const cssArtifact: Artifact = {
      identifier: '',
      artifactType: 'text/css',
      title: 'Theme',
      html: 'body { color: red; }',
    };
    const cssFile = projectFile('theme.css', 'code', 1_000);

    await expect(
      findSameTurnNonHtmlWriteForRecoveredArtifact({
        artifact: cssArtifact,
        producedFiles: [cssFile],
        readProjectText: async () => 'body { color: blue; }',
      }),
    ).resolves.toBeNull();
  });

  it('reuses same-turn non-html collision suffixes only when contents match', async () => {
    const cssArtifact: Artifact = {
      identifier: '',
      artifactType: 'text/css',
      title: 'Theme',
      html: 'body { color: red; }',
    };
    const cssFile = projectFile('theme-2.css', 'code', 1_000);

    await expect(
      findSameTurnNonHtmlWriteForRecoveredArtifact({
        artifact: cssArtifact,
        producedFiles: [cssFile],
        readProjectText: async () => 'body { color: red; }',
      }),
    ).resolves.toBe(cssFile);
  });

  it('does not reuse same-turn html files before checking recovered content', () => {
    const htmlArtifact: Artifact = {
      identifier: 'landing',
      artifactType: 'text/html',
      title: 'Landing',
      html: '<!doctype html><html><body>final artifact</body></html>',
    };
    const sameNameHtmlFile = projectFile('landing.html', 'html', 1_000);

    expect(findExistingArtifactProjectFile(htmlArtifact, [sameNameHtmlFile]))
      .toBe(sameNameHtmlFile);
    expect(findExistingNonHtmlArtifactProjectFile(htmlArtifact, [sameNameHtmlFile]))
      .toBeNull();
  });

  it('treats standalone HTML terminal assistant messages as recoverable', () => {
    expect(
      hasRecoverableArtifactMessage({
        id: 'msg-standalone-html',
        role: 'assistant',
        content:
          '<!doctype html><html><head><title>Standalone</title></head>' +
          '<body><h1>Standalone</h1><p>Recovered artifact output.</p></body></html>',
        createdAt: Date.now(),
        runId: 'run-standalone-html',
        runStatus: 'succeeded',
        producedFiles: [],
      }),
    ).toBe(true);
  });
});

describe('selectPrimaryProjectFile', () => {
  it('prefers explicit primary manifests over newer renderable files', () => {
    const newer = projectFile('preview.html', 'html', 2_000);
    const primary = projectFile('index.html', 'html', 1_000, {
      entry: 'index.html',
      exports: ['html'],
      kind: 'html',
      primary: true,
      renderer: 'html',
      title: 'Index',
      version: 1,
    });

    expect(selectPrimaryProjectFile([newer, primary])).toBe(primary);
  });

  it('ignores sidecar manifest files when choosing a fallback', () => {
    const sidecar = projectFile('index.html.artifact.json', 'text', 2_000);
    const html = projectFile('index.html', 'html', 1_000);

    expect(selectPrimaryProjectFile([sidecar, html])).toBe(html);
  });
});

describe('retry target resolution', () => {
  const userMessage: ChatMessage = {
    id: 'user-1',
    role: 'user',
    content: 'Create a login page',
    createdAt: 1,
  };
  const failedAssistant: ChatMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Generation failed',
    createdAt: 2,
    runStatus: 'failed',
  };

  it('returns the prior transcript and original user turn for the last failed assistant', () => {
    const systemContext: ChatMessage = {
      id: 'assistant-0',
      role: 'assistant',
      content: 'Earlier result',
      createdAt: 0,
      runStatus: 'succeeded',
    };

    expect(resolveRetryTarget([systemContext, userMessage, failedAssistant], failedAssistant.id)).toEqual({
      failedAssistant,
      userMsg: userMessage,
      priorMessages: [systemContext],
      preservedAttempts: [failedAssistant],
    });
  });

  it('keeps earlier delivery-failure retry attempts visible while reusing the original user turn', () => {
    const firstFailure: ChatMessage = {
      ...failedAssistant,
      id: 'assistant-1',
      content: 'First attempt produced partial output',
      runStatus: 'succeeded',
      resultDeliveryState: 'no_result',
      events: [{ kind: 'text', text: 'thinking before failure' }],
      producedFiles: [
        {
          name: 'partial.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 100,
        },
      ],
    };
    const secondFailure: ChatMessage = {
      ...failedAssistant,
      id: 'assistant-2',
      content: 'Retry failed too',
      runStatus: 'succeeded',
      resultDeliveryState: 'delivery_failed',
    };

    expect(resolveRetryTarget([userMessage, firstFailure, secondFailure], secondFailure.id)).toEqual({
      failedAssistant: secondFailure,
      userMsg: userMessage,
      priorMessages: [],
      preservedAttempts: [firstFailure, secondFailure],
    });
  });

  it('rejects non-terminal, non-last, or non-user-preceded retry targets', () => {
    expect(resolveRetryTarget([userMessage, { ...failedAssistant, runStatus: 'running' }], failedAssistant.id))
      .toBeNull();
    expect(resolveRetryTarget([userMessage, failedAssistant, { ...userMessage, id: 'user-2' }], failedAssistant.id))
      .toBeNull();
    expect(resolveRetryTarget([failedAssistant], failedAssistant.id)).toBeNull();
  });
});

describe('ProjectView daemon cleanup', () => {
  beforeEach(() => {
    listProjectRuns.mockResolvedValue([]);
    cancelBrandExtraction.mockResolvedValue({ ok: true, status: 'failed' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    window.sessionStorage.clear();
  });

  it('does not abort daemon cancel reattach controllers during unmount cleanup', async () => {
    let seenCancelSignal: { aborted: boolean } | null = null;
    let seenSignal: { aborted: boolean } | null = null;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'working',
        createdAt: Date.now(),
        runId: 'run-1',
        runStatus: 'running',
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-1',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async (options: { signal: { aborted: boolean }; cancelSignal?: { aborted: boolean } }) => {
      seenSignal = options.signal;
      seenCancelSignal = options.cancelSignal ?? null;
      return new Promise<void>(() => {});
    });

    const view = render(
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(seenSignal).not.toBeNull();
    expect(seenCancelSignal).not.toBeNull();

    view.unmount();

    if (!seenSignal || !seenCancelSignal) throw new Error('Expected reattach signals to be captured');
    expect((seenSignal as any).aborted).toBe(true);
    expect((seenCancelSignal as any).aborted).toBe(false);
  });

  it('marks successful daemon completion as succeeded even before runId reaches message state', () => {
    expect(resolveSucceededRunStatus('running')).toBe('succeeded');
    expect(resolveSucceededRunStatus('queued')).toBe('succeeded');
    expect(resolveSucceededRunStatus(undefined)).toBe('succeeded');
    expect(resolveSucceededRunStatus('failed')).toBe('failed');
    expect(resolveSucceededRunStatus('canceled')).toBe('canceled');
  });

  it('replays an unverified terminal Design-mode result after reload', () => {
    expect(
      shouldReplayTerminalRunMessage({
        id: 'msg-unverified-delivery',
        role: 'assistant',
        content: 'I finished the design.',
        runId: 'run-unverified-delivery',
        runStatus: 'succeeded',
        sessionMode: 'design',
        startedAt: 1,
      }),
    ).toBe(true);
    expect(
      shouldReplayTerminalRunMessage({
        id: 'msg-chat-answer',
        role: 'assistant',
        content: 'Here is the answer.',
        runId: 'run-chat-answer',
        runStatus: 'succeeded',
        sessionMode: 'chat',
        startedAt: 1,
      }),
    ).toBe(false);
  });

  // Regression: a phantom 'running' row in DB (no runId, no matching active
  // daemon run) used to stick the UI on "Waiting for first output —
  // Working 24m+" forever. The reattach loop now self-heals by marking
  // such a message as failed so the composer is interactive again.
  //
  // TODO(reconcile): re-add the three unit tests for
  // finalizeActiveAssistantMessagesOnStop / clearStreamingConversationMarker /
  // shouldClearActiveRunRefs that landed on main alongside this hunk —
  // they were dropped at merge because their bodies sat on top of HEAD's
  // self-heals fixture and the test body that follows uses the
  // `startedAt` variable declared only in this `it()` opener.
  it('self-heals running messages with no runId when daemon has no active run', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-phantom',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    render(
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(listActiveChatRuns).toHaveBeenCalled());
    await waitFor(() => {
      const failedCall = saveMessage.mock.calls.find(
        (call) =>
          call[2]?.id === 'msg-phantom' && call[2]?.runStatus === 'failed',
      );
      expect(failedCall).toBeTruthy();
    });
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('persists a delayed daemon run id after switching projects so returning can reattach', async () => {
    const projectOne = { id: 'project-1', name: 'Project One', skillId: null, designSystemId: null };
    const projectTwo = { id: 'project-2', name: 'Project Two', skillId: null, designSystemId: null };
    const messagesByConversation = new Map<string, ChatMessage[]>([
      ['conv-1', []],
      ['conv-2', []],
    ]);

    listConversations.mockImplementation(async (projectId: string) => [
      projectId === 'project-1'
        ? { id: 'conv-1', title: 'Conversation 1' }
        : { id: 'conv-2', title: 'Conversation 2' },
    ]);
    listMessages.mockImplementation(async (_projectId: string, conversationId: string) =>
      messagesByConversation.get(conversationId) ?? [],
    );
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-delayed',
      status: 'running',
      createdAt: 1,
      updatedAt: 1,
      exitCode: null,
      signal: null,
    });
    saveMessage.mockImplementation(async (_projectId: string, conversationId: string, message: ChatMessage) => {
      const existing = messagesByConversation.get(conversationId) ?? [];
      const next = existing.filter((item) => item.id !== message.id);
      next.push(message);
      messagesByConversation.set(conversationId, next);
      return message;
    });
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));

    let capturedRunCreated: ((runId: string) => void) | null = null;
    let capturedStreamSignal: AbortSignal | null = null;
    let capturedCancelSignal: AbortSignal | null = null;
    let capturedAssistantMessageId: string | null = null;
    streamViaDaemon.mockImplementation(async (options: {
      assistantMessageId?: string;
      signal: AbortSignal;
      cancelSignal?: AbortSignal;
      onRunCreated?: (runId: string) => void;
    }) => {
      capturedRunCreated = options.onRunCreated ?? null;
      capturedStreamSignal = options.signal;
      capturedCancelSignal = options.cancelSignal ?? null;
      capturedAssistantMessageId = options.assistantMessageId ?? null;
      return new Promise<void>(() => {});
    });

    const view = render(
      <ProjectView
        project={projectOne as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps.onSend!('keep running', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(capturedRunCreated).not.toBeNull();

    view.rerender(
      <ProjectView
        project={projectTwo as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect((capturedStreamSignal as AbortSignal | null)?.aborted).toBe(true));
    expect((capturedCancelSignal as AbortSignal | null)?.aborted).toBe(false);

    capturedRunCreated!('run-delayed');

    await waitFor(() => {
      const persistedAssistant = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-1' &&
          call[1] === 'conv-1' &&
          call[2]?.id === capturedAssistantMessageId &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-delayed' &&
          call[2]?.runStatus === 'queued',
      );
      expect(persistedAssistant).toBeTruthy();
    });

    view.rerender(
      <ProjectView
        project={projectOne as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(reattachDaemonRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-delayed' }),
      );
    });
  });

  // Regression: when a project is created via PluginLoopHome with the
  // auto-send sessionStorage flag set, ProjectView used to seed
  // ChatComposer.initialDraft with project.pendingPrompt. The composer
  // latched that seed into local state, then auto-send fired the same
  // text as a real user message — leaving the textarea populated while
  // the run streamed. The user reported "好像发送了输入框的 query 还
  // 没有清除". With the fix, auto-send projects must hand the composer
  // an undefined initialDraft so the textarea stays empty; the seed
  // still flows through autoSendSeedRef so the prompt is delivered.
  it('does not seed composer initialDraft when auto-send sessionStorage flag is set', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-2', '1');

    try {
      render(
        <ProjectView
          project={{
            id: 'project-2',
            name: 'Project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: 'design a landing page for a coffee shop',
          } as never}
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
          onProjectsRefresh={() => {}}
        />,
      );

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      const seededCall = chatPaneSpy.mock.calls.find(
        (call) => call[0]?.initialDraft === 'design a landing page for a coffee shop',
      );
      expect(seededCall).toBeUndefined();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-2');
    }
  });

  it('reloads an empty brand-extraction transcript without auto-sending the fallback prompt', async () => {
    const programmaticMessages: ChatMessage[] = [
      {
        id: 'brand-user-1',
        role: 'user',
        content: 'Extract a design system from https://refly.ai/.',
        createdAt: 1,
      },
      {
        id: 'brand-assistant-1',
        role: 'assistant',
        content: 'Programmatic design-system extraction started from https://refly.ai/.',
        createdAt: 1,
        startedAt: 1,
        runStatus: 'running',
      },
    ];
    listConversations.mockResolvedValue([{ id: 'conv-brand', title: 'Conversation' }]);
    listMessages
      .mockResolvedValueOnce([])
      .mockResolvedValue(programmaticMessages);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: ['brand.html'], activeTabId: 'brand.html' });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    window.sessionStorage.setItem('od:auto-send-first:brand-project', '1');

    render(
      <ProjectView
        project={{
          id: 'brand-project',
          name: 'refly.ai Design System',
          skillId: null,
          designSystemId: null,
          pendingPrompt: 'Extract refly.ai into a design system.',
          metadata: {
            kind: 'brand',
            importedFrom: 'brand-extraction',
            brandId: 'refly-ai',
            brandSourceUrl: 'https://refly.ai/',
          },
          createdAt: 1,
          updatedAt: 1,
        } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.messages).toEqual(programmaticMessages);
    });
    expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.streaming).toBe(true);
    expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
    const latestChatPaneProps = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      onStop?: () => void;
    };
    latestChatPaneProps.onStop?.();
    await waitFor(() => expect(cancelBrandExtraction).toHaveBeenCalledWith('refly-ai'));
    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'brand-project',
        'conv-brand',
        expect.objectContaining({
          id: 'brand-assistant-1',
          runStatus: 'canceled',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('od:auto-send-first:brand-project')).toBeNull();
  });

  it('opens browser assist without adding a global download-guide toast', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-brand', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    fileWorkspaceSpy.mockClear();

    render(
      <ProjectView
        project={{
          id: 'brand-project',
          name: 'Refly Design System',
          skillId: null,
          designSystemId: null,
          metadata: {
            kind: 'brand',
            importedFrom: 'brand-extraction',
            brandId: 'refly-ai',
            brandSourceUrl: 'https://refly.ai/',
          },
          createdAt: 1,
          updatedAt: 1,
        } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const chatProps = await waitForReadyChatPaneProps();
    expect(chatProps.onBrandBrowserAssistConfirm).toBeTypeOf('function');

    let result: { ok: boolean; action?: string; message?: string } | void = undefined;
    await act(async () => {
      result = await chatProps.onBrandBrowserAssistConfirm?.({
        brandId: 'refly-ai',
        browserTabId: 'brand-browser-tab',
        reason: 'Cloudflare',
        url: 'https://refly.ai/',
      });
    });

    expect(result).toMatchObject({ ok: true, action: 'opened' });
    await waitFor(() => {
      expect(fileWorkspaceSpy.mock.calls.at(-1)?.[0]?.browserOpenRequest).toMatchObject({
        tabId: 'brand-browser-tab',
        url: 'https://refly.ai/',
        attentionAction: 'download-page',
      });
    });

    expect(document.querySelector('.project-actions-toast-anchor .od-toast')).toBeNull();
  });

  it('anchors continue-extraction snapshot errors in the chat pane', async () => {
    // Continue extraction snapshot failures should stay between the transcript
    // and the composer, without resurrecting the long download-guide details
    // that now live beside the Browser download action.
    listConversations.mockResolvedValue([{ id: 'conv-brand', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);
    // No saved page archive on disk…
    fetchProjectFileText.mockResolvedValue(null);
    // …and the daemon cannot finish programmatically either.
    continueBrandExtraction.mockResolvedValue({ ok: false, error: 'still walled' });

    // A mounted desktop Browser tab whose live DOM and page-snapshot download
    // both fail, so the flow lands on a contained snapshot error toast.
    registerBrandBrowser('brand-project', BRAND_BROWSER_TAB_ID, {
      executeJavaScript: () => null,
      downloadPageSnapshot: async () => ({ ok: false, message: 'snapshot save failed' }),
      getURL: () => 'https://refly.ai/',
      isDesktopWebview: true,
    });

    chatPaneSpy.mockClear();
    fileWorkspaceSpy.mockClear();

    try {
      render(
        <ProjectView
          project={{
            id: 'brand-project',
            name: 'Refly Design System',
            skillId: null,
            designSystemId: null,
            metadata: {
              kind: 'brand',
              importedFrom: 'brand-extraction',
              brandId: 'refly-ai',
              brandSourceUrl: 'https://refly.ai/',
            },
            createdAt: 1,
            updatedAt: 1,
          } as never}
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
          onProjectsRefresh={() => {}}
        />,
      );

      const chatProps = await waitForReadyChatPaneProps();
      expect(chatProps.onContinueBrandExtraction).toBeTypeOf('function');

      await act(async () => {
        chatProps.onContinueBrandExtraction?.();
      });

      const toast = await waitFor(() => {
        const node = document.querySelector('.od-toast');
        expect(node?.textContent).toContain('snapshot save failed');
        return node as HTMLElement;
      });
      expect(toast.textContent).not.toContain('chat.brandBrowserAssistDownloadGuideDetails');
      expect(toast.closest('.project-actions-toast-anchor')).toBeTruthy();
      expect(toast.closest('.split-chat-slot')).toBeTruthy();
      expect(toast.closest('.chat-log-wrap')?.className).toContain('has-chat-log-tray');
    } finally {
      registerBrandBrowser('brand-project', BRAND_BROWSER_TAB_ID, null);
    }
  });

  it('waits for pendingPrompt hydration before consuming an auto-send flag', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    const onClearPendingPrompt = vi.fn();
    window.sessionStorage.setItem('od:auto-send-first:project-hydrating', '1');

    const baseProps = {
      project: {
        id: 'project-hydrating',
        name: 'Ramp.com Design System',
        skillId: null,
        designSystemId: null,
      } as never,
      routeFileName: null,
      config: { mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never,
      agents: [{ id: 'agent-1', name: 'OpenCode', models: [] } as never],
      skills: [],
      designTemplates: [],
      designSystems: [],
      daemonLive: true,
      onModeChange: () => {},
      onAgentChange: () => {},
      onAgentModelChange: () => {},
      onRefreshAgents: () => {},
      onOpenSettings: () => {},
      onBack: () => {},
      onClearPendingPrompt,
      onTouchProject: () => {},
      onProjectChange: () => {},
      onProjectsRefresh: () => {},
    } satisfies ComponentProps<typeof ProjectView>;

    try {
      const view = render(<ProjectView {...baseProps} />);

      await waitFor(() => {
        expect(chatPaneSpy).toHaveBeenCalled();
        expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
      });
      expect(streamViaDaemon).not.toHaveBeenCalled();
      expect(onClearPendingPrompt).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem('od:auto-send-first:project-hydrating')).toBe('1');

      view.rerender(
        <ProjectView
          {...baseProps}
          project={{
            id: 'project-hydrating',
            name: 'Ramp.com Design System',
            skillId: null,
            designSystemId: null,
            createdAt: 1,
            updatedAt: 1,
            pendingPrompt: 'Extract ramp.com into a design system.',
          }}
        />,
      );

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expect(onClearPendingPrompt).toHaveBeenCalledTimes(1);
      expect(streamViaDaemon.mock.calls[0]?.[0]).toMatchObject({
        history: [
          expect.objectContaining({
            role: 'user',
            content: 'Extract ramp.com into a design system.',
          }),
        ],
      });
      expect(window.sessionStorage.getItem('od:auto-send-first:project-hydrating')).toBeNull();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-hydrating');
    }
  });

  it('auto-sends Home-staged design files as first-turn daemon attachments', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-files', '1');
    window.sessionStorage.setItem(
      'od:auto-send-attachments:project-files',
      JSON.stringify([
        { path: 'brief.pdf', name: 'brief.pdf', kind: 'file', size: 5 },
        { path: 'logo.png', name: 'logo.png', kind: 'image', size: 7 },
      ]),
    );

    try {
      render(
        <ProjectView
          project={{
            id: 'project-files',
            name: 'Project',
            skillId: null,
            designSystemId: null,
          } as never}
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
          onProjectsRefresh={() => {}}
        />,
      );

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expect(streamViaDaemon.mock.calls[0]?.[0]).toMatchObject({
        attachments: ['brief.pdf', 'logo.png'],
        history: [
          expect.objectContaining({
            role: 'user',
            content: '',
            attachments: [
              { path: 'brief.pdf', name: 'brief.pdf', kind: 'file', size: 5 },
              { path: 'logo.png', name: 'logo.png', kind: 'image', size: 7 },
            ],
          }),
        ],
      });
      expect(window.sessionStorage.getItem('od:auto-send-first:project-files')).toBeNull();
      expect(window.sessionStorage.getItem('od:auto-send-attachments:project-files')).toBeNull();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-files');
      window.sessionStorage.removeItem('od:auto-send-attachments:project-files');
    }
  });

  it('passes Home-staged workspace contexts into the project composer during auto-send', async () => {
    const workspaceItems = [
      {
        id: 'project:reference-a',
        kind: 'project',
        label: 'Reference A',
        title: 'Reference A',
        path: 'reference-a',
        absolutePath: '/Users/me/reference-a',
      },
      {
        id: 'project:reference-b',
        kind: 'project',
        label: 'Reference B',
        title: 'Reference B',
        path: 'reference-b',
        absolutePath: '/Users/me/reference-b',
      },
    ];
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-context', '1');
    window.sessionStorage.setItem(
      'od:auto-send-context:project-context',
      JSON.stringify({ workspaceItems }),
    );

    try {
      render(
        <ProjectView
          project={{
            id: 'project-context',
            name: 'Project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: 'Inspect the reference dir.',
            metadata: { kind: 'prototype', linkedDirs: ['/Users/me/reference-a', '/Users/me/reference-b'] },
          } as never}
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
          onProjectsRefresh={() => {}}
        />,
      );

      const chatProps = await waitForReadyChatPaneProps() as {
        initialWorkspaceContexts?: unknown[];
      };
      expect(chatProps.initialWorkspaceContexts).toEqual(workspaceItems);

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expect(streamViaDaemon.mock.calls[0]?.[0]).toMatchObject({
        history: [
          expect.objectContaining({
            content: 'Inspect the reference dir.',
            runContext: { workspaceItems },
          }),
        ],
      });
      expect(window.sessionStorage.getItem('od:auto-send-context:project-context')).toBeNull();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-context');
      window.sessionStorage.removeItem('od:auto-send-context:project-context');
    }
  });

  it('queues board comment attachments while the current daemon run is still busy', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockImplementation(async () => new Promise<void>(() => {}));

    render(
      <ProjectView
        project={{
          id: 'project-comments',
          name: 'Project',
          skillId: null,
          designSystemId: null,
        } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const chatProps = await waitForReadyChatPaneProps();
    await chatProps.onSend!('keep running', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.streaming).toBe(true);
    });

    const workspaceProps = fileWorkspaceSpy.mock.calls.at(-1)?.[0] as {
      onSendBoardCommentAttachments?: (attachments: unknown[]) => Promise<boolean | void>;
    };
    expect(workspaceProps.onSendBoardCommentAttachments).toBeTruthy();

    await workspaceProps.onSendBoardCommentAttachments!([
      {
        id: 'hero-board-1',
        order: 1,
        filePath: 'preview.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        comment: 'Use a warmer accent',
        currentText: 'Hero',
        pagePosition: { x: 10, y: 20, width: 100, height: 40 },
        htmlHint: '<main data-od-id="hero">',
        source: 'board-batch',
      },
    ]);

    await waitFor(() => {
      const latest = chatPaneSpy.mock.calls.at(-1)?.[0] as {
        queuedItems?: Array<{
          prompt?: string;
          commentAttachments?: Array<{
            comment: string;
            commentContext?: string;
            elementId?: string;
          }>;
        }>;
      };
      expect(latest.queuedItems).toHaveLength(1);
      // Each board comment is queued as its own task: the comment text becomes
      // the task prompt while the attachment rides along as element context
      // (comment blanked, commentContext === 'query').
      expect(latest.queuedItems?.[0]?.prompt).toBe('Use a warmer accent');
      const queuedAttachment = latest.queuedItems?.[0]?.commentAttachments?.[0];
      expect(queuedAttachment?.elementId).toBe('hero');
      expect(queuedAttachment?.commentContext).toBe('query');
    });
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
  });

  it('audits design-system workspace output after first auto-send and seeds a bounded repair prompt', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: false,
      projectPath: '/tmp/ds',
      filesInspected: 12,
      errors: [{
        severity: 'error',
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'ui_kits/app/index.html must mount the kit.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [],
    });
    let streamCallCount = 0;
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      streamCallCount += 1;
      options.onRunCreated?.(`run-ds-${streamCallCount}`);
      if (streamCallCount === 1) {
        options.handlers.onDone();
      }
    });

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-ds', '1');

    render(
      <ProjectView
        project={{
          id: 'project-ds',
          name: 'Cherry Studio Design System',
          skillId: null,
          designSystemId: 'user:cherry-studio',
          pendingPrompt: 'Create this project as a design system.',
          metadata: {
            importedFrom: 'design-system',
            entryFile: 'DESIGN.md',
            sourceFileName: 'user:cherry-studio',
          },
        } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith('project-ds'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalled());
    expect(window.sessionStorage.getItem('od:design-system-audit-auto-repair:project-ds')).toBe('1');
    await waitFor(() => {
      const repairSeed = chatPaneSpy.mock.calls.find(
        (call) => typeof call[0]?.initialDraft === 'string'
          && call[0].initialDraft.includes('Fix the design-system package audit findings below.')
          && call[0].initialDraft.includes('ui_kit_index_missing_runtime_bootstrap'),
      );
      expect(repairSeed).toBeTruthy();
    });
    expect(saveMessage.mock.calls.some((call) =>
      call[2]?.role === 'assistant'
      && call[2]?.events?.some((event: { kind?: string; label?: string; detail?: string }) =>
        event.kind === 'status'
        && event.label === 'audit'
        && event.detail?.includes('Package audit found 1 error'),
      ),
    )).toBe(true);
  });

  it('does not seed audit repair prompt for manual design-system runs without auto-repair budget', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: false,
      projectPath: '/tmp/ds',
      filesInspected: 12,
      errors: [{
        severity: 'error',
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'ui_kits/app/index.html must mount the kit.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [],
    });
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      options.onRunCreated?.('run-ds-manual');
      options.handlers.onDone();
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{
          id: 'project-ds-manual',
          name: 'Manual Design System',
          skillId: null,
          designSystemId: 'user:manual-ds',
          metadata: {
            importedFrom: 'design-system',
            entryFile: 'DESIGN.md',
            sourceFileName: 'user:manual-ds',
          },
        } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const chatProps = await waitForReadyChatPaneProps();
    await chatProps.onSend!('Update the design system', [], []);

    await waitFor(() => expect(fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith('project-ds-manual'));
    await waitFor(() => {
      expect(saveMessage.mock.calls.some((call) =>
        call[2]?.role === 'assistant'
        && call[2]?.events?.some((event: { kind?: string; label?: string; detail?: string }) =>
          event.kind === 'status'
          && event.label === 'audit'
          && event.detail?.includes('Package audit found 1 error'),
        ),
      )).toBe(true);
    });
    expect(window.sessionStorage.getItem('od:design-system-audit-auto-repair:project-ds-manual')).toBeNull();
    expect(chatPaneSpy.mock.calls.some(
      (call) => typeof call[0]?.initialDraft === 'string'
        && call[0].initialDraft.includes('Fix the design-system package audit findings below.'),
    )).toBe(false);
  });

  it('clears design-system auto-repair budget when the first audit passes', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: true,
      projectPath: '/tmp/ds',
      filesInspected: 24,
      errors: [],
      warnings: [],
    });
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      options.onRunCreated?.('run-ds-pass');
      options.handlers.onDone();
    });

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-ds-pass', '1');

    render(
      <ProjectView
        project={{
          id: 'project-ds-pass',
          name: 'Passing Design System',
          skillId: null,
          designSystemId: 'user:passing-ds',
          pendingPrompt: 'Create this project as a design system.',
          metadata: {
            importedFrom: 'design-system',
            entryFile: 'DESIGN.md',
            sourceFileName: 'user:passing-ds',
          },
        } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith('project-ds-pass'));
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('od:design-system-audit-auto-repair:project-ds-pass')).toBeNull();
  });

  // Sister check: without the auto-send flag, the composer should still
  // seed from pendingPrompt so the user can edit before manually sending.
  it('seeds composer initialDraft with pendingPrompt when auto-send flag is absent', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    chatPaneSpy.mockClear();
    window.sessionStorage.removeItem('od:auto-send-first:project-3');

    render(
      <ProjectView
        project={{
          id: 'project-3',
          name: 'Project',
          skillId: null,
          designSystemId: null,
          pendingPrompt: 'design a landing page for a coffee shop',
        } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(chatPaneSpy).toHaveBeenCalled());
    // The first render — before activeConversationId resolves — must
    // pass the seed through so ChatComposer can populate its draft.
    const seedingCall = chatPaneSpy.mock.calls.find(
      (call) => call[0]?.initialDraft === 'design a landing page for a coffee shop',
    );
    expect(seedingCall).toBeTruthy();
  });

  // Root-cause regression for the "Working 24m+ / Waiting for first output"
  // stuck UI. The phantom was created at line `persistMessage(assistantMsg)`
  // in handleSend: a daemon assistant row was written to DB with
  // runStatus='running' BEFORE POST /api/runs returned a runId. If that POST
  // never returned (slow daemon, network blip, component unmount mid-flight),
  // the row was orphaned forever with no runId for the reattach loop to
  // recover. The fix: persistMessage / persistMessageById / updateMessageById
  // all refuse to write a daemon assistant row that is still active without
  // a runId. The first DB write for that row only happens once onRunCreated
  // pins the daemon's runId onto the message.
  it('does not persist an assistant message before POST /api/runs returns a runId', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    // streamViaDaemon: capture onRunCreated but never resolve, so the POST
    // looks "in-flight" for the rest of the test. This is the exact window
    // in which phantom rows used to be written.
    let capturedOnRunCreated: ((runId: string) => void) | null = null;
    streamViaDaemon.mockImplementation(async (options: { onRunCreated?: (runId: string) => void }) => {
      capturedOnRunCreated = options.onRunCreated ?? null;
      return new Promise<void>(() => {});
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-phantom', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    expect(sendProps?.onSend).toBeTypeOf('function');

    await sendProps!.onSend!('hello world', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    // The user message must be persisted immediately — it is committed
    // user intent and has no runId concept.
    const userSave = saveMessage.mock.calls.find((call) => call[2]?.role === 'user');
    expect(userSave?.[2]?.content).toBe('hello world');

    // The assistant placeholder must NOT be persisted yet: runStatus
    // is 'running' and the daemon has not returned a runId.
    const phantomSave = saveMessage.mock.calls.find(
      (call) =>
        call[2]?.role === 'assistant' &&
        call[2]?.runStatus === 'running' &&
        !call[2]?.runId,
    );
    expect(phantomSave).toBeUndefined();

    // Now simulate POST /api/runs returning a runId. The assistant row
    // transitions to 'queued' with a runId — that's a non-phantom write
    // that the guard lets through.
    expect(capturedOnRunCreated).not.toBeNull();
    capturedOnRunCreated!('run-pinned-xyz');

    await waitFor(() => {
      const pinnedSave = saveMessage.mock.calls.find(
        (call) =>
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-pinned-xyz' &&
          call[2]?.runStatus === 'queued',
      );
      expect(pinnedSave).toBeTruthy();
    });
  });

  // Companion regression: if the user navigates away (component unmounts)
  // BEFORE onRunCreated ever fires, the assistant placeholder must never
  // appear in DB. This is the exact failure mode the user reported — the
  // PluginLoopHome auto-send fired, the user moved on, and a phantom row
  // sat forever in the project's conversation.
  it('never persists a phantom assistant row when send aborts before runId', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    streamViaDaemon.mockImplementation(async () => {
      // Simulate a POST that never returns (network blip, daemon timeout).
      return new Promise<void>(() => {});
    });

    chatPaneSpy.mockClear();

    const view = render(
      <ProjectView
        project={{ id: 'project-aborted', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('quick send', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    view.unmount();

    const phantomSave = saveMessage.mock.calls.find(
      (call) =>
        call[2]?.role === 'assistant' &&
        call[2]?.runStatus === 'running' &&
        !call[2]?.runId,
    );
    expect(phantomSave).toBeUndefined();
  });

  it('persists a daemon assistant row as failed after an AMR auth error returns post-run creation', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => void };
    }) => {
      options.onRunCreated?.('run-auth-expired');
      options.handlers.onError(
        new Error('Your authentication token has expired. Please sign in again.'),
      );
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-auth-expired', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('retry auth', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const failedAssistantSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-auth-expired' &&
          call[1] === 'conv-1' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-auth-expired' &&
          call[2]?.runStatus === 'failed' &&
          call[2]?.events?.some(
            (event: { kind?: string; label?: string; detail?: string }) =>
              event.kind === 'status' &&
              event.label === 'error' &&
              event.detail === 'Your authentication token has expired. Please sign in again.',
          ),
      );
      expect(failedAssistantSave).toBeTruthy();
    });
  });

  it('threads the resumable flag from a live daemon failure onto the assistant message', async () => {
    // Regression: a transient failure that arrives on the live streamViaDaemon
    // onError path (not just reattach/status-fetch) must carry `resumable` onto
    // the assistant message, otherwise ChatPane's Continue CTA never appears on
    // the primary surface until a reload re-fetches run status.
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => void };
    }) => {
      options.onRunCreated?.('run-resumable-1');
      const err = new Error('Upstream request failed: stream disconnected.') as Error & {
        resumable?: boolean;
      };
      err.resumable = true;
      options.handlers.onError(err);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-resumable', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('do the thing', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    // The failed assistant row carries `resumable: true` (persisted + rendered).
    await waitFor(() => {
      const resumableFailedSave = saveMessage.mock.calls.find(
        (call) =>
          call[2]?.role === 'assistant' &&
          call[2]?.runStatus === 'failed' &&
          call[2]?.resumable === true,
      );
      expect(resumableFailedSave).toBeTruthy();
    });
    // And ChatPane receives that resumable failed message so the CTA can gate on it.
    const latest = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      messages?: Array<{ role: string; runStatus?: string; resumable?: boolean }>;
    };
    expect(
      latest?.messages?.some((m) => m.role === 'assistant' && m.runStatus === 'failed' && m.resumable === true),
    ).toBe(true);
  });

  it('does not replay a terminal succeeded row with empty produced files', async () => {
    const runCreatedAt = Date.now();
    const existingArtifact = {
      artifactManifest: {
        entry: 'real-daemon-smoke.html',
        exports: ['html'],
        kind: 'html',
        metadata: {
          artifactType: 'text/html',
          identifier: 'real-daemon-smoke',
          inferred: false,
        },
        renderer: 'html',
        title: 'Real Daemon Smoke',
        version: 1,
      },
      kind: 'html',
      mime: 'text/html',
      mtime: runCreatedAt + 1,
      name: 'real-daemon-smoke.html',
      size: 100,
    };

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-replay',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        runId: 'run-replay',
        runStatus: 'succeeded',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([existingArtifact]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-replay',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onDone: () => void;
      };
    }) => {
      options.handlers.onDelta(
        '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke"><h1>Real Daemon Smoke</h1></artifact>',
      );
      options.handlers.onDone();
    });

    render(
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledWith('project-1'));
    expect(fetchChatRunStatus).not.toHaveBeenCalled();
    expect(reattachDaemonRun).not.toHaveBeenCalled();
    expect(saveMessage).not.toHaveBeenCalledWith(
      'project-1',
      'conv-1',
      expect.objectContaining({
        id: 'msg-replay',
        producedFiles: [existingArtifact],
      }),
    );
    expect(writeProjectTextFile).not.toHaveBeenCalled();
  });

  it('replays a legacy terminal succeeded row when agent events still contain the artifact', async () => {
    const runCreatedAt = Date.now();
    const existingArtifact = artifactProjectFile('real-daemon-smoke.html', runCreatedAt + 1);
    const artifactEvent = {
      kind: 'text',
      text:
        '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke"><h1>Real Daemon Smoke</h1></artifact>',
    };

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-legacy-replay',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        events: [artifactEvent],
        runId: 'run-legacy-replay',
        runStatus: 'succeeded',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([existingArtifact]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-legacy-replay',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    render(
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(fetchChatRunStatus).toHaveBeenCalledWith('run-legacy-replay'));
    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-1',
        'conv-1',
        expect.objectContaining({
          id: 'msg-legacy-replay',
          content: artifactEvent.text,
          producedFiles: [existingArtifact],
          runStatus: 'succeeded',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
    expect(reattachDaemonRun).not.toHaveBeenCalled();
    expect(writeProjectTextFile).not.toHaveBeenCalled();
  });

  it('preserves authoritative failed status while replaying a stale succeeded row', async () => {
    const runCreatedAt = Date.now();
    const artifactEvent = {
      kind: 'text',
      text:
        '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke"><h1>Real Daemon Smoke</h1></artifact>',
    };

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-stale-succeeded-failed-status',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        events: [artifactEvent],
        runId: 'run-stale-succeeded-failed-status',
        runStatus: 'succeeded',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-stale-succeeded-failed-status',
      status: 'failed',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 1,
      signal: null,
      resumable: true,
    });
    listActiveChatRuns.mockResolvedValue([]);

    render(
      <ProjectView
        project={{ id: 'project-stale-succeeded-failed-status', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-stale-succeeded-failed-status',
        'conv-1',
        expect.objectContaining({
          id: 'msg-stale-succeeded-failed-status',
          content: artifactEvent.text,
          runStatus: 'failed',
          resumable: true,
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('keeps reattaching after two generic disconnects while daemon status stays running, but backs off before the next retry', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-flaky-reattach',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-flaky-reattach',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-flaky-reattach',
      status: 'running',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: { onError: (error: Error) => void };
    }) => {
      options.handlers.onError(genericDisconnect);
    });

    render(
      <ProjectView
        project={{ id: 'project-flaky-reattach', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 2_000,
    });
    expect(reattachDaemonRun.mock.calls.length).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(reattachDaemonRun.mock.calls.length).toBe(2);
    await waitFor(() => expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(3), {
      timeout: 4_500,
    });
  }, 12_000);

  it('clears streaming after a slow retry-cap status probe on reattach generic disconnects', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();
    type RunningStatusProbe = {
      id: string;
      status: 'running';
      createdAt: number;
      updatedAt: number;
      exitCode: null;
      signal: null;
    };
    let resolveStatusProbe!: (value: RunningStatusProbe) => void;
    const statusProbe = new Promise<RunningStatusProbe>((resolve) => {
      resolveStatusProbe = resolve;
    });

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-slow-status-probe',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-slow-status-probe',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    let statusChecks = 0;
    fetchChatRunStatus.mockImplementation(async () => {
      statusChecks += 1;
      if (statusChecks === 3) return statusProbe;
      return {
        id: 'run-reattach-slow-status-probe',
        status: 'running' as const,
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + statusChecks,
        exitCode: null,
        signal: null,
      };
    });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: { onError: (error: Error) => Promise<void> };
    }) => {
      void options.handlers.onError(genericDisconnect);
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-slow-status-probe', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(reattachDaemonRun).toHaveBeenCalledTimes(2);
      expect(fetchChatRunStatus).toHaveBeenCalledTimes(3);
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.streaming).toBe(false);
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
    });

    resolveStatusProbe({
      id: 'run-reattach-slow-status-probe',
      status: 'running',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 3,
      exitCode: null,
      signal: null,
    });

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.streaming).toBe(false);
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
    });
  });

  it('keeps live-stream recovery retryable after two generic disconnects while daemon status stays running, but backs off before the next retry', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-live-flaky',
      status: 'running',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: null,
      signal: null,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => void };
    }) => {
      options.onRunCreated?.('run-live-flaky');
      options.handlers.onError(genericDisconnect);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-flaky', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('flaky stream', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(1), {
      timeout: 2_000,
    });
    expect(reattachDaemonRun.mock.calls.length).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(reattachDaemonRun.mock.calls.length).toBe(1);
    await waitFor(() => expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 4_500,
    });
  }, 12_000);

  it('keeps a partial live generic disconnect recoverable after the first failure', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-live-partial-recoverable',
      status: 'running',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: null,
      signal: null,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: {
        onDelta: (delta: string) => void;
        onError: (error: Error) => Promise<void>;
      };
    }) => {
      options.onRunCreated?.('run-live-partial-recoverable');
      options.handlers.onDelta('partial output');
      await options.handlers.onError(genericDisconnect);
    });
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-partial-recoverable', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('recover partial live disconnect', [], []);

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1), {
      timeout: 2_000,
    });
  });

  it('installs live generic-disconnect backoff before a slow retry-cap status probe can trigger reattach', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();
    type RunningStatusProbe = {
      id: string;
      status: 'running';
      createdAt: number;
      updatedAt: number;
      exitCode: null;
      signal: null;
    };
    let resolveStatusProbe!: (value: RunningStatusProbe) => void;
    const statusProbe = new Promise<RunningStatusProbe>((resolve) => {
      resolveStatusProbe = resolve;
    });
    let statusChecks = 0;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockImplementation(async () => {
      statusChecks += 1;
      if (statusChecks === 1) return statusProbe;
      return {
        id: 'run-live-slow-status-probe',
        status: 'running' as const,
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + statusChecks,
        exitCode: null,
        signal: null,
      };
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: {
        onError: (error: Error) => Promise<void>;
      };
    }) => {
      options.onRunCreated?.('run-live-slow-status-probe');
      await options.handlers.onError(genericDisconnect);
      void options.handlers.onError(genericDisconnect);
    });
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-slow-status-probe', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('slow live status probe', [], []);

    await waitFor(() => {
      expect(fetchChatRunStatus).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(reattachDaemonRun).not.toHaveBeenCalled();

    resolveStatusProbe({
      id: 'run-live-slow-status-probe',
      status: 'running',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: null,
      signal: null,
    });

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1), {
      timeout: 4_000,
    });
  });

  it('keeps generic-disconnect cap retryable when the follow-up status probe returns null, but backs off before retrying', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-null-status-retry',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-null-status-retry',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-null-status-retry',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-null-status-retry',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 2,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'run-null-status-retry',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 3,
        exitCode: null,
        signal: null,
      });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: { onError: (error: Error) => void };
    }) => {
      options.handlers.onError(genericDisconnect);
    });

    render(
      <ProjectView
        project={{ id: 'project-null-status-retry', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 2_000,
    });
    expect(reattachDaemonRun.mock.calls.length).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(reattachDaemonRun.mock.calls.length).toBe(2);
    await waitFor(() => expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(3), {
      timeout: 4_500,
    });
  }, 12_000);

  it('finalizes a reattach generic disconnect as succeeded when the next status poll turns terminal', async () => {
    const runCreatedAt = Date.now();
    const { GENERIC_DAEMON_DISCONNECT_MESSAGE } = await import('../../src/providers/daemon');
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-terminal-success',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-terminal-success',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-reattach-terminal-success',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-terminal-success',
        status: 'succeeded',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 2,
        exitCode: 0,
        signal: null,
      });
    let reattachAttempts = 0;
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onError: (error: Error) => Promise<void>;
        onDone: () => void;
      };
    }) => {
      reattachAttempts += 1;
      if (reattachAttempts === 1) {
        await options.handlers.onError(genericDisconnect);
        return;
      }
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-terminal-success', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-reattach-terminal-success',
        'conv-1',
        expect.objectContaining({
          id: 'msg-reattach-terminal-success',
          runStatus: 'succeeded',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
    const recoveredSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-reattach-terminal-success' &&
        call[2]?.id === 'msg-reattach-terminal-success' &&
        call[2]?.runStatus === 'succeeded',
    );
    expect(
      recoveredSave?.[2]?.events?.some(
        (event: { kind?: string; label?: string; detail?: string }) =>
          event.kind === 'status' &&
          event.label === 'error' &&
          event.detail === GENERIC_DAEMON_DISCONNECT_MESSAGE,
      ),
    ).toBe(false);
  });

  it('treats a code-only generic disconnect as retryable even when the message differs', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createCodeOnlyGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-code-only-generic-disconnect',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-code-only-generic-disconnect',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-reattach-code-only-generic-disconnect',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-code-only-generic-disconnect',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 2,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-code-only-generic-disconnect',
        status: 'succeeded',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 3,
        exitCode: 0,
        signal: null,
      });
    let reattachAttempts = 0;
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onError: (error: Error) => Promise<void>;
        onDone: () => void;
      };
    }) => {
      reattachAttempts += 1;
      if (reattachAttempts < 3) {
        await options.handlers.onError(genericDisconnect);
        return;
      }
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-code-only-generic-disconnect', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(saveMessage).toHaveBeenCalledWith(
        'project-reattach-code-only-generic-disconnect',
        'conv-1',
        expect.objectContaining({
          id: 'msg-reattach-code-only-generic-disconnect',
          runStatus: 'succeeded',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
  });

  it('patches terminal metadata when a reattach generic disconnect later proves failed', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError() as Error & {
      resumable?: boolean;
    };
    genericDisconnect.resumable = false;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-terminal-failed',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-terminal-failed',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-reattach-terminal-failed',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-terminal-failed',
        status: 'failed',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 2,
        exitCode: 1,
        signal: null,
        resumable: true,
      });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onError: (error: Error) => Promise<void>;
      };
    }) => {
      await options.handlers.onError(genericDisconnect);
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-terminal-failed', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      const failedSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-reattach-terminal-failed' &&
          call[2]?.id === 'msg-reattach-terminal-failed' &&
          call[2]?.runStatus === 'failed' &&
          call[2]?.resumable === true,
      );
      expect(failedSave).toBeTruthy();
    });
  });

  it('replays a terminally-succeeded reattach run again when the previous retry only restored partial content', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-terminal-partial-success',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-terminal-partial-success',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-reattach-terminal-partial-success',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-terminal-partial-success',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 2,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-terminal-partial-success',
        status: 'succeeded',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 3,
        exitCode: 0,
        signal: null,
      })
      .mockResolvedValue({
        id: 'run-reattach-terminal-partial-success',
        status: 'succeeded',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 4,
        exitCode: 0,
        signal: null,
      });
    let reattachAttempts = 0;
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onError: (error: Error) => Promise<void>;
        onDone: () => void;
      };
    }) => {
      reattachAttempts += 1;
      if (reattachAttempts === 1) {
        await options.handlers.onError(genericDisconnect);
        return;
      }
      if (reattachAttempts === 2) {
        options.handlers.onDelta('partial output');
        await options.handlers.onError(genericDisconnect);
        return;
      }
      options.handlers.onDelta('full recovered output');
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-terminal-partial-success', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(reattachDaemonRun.mock.calls.length).toBeGreaterThanOrEqual(3);
      const succeededSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-reattach-terminal-partial-success' &&
          call[2]?.id === 'msg-reattach-terminal-partial-success' &&
          call[2]?.runStatus === 'succeeded' &&
          call[2]?.content === 'full recovered output',
      );
      expect(succeededSave).toBeTruthy();
    });

    const truncatedSucceededSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-reattach-terminal-partial-success' &&
        call[2]?.id === 'msg-reattach-terminal-partial-success' &&
        call[2]?.runStatus === 'succeeded' &&
        call[2]?.content === 'partial output',
    );
    expect(truncatedSucceededSave).toBeFalsy();
  });

  it('finalizes a live generic disconnect as succeeded when the next status poll turns terminal', async () => {
    const runCreatedAt = Date.now();
    const { GENERIC_DAEMON_DISCONNECT_MESSAGE } = await import('../../src/providers/daemon');
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-live-terminal-success',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => Promise<void> };
    }) => {
      options.onRunCreated?.('run-live-terminal-success');
      await options.handlers.onError(genericDisconnect);
      await options.handlers.onError(genericDisconnect);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-terminal-success', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('terminal success after disconnect', [], []);

    await waitFor(() => {
      const succeededSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-live-terminal-success' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-live-terminal-success' &&
          call[2]?.runStatus === 'succeeded',
      );
      expect(succeededSave).toBeTruthy();
    });
    const succeededSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-live-terminal-success' &&
        call[2]?.role === 'assistant' &&
        call[2]?.runId === 'run-live-terminal-success' &&
        call[2]?.runStatus === 'succeeded',
    );
    expect(
      succeededSave?.[2]?.events?.some(
        (event: { kind?: string; label?: string; detail?: string }) =>
          event.kind === 'status' &&
          event.label === 'error' &&
          event.detail === GENERIC_DAEMON_DISCONNECT_MESSAGE,
      ),
    ).toBe(false);
    expect(patchPreviewCommentStatus).not.toHaveBeenCalled();
  });

  it('does not persist a live generic disconnect as succeeded with partial streamed text', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-live-terminal-partial-success',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: {
        onDelta: (delta: string) => void;
        onError: (error: Error) => Promise<void>;
      };
    }) => {
      options.onRunCreated?.('run-live-terminal-partial-success');
      options.handlers.onDelta('partial output');
      await options.handlers.onError(genericDisconnect);
      await options.handlers.onError(genericDisconnect);
    });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onDone: () => void;
      };
    }) => {
      options.handlers.onDelta('full recovered output');
      options.handlers.onDone();
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-terminal-partial-success', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('terminal success after partial disconnect', [], []);

    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalled();
    });

    const truncatedSucceededSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-live-terminal-partial-success' &&
        call[2]?.role === 'assistant' &&
        call[2]?.runId === 'run-live-terminal-partial-success' &&
        call[2]?.runStatus === 'succeeded' &&
        call[2]?.content === 'partial output',
    );
    expect(truncatedSucceededSave).toBeFalsy();

    await waitFor(() => {
      const recoveredSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-live-terminal-partial-success' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-live-terminal-partial-success' &&
          call[2]?.runStatus === 'succeeded' &&
          call[2]?.content === 'full recovered output',
      );
      expect(recoveredSave).toBeTruthy();
    });
  });

  it('preserves canceled status when a reattached run reports canceled before onDone', async () => {
    const runCreatedAt = Date.now();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-canceled',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-canceled',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-reattach-canceled',
      status: 'running',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: null,
      signal: null,
    });
    reattachDaemonRun.mockImplementation(async (options: {
      onRunStatus?: (runStatus: 'canceled') => void;
      handlers: {
        onDone: () => void;
      };
    }) => {
      options.onRunStatus?.('canceled');
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-canceled', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-reattach-canceled',
        'conv-1',
        expect.objectContaining({
          id: 'msg-reattach-canceled',
          runStatus: 'canceled',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
    expect(saveMessage).not.toHaveBeenCalledWith(
      'project-reattach-canceled',
      'conv-1',
      expect.objectContaining({
        id: 'msg-reattach-canceled',
        runStatus: 'succeeded',
      }),
      expect.objectContaining({ telemetryFinalized: true }),
    );
  });

  it('patches live generic-disconnect terminal metadata from a failed daemon status', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError() as Error & {
      resumable?: boolean;
    };
    genericDisconnect.resumable = false;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-live-terminal-failed',
        status: 'failed',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: 1,
        signal: null,
        resumable: true,
      })
      .mockResolvedValue({
        id: 'run-live-terminal-failed',
        status: 'failed',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: 1,
        signal: null,
        resumable: true,
      });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => Promise<void> };
    }) => {
      options.onRunCreated?.('run-live-terminal-failed');
      await options.handlers.onError(genericDisconnect);
      await options.handlers.onError(genericDisconnect);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-terminal-failed', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('terminal failed after disconnect', [], []);

    await waitFor(() => {
      const failedSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-live-terminal-failed' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-live-terminal-failed' &&
          call[2]?.runStatus === 'failed' &&
          call[2]?.resumable === true,
      );
      expect(failedSave).toBeTruthy();
    });
  });

  it('restores attached comment statuses when a live generic disconnect later proves succeeded', async () => {
    const runCreatedAt = Date.now();
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-live-success-comments',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => Promise<void> };
    }) => {
      options.onRunCreated?.('run-live-success-comments');
      await options.handlers.onError(genericDisconnect);
      await options.handlers.onError(genericDisconnect);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-success-comments', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!(
      'terminal success after disconnect with comments',
      [],
      [
        {
          id: 'comment-1',
          comment: 'Tighten spacing',
          commentContext: 'query',
          filePath: 'preview.html',
          source: 'query',
        },
      ] as never,
    );

    await waitFor(() => {
      expect(patchPreviewCommentStatus).toHaveBeenCalledWith(
        'project-live-success-comments',
        'conv-1',
        'comment-1',
        'needs_review',
      );
    });
  });

  it('replays a spuriously failed empty row when daemon status is already succeeded', async () => {
    const runCreatedAt = Date.now();
    const recoveredArtifact = artifactProjectFile('real-daemon-smoke.html', runCreatedAt + 2);
    const artifactContent =
      '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke">' +
      '<!doctype html><html><body><h1>Real Daemon Smoke</h1></body></html>' +
      '</artifact>';

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-spurious-succeeded',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-spurious-succeeded',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([recoveredArtifact]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-spurious-succeeded',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onDone: () => void;
      };
    }) => {
      options.handlers.onDelta(artifactContent);
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-spurious-succeeded', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-spurious-succeeded',
        'conv-1',
        expect.objectContaining({
          id: 'msg-spurious-succeeded',
          content: artifactContent,
          producedFiles: [recoveredArtifact],
          runStatus: 'succeeded',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
  });

  it('preserves a spuriously failed empty row when daemon status is already canceled', async () => {
    const runCreatedAt = Date.now();
    const preservedEvents = [
      {
        kind: 'status',
        label: 'warning',
        detail: 'Canceled after reload.',
        timestamp: runCreatedAt + 1,
      },
    ];

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-spurious-canceled',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-spurious-canceled',
        runStatus: 'failed',
        producedFiles: [],
        events: preservedEvents,
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-spurious-canceled',
      status: 'canceled',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 130,
      signal: null,
      resumable: true,
    });

    render(
      <ProjectView
        project={{ id: 'project-spurious-canceled', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(reattachDaemonRun).not.toHaveBeenCalled();
      const canceledSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-spurious-canceled' &&
          call[1] === 'conv-1' &&
          call[2]?.id === 'msg-spurious-canceled' &&
          call[2]?.runStatus === 'canceled' &&
          call[2]?.resumable === true &&
          call[2]?.events === preservedEvents &&
          call[3] === undefined,
      );
      expect(canceledSave).toBeTruthy();
    });
  });

  // Regression (#4607): messages persisted BEFORE this PR started tagging
  // disconnects with a structured `code` recorded the generic disconnect as
  // a legacy status/error event — `detail` matches the generic-disconnect
  // message but there is no `code` field. `hasGenericDisconnectFailureEvent`
  // must still recognize that legacy shape so a spuriously-failed row
  // recovers on reload once the daemon reports the run actually succeeded.
  // The row is seeded with non-empty partial content (rather than empty
  // content) specifically to prove the plain empty-content spurious-fail
  // heuristic is NOT what catches this row — only the legacy-detail
  // predicate does. Recovery replaces that local content with the daemon's
  // authoritative replayed transcript (`attachRecoverableRuns` wipes and
  // re-drives `reattachDaemonRun`), so the persisted content must match the
  // REPLAYED content, not the originally-seeded partial content.
  it('recovers a legacy message-only generic-disconnect failure (partial content, no code) when the daemon reports succeeded', async () => {
    const runCreatedAt = Date.now();
    const partialContent = 'Partial output captured before the browser SSE reconnect loop gave up.';
    const replayedContent =
      '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke">' +
      '<!doctype html><html><body><h1>Real Daemon Smoke</h1></body></html>' +
      '</artifact>';
    const legacyDisconnectEvents = [
      {
        kind: 'status',
        label: 'error',
        detail: 'daemon stream disconnected before run completed',
      },
    ];

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-legacy-disconnect-partial',
        role: 'assistant',
        content: partialContent,
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-legacy-disconnect-partial',
        runStatus: 'failed',
        events: legacyDisconnectEvents,
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-legacy-disconnect-partial',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onDone: () => void;
      };
    }) => {
      options.handlers.onDelta(replayedContent);
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-legacy-disconnect-partial', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    // The daemon reattach must actually be entered — this is what proves the
    // legacy no-code event was recognized as recoverable in the first place.
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-legacy-disconnect-partial',
        'conv-1',
        expect.objectContaining({
          id: 'msg-legacy-disconnect-partial',
          content: replayedContent,
          runStatus: 'succeeded',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
  });

  it('keeps reload artifact recovery retryable after a transient persistence miss', async () => {
    const runCreatedAt = Date.now();
    const recoveredArtifact = artifactProjectFile('real-daemon-smoke.html', runCreatedAt + 2);
    const artifactContent =
      '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke">' +
      '<!doctype html><html><body><h1>Real Daemon Smoke</h1></body></html>' +
      '</artifact>';

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-recover-failed',
        role: 'assistant',
        content: artifactContent,
        createdAt: runCreatedAt + 1,
        runId: 'run-recover-failed',
        runStatus: 'succeeded',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    let persistAttempts = 0;
    fetchProjectFiles.mockImplementation(async () =>
      persistAttempts >= 2 ? [recoveredArtifact] : [],
    );
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-recover-failed',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    writeProjectTextFile.mockImplementation(async () => {
      persistAttempts += 1;
      return persistAttempts >= 2 ? recoveredArtifact : null;
    });

    render(
      <ProjectView
        project={{ id: 'project-recover-failed', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(writeProjectTextFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(writeProjectTextFile).toHaveBeenCalledTimes(2), { timeout: 2_500 });
    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-recover-failed',
        'conv-1',
        expect.objectContaining({
          id: 'msg-recover-failed',
          producedFiles: [recoveredArtifact],
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
  });

  it('persists reload-recovered non-html artifacts when same-turn suffix matches have different contents', async () => {
    const runCreatedAt = Date.now();
    const staleCss = projectFile('theme-2.css', 'code', runCreatedAt + 1);
    const finalCss = 'body { color: red; }';
    const artifactContent =
      `<artifact type="text/css" title="Theme">${finalCss}</artifact>`;

    globalThis.fetch = vi.fn(async () =>
      new Response('body { color: blue; }', { status: 200 }),
    ) as typeof fetch;
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-css-recover',
        role: 'assistant',
        content: artifactContent,
        createdAt: runCreatedAt + 1,
        runId: 'run-css-recover',
        runStatus: 'succeeded',
        producedFiles: [],
        preTurnFileNames: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockImplementation(async () =>
      writeProjectTextFile.mock.calls.length > 0
        ? [staleCss, projectFile('theme.css', 'code', runCreatedAt + 2)]
        : [staleCss],
    );
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-css-recover',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    writeProjectTextFile.mockImplementation(async (_projectId, name) =>
      projectFile(String(name), 'code', runCreatedAt + 2),
    );

    render(
      <ProjectView
        project={{ id: 'project-css-recover', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(writeProjectTextFile).toHaveBeenCalledTimes(1));
    expect(writeProjectTextFile).toHaveBeenCalledWith(
      'project-css-recover',
      'theme.css',
      finalCss,
      expect.objectContaining({
        artifactManifest: expect.objectContaining({ entry: 'theme.css' }),
      }),
    );
  });

  it('does not recover a stale pointer target when reattached artifact persistence falls back to writing', async () => {
    const runCreatedAt = Date.now();
    const stalePointerTarget = projectFile('index.html', 'html', runCreatedAt - 1);
    const recoveredPointerHtml = '<!doctype html><html><body><main>See: index.html</main><p>Recovered artifact body.</p></body></html>';

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-replay',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-replay',
        runStatus: 'running',
        preTurnFileNames: ['index.html'],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([stalePointerTarget]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-replay',
      status: 'running',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt,
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    writeProjectTextFile.mockResolvedValue({
      ...projectFile('real-daemon-smoke.html', 'html', runCreatedAt + 1),
      artifactManifest: {
        entry: 'real-daemon-smoke.html',
        exports: ['html'],
        kind: 'html',
        metadata: {
          artifactType: 'text/html',
          identifier: 'real-daemon-smoke',
          inferred: false,
        },
        renderer: 'html',
        title: 'Real Daemon Smoke',
        version: 1,
      },
    });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onDone: () => void;
      };
    }) => {
      options.handlers.onDelta(
        `<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke">${recoveredPointerHtml}</artifact>`,
      );
      options.handlers.onDone();
    });

    render(
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(writeProjectTextFile).toHaveBeenCalledTimes(1));
    expect(writeProjectTextFile).toHaveBeenCalledWith(
      'project-1',
      'real-daemon-smoke.html',
      recoveredPointerHtml,
      expect.objectContaining({
        artifactManifest: expect.objectContaining({ entry: 'real-daemon-smoke.html' }),
      }),
    );
    expect(saveTabs).not.toHaveBeenCalledWith('project-1', expect.objectContaining({ active: 'index.html' }));
  });

  it('advances endedAt to the daemon terminal time when a reattach generic disconnect probe turns succeeded', async () => {
    const runCreatedAt = Date.now();
    // Far enough past any plausible disconnect-time Date.now() stamp taken during
    // this test run that the two timestamps can never coincide by accident.
    const daemonTerminalUpdatedAt = runCreatedAt + 10_000_000;
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-endedat-succeeded',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-endedat-succeeded',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-reattach-endedat-succeeded',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-endedat-succeeded',
        status: 'succeeded',
        createdAt: runCreatedAt,
        updatedAt: daemonTerminalUpdatedAt,
        exitCode: 0,
        signal: null,
      });
    let reattachAttempts = 0;
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onError: (error: Error) => Promise<void>;
        onDone: () => void;
      };
    }) => {
      reattachAttempts += 1;
      if (reattachAttempts === 1) {
        await options.handlers.onError(genericDisconnect);
        return;
      }
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-endedat-succeeded', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-reattach-endedat-succeeded',
        'conv-1',
        expect.objectContaining({
          id: 'msg-reattach-endedat-succeeded',
          runStatus: 'succeeded',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
    const recoveredSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-reattach-endedat-succeeded' &&
        call[2]?.id === 'msg-reattach-endedat-succeeded' &&
        call[2]?.runStatus === 'succeeded',
    );
    // The daemon's authoritative terminal timestamp must win over the stale
    // disconnect-time stamp recorded when the generic disconnect first fired.
    expect(recoveredSave?.[2]?.endedAt).toBe(daemonTerminalUpdatedAt);
  });

  it('advances endedAt to the daemon terminal time when a reattach generic disconnect probe turns canceled', async () => {
    const runCreatedAt = Date.now();
    const daemonTerminalUpdatedAt = runCreatedAt + 10_000_000;
    const genericDisconnect = await createGenericDisconnectError() as Error & {
      resumable?: boolean;
    };
    genericDisconnect.resumable = false;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-endedat-canceled',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reattach-endedat-canceled',
        runStatus: 'failed',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-reattach-endedat-canceled',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt + 1,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reattach-endedat-canceled',
        status: 'canceled',
        createdAt: runCreatedAt,
        updatedAt: daemonTerminalUpdatedAt,
        exitCode: null,
        signal: null,
      });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onError: (error: Error) => Promise<void>;
      };
    }) => {
      await options.handlers.onError(genericDisconnect);
    });

    render(
      <ProjectView
        project={{ id: 'project-reattach-endedat-canceled', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      const canceledSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-reattach-endedat-canceled' &&
          call[2]?.id === 'msg-reattach-endedat-canceled' &&
          call[2]?.runStatus === 'canceled',
      );
      expect(canceledSave).toBeTruthy();
    });
    const canceledSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-reattach-endedat-canceled' &&
        call[2]?.id === 'msg-reattach-endedat-canceled' &&
        call[2]?.runStatus === 'canceled',
    );
    expect(canceledSave?.[2]?.endedAt).toBe(daemonTerminalUpdatedAt);
  });

  it('advances endedAt to the daemon terminal time when a live generic disconnect probe turns succeeded', async () => {
    const runCreatedAt = Date.now();
    const daemonTerminalUpdatedAt = runCreatedAt + 10_000_000;
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-live-endedat-succeeded',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: daemonTerminalUpdatedAt,
      exitCode: 0,
      signal: null,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => Promise<void> };
    }) => {
      options.onRunCreated?.('run-live-endedat-succeeded');
      await options.handlers.onError(genericDisconnect);
      await options.handlers.onError(genericDisconnect);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-live-endedat-succeeded', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('terminal success after disconnect (endedAt check)', [], []);

    await waitFor(() => {
      const succeededSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-live-endedat-succeeded' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-live-endedat-succeeded' &&
          call[2]?.runStatus === 'succeeded',
      );
      expect(succeededSave).toBeTruthy();
    });
    const succeededSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-live-endedat-succeeded' &&
        call[2]?.role === 'assistant' &&
        call[2]?.runId === 'run-live-endedat-succeeded' &&
        call[2]?.runStatus === 'succeeded',
    );
    expect(succeededSave?.[2]?.endedAt).toBe(daemonTerminalUpdatedAt);
  });

  // Regression (#4607): a reload while a run is still active fetches the
  // daemon status exactly once, before reattachDaemonRun starts. For the
  // ordinary reload-while-running path (no generic disconnect in the mix)
  // that one snapshot is still 'running' — a near-run-start heartbeat, not
  // a terminal completion time. The reattach onDone handler must not stamp
  // that heartbeat as endedAt; it must observe an authoritative terminal
  // status before finalizing, so endedAt advances past the initial running
  // snapshot instead of freezing at it.
  it('advances the recovered endedAt past the initial running snapshot when a reload reattaches an active run', async () => {
    const runCreatedAt = Date.now();
    const initialRunningUpdatedAt = runCreatedAt + 1;
    // Far enough past the pre-reattach heartbeat that the two timestamps can
    // never coincide by accident.
    const daemonTerminalUpdatedAt = runCreatedAt + 10_000_000;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reload-active-run',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-reload-active',
        runStatus: 'running',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-reload-active',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: initialRunningUpdatedAt,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-reload-active',
        status: 'succeeded',
        createdAt: runCreatedAt,
        updatedAt: daemonTerminalUpdatedAt,
        exitCode: 0,
        signal: null,
      });
    // A plain, error-free reattach: the daemon stream simply finishes.
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: { onDone: () => void };
    }) => {
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-reload-active-endedat', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(saveMessage).toHaveBeenCalledWith(
        'project-reload-active-endedat',
        'conv-1',
        expect.objectContaining({
          id: 'msg-reload-active-run',
          runStatus: 'succeeded',
        }),
        expect.objectContaining({ telemetryFinalized: true }),
      );
    });
    const recoveredSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-reload-active-endedat' &&
        call[2]?.id === 'msg-reload-active-run' &&
        call[2]?.runStatus === 'succeeded',
    );
    // Must land on the daemon's authoritative terminal time, not the
    // pre-reattach 'running' heartbeat fetched before recovery started.
    expect(recoveredSave?.[2]?.endedAt).toBe(daemonTerminalUpdatedAt);
    expect(recoveredSave?.[2]?.endedAt).not.toBe(initialRunningUpdatedAt);
  });

  // Regression (#4607): updateConversationLatestRun() drives the sidebar/
  // dropdown's conversation.updatedAt, latestRun.endedAt, and durationMs.
  // The live generic-disconnect onError handler already patches the
  // assistant MESSAGE row with the daemon's authoritative terminal
  // timestamp once the retry-cap status probe turns terminal, but the
  // `endedAt` threaded into updateConversationLatestRun() is still the
  // stale disconnect-time stamp captured at the top of onError. This
  // regression asserts the conversation-level metadata advances too.
  it('threads the daemon terminal timestamp into the conversation latestRun after a live generic disconnect recovers as succeeded', async () => {
    const runCreatedAt = Date.now();
    const daemonTerminalUpdatedAt = runCreatedAt + 10_000_000;
    const genericDisconnect = await createGenericDisconnectError();

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-conv-endedat-succeeded',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: daemonTerminalUpdatedAt,
      exitCode: 0,
      signal: null,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => Promise<void> };
    }) => {
      options.onRunCreated?.('run-conv-endedat-succeeded');
      await options.handlers.onError(genericDisconnect);
      await options.handlers.onError(genericDisconnect);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-conv-endedat-succeeded', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('terminal success after disconnect (conversation endedAt check)', [], []);

    await waitFor(() => {
      const succeededSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-conv-endedat-succeeded' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-conv-endedat-succeeded' &&
          call[2]?.runStatus === 'succeeded',
      );
      expect(succeededSave).toBeTruthy();
    });

    const conversations = chatPaneSpy.mock.calls.at(-1)?.[0]?.conversations as
      | Array<{ id: string; latestRun?: { endedAt?: number; durationMs?: number } }>
      | undefined;
    const conversation = conversations?.find((c) => c.id === 'conv-1');
    // The conversation-level metadata must adopt the same daemon terminal
    // timestamp as the message row, not the stale disconnect-time stamp
    // captured before the terminal probe resolved.
    expect(conversation?.latestRun?.endedAt).toBe(daemonTerminalUpdatedAt);
  });

  // Regression (#4607): proves neither surface — the assistant message row
  // nor the conversation's latestRun metadata — keeps the stale
  // disconnect-time stamp after a generic-disconnect recovery. Uses a
  // terminal 'failed' probe (rather than 'succeeded') to cover the sibling
  // branch of the same onError handler.
  it('advances both the message row and the conversation latestRun to the daemon terminal time when a live generic disconnect probe turns failed', async () => {
    const runCreatedAt = Date.now();
    const daemonTerminalUpdatedAt = runCreatedAt + 10_000_000;
    const genericDisconnect = await createGenericDisconnectError() as Error & {
      resumable?: boolean;
    };
    genericDisconnect.resumable = false;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-both-endedat-failed',
      status: 'failed',
      createdAt: runCreatedAt,
      updatedAt: daemonTerminalUpdatedAt,
      exitCode: 1,
      signal: null,
      resumable: true,
    });
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => Promise<void> };
    }) => {
      options.onRunCreated?.('run-both-endedat-failed');
      await options.handlers.onError(genericDisconnect);
      await options.handlers.onError(genericDisconnect);
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-both-endedat-failed', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('terminal failed after disconnect (both surfaces check)', [], []);

    // Match on `resumable === true` (the daemon-probed terminal value) to
    // land on the FINAL save, not the interim 'failed' save the first
    // onError call persists before the retry-cap probe ever fires (that
    // interim save carries `resumable: false` from the disconnect error
    // itself, per the same disambiguation the pre-existing "patches live
    // generic-disconnect terminal metadata from a failed daemon status"
    // test above uses).
    await waitFor(() => {
      const failedSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-both-endedat-failed' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-both-endedat-failed' &&
          call[2]?.runStatus === 'failed' &&
          call[2]?.resumable === true,
      );
      expect(failedSave).toBeTruthy();
    });
    const failedSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-both-endedat-failed' &&
        call[2]?.role === 'assistant' &&
        call[2]?.runId === 'run-both-endedat-failed' &&
        call[2]?.runStatus === 'failed' &&
        call[2]?.resumable === true,
    );
    // Message row surface: already threads the daemon terminal timestamp.
    expect(failedSave?.[2]?.endedAt).toBe(daemonTerminalUpdatedAt);

    const conversations = chatPaneSpy.mock.calls.at(-1)?.[0]?.conversations as
      | Array<{ id: string; latestRun?: { endedAt?: number; durationMs?: number } }>
      | undefined;
    const conversation = conversations?.find((c) => c.id === 'conv-1');
    // Conversation-metadata surface: must not keep the stale disconnect-time
    // stamp while the message row has already moved on.
    expect(conversation?.latestRun?.endedAt).toBe(daemonTerminalUpdatedAt);
  });

  // Regression (#4607): the reattach onError handler's recoverable-artifact
  // branch (entered when a non-generic-disconnect error still carries
  // artifact-shaped replayed content) first stamps the message with the
  // disconnect-time endedAt synchronously, then later fetches the daemon's
  // authoritative terminal status to recover the artifact. The final
  // updateMessageById call must adopt that authoritative terminal time —
  // not fall back to the disconnect-time stamp `prev.endedAt` already
  // carries by the time it runs.
  it('adopts the daemon terminal time instead of the disconnect stamp when a reattach recovers an artifact after a non-generic error', async () => {
    const runCreatedAt = Date.now();
    const initialRunningUpdatedAt = runCreatedAt + 1;
    // Far enough past any disconnect-time Date.now() stamp taken during this
    // test run that the two timestamps can never coincide by accident.
    const daemonTerminalUpdatedAt = runCreatedAt + 10_000_000;
    const artifactContent =
      '<artifact identifier="recoverable-artifact" type="text/html" title="Recoverable Artifact">' +
      '<!doctype html><html><body><h1>Recovered</h1></body></html>' +
      '</artifact>';

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-recoverable-artifact-endedat',
        role: 'assistant',
        content: '',
        createdAt: runCreatedAt,
        startedAt: runCreatedAt,
        runId: 'run-recoverable-artifact-endedat',
        runStatus: 'running',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus
      .mockResolvedValueOnce({
        id: 'run-recoverable-artifact-endedat',
        status: 'running',
        createdAt: runCreatedAt,
        updatedAt: initialRunningUpdatedAt,
        exitCode: null,
        signal: null,
      })
      .mockResolvedValueOnce({
        id: 'run-recoverable-artifact-endedat',
        status: 'succeeded',
        createdAt: runCreatedAt,
        updatedAt: daemonTerminalUpdatedAt,
        exitCode: 0,
        signal: null,
      });
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onError: (error: Error) => Promise<void>;
      };
    }) => {
      options.handlers.onDelta(artifactContent);
      // A genuine (non-generic-disconnect) failure — the daemon stream
      // really dropped mid-turn, not a browser SSE reconnect-budget
      // exhaustion, so the generic-disconnect retry/backoff machinery must
      // not apply here.
      await options.handlers.onError(new Error('some real non-generic failure'));
    });

    render(
      <ProjectView
        project={{ id: 'project-recoverable-artifact-endedat', name: 'Project', skillId: null, designSystemId: null } as never}
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
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      const recoveredSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-recoverable-artifact-endedat' &&
          call[2]?.id === 'msg-recoverable-artifact-endedat' &&
          call[2]?.runStatus === 'succeeded',
      );
      expect(recoveredSave).toBeTruthy();
    });
    const recoveredSave = saveMessage.mock.calls.find(
      (call) =>
        call[0] === 'project-recoverable-artifact-endedat' &&
        call[2]?.id === 'msg-recoverable-artifact-endedat' &&
        call[2]?.runStatus === 'succeeded',
    );
    // Must land on the daemon's authoritative terminal time, not the
    // disconnect-time stamp the synchronous onError handler wrote onto
    // `prev.endedAt` moments earlier.
    expect(recoveredSave?.[2]?.endedAt).toBe(daemonTerminalUpdatedAt);
  });
});
