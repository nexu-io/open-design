// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { streamViaDaemon, type DaemonStreamOptions } from '../../src/providers/daemon';
import { I18nProvider } from '../../src/i18n';
import { listMessages, saveMessage } from '../../src/state/projects';
import type { AppConfig, ChatMessage, Project, ProjectFile } from '../../src/types';

vi.mock('../../src/router', () => ({ navigate: vi.fn(), registerNavigationGuard: vi.fn(() => () => {}) }));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', () => ({
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
vi.mock('../../src/components/FileViewer', () => ({
  FileViewer: () => null, LiveArtifactViewer: () => null,
}));
vi.mock('../../src/components/workspace/TerminalViewer', () => ({ TerminalViewer: () => null }));

const config: AppConfig = {
  mode: 'api', apiProtocol: 'openai', apiKey: 'test-key',
  baseUrl: 'https://provider.invalid', model: 'test-model',
  agentId: null, skillId: null, designSystemId: null,
};
let projectSequence = 0;
let project: Project;
let files: ProjectFile[];
let persisted: Map<string, ChatMessage>;
let fileRequests: Array<{ method: string; names: string[] }>;
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

async function successfulAgentWrite(options: DaemonStreamOptions, name: string, tool: 'Write' | 'Edit' = 'Write') {
  if (!files.some((file) => file.name === name)) files = [...files, projectFile(name)];
  await act(async () => {
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
}

async function finishRun(options: DaemonStreamOptions, authority: string[] | undefined) {
  const readsBeforeDone = fileRequests.filter((request) => request.method === 'GET').length;
  await act(async () => {
    if (authority !== undefined) options.onArtifactPaths?.(authority);
    options.onRunStatus?.('succeeded');
    options.handlers.onDone('The requested work is ready.');
    resolveStream?.();
  });
  await waitFor(() => {
    expect(fileRequests.filter((request) => request.method === 'GET').length).toBeGreaterThan(readsBeforeDone);
    const message = [...persisted.values()].find((entry) => entry.role === 'assistant' && entry.producedFiles !== undefined);
    expect(message?.runStatus).toBe('succeeded');
    expect(message?.traceObjectFiles).toBeDefined();
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
  persisted = new Map();
  fileRequests = [];
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
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { name: string; content: string };
        if (body.name === 'document.md') expect(body.content).toMatch(/^# Document\n/);
        else {
          expect(body.name).toBe('landing-page.html');
          expect(body.content).toBe(persistedArtifactHtml);
        }
        const file = projectFile(body.name);
        files = [...files, file];
        fileRequests.push({ method: 'POST', names: [file.name] });
        return Response.json({ file });
      }
      fileRequests.push({ method: 'GET', names: files.map((file) => file.name) });
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

describe('ProjectView run-produced file ownership (OPEND-2928)', () => {
  it('keeps a concurrent user-created document in the project but out of the Agent message and trace', async () => {
    const options = await startRun();
    await createPersonalDocument();
    await successfulAgentWrite(options, 'agent.html');
    await finishRun(options, ['agent.html']);
    expect(files.map((file) => file.name)).toContain('document.md');
    expect(screen.getByTestId('project-files').textContent).toContain('document.md');
    await expectAttribution(['agent.html']);
  });

  it('keeps a Markdown deliverable proven by a successful Agent Write when artifact paths are empty', async () => {
    const options = await startRun();
    await successfulAgentWrite(options, 'agent-notes.md');
    await finishRun(options, []);
    await expectAttribution(['agent-notes.md']);
  });

  it('attributes a user-created document once this Agent actually edits it successfully', async () => {
    const options = await startRun();
    await createPersonalDocument();
    await successfulAgentWrite(options, 'document.md', 'Edit');
    await finishRun(options, []);
    await expectAttribution(['document.md']);
  });

  it('keeps the existing new-file fallback for a legacy runtime without authoritative artifact paths', async () => {
    const options = await startRun();
    files = [...files, projectFile('legacy-output.md')];
    await finishRun(options, undefined);
    await expectAttribution(['legacy-output.md']);
  });
});

const persistedArtifactHtml = '<!doctype html><html><head><title>Landing</title></head><body><main><h1>Landing page</h1><p>Generated design artifact with enough structure to persist.</p></main></body></html>';

describe('ProjectView producer evidence compatibility (OPEND-2928)', () => {
  for (const tool of ['Bash', 'apply_patch'] as const) {
    it(`keeps Markdown generated through ${tool} with an empty artifact whitelist`, async () => {
      const options = await startRun();
      files = [...files, projectFile('shell-notes.md')];
      await act(async () => {
        options.handlers.onAgentEvent({
          kind: 'tool_use', id: 'opaque-write', name: tool,
          input: tool === 'Bash'
            ? { command: "printf '# Notes' > shell-notes.md" }
            : { patch: '*** Begin Patch\n*** Add File: shell-notes.md\n+# Notes\n*** End Patch' },
        });
        options.handlers.onAgentEvent({
          kind: 'tool_result', toolUseId: 'opaque-write', content: 'Saved', isError: false,
        });
      });
      await finishRun(options, []);
      await expectAttribution(['shell-notes.md']);
    });
  }

  it('keeps a user-created file subsequently modified by a successful Shell operation', async () => {
    const options = await startRun();
    await createPersonalDocument();
    files = files.map((file) => file.name === 'document.md'
      ? { ...file, size: file.size + 20, mtime: file.mtime + 1000 }
      : file);
    await act(async () => {
      options.handlers.onAgentEvent({
        kind: 'tool_use', id: 'shell-edit', name: 'Bash',
        input: { command: "printf '# Revised notes' > document.md" },
      });
      options.handlers.onAgentEvent({
        kind: 'tool_result', toolUseId: 'shell-edit', content: 'Saved', isError: false,
      });
    });
    await finishRun(options, []);
    await expectAttribution(['document.md']);
  });

  it('attributes a chat artifact saved by ProjectView through the same browser file POST API', async () => {
    const options = await startRun();
    await createPersonalDocument();
    await act(async () => {
      options.handlers.onDelta(
        '<artifact identifier="landing-page" type="text/html" title="Landing Page">'
          + persistedArtifactHtml + '</artifact>',
      );
    });
    await finishRun(options, []);
    expect(fileRequests.filter((request) => request.method === 'POST').map((request) => request.names[0]))
      .toEqual(['document.md', 'landing-page.html']);
    await expectAttribution(['landing-page.html']);
  });

  it('does not attribute a manual document after the Agent failed to edit it', async () => {
    const options = await startRun();
    await createPersonalDocument();
    await successfulAgentWrite(options, 'agent.html');
    await act(async () => {
      options.handlers.onAgentEvent({
        kind: 'tool_use', id: 'failed-edit', name: 'Edit',
        input: { file_path: '/workspace/owner-test/document.md', old_string: 'missing', new_string: 'replacement' },
      });
      options.handlers.onAgentEvent({
        kind: 'tool_result', toolUseId: 'failed-edit', content: 'Old text not found', isError: true,
      });
    });
    await finishRun(options, ['agent.html']);
    expect(screen.getByTestId('project-files').textContent).toContain('document.md');
    await expectAttribution(['agent.html']);
  });
});
