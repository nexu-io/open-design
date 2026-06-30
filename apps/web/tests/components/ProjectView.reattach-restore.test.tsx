// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectView,
  computeProducedFiles,
  computeTraceObjectFiles,
  extractTouchedFilePathsFromEvents,
  findSameTurnHtmlWriteForRecoveredArtifact,
  mergeRecoveredArtifact,
} from '../../src/components/ProjectView';
import { resolvePersistedArtifactHtml } from '../../src/artifacts/recover';
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
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();

const chatPaneHarness = vi.hoisted(() => ({
  onSend: null as null | ((
    prompt: string,
    attachments: unknown[],
    commentAttachments?: unknown[],
    meta?: unknown,
  ) => unknown),
  onStop: null as null | (() => void),
}));

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
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
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
  cacheTabsLocally: vi.fn((projectId: string, tabs: unknown) => ({ projectId, tabs })),
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  persistTabsToDaemonNow: vi.fn(),
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
  ChatPane: ({
    onSend,
    onStop,
  }: {
    onSend: typeof chatPaneHarness.onSend;
    onStop: typeof chatPaneHarness.onStop;
  }) => {
    chatPaneHarness.onSend = onSend;
    chatPaneHarness.onStop = onStop;
    return null;
  },
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
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

describe('computeTraceObjectFiles', () => {
  it('includes existing files touched by successful write tools', () => {
    const before = ['existing.html'];
    const next = [
      { name: 'existing.html', path: 'existing.html', size: 10, mtime: 2, kind: 'html', mime: 'text/html' },
      { name: 'new.pptx', path: 'new.pptx', size: 20, mtime: 3, kind: 'presentation', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    ];

    const files = computeTraceObjectFiles(before, next as never, ['existing.html']);

    expect(files?.map((file) => [file.name, file.traceObjectReason])).toEqual([
      ['new.pptx', 'new'],
      ['existing.html', 'modified'],
    ]);
  });

  it('ignores slash-containing external paths that only share a basename with a project file', () => {
    const before = ['existing.html'];
    const next = [
      { name: 'existing.html', path: 'existing.html', size: 10, mtime: 2, kind: 'html', mime: 'text/html' },
    ];

    const files = computeTraceObjectFiles(before, next as never, ['/tmp/existing.html']);

    expect(files).toEqual([]);
  });

  it('recovers successful write paths from persisted tool events', () => {
    const touched = extractTouchedFilePathsFromEvents([
      { kind: 'tool_use', id: 'tool-1', name: 'Edit', input: { file_path: 'existing.html' } },
      { kind: 'tool_result', toolUseId: 'tool-1', isError: false },
      { kind: 'tool_use', id: 'tool-2', name: 'Write', input: { file_path: 'failed.html' } },
      { kind: 'tool_result', toolUseId: 'tool-2', isError: true },
    ] as never);

    expect(touched).toEqual(['existing.html']);
  });

  it('recovers supported write/edit aliases with path inputs from persisted tool events', () => {
    const touched = extractTouchedFilePathsFromEvents([
      { kind: 'tool_use', id: 'tool-1', name: 'create_file', input: { path: 'created.html' } },
      { kind: 'tool_result', toolUseId: 'tool-1', isError: false },
      { kind: 'tool_use', id: 'tool-2', name: 'str_replace_edit', input: { path: 'edited.html' } },
      { kind: 'tool_result', toolUseId: 'tool-2', isError: false },
      { kind: 'tool_use', id: 'tool-3', name: 'MultiEdit', input: { path: 'multi.html' } },
      { kind: 'tool_result', toolUseId: 'tool-3', isError: false },
      { kind: 'tool_use', id: 'tool-4', name: 'multi_edit', input: { path: 'failed.html' } },
      { kind: 'tool_result', toolUseId: 'tool-4', isError: true },
    ] as never);

    expect(touched).toEqual(['created.html', 'edited.html', 'multi.html']);
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

describe('findSameTurnHtmlWriteForRecoveredArtifact', () => {
  const html = '<!doctype html><html><head><title>Demo</title></head><body><main><h1>Demo</h1></main></body></html>';

  it('returns the same-turn HTML file when fallback content matches a Write output', async () => {
    const indexFile = {
      name: 'index.html',
      path: 'index.html',
      size: html.length,
      mtime: 2,
      kind: 'html',
      mime: 'text/html',
    };
    const readProjectHtml = vi.fn(async (name: string) =>
      name === 'index.html' ? `\uFEFF${html}\r\n` : null,
    );

    await expect(findSameTurnHtmlWriteForRecoveredArtifact({
      artifactHtml: `\n${html}\n`,
      producedFiles: [indexFile] as never,
      readProjectHtml,
    })).resolves.toBe(indexFile);
  });

  // #4308: agent-agnostic recovery is the *normalized exact content match* —
  // it already binds for any filesystem-backed CLI (not just Claude) when the
  // written file and the echoed artifact are the same document. We deliberately
  // do NOT bind on a content *mismatch*: a same-turn HTML file whose content
  // differs from the echo is a genuinely different document and must persist on
  // its own. (A blind single-file bind also mis-fired across queued runs, where
  // a prior run's artifact is still reported as "produced this turn" — the
  // app-restoration regression that motivated dropping it.)
  it('does not bind a single same-turn HTML file whose content differs from the echo', async () => {
    const indexFile = {
      name: 'index.html',
      path: 'index.html',
      size: html.length,
      mtime: 2,
      kind: 'html',
      mime: 'text/html',
    };

    await expect(findSameTurnHtmlWriteForRecoveredArtifact({
      artifactHtml: html,
      producedFiles: [indexFile] as never,
      readProjectHtml: vi.fn(async () => html.replace('Demo</h1>', 'Other</h1>')),
    })).resolves.toBeNull();
  });

  // ...and never bind when several same-turn HTML files all differ from the
  // echo — binding the wrong one could clobber the user's other in-flight work.
  it('avoids selection when multiple same-turn HTML files differ from the echo', async () => {
    const a = { name: 'a.html', path: 'a.html', kind: 'html', mime: 'text/html' };
    const b = { name: 'b.html', path: 'b.html', kind: 'html', mime: 'text/html' };

    await expect(findSameTurnHtmlWriteForRecoveredArtifact({
      artifactHtml: html,
      producedFiles: [a, b] as never,
      readProjectHtml: vi.fn(async (name: string) =>
        name === 'a.html' ? html.replace('Demo', 'AAA') : html.replace('Demo', 'BBB'),
      ),
    })).resolves.toBeNull();
  });

  // When multiple same-turn HTML files exist, bind the one whose normalized
  // content matches the echo — unambiguous regardless of which agent ran.
  it('binds the exact normalized match among multiple same-turn HTML files', async () => {
    const a = { name: 'a.html', path: 'a.html', kind: 'html', mime: 'text/html' };
    const b = { name: 'b.html', path: 'b.html', kind: 'html', mime: 'text/html' };

    await expect(findSameTurnHtmlWriteForRecoveredArtifact({
      artifactHtml: html,
      producedFiles: [a, b] as never,
      readProjectHtml: vi.fn(async (name: string) =>
        name === 'b.html' ? `﻿${html}\r\n` : html.replace('Demo', 'AAA'),
      ),
    })).resolves.toBe(b);
  });

  it('ignores non-HTML same-turn files', async () => {
    const readProjectHtml = vi.fn(async () => html);

    await expect(findSameTurnHtmlWriteForRecoveredArtifact({
      artifactHtml: html,
      producedFiles: [{ name: 'notes.md', path: 'notes.md', kind: 'text' }] as never,
      readProjectHtml,
    })).resolves.toBeNull();
    expect(readProjectHtml).not.toHaveBeenCalled();
  });
});

// #4318: when the model emits a prose-only <artifact> next to a complete
// same-turn <html> document, the call site must resolve the persisted HTML
// (recovering the preceding document) BEFORE the dedup lookup. Feeding the raw
// prose summary makes the normalized exact-match miss the same-turn Write file
// and the recovered document persists a second time as a duplicate artifact.
describe('same-turn dedup for recovered prose-only artifacts (#4318)', () => {
  const realHtml = '<!doctype html><html><head><title>Recovered</title></head><body><main><h1>Recovered</h1></main></body></html>';
  const proseSummary = '(The complete document above is the delivered artifact.)';
  const sourceText = `${realHtml}\n<artifact identifier="page" type="text/html">${proseSummary}</artifact>`;
  const indexFile = { name: 'index.html', path: 'index.html', kind: 'html', mime: 'text/html' };
  const readProjectHtml = () =>
    vi.fn(async (name: string) => (name === 'index.html' ? realHtml : null));

  it('binds the same-turn HTML write once the persisted HTML is resolved', async () => {
    const persistedHtml = resolvePersistedArtifactHtml({
      artifactHtml: proseSummary,
      identifier: 'page',
      sourceText,
    });
    await expect(findSameTurnHtmlWriteForRecoveredArtifact({
      artifactHtml: persistedHtml,
      producedFiles: [indexFile] as never,
      readProjectHtml: readProjectHtml(),
    })).resolves.toBe(indexFile);
  });

  it('misses the match when fed the raw prose summary (the pre-fix regression)', async () => {
    await expect(findSameTurnHtmlWriteForRecoveredArtifact({
      artifactHtml: proseSummary,
      producedFiles: [indexFile] as never,
      readProjectHtml: readProjectHtml(),
    })).resolves.toBeNull();
  });
});

describe('ProjectView daemon reattach restore', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    chatPaneHarness.onSend = null;
    chatPaneHarness.onStop = null;
    window.sessionStorage.clear();
  });

  it('does not replay a terminal succeeded row just because produced files are missing', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-done',
        role: 'assistant',
        content: 'All done!',
        createdAt: startedAt,
        startedAt,
        runStatus: 'succeeded',
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);

    renderProjectView();

    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalled());
    expect(listActiveChatRuns).not.toHaveBeenCalled();
    expect(listProjectRuns).not.toHaveBeenCalled();
    expect(fetchChatRunStatus).not.toHaveBeenCalled();
    expect(reattachDaemonRun).not.toHaveBeenCalled();
    expect(
      saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .some((m) => m?.id === 'msg-done' && m.runStatus === 'failed'),
    ).toBe(false);
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

  it('finalizes reattached telemetry only after trace object files are restored', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-trace',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-trace',
        runStatus: 'running',
        preTurnFileNames: ['existing.html'],
        events: [
          {
            kind: 'tool_use',
            id: 'tool-edit',
            name: 'str_replace_edit',
            input: { path: 'existing.html' },
          },
          { kind: 'tool_result', toolUseId: 'tool-edit', content: '', isError: false },
        ],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    const beforeFiles = [
      { name: 'existing.html', path: '/p/existing.html', size: 1, updatedAt: 0 },
    ];
    const afterFiles = [
      { name: 'existing.html', path: '/p/existing.html', size: 2, updatedAt: 1 },
    ];
    fetchProjectFiles.mockResolvedValueOnce(beforeFiles).mockResolvedValue(afterFiles);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-trace',
      status: 'running',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let captured: {
      onAgentEvent: (ev: unknown) => void;
      onDone: () => void;
    } | null = null;
    reattachDaemonRun.mockImplementation(async (options: any) => {
      captured = {
        onAgentEvent: options.handlers.onAgentEvent,
        onDone: options.handlers.onDone,
      };
      return new Promise<void>(() => {});
    });

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(captured).not.toBeNull();
    captured!.onAgentEvent({
      kind: 'tool_use',
      id: 'tool-edit',
      name: 'str_replace_edit',
      input: { path: 'existing.html' },
    });
    captured!.onAgentEvent({
      kind: 'tool_result',
      toolUseId: 'tool-edit',
      content: '',
      isError: false,
    });
    captured!.onDone();

    await waitFor(() => {
      const saves = saveMessage.mock.calls
        .map((call) => ({
          message: call[2] as ChatMessage,
          options: call[3] as { telemetryFinalized?: boolean } | undefined,
        }))
        .filter(({ message }) => message?.id === 'msg-reattach-trace');
      const firstFinalizedIndex = saves.findIndex(
        ({ options }) => options?.telemetryFinalized === true,
      );
      expect(firstFinalizedIndex).toBeGreaterThan(-1);
      expect(saves[firstFinalizedIndex]!.message.traceObjectFiles?.map((file) => [
        file.name,
        file.traceObjectReason,
      ])).toEqual([['existing.html', 'modified']]);
      expect(
        saves.slice(0, firstFinalizedIndex).some(
          ({ options }) => options?.telemetryFinalized === true,
        ),
      ).toBe(false);
    });
  });

  it('uses replayed events for trace object files during a full reattach replay', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-reattach-full-replay-trace',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-full-replay-trace',
        runStatus: 'running',
        preTurnFileNames: ['existing.html'],
        events: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    const beforeFiles = [
      { name: 'existing.html', path: '/p/existing.html', size: 1, updatedAt: 0 },
    ];
    const afterFiles = [
      { name: 'existing.html', path: '/p/existing.html', size: 2, updatedAt: 1 },
    ];
    fetchProjectFiles.mockResolvedValueOnce(beforeFiles).mockResolvedValue(afterFiles);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-full-replay-trace',
      status: 'running',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let captured: {
      onAgentEvent: (ev: unknown) => void;
      onDone: () => void;
    } | null = null;
    reattachDaemonRun.mockImplementation(async (options: any) => {
      captured = {
        onAgentEvent: options.handlers.onAgentEvent,
        onDone: options.handlers.onDone,
      };
      return new Promise<void>(() => {});
    });

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(captured).not.toBeNull();
    captured!.onAgentEvent({
      kind: 'tool_use',
      id: 'tool-edit',
      name: 'str_replace_edit',
      input: { path: 'existing.html' },
    });
    captured!.onAgentEvent({
      kind: 'tool_result',
      toolUseId: 'tool-edit',
      content: '',
      isError: false,
    });
    captured!.onDone();

    await waitFor(() => {
      const finalized = saveMessage.mock.calls
        .map((call) => ({
          message: call[2] as ChatMessage,
          options: call[3] as { telemetryFinalized?: boolean } | undefined,
        }))
        .filter(
          ({ message, options }) =>
            message?.id === 'msg-reattach-full-replay-trace' &&
            options?.telemetryFinalized === true,
        )
        .at(-1);
      expect(finalized?.message.traceObjectFiles?.map((file) => [
        file.name,
        file.traceObjectReason,
      ])).toEqual([['existing.html', 'modified']]);
    });
  });

  it('clears touched-file paths after a failed run before the next successful run finalizes', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    const projectFiles = [
      { name: 'existing.html', path: 'existing.html', size: 10, mtime: 1, kind: 'html', mime: 'text/html' },
    ];
    fetchProjectFiles.mockResolvedValue(projectFiles);
    streamViaDaemon
      .mockImplementationOnce(async (options: any) => {
        options.onRunCreated('run-failed');
        options.handlers.onAgentEvent({
          kind: 'tool_use',
          id: 'tool-1',
          name: 'str_replace_edit',
          input: { path: 'existing.html' },
        });
        options.handlers.onAgentEvent({
          kind: 'tool_result',
          toolUseId: 'tool-1',
          content: '',
          isError: false,
        });
        options.onRunStatus('failed');
        options.handlers.onError(new Error('failed after edit'));
      })
      .mockImplementationOnce(async (options: any) => {
        options.onRunCreated('run-succeeded');
        options.handlers.onDelta('done');
        options.handlers.onDone('done');
      });

    renderProjectView();
    await waitFor(() => expect(chatPaneHarness.onSend).toBeTruthy());

    await chatPaneHarness.onSend!('first run', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const failed = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .find((m) => m?.runId === 'run-failed' && m.runStatus === 'failed');
      expect(failed).toBeTruthy();
    });

    await chatPaneHarness.onSend!('second run', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      const secondRunFinal = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.runId === 'run-succeeded' && Array.isArray(m.traceObjectFiles))
        .at(-1);
      expect(secondRunFinal?.traceObjectFiles).toEqual([]);
    });
  });

  it('keeps touched-file paths isolated when a previous successful run finalizes late', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    const projectFiles = [
      { name: 'first.html', path: 'first.html', size: 10, mtime: 1, kind: 'html', mime: 'text/html' },
      { name: 'second.html', path: 'second.html', size: 10, mtime: 1, kind: 'html', mime: 'text/html' },
    ];
    fetchProjectFiles.mockResolvedValue(projectFiles);

    streamViaDaemon
      .mockImplementationOnce(async (options: any) => {
        options.onRunCreated('run-first');
        options.handlers.onAgentEvent({
          kind: 'tool_use',
          id: 'tool-first',
          name: 'str_replace_edit',
          input: { path: 'first.html' },
        });
        options.handlers.onAgentEvent({
          kind: 'tool_result',
          toolUseId: 'tool-first',
          content: '',
          isError: false,
        });
        options.handlers.onDelta('first done');
        options.handlers.onDone('first done');
      })
      .mockImplementationOnce(async (options: any) => {
        options.onRunCreated('run-second');
        options.handlers.onAgentEvent({
          kind: 'tool_use',
          id: 'tool-second',
          name: 'str_replace_edit',
          input: { path: 'second.html' },
        });
        options.handlers.onAgentEvent({
          kind: 'tool_result',
          toolUseId: 'tool-second',
          content: '',
          isError: false,
        });
        options.handlers.onDelta('second done');
        options.handlers.onDone('second done');
      });

    renderProjectView();
    await waitFor(() => expect(chatPaneHarness.onSend).toBeTruthy());
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalled());

    let resolveFirstFinalRefresh: ((files: typeof projectFiles) => void) | null = null;
    let resolveSecondFinalRefresh: ((files: typeof projectFiles) => void) | null = null;
    let refreshCall = 0;
    fetchProjectFiles.mockClear();
    fetchProjectFiles.mockImplementation(() => {
      refreshCall += 1;
      if (refreshCall === 2) {
        return new Promise<typeof projectFiles>((resolve) => {
          resolveFirstFinalRefresh = resolve;
        });
      }
      if (refreshCall === 4) {
        return new Promise<typeof projectFiles>((resolve) => {
          resolveSecondFinalRefresh = resolve;
        });
      }
      return Promise.resolve(projectFiles);
    });

    await chatPaneHarness.onSend!('first run', [], []);
    await waitFor(() => expect(resolveFirstFinalRefresh).toBeTruthy());

    await waitFor(() => {
      const started = chatPaneHarness.onSend!('second run', [], []);
      expect(started).toBeTruthy();
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resolveSecondFinalRefresh).toBeTruthy());

    resolveFirstFinalRefresh!(projectFiles);
    await Promise.resolve();
    resolveSecondFinalRefresh!(projectFiles);

    await waitFor(() => {
      const secondRunFinal = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.runId === 'run-second' && Array.isArray(m.traceObjectFiles))
        .at(-1);
      expect(secondRunFinal?.traceObjectFiles?.map((file) => file.name)).toEqual(['second.html']);
    });
  });

  it('keeps replacement touched files when a superseded run emits a late colliding tool result', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    const projectFiles = [
      { name: 'first.html', path: 'first.html', size: 10, mtime: 1, kind: 'html', mime: 'text/html' },
      { name: 'second.html', path: 'second.html', size: 10, mtime: 1, kind: 'html', mime: 'text/html' },
    ];
    fetchProjectFiles.mockResolvedValue(projectFiles);

    let firstHandlers: {
      onAgentEvent: (ev: unknown) => void;
    } | null = null;
    let secondHandlers: {
      onAgentEvent: (ev: unknown) => void;
      onDelta: (text: string) => void;
      onDone: (text?: string) => void;
    } | null = null;

    streamViaDaemon
      .mockImplementationOnce(async (options: any) => {
        options.onRunCreated('run-first');
        firstHandlers = options.handlers;
        options.handlers.onAgentEvent({
          kind: 'tool_use',
          id: 'tool-collide',
          name: 'str_replace_edit',
          input: { path: 'first.html' },
        });
        return new Promise<void>(() => {});
      })
      .mockImplementationOnce(async (options: any) => {
        options.onRunCreated('run-second');
        secondHandlers = options.handlers;
        options.handlers.onAgentEvent({
          kind: 'tool_use',
          id: 'tool-collide',
          name: 'str_replace_edit',
          input: { path: 'second.html' },
        });
        return new Promise<void>(() => {});
      });

    renderProjectView();
    await waitFor(() => expect(chatPaneHarness.onSend).toBeTruthy());
    await waitFor(() => expect(chatPaneHarness.onStop).toBeTruthy());

    void chatPaneHarness.onSend!('first run', [], []);
    await waitFor(() => expect(firstHandlers).toBeTruthy());

    chatPaneHarness.onStop!();
    await waitFor(() => {
      const stopped = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .find((m) => m?.runId === 'run-first' && m.runStatus === 'canceled');
      expect(stopped).toBeTruthy();
    });

    void chatPaneHarness.onSend!('second run', [], []);
    await waitFor(() => expect(secondHandlers).toBeTruthy());

    firstHandlers!.onAgentEvent({
      kind: 'tool_result',
      toolUseId: 'tool-collide',
      content: '',
      isError: false,
    });
    secondHandlers!.onAgentEvent({
      kind: 'tool_result',
      toolUseId: 'tool-collide',
      content: '',
      isError: false,
    });
    secondHandlers!.onDelta('second done');
    secondHandlers!.onDone('second done');

    await waitFor(() => {
      const secondRunFinal = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.runId === 'run-second' && Array.isArray(m.traceObjectFiles))
        .at(-1);
      expect(secondRunFinal?.traceObjectFiles?.map((file) => file.name)).toEqual(['second.html']);
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
