// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { fetchChatRunStatus, reattachDaemonRun, streamViaDaemon, type DaemonStreamOptions } from '../../src/providers/daemon';
import { I18nProvider } from '../../src/i18n';
import { listMessages, saveMessage } from '../../src/state/projects';
import type { AppConfig, ChatMessage, Project, ProjectFile } from '../../src/types';

vi.mock('../../src/router', () => ({ navigate: vi.fn(), registerNavigationGuard: vi.fn(() => () => {}) }));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/providers/daemon')>(),
  fetchChatRunStatus: vi.fn(),
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));
vi.mock('../../src/providers/project-events', () => ({ useProjectFileEvents: vi.fn() }));
vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystem: vi.fn().mockResolvedValue(null),
    fetchProjectDesignSystemPackageAudit: vi.fn().mockResolvedValue(null),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchProjectFilePreview: vi.fn().mockResolvedValue(null),
    fetchProjectFileText: vi.fn().mockResolvedValue(null),
    fetchProjectFolders: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn().mockResolvedValue(null),
    // Keep the real file-list HTTP/cache boundary for terminal recovery.
  };
});
vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn(),
    listPlugins: vi.fn().mockResolvedValue([]),
    getTemplate: vi.fn().mockResolvedValue(null),
    listConversations: vi.fn().mockImplementation(async (projectId: string) => [{
      id: `conv-${projectId}`, projectId, title: null, createdAt: 1, updatedAt: 1,
    }]),
    listMessages: vi.fn(),
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});
vi.mock('../../src/components/AppChromeHeader', () => ({ AppChromeHeader: () => null, APP_CHROME_FILE_ACTIONS_ID: 'test-file-actions' }));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ messages, onSend, viewerOnly }: {
    messages: ChatMessage[];
    onSend: (prompt: string, attachments: [], comments: []) => void;
    viewerOnly?: boolean;
  }) => (
    <section>
      <button disabled={viewerOnly} onClick={() => onSend('Create the requested deliverable.', [], [])}>
        Send owner test
      </button>
      <output data-testid="assistant-produced-files">{JSON.stringify(
        messages.filter((message) => message.role === 'assistant').map((message) => ({
          id: message.id,
          produced: message.producedFiles?.map((file) => file.name),
          trace: message.traceObjectFiles?.map((file) => file.name),
        })),
      )}</output>
    </section>
  ),
}));
// Observe the file list independently of the chat message association.
vi.mock('../../src/components/FileWorkspace', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/FileWorkspace')>(
    '../../src/components/FileWorkspace',
  );
  const Real = actual.FileWorkspace;
  return {
    ...actual,
    FileWorkspace: (props: Parameters<typeof Real>[0]) => <>
      <Real {...props} />
      <output data-testid="project-files">{JSON.stringify(props.files.map((file) => file.name))}</output>
    </>,
  };
});
// File rendering is covered by the ChatPane regression.
vi.mock('../../src/components/FileViewer', () => ({
  FileViewer: () => null, LiveArtifactViewer: () => null,
}));
vi.mock('../../src/components/workspace/TerminalViewer', () => ({ TerminalViewer: () => null }));

const config: AppConfig = {
  mode: 'daemon', apiProtocol: 'openai', apiKey: 'test-key',
  baseUrl: 'https://provider.invalid', model: 'test-model',
  agentId: 'deepseek-harness', skillId: null, designSystemId: null,
};
let projectSequence = 0;
let project: Project;
let files: ProjectFile[];
let persisted: Map<string, ChatMessage>;
let resolveStream: (() => void) | undefined;

function projectFile(name: string): ProjectFile {
  return {
    name, path: name, kind: name.endsWith('.html') ? 'html' : 'code',
    mime: name.endsWith('.html') ? 'text/html' : 'text/markdown',
    size: 40, mtime: Date.now(),
  };
}

function mountProject() {
  return render(<I18nProvider initial="en"><ProjectView
    project={project}
    initialProjectDetail={{ project, resolvedDir: '/workspace/owner-test' }}
    routeFileName={null}
    config={config}
    agents={[{ id: 'deepseek-harness', name: 'DeepSeek Harness', bin: 'dsh', available: true, models: [] }]}
    skills={[]}
    designTemplates={[]}
    designSystems={[]}
    daemonLive
    onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()}
    onRefreshAgents={vi.fn()} onOpenSettings={vi.fn()} onBack={vi.fn()}
    onClearPendingPrompt={vi.fn()} onTouchProject={vi.fn()} onProjectChange={vi.fn()}
    onProjectsRefresh={vi.fn()}
  /></I18nProvider>);
}

async function startRun(): Promise<DaemonStreamOptions> {
  mountProject();
  await waitFor(() => {
    expect(vi.mocked(listMessages)).toHaveBeenCalled();
    expect(screen.getByTestId('project-files').textContent).toContain('input.md');
    expect(screen.getByRole('button', { name: 'Send owner test' })).not.toBeDisabled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send owner test' }));
  await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
  const options = vi.mocked(streamViaDaemon).mock.calls[0]![0];
  await act(async () => {
    options.onRunCreated?.(`run-${project.id}`);
    options.onRunStatus?.('running');
  });
  return options;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchChatRunStatus).mockReset().mockResolvedValue(null);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  project = { id: `owner-project-${++projectSequence}`, name: 'Owner test', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 };
  files = [projectFile('input.md')];
  persisted = new Map();
  resolveStream = undefined;
  vi.mocked(listMessages).mockImplementation(async () => [...persisted.values()].map((message) => structuredClone(message)));
  vi.mocked(saveMessage).mockImplementation(async (_projectId, _conversationId, message) => {
    persisted.set(message.id, structuredClone(message));
    return structuredClone(message);
  });
  vi.mocked(streamViaDaemon).mockImplementation(() => new Promise<void>((resolve) => { resolveStream = resolve; }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    if (url.pathname === `/api/projects/${project.id}/files`) {
      return Response.json({ files });
    }
    if (url.pathname === `/api/projects/${project.id}`) {
      return Response.json({ project, resolvedDir: '/workspace/owner-test' });
    }
    return Response.json({});
  }));
});

afterEach(() => {
  cleanup();
  resolveStream?.();
  vi.unstubAllGlobals();
});

describe('issue #8596: produced artifacts on a terminal no-prose run', () => {
  it.each([
    { runStatus: 'failed', withStrategyTask: false },
    { runStatus: 'failed', withStrategyTask: true },
    { runStatus: 'canceled', withStrategyTask: false },
    { runStatus: 'canceled', withStrategyTask: true },
  ] as const)('recovers $runStatus-run artifacts on reopen (strategy task: $withStrategyTask)', async ({ runStatus, withStrategyTask }) => {
    const artifact: ProjectFile = { ...projectFile('image-result.png'), kind: 'image', mime: 'image/png' };
    files = [...files, artifact, projectFile('unrelated-later-file.html')];
    const message = {
      id: 'assistant-reopened', role: 'assistant', content: '', createdAt: 1000,
      startedAt: 1000, endedAt: 2000, runId: 'run-reopened', runStatus,
      agentId: 'deepseek-harness', preTurnFileNames: ['input.md'],
      events: runStatus === 'failed'
        ? [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
          failureCategory: 'empty_output', failureDetail: 'empty_output' }]
        : [{ kind: 'status', label: 'canceled' }],
    } as ChatMessage;
    persisted.set(message.id, message);
    vi.mocked(fetchChatRunStatus).mockResolvedValue({
      id: message.runId!, assistantMessageId: message.id,
      status: runStatus, agentId: 'deepseek-harness',
      createdAt: 1000, updatedAt: 2000, terminalAt: 2000,
      artifactCount: 1, artifactPaths: [artifact.name],
      ...(runStatus === 'failed' ? {
        failureCategory: 'empty_output', failureDetail: 'empty_output',
      } : {}),
      projectId: project.id, conversationId: `conv-${project.id}`,
      ...(withStrategyTask ? { strategyTask: {
        taskExecutionId: 'task-reopened',
        strategy: { id: 'od-next-strategy', version: '2.0.0',
          packageHash: 'b'.repeat(64), snapshotId: 'snapshot-reopened' },
        inputStage: 'production', outcome: runStatus === 'failed' ? 'blocked' : 'canceled', route: 'direct_edit',
        executionMode: 'simple', activeRunId: message.runId!, terminal: true,
      } as const } : {}),
    });
    // Hold the fresh file read across a React commit. A task projection must
    // not invalidate its own recovery effect while that HTTP request is pending.
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    const pendingReads: Array<() => void> = [];
    let fileReads = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes(`/api/projects/${project.id}/files`) && ++fileReads > 1) {
        return new Promise<Response>((resolve) => {
          pendingReads.push(() => resolve(Response.json({ files })));
        });
      }
      return originalFetch(input, init);
    });
    mountProject();
    await waitFor(() => expect(fetchChatRunStatus).toHaveBeenCalledWith(message.runId, null));
    await waitFor(() => expect(pendingReads).toHaveLength(1));
    await act(async () => { pendingReads.shift()!(); });
    await waitFor(() => expect(persisted.get(message.id)?.producedFiles?.map((file) => file.name))
      .toEqual([artifact.name]));
    expect(persisted.get(message.id)?.runStatus).toBe(runStatus);
    expect(persisted.get(message.id)?.endedAt).toBe(message.endedAt);
    expect(persisted.get(message.id)?.events).toEqual(message.events);
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it.each(['running', 'succeeded'] as const)('does not replay a canceled message when the daemon still reports %s', async (status) => {
    const message = {
      id: 'assistant-stopped', role: 'assistant', content: '', createdAt: 1000,
      startedAt: 1000, endedAt: 2000, runId: 'run-stopped', runStatus: 'canceled',
      agentId: 'deepseek-harness',
      events: [{ kind: 'status', label: 'canceled' }],
    } as ChatMessage;
    persisted.set(message.id, message);
    let resolveStatus!: (value: NonNullable<Awaited<ReturnType<typeof fetchChatRunStatus>>>) => void;
    vi.mocked(fetchChatRunStatus).mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    mountProject();
    await waitFor(() => expect(fetchChatRunStatus).toHaveBeenCalledWith(message.runId, null));
    await act(async () => resolveStatus({
      id: message.runId!, assistantMessageId: message.id,
      status, agentId: 'deepseek-harness', createdAt: 1000, updatedAt: 2000,
      artifactCount: 0, projectId: project.id, conversationId: `conv-${project.id}`,
    }));
    expect(persisted.get(message.id)?.runStatus).toBe('canceled');
    expect(persisted.get(message.id)?.endedAt).toBe(message.endedAt);
    expect(persisted.get(message.id)?.events).toEqual(message.events);
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('attributes and persists the artifact delivered in the terminal frame', async () => {
    const options = await startRun();
    const artifact = projectFile('image-result.png');
    files = [...files, artifact];
    await act(async () => {
      options.onArtifactPaths?.([artifact.name]);
      options.handlers.onArtifactCount?.(1);
      options.onRunStatus?.('failed');
      options.handlers.onError(Object.assign(new Error('Agent returned no text output.'), {
        code: 'AGENT_EXECUTION_FAILED',
        failureCategory: 'empty_output',
        failureDetail: 'empty_output',
      }));
      resolveStream?.();
    });
    await waitFor(() => {
      const message = [...persisted.values()].find((entry) => entry.role === 'assistant');
      expect(message?.runStatus).toBe('failed');
    });
    const message = [...persisted.values()].find((entry) => entry.role === 'assistant')!;
    await waitFor(() => expect(
      [...persisted.values()].find((entry) => entry.id === message.id)?.producedFiles?.map((file) => file.name),
    ).toEqual([artifact.name]));
  });
});
