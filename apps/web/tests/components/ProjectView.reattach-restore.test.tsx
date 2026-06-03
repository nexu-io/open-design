// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectView,
  computeProducedFiles,
  mergeRecoveredArtifact,
} from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

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
const reattachDaemonRun = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();

vi.mock('../../src/i18n', () => ({
  // ProjectView calls useI18n() (for locale/t); mock it like the other
  // ProjectView suites so the render does not throw on a missing export.
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
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) =>
    fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

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
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: () => null,
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

function renderProjectView() {
  return render(
    <ProjectView
      project={
        { id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never
      }
      routeFileName={null}
      config={
        {
          mode: 'daemon',
          agentId: 'agent-1',
          notifications: undefined,
          agentModels: {},
        } as never
      }
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
}

describe('computeProducedFiles', () => {
  it('returns files not present in the before-set', () => {
    const before = ['existing.html'];
    const next = [
      { name: 'existing.html', path: '/p/existing.html', size: 1, updatedAt: 0 },
      { name: 'new.pptx', path: '/p/new.pptx', size: 2, updatedAt: 0 },
    ];
    const produced = computeProducedFiles(before, next as never);
    expect(produced?.map((f) => f.name)).toEqual(['new.pptx']);
  });

  it('excludes user sketch files from turn output attribution', () => {
    const before = ['existing.html'];
    const next = [
      { name: 'existing.html', path: '/p/existing.html', size: 1, mtime: 1, kind: 'html', mime: 'text/html' },
      { name: 'board.sketch.json', path: '/p/board.sketch.json', size: 2, mtime: 2, kind: 'sketch', mime: 'application/json' },
      { name: 'new.pptx', path: '/p/new.pptx', size: 3, mtime: 3, kind: 'pdf', mime: 'application/pdf' },
    ];
    const produced = computeProducedFiles(before, next as never);
    expect(produced?.map((f) => f.name)).toEqual(['new.pptx']);
  });

  it('keeps generated svg files even when they are classified as sketches', () => {
    const before = ['existing.html'];
    const next = [
      { name: 'existing.html', path: '/p/existing.html', size: 1, mtime: 1, kind: 'html', mime: 'text/html' },
      { name: 'diagram.svg', path: '/p/diagram.svg', size: 2, mtime: 2, kind: 'sketch', mime: 'image/svg+xml' },
      { name: 'board.sketch.json', path: '/p/board.sketch.json', size: 3, mtime: 3, kind: 'sketch', mime: 'application/json' },
    ];
    const produced = computeProducedFiles(before, next as never);
    expect(produced?.map((f) => f.name)).toEqual(['diagram.svg']);
  });

  it('returns undefined when no baseline is provided', () => {
    expect(computeProducedFiles(undefined, [] as never)).toBeUndefined();
  });
});

describe('mergeRecoveredArtifact', () => {
  const fileA = { name: 'helper.txt', path: '/p/helper.txt', size: 1, updatedAt: 0 };
  const artifact = { name: 'deck.html', path: '/p/deck.html', size: 9, updatedAt: 0 };

  it('keeps pre-artifact files when a recovered artifact is appended', () => {
    const merged = mergeRecoveredArtifact([fileA] as never, artifact as never);
    expect(merged.map((f) => f.name)).toEqual(['helper.txt', 'deck.html']);
  });

  it('does not duplicate the artifact if the diff already contains it', () => {
    const merged = mergeRecoveredArtifact([fileA, artifact] as never, artifact as never);
    expect(merged.map((f) => f.name)).toEqual(['helper.txt', 'deck.html']);
  });

  it('returns the diff unchanged when no artifact was recovered', () => {
    const merged = mergeRecoveredArtifact([fileA] as never, null);
    expect(merged.map((f) => f.name)).toEqual(['helper.txt']);
  });
});

describe('ProjectView daemon reattach restore', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('populates producedFiles on the persisted message after reattach completes', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-1',
        runStatus: 'running',
        preTurnFileNames: ['existing.html'],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    const beforeFiles = [{ name: 'existing.html', path: '/p/existing.html', size: 1, updatedAt: 0 }];
    const afterFiles = [
      ...beforeFiles,
      { name: 'new.pptx', path: '/p/new.pptx', size: 2, updatedAt: 0 },
    ];
    fetchProjectFiles.mockResolvedValueOnce(beforeFiles).mockResolvedValue(afterFiles);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-1',
      status: 'running',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let capturedHandlers: {
      onDelta: (text: string) => void;
      onAgentEvent: (ev: unknown) => void;
      onDone: () => void;
    } | null = null;
    reattachDaemonRun.mockImplementation(
      async (options: { handlers: { onDelta: any; onAgentEvent: any; onDone: any } }) => {
        capturedHandlers = options.handlers;
        return new Promise<void>(() => {});
      },
    );

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(capturedHandlers).not.toBeNull();

    capturedHandlers!.onDelta('hello ');
    capturedHandlers!.onAgentEvent({ kind: 'thinking', text: 'reasoning step' });
    capturedHandlers!.onDelta('world');
    capturedHandlers!.onDone();

    await waitFor(() => {
      const lastWithProduced = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.id === 'msg-reattach' && Array.isArray(m.producedFiles))
        .at(-1);
      expect(lastWithProduced?.producedFiles?.map((f) => f.name)).toEqual(['new.pptx']);
      expect(lastWithProduced?.runStatus).toBe('succeeded');
    });
  });

  it('reaches succeeded state via the SSE end event even when only the terminal event replays', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-late',
        role: 'assistant',
        content: 'partial',
        createdAt: startedAt,
        startedAt,
        runId: 'run-late',
        runStatus: 'running',
        preTurnFileNames: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-late',
      status: 'succeeded',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let capturedOnDone: (() => void) | null = null;
    reattachDaemonRun.mockImplementation(
      async (options: { handlers: { onDone: () => void } }) => {
        capturedOnDone = options.handlers.onDone;
        return new Promise<void>(() => {});
      },
    );

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(capturedOnDone).not.toBeNull();
    capturedOnDone!();

    await waitFor(() => {
      const succeeded = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .find((m) => m?.id === 'msg-late' && m.runStatus === 'succeeded');
      expect(succeeded).toBeTruthy();
    });
  });

  it('preserves failed runStatus when onRunStatus records failure before onDone fires', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-fail',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-fail',
        runStatus: 'running',
        preTurnFileNames: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-fail',
      status: 'failed',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: 1,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let captured: {
      onDone: () => void;
      onRunStatus: (s: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled') => void;
    } | null = null;
    reattachDaemonRun.mockImplementation(async (options: any) => {
      captured = { onDone: options.handlers.onDone, onRunStatus: options.onRunStatus };
      return new Promise<void>(() => {});
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(captured).not.toBeNull();

    captured!.onRunStatus('failed');
    captured!.onDone();

    await waitFor(() => {
      const finalSave = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.id === 'msg-fail' && (m.runStatus === 'failed' || m.runStatus === 'succeeded'))
        .at(-1);
      expect(finalSave?.runStatus).toBe('failed');
    });
  });

  it('renders AMR recharge guidance when a reattached run reports insufficient balance', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-amr-balance',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-amr-balance',
        runStatus: 'running',
        preTurnFileNames: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-amr-balance',
      status: 'running',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    reattachDaemonRun.mockImplementation(async (options: any) => {
      const error = new Error(
        'AMR Cloud reported insufficient balance for this model. Recharge your AMR wallet at https://open-design.ai/amr/wallet, then retry this run.',
      ) as Error & { code: string; details: unknown };
      error.code = 'AMR_INSUFFICIENT_BALANCE';
      error.details = {
        kind: 'amr_account',
        action: 'recharge',
        actionUrl: 'https://open-design.ai/amr/wallet',
      };
      options.handlers.onError(error);
    });

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const finalSave = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.id === 'msg-amr-balance' && m.runStatus === 'failed')
        .at(-1);
      expect(finalSave?.events?.some(
        (event) => event.kind === 'status'
          && event.label === 'error'
          && (event as { code?: string }).code === 'AMR_INSUFFICIENT_BALANCE',
      )).toBe(true);
    });
  });

  it('preserves canceled runStatus when onRunStatus records cancellation before onDone fires', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-cancel',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-cancel',
        runStatus: 'running',
        preTurnFileNames: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-cancel',
      status: 'canceled',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: null,
      signal: 'SIGTERM',
    });
    listActiveChatRuns.mockResolvedValue([]);

    let captured: { onDone: () => void; onRunStatus: (s: any) => void } | null = null;
    reattachDaemonRun.mockImplementation(async (options: any) => {
      captured = { onDone: options.handlers.onDone, onRunStatus: options.onRunStatus };
      return new Promise<void>(() => {});
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    captured!.onRunStatus('canceled');
    captured!.onDone();

    await waitFor(() => {
      const finalSave = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.id === 'msg-cancel' && (m.runStatus === 'canceled' || m.runStatus === 'succeeded'))
        .at(-1);
      expect(finalSave?.runStatus).toBe('canceled');
    });
  });

  it('persists the last buffered delta immediately on pagehide instead of waiting for the 500ms debounce', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-unload',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-unload',
        runStatus: 'running',
        preTurnFileNames: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-unload',
      status: 'running',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let capturedOnDelta: ((text: string) => void) | null = null;
    reattachDaemonRun.mockImplementation(async (options: any) => {
      capturedOnDelta = options.handlers.onDelta;
      return new Promise<void>(() => {});
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(capturedOnDelta).not.toBeNull();

    // Stream a delta. persistSoon would schedule a save in 500ms, but the
    // page is about to be torn down — anything not yet persisted is lost.
    capturedOnDelta!('last buffered chunk');

    // Page reload fires pagehide synchronously while the document is still
    // alive; the buffered chunk must reach saveMessage with keepalive=true
    // BEFORE the debounce timer would otherwise fire.
    saveMessage.mockClear();
    window.dispatchEvent(new Event('pagehide'));

    await waitFor(() => {
      const keepaliveSave = saveMessage.mock.calls.find((call) => {
        const msg = call[2] as ChatMessage;
        const opts = call[3] as { keepalive?: boolean } | undefined;
        return (
          msg?.id === 'msg-unload' &&
          typeof msg.content === 'string' &&
          msg.content.includes('last buffered chunk') &&
          opts?.keepalive === true
        );
      });
      expect(keepaliveSave).toBeTruthy();
    });
  });
});
