// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { streamViaDaemon } from '../../src/providers/daemon';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { I18nProvider } from '../../src/i18n';
import { createProject, listMessages } from '../../src/state/projects';
import type { AppConfig, ChatMessage, Project, ProjectFile } from '../../src/types';

vi.mock('../../src/router', () => ({ navigate: vi.fn(), registerNavigationGuard: vi.fn(() => () => {}) }));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/daemon')>('../../src/providers/daemon');
  return {
    ...actual,
    fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
    listActiveChatRuns: vi.fn().mockResolvedValue([]),
    listProjectRuns: vi.fn().mockResolvedValue([]),
    publishDaemonRunFinishedEvent: vi.fn(),
    // Real POST /runs, SSE decoder, strategy verdict and callback ordering.
    streamViaDaemon: vi.fn(actual.streamViaDaemon),
  };
});
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
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveTabs: vi.fn(),
  };
});
vi.mock('../../src/components/AppChromeHeader', () => ({ AppChromeHeader: () => null, APP_CHROME_FILE_ACTIONS_ID: 'test-file-actions' }));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ messages, onSend, viewerOnly, sendDisabled, error, activeConversationId, streaming, loading, initialDraft, queuedItems }: {
    messages: ChatMessage[];
    onSend: (prompt: string, attachments: [], comments: []) => void;
    viewerOnly?: boolean;
    sendDisabled?: boolean;
    error?: string | null;
    activeConversationId?: string | null;
    streaming?: boolean;
    loading?: boolean;
    initialDraft?: string;
    queuedItems?: unknown[];
  }) => (
    <section>
      <output data-testid="home-setup-state">{JSON.stringify({ viewerOnly, sendDisabled, error, activeConversationId, streaming, loading, initialDraft, messageCount: messages.length, roles: messages.map((m) => m.role), queuedCount: queuedItems?.length })}</output>
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
// Keep the real Markdown editor/autosave; only unrelated HTML iframe work is omitted.
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

// The HTTP fixture models the daemon-owned physical status and message store.
// It does not import daemon private code, intercept ownership callbacks, reset
// the registry cache, or put an Agent output in the file list before its POST.
const config: AppConfig = {
  // AppConfig.model is always a string, even when a local CLI has no model pick.
  mode: 'daemon', apiProtocol: 'openai', apiKey: '', baseUrl: '', model: '',
  agentId: 'opencode', skillId: null, designSystemId: null,
};
const html = '<!doctype html><html><body><h1>Agent output</h1><p>Fresh artifact produced during this run.</p></body></html>';
const artifact = '<artifact identifier="agent-output" type="text/html" title="Agent output">' + html + '</artifact>';
const manualText = '# Manual autosave revision';
const lateManualText = '# A later manual save while the HTML response is pending\n\nKeep this user revision out of Agent outputs.';
function deferredGate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
let firstTerminalReadGate: ReturnType<typeof deferredGate>;
let htmlResponseGate: ReturnType<typeof deferredGate>;
let firstTerminalReadArrived: boolean;
let htmlPostStored: boolean;
let causalOrder: string[];
let messageWrites: ChatMessage[];
const agentNotes = '# Agent notes written successfully during this run';

let homeStorageReads: Array<{ key: string; value: string | null; source: string[] }>;
let setupErrors: string[];
let restoreDiagnostics: (() => void) | undefined;
let onUnhandledRejection: ((event: PromiseRejectionEvent) => void) | undefined;
let sequence = 0;
let project: Project;
let files: ProjectFile[];
let fileContents: Map<string, string>;
let persisted: Map<string, ChatMessage>;
let requests: Array<{ method: string; path: string; role: string | null; names: string[]; clock: number }>;
let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
let physicalStatus: 'running' | 'succeeded';
let runStartedAt: number;
let accumulatedText: string;
let eventId: number;
let terminal: boolean;
let ambient: WorkspaceCollabContext;
let member: WorkspaceCollabContext;
let runRequest: { assistantMessageId: string; userMessageId: string } | undefined;

function context(role: 'owner' | 'member'): WorkspaceCollabContext {
  return {
    workspaceId: 'owner-qa-workspace', workspaceType: 'personal', workspaceMemberId: 'owner-qa-member',
    role, memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
    providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }),
  };
}
function strategyTask() {
  return {
    activeRunId: `run-${project.id}`, executionMode: null, inputStage: 'request', route: 'full_plan',
    outcome: 'blocked', terminal: true, taskExecutionId: `task-${project.id}`,
    strategy: { id: 'od-next-strategy', version: '2.0.4', packageHash: 'fixture', snapshotId: 'fixture' },
    blockedContext: { reasonCodes: ['od_next_protocol_runtime_state_missing'], visibleText: accumulatedText },
  };
}
function frame(event: string, data: Record<string, unknown>) {
  if (!streamController) throw new Error('The real provider has not opened its HTTP SSE response');
  streamController.enqueue(new TextEncoder().encode(`id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}
function textFrame(delta: string) {
  accumulatedText += delta;
  frame('agent', { type: 'text_delta', delta });
}
function mountProject() {
  return render(<I18nProvider initial="en"><ProjectView
    project={project} initialProjectDetail={{ project, resolvedDir: '/workspace/owner-test' }}
    routeConversationId={`conv-${project.id}`} routeFileName={null}
    config={config} workspaceContextOverride={ambient}
    agents={[{ id: 'opencode', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
    skills={[]} designTemplates={[]} designSystems={[]} daemonLive
    onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()}
    onRefreshAgents={vi.fn()} onOpenSettings={vi.fn()} onBack={vi.fn()}
    onClearPendingPrompt={vi.fn()} onTouchProject={vi.fn()} onProjectChange={vi.fn()} onProjectsRefresh={vi.fn()}
  /></I18nProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  homeStorageReads = []; setupErrors = [];
  firstTerminalReadGate = deferredGate(); htmlResponseGate = deferredGate();
  firstTerminalReadArrived = false; htmlPostStored = false;
  causalOrder = []; messageWrites = [];
  const getItem = Storage.prototype.getItem;
  const storageReadSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    const value = getItem.call(this, key);
    if (key.startsWith('od:auto-send-')) {
      const source = (new Error().stack ?? '').split('\n').filter((line) => line.includes('ProjectView.tsx'));
      if (source.length > 0) homeStorageReads.push({ key, value, source });
    }
    return value;
  });
  const consoleError = console.error;
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    setupErrors.push(args.map(String).join(' '));
    consoleError(...args);
  });
  restoreDiagnostics = () => { storageReadSpy.mockRestore(); consoleErrorSpy.mockRestore(); };
  onUnhandledRejection = (event) => { setupErrors.push(String(event.reason)); };
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  member = context('member'); ambient = member;
  project = {
    id: `home-artifact-owner-${++sequence}`, name: 'Home artifact owner', workspaceId: member.workspaceId,
    skillId: null, designSystemId: null, pendingPrompt: 'Create a fresh artifact.',
    metadata: { kind: 'prototype' }, createdAt: Date.now(), updatedAt: Date.now(),
  };
  files = []; fileContents = new Map(); persisted = new Map(); requests = [];
  physicalStatus = 'running'; runStartedAt = Date.now(); accumulatedText = ''; eventId = 0;
  terminal = false; runRequest = undefined; streamController = undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const method = init?.method ?? 'GET';
    const role = new Headers(init?.headers).get('x-od-workspace-role');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const request = { method, path: url.pathname, role, names: [] as string[], clock: Date.now() };
    requests.push(request);
    if (url.pathname === '/api/projects' && method === 'POST') {
      return Response.json({ project, conversationId: `conv-${project.id}` });
    }
    if (url.pathname === `/api/projects/${project.id}/workspace-scope`) {
      return Response.json({ scope: { kind: 'personal', projectId: project.id, workspaceId: member.workspaceId, visibility: 'personal', context: member } });
    }
    if (url.pathname === `/api/projects/${project.id}/collab/status`) {
      return Response.json({ syncState: 'local_only', ownerMemberId: member.workspaceMemberId, publishedVersion: null, localVersion: null });
    }
    if (url.pathname === `/api/projects/${project.id}/files`) {
      if (method === 'POST') {
        const name: string = body.name;
        const content: string = body.content;
        expect(name === 'document.md' || name === 'agent-output.html').toBe(true);
        if (name.endsWith('.html')) expect(content).toBe(html);
        const file: ProjectFile = {
          name, path: name, kind: name.endsWith('.html') ? 'html' : 'text',
          mime: name.endsWith('.html') ? 'text/html' : 'text/markdown',
          size: new TextEncoder().encode(content).length, mtime: Date.now(),
          ...(body.artifactManifest ? { artifactManifest: body.artifactManifest } : {}),
        };
        files = [...files.filter((entry) => entry.name !== name), file];
        fileContents.set(name, content); request.names = [name];
        if (name === 'agent-output.html') {
          htmlPostStored = true;
          causalOrder.push('html-post-stored');
          // The server has committed the file; the response body may arrive later.
          // Keep the real registry mutation/invalidation waiting on this HTTP response.
          await htmlResponseGate.promise;
          causalOrder.push('html-post-response-released');
        }
        return Response.json({ file });
      }
      if (terminal && !firstTerminalReadArrived) {
        firstTerminalReadArrived = true;
        causalOrder.push('terminal-files-get-arrived');
        await firstTerminalReadGate.promise;
        causalOrder.push('terminal-files-get-released');
      }
      request.names = files.map((file) => file.name);
      return Response.json({ files });
    }
    if (url.pathname === `/api/projects/${project.id}/conversations` && method === 'GET') {
      return Response.json({ conversations: [{ id: `conv-${project.id}`, projectId: project.id,
        title: null, sessionMode: 'design', createdAt: runStartedAt, updatedAt: runStartedAt }] });
    }
    if (url.pathname.endsWith('/messages') && method === 'GET') {
      return Response.json({ messages: [...persisted.values()] });
    }
    if (url.pathname.includes('/messages/') && method === 'PUT') {
      const incoming = body as ChatMessage;
      // Real conversations.ts preserves the daemon's physical run status even
      // when the web reports the blocked logical verdict as failed. Retain
      // client-produced metadata; this store is an HTTP fixture, not SQLite.
      const saved: ChatMessage = incoming.role === 'assistant' && incoming.runId
        ? { ...incoming, createdAt: runStartedAt, startedAt: runStartedAt,
            preTurnFileNames: [], runStatus: physicalStatus,
            ...(terminal ? { endedAt: runStartedAt + 1000 } : {}) }
        : { ...incoming, createdAt: incoming.createdAt ?? runStartedAt };
      persisted.set(saved.id, structuredClone(saved));
      messageWrites.push(structuredClone(saved));
      if (saved.role === 'assistant' && saved.producedFiles?.some((file) => file.name === 'agent-notes.md')
        && !saved.producedFiles.some((file) => file.name === 'agent-output.html')) {
        causalOrder.push('assistant-accepted-existing-agent-notes');
      }
      return Response.json({ message: saved });
    }
    if (url.pathname === '/api/runs' && method === 'POST') {
      runRequest = body;
      return Response.json({ runId: `run-${project.id}` }, { status: 202 });
    }
    if (url.pathname === `/api/runs/run-${project.id}/events`) {
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } }),
        { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.pathname === `/api/runs/run-${project.id}`) {
      return Response.json({ runId: `run-${project.id}`, status: physicalStatus, createdAt: runStartedAt,
        updatedAt: runStartedAt + 1000, artifactCount: 0, artifactPaths: [], deliverableValid: false,
        ...(terminal ? { strategyTask: strategyTask() } : {}) });
    }
    if (url.pathname === `/api/projects/${project.id}`) return Response.json({ project, resolvedDir: '/workspace/owner-test' });
    return Response.json({});
  }));
});
afterEach(async () => {
  // Release actual HTTP waiters even when a reachability/behavior assertion fails.
  firstTerminalReadGate.release(); htmlResponseGate.release();
  await act(async () => { await Promise.resolve(); });
  cleanup();
  try { streamController?.close(); } catch { /* already terminal */ }
  window.sessionStorage.clear();
  restoreDiagnostics?.();
  if (onUnhandledRejection) window.removeEventListener('unhandledrejection', onUnhandledRejection);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

async function runHomeArtifactScenario() {
  const created = await createProject({ id: project.id, name: project.name, skillId: null,
    designSystemId: null, pendingPrompt: project.pendingPrompt, workspaceContext: ambient });
  expect(created.project.id).toBe(project.id);
  window.sessionStorage.setItem(`od:auto-send-first:${project.id}`, '1');
  window.sessionStorage.setItem(`od:auto-send-prompt:${project.id}`, project.pendingPrompt!);
  expect(window.sessionStorage.getItem(`od:auto-send-first:${project.id}`)).toBe('1');
  mountProject();
  await waitFor(() => {
    expect(streamViaDaemon, JSON.stringify({
      setup: screen.getByTestId('home-setup-state').textContent,
      flag: window.sessionStorage.getItem(`od:auto-send-first:${project.id}`),
      homeStorageReads, setupErrors,
      requests: requests.map(({ method, path, role }) => ({ method, path, role })),
    })).toHaveBeenCalledTimes(1);
    expect(streamController).toBeDefined();
    expect(runRequest?.assistantMessageId).toMatch(/^home-auto-send-.*-assistant$/);
    expect(requests.some((r) => r.path.endsWith('/files') && r.method === 'GET' && r.role === 'member')).toBe(true);
  });
  await act(async () => { frame('start', { bin: 'opencode' }); textFrame('Owner QA is active.\n'); });
  // A fresh Home project has the actual Design Files empty-state action.
  // Opening the plus menu as well would create a second New document button.
  const newDocument = await screen.findByTestId('design-files-empty-new-document');
  expect(newDocument).toHaveAccessibleName('New document');
  fireEvent.click(newDocument);
  const editor = await screen.findByRole('textbox', { name: /markdown editor/i });
  await waitFor(() => expect(editor).toHaveValue(fileContents.get('document.md')));
  vi.useFakeTimers();
  try {
    fireEvent.change(editor, { target: { value: manualText } });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
  } finally { vi.useRealTimers(); }
  await waitFor(() => expect(fileContents.get('document.md')).toBe(manualText));
  expect(files.map((file) => file.name)).toEqual(['document.md']);
  expect(physicalStatus).toBe('running');
  // Freeze the real cache TTL clock while timers are advanced explicitly;
  // wall-clock CI/React slowness cannot turn this into an accidental cache miss.
  vi.useFakeTimers();
  await act(async () => {
    textFrame(artifact.slice(0, artifact.indexOf('<p>')));
    textFrame(artifact.slice(artifact.indexOf('<p>')));
    textFrame('\nOwner QA finished.');
  });
  // The inline HTML is still text only. A different output is now written
  // by the simulated daemon-side Agent, after the real run and manual save.
  expect(files.map((file) => file.name)).toEqual(['document.md']);
  await act(async () => {
    frame('agent', { type: 'tool_use', id: 'agent-notes-write', name: 'Write',
      input: { file_path: '/workspace/owner-test/agent-notes.md', content: agentNotes } });
    files.push({ name: 'agent-notes.md', path: 'agent-notes.md', kind: 'text',
      mime: 'text/markdown', size: new TextEncoder().encode(agentNotes).length, mtime: Date.now() });
    fileContents.set('agent-notes.md', agentNotes);
    frame('agent', { type: 'tool_result', toolUseId: 'agent-notes-write', content: 'Saved', isError: false });
  });
  expect(fileContents.get('agent-output.html')).toBeUndefined();
  await act(async () => {
    physicalStatus = 'succeeded'; terminal = true;
    frame('end', { code: 0, signal: null, status: 'succeeded', artifactCount: 0,
      artifactPaths: [], strategyTask: strategyTask() });
    streamController?.close();
  });
  await vi.waitFor(() => expect(firstTerminalReadArrived, 'terminal production GET must be reached').toBe(true));
  expect(htmlPostStored).toBe(false);
  // Recovery's pre-POST read shares this still-pending scope GET. Release it
  // before waiting for HTML persistence; reversing that order would deadlock.
  await act(async () => { firstTerminalReadGate.release(); await Promise.resolve(); });
  await vi.waitFor(() => expect(htmlPostStored, JSON.stringify({ phase: 'recovery POST reachability', causalOrder })).toBe(true));
  await vi.waitFor(() => expect(messageWrites.some((message) => message.id === runRequest?.assistantMessageId
    && message.producedFiles?.some((file) => file.name === 'agent-notes.md')
    && !message.producedFiles.some((file) => file.name === 'agent-output.html')),
  JSON.stringify({ phase: 'error finalizer accepted existing Agent file', causalOrder })).toBe(true));
  expect(fileContents.get('agent-output.html')).toBe(html);
  expect(fileContents.get('agent-notes.md')).toBe(agentNotes);
  // Match the Chrome positive anchor before releasing the HTML response:
  // the earlier successful message write must already exclude the manual file.
  expect(persisted.get(runRequest!.assistantMessageId)?.producedFiles?.map((file) => file.name))
    .toEqual(['agent-notes.md']);
  expect(persisted.get(runRequest!.assistantMessageId)?.traceObjectFiles?.map((file) => file.name))
    .toEqual(['agent-notes.md']);
  expect(causalOrder).not.toContain('html-post-response-released');
  // Use the real launcher result and real Markdown autosave again, after the
  // first terminal finalizer has accepted MD but while HTML is still pending.
  const manualPostsBefore = requests.filter((request) => request.method === 'POST'
    && request.path.endsWith('/files') && request.names.includes('document.md')).length;
  fireEvent.click(screen.getByTestId('workspace-add-tab'));
  const manualResults = within(screen.getByTestId('tab-launcher-menu'))
    .getAllByTestId('tab-launcher-result')
    .filter((button) => within(button).queryByText('document.md', { exact: true }));
  expect(manualResults).toHaveLength(1);
  await act(async () => { fireEvent.click(manualResults[0]!); });
  await vi.waitFor(() => expect(screen.getByRole('textbox', { name: /markdown editor/i })).toHaveValue(manualText));
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: /markdown editor/i }), { target: { value: lateManualText } });
    await vi.advanceTimersByTimeAsync(700);
  });
  await vi.waitFor(() => {
    expect(fileContents.get('document.md')).toBe(lateManualText);
    expect(requests.filter((request) => request.method === 'POST'
      && request.path.endsWith('/files') && request.names.includes('document.md'))).toHaveLength(manualPostsBefore + 1);
  });
  expect(persisted.get(runRequest!.assistantMessageId)?.producedFiles?.map((file) => file.name)).toEqual(['agent-notes.md']);
  expect(causalOrder).not.toContain('html-post-response-released');
  // The actual error-finalization HTTP write has now accepted the first Agent
  // output while recovery is waiting for its own HTML write response.
  await act(async () => { htmlResponseGate.release(); await Promise.resolve(); });
  await vi.waitFor(() => {
    const saved = persisted.get(runRequest!.assistantMessageId);
    // First wait until both real Agent outputs have reached the actual save
    // boundary; the outer assertion then checks manual ownership continuity.
    expect(saved?.producedFiles?.map((file) => file.name).sort(),
      JSON.stringify({ phase: 'both Agent outputs after overlapping finalizers', causalOrder }))
      .toEqual(expect.arrayContaining(['agent-notes.md', 'agent-output.html']));
  });
  expect(requests.filter((r) => r.path === '/api/runs' && r.method === 'POST')).toHaveLength(1);
  return [...persisted.values()].find((message) => message.id === runRequest?.assistantMessageId)!;
}

describe('Late manual autosave while terminal artifact recovery is pending', () => {
  it('keeps a real manual autosave after the MD-only finalizer out of the later HTML output projection', async () => {
    const message = await runHomeArtifactScenario();
    expect(fileContents.get('document.md')).toBe(lateManualText);
    expect(fileContents.get('agent-notes.md')).toBe(agentNotes);
    expect(fileContents.get('agent-output.html')).toBe(html);
    expect(message.producedFiles?.map((file) => file.name).sort(),
      JSON.stringify({ causalOrder, produced: message.producedFiles?.map((file) => file.name) }))
      .toEqual(['agent-notes.md', 'agent-output.html']);
    expect(message.traceObjectFiles?.map((file) => file.name)).toEqual(['agent-notes.md']);
    expect(files.map((file) => file.name).sort()).toEqual(['agent-notes.md', 'agent-output.html', 'document.md']);
    const readback = await listMessages(project.id, `conv-${project.id}`, member);
    const saved = readback.find((item) => item.id === message.id);
    expect(saved?.runId).toBe(`run-${project.id}`);
    expect(saved?.producedFiles?.map((file) => file.name).sort()).toEqual(['agent-notes.md', 'agent-output.html']);
    expect(saved?.traceObjectFiles?.map((file) => file.name)).toEqual(['agent-notes.md']);
    expect(causalOrder.indexOf('terminal-files-get-released')).toBeLessThan(causalOrder.indexOf('html-post-stored'));
    expect(causalOrder.indexOf('assistant-accepted-existing-agent-notes')).toBeLessThan(causalOrder.indexOf('html-post-response-released'));
    expect(message.events?.some((event) => event.kind === 'tool_result'
      && event.toolUseId === 'agent-notes-write' && event.isError === false)).toBe(true);
  });
});
