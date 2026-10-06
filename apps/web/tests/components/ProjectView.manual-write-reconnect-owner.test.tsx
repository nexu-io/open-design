// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { streamViaDaemon, reattachDaemonRun, fetchChatRunStatus, GENERIC_DAEMON_DISCONNECT_CODE, GENERIC_DAEMON_DISCONNECT_MESSAGE, type DaemonStreamOptions } from '../../src/providers/daemon';
import type { ProjectEvent } from '../../src/providers/project-events';
import { I18nProvider } from '../../src/i18n';
import { listMessages, saveMessage } from '../../src/state/projects';
import type { AppConfig, ChatMessage, Project, ProjectFile } from '../../src/types';

vi.mock('../../src/router', () => ({ navigate: vi.fn(), registerNavigationGuard: vi.fn(() => () => {}) }));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', () => ({
  GENERIC_DAEMON_DISCONNECT_CODE: 'DAEMON_STREAM_DISCONNECTED',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: vi.fn(),
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));
vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn((_projectId: string, enabled: boolean, callback: (event: ProjectEvent) => void) => {
    projectFileEventHandler = enabled ? callback : undefined;
  }),
}));
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
    fetchProjectFileText: vi.fn().mockImplementation(async (_projectId: string, name: string) => fileContents.get(name) ?? null),
    fetchProjectFolders: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn().mockResolvedValue(null),
    // Keep real fetchProjectFiles and writeProjectTextFile. A user's POST and
    // completion's fresh GET exercise their normal HTTP/cache boundaries.
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
// Observe the file list without replacing FileWorkspace or its create handler.
// The actual launcher -> createMarkdownDocument -> POST -> refresh path runs.
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
// File rendering is not part of producer attribution or manual creation.
vi.mock('../../src/components/FileViewer', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/FileViewer')>(
    '../../src/components/FileViewer',
  );
  const Real = actual.FileViewer;
  return {
    ...actual,
    // Markdown rendering and save effects are real; unrelated HTML preview is not mounted.
    FileViewer: (props: Parameters<typeof Real>[0]) => props.file.name.endsWith('.md')
      ? <Real {...props} /> : null,
  };
});
vi.mock('../../src/components/workspace/TerminalViewer', () => ({ TerminalViewer: () => null }));

const config: AppConfig = {
  mode: 'daemon', apiProtocol: 'openai', apiKey: 'test-key',
  baseUrl: 'https://provider.invalid', model: 'test-model',
  agentId: 'byok-opencode', skillId: null, designSystemId: null,
};
let projectSequence = 0;
let project: Project;
let files: ProjectFile[];
let fileContents: Map<string, string>;
let persisted: Map<string, ChatMessage>;
let fileRequests: Array<{ method: string; names: string[] }>;
let resolveStream: (() => void) | undefined;
let projectFileEventHandler: ((event: ProjectEvent) => void) | undefined;

function projectFile(name: string): ProjectFile {
  return {
    name, path: name, kind: name.endsWith('.html') ? 'html' : 'text',
    mime: name.endsWith('.html') ? 'text/html' : 'text/markdown',
    size: 40, mtime: Date.now(),
  };
}

function mountProject(runConfig: AppConfig = config) {
  return render(<I18nProvider initial="en"><ProjectView
    project={project}
    initialProjectDetail={{ project, resolvedDir: '/workspace/owner-test' }}
    routeFileName={null}
    config={runConfig}
    workspaceContextOverride={null}
    agents={[{ id: 'byok-opencode', name: 'BYOK OpenCode', bin: 'opencode', available: true, models: [] }]}
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
    options.handlers.onDelta('The requested work is ready.');
  });
  return options;
}

async function createPersonalDocument() {
  fireEvent.click(screen.getByTestId('workspace-add-tab'));
  fireEvent.click(await screen.findByRole('button', { name: /New document/i }));
  await waitFor(() => {
    expect(fileRequests.some((request) => request.method === 'POST' && request.names[0] === 'document.md'))
      .toBe(true);
    expect(screen.getByTestId('project-files').textContent).toContain('document.md');
  });
}

async function successfulAgentWrite(options: Pick<DaemonStreamOptions, 'handlers'>, name: string, tool: 'Write' | 'Edit' = 'Write') {
  if (!files.some((file) => file.name === name)) files = [...files, projectFile(name)];
  await act(async () => {
    expect(projectFileEventHandler).toBeDefined();
    projectFileEventHandler?.({ type: 'file-changed', path: name, kind: tool === 'Edit' ? 'change' : 'add' });
    options.handlers.onAgentEvent({
      kind: 'tool_use', id: `write-${name}`, name: tool,
      input: {
        file_path: `/workspace/owner-test/${name}`,
        ...(tool === 'Edit'
          ? { old_string: '# Document', new_string: '# Agent revised notes' }
          : { content: '# Agent deliverable' }),
      },
    });
    options.handlers.onAgentEvent({
      kind: 'tool_result', toolUseId: `write-${name}`, content: 'Saved', isError: false,
    });
  });
  // File-watch refresh is coalesced by the real PV handler (80ms). The run
  // must not terminate until this fixture's Agent write is actually observed;
  // reattach completion may legitimately reuse the settled file-list cache.
  await waitFor(() => {
    expect(fileRequests.some((request) => request.method === 'GET' && request.names.includes(name))).toBe(true);
    expect(screen.getByTestId('project-files').textContent).toContain(name);
  });
}

async function finishRun(
  options: Pick<DaemonStreamOptions, 'handlers' | 'onArtifactPaths' | 'onRunStatus'>,
  authority: string[] | undefined,
  completion: 'send' | 'reattach' = 'send',
) {
  await act(async () => {
    if (authority !== undefined) options.onArtifactPaths?.(authority);
    options.onRunStatus?.('succeeded');
    await options.handlers.onDone('The requested work is ready.');
    resolveStream?.();
  });
  await waitFor(() => {
    const message = [...persisted.values()].find((entry) => entry.role === 'assistant' && entry.producedFiles !== undefined);
    expect(message?.runStatus).toBe('succeeded');
    expect(message?.traceObjectFiles).toBeDefined();
    // The reattach callback is awaited above and persists succeeded + file
    // projections; its contract does not require resultDeliveryState.
    if (completion === 'send') expect(message?.resultDeliveryState).toBeDefined();
  });
  return [...persisted.values()].find((message) => message.role === 'assistant')!;
}

async function expectAttribution(names: string[]) {
  const expected = [...names].sort();
  const message = [...persisted.values()].find((entry) => entry.role === 'assistant')!;
  expect(message.producedFiles?.map((file) => file.name).sort()).toEqual(expected);
  expect(message.traceObjectFiles?.map((file) => file.name).sort()).toEqual(expected);
  // Replay through the production ProjectView history read, not a second
  // attribution helper call. The message provider is the persistence boundary.
  cleanup();
  mountProject();
  await waitFor(() => {
    const replay = JSON.parse(screen.getByTestId('assistant-produced-files').textContent ?? '[]') as Array<{
      id: string; produced: string[]; trace: string[];
    }>;
    expect(replay.find((entry) => entry.id === message.id)?.produced?.sort()).toEqual(expected);
    expect(replay.find((entry) => entry.id === message.id)?.trace?.sort()).toEqual(expected);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  project = { id: `owner-project-${++projectSequence}`, name: 'Owner test', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 };
  files = [projectFile('input.md')];
  fileContents = new Map([['input.md', '# Existing input']]);
  persisted = new Map();
  fileRequests = [];
  resolveStream = undefined;
  projectFileEventHandler = undefined;
  vi.mocked(listMessages).mockImplementation(async () => [...persisted.values()].map((message) => structuredClone(message)));
  vi.mocked(saveMessage).mockImplementation(async (_projectId, _conversationId, message) => {
    persisted.set(message.id, structuredClone(message));
    return structuredClone(message);
  });
  vi.mocked(streamViaDaemon).mockImplementation(() => new Promise<void>((resolve) => { resolveStream = resolve; }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    if (url.pathname === `/api/projects/${project.id}/files`) {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { name: string; content: string };
        if (body.name === 'document.md') expect(body.content).toMatch(/^(# Document\n|# Manual autosave revision$)/);
        else {
          expect(body.name).toBe('landing-page.html');
          expect(body.content).toBe(persistedArtifactHtml);
        }
        const file = projectFile(body.name);
        const previous = files.find((entry) => entry.name === body.name);
        if (previous) {
          file.mtime = previous.mtime + 1000;
          file.size = previous.size + 20;
        }
        fileContents.set(body.name, body.content);
        files = [...files.filter((entry) => entry.name !== body.name), file];
        fileRequests.push({ method: 'POST', names: [file.name] });
        return Response.json({ file });
      }
      fileRequests.push({ method: 'GET', names: files.map((file) => file.name) });
      return Response.json({ files });
    }
    if (url.pathname === `/api/projects/${project.id}/workspace-scope`) {
      return Response.json({ scope: { kind: 'unbound', projectId: project.id, workspaceId: null, context: null } });
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});


const persistedArtifactHtml = '';


describe('ProjectView manual receipts across one physical run reconnect (OPEND-2928)', () => {
  for (const reconnect of [false, true]) {
    it(`keeps the manual document out of the same run ${reconnect ? 'after a generic disconnect and real reattach' : 'without a disconnect'}`, async () => {
      const runCreatedAt = Date.now();
      const original = await startRun();
      const originalRunId = `run-${project.id}`;
      await createPersonalDocument();
      await waitFor(() => expect([...persisted.values()].find((message) => message.runId === originalRunId)?.runStatus)
        .toBe('running'));
      const originalMessage = [...persisted.values()].find((message) => message.runId === originalRunId)!;
      const originalUserIds = [...persisted.values()].filter((message) => message.role === 'user').map((message) => message.id);
      expect(originalUserIds).toHaveLength(1);
      let resumed: Pick<DaemonStreamOptions, 'handlers' | 'onArtifactPaths' | 'onRunStatus'> = original;
      if (reconnect) {
        vi.mocked(fetchChatRunStatus).mockResolvedValue({
          id: originalRunId, projectId: project.id, conversationId: `conv-${project.id}`,
          assistantMessageId: originalMessage.id, agentId: 'byok-opencode',
          status: 'running', createdAt: runCreatedAt, updatedAt: Date.now(),
          exitCode: null, signal: null,
        });
        const settleOriginalStream = resolveStream;
        vi.mocked(reattachDaemonRun).mockImplementation(() => new Promise<void>((resolve) => { resolveStream = resolve; }));
        await act(async () => {
          await original.handlers.onError(Object.assign(new Error(GENERIC_DAEMON_DISCONNECT_MESSAGE), {
            code: GENERIC_DAEMON_DISCONNECT_CODE,
          }));
          settleOriginalStream?.();
        });
        await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
        const attached = vi.mocked(reattachDaemonRun).mock.calls[0]![0];
        expect(attached.runId).toBe(originalRunId);
        expect(attached.projectId).toBe(project.id);
        expect(attached.conversationId).toBe(`conv-${project.id}`);
        expect(streamViaDaemon).toHaveBeenCalledTimes(1);
        resumed = attached;
      }
      await successfulAgentWrite(resumed, 'agent.html');
      await act(async () => { resumed.handlers.onDelta('The original run has finished.'); });
      await finishRun(resumed, ['agent.html'], reconnect ? 'reattach' : 'send');
      expect([...persisted.values()].filter((message) => message.role === 'user').map((message) => message.id))
        .toEqual(originalUserIds);
      const finished = [...persisted.values()].find((message) => message.role === 'assistant')!;
      expect(finished.id).toBe(originalMessage.id);
      expect(finished.runId).toBe(originalRunId);
      expect(files.some((file) => file.name === 'document.md')).toBe(true);
      if (!reconnect) expect(reattachDaemonRun).not.toHaveBeenCalled();
      await expectAttribution(['agent.html']);
    });
  }
});
