// @vitest-environment jsdom

// Issue #5352 lifecycle regressions for the post-turn auto-open settle watcher.
//
// Both cases live at the ProjectView level rather than in
// `auto-open-file.test.ts` because both are about WHEN the watcher's inputs are
// sampled and WHO owns it — timing the pure re-evaluation function cannot see.
// The completion continuation is an unawaited async IIFE, so between the daemon
// reporting terminal status and the watcher being armed there is a real window
// in which the user can change tabs and a new turn can start.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { OpenTabsState, ProjectFile } from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const fetchProjectFileText = vi.fn();
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
const upsertPreviewComment = vi.fn();
const saveTabs = vi.fn();
const cacheTabsLocally = vi.fn();
const writeProjectTextFile = vi.fn();

const chatPaneSpy = vi.fn();
const fileWorkspaceSpy = vi.fn();

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
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
    publishDaemonRunFinishedEvent: vi.fn(),
    reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
    streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
  };
});

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) =>
    fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchProjectFileText: (...args: unknown[]) => fetchProjectFileText(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: (...args: unknown[]) => patchPreviewCommentStatus(...args),
  upsertPreviewComment: (...args: unknown[]) => upsertPreviewComment(...args),
  writeProjectTextFile: (...args: unknown[]) => writeProjectTextFile(...args),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  cacheTabsLocally: (...args: unknown[]) => cacheTabsLocally(...args),
  createConversation: (...args: unknown[]) => createConversation(...args),
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
  ChatPane: (props: Record<string, unknown>) => {
    chatPaneSpy(props);
    return null;
  },
}));

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

function projectFile(name: string, kind: ProjectFile['kind'], mtime: number): ProjectFile {
  return {
    kind,
    mime: kind === 'html' ? 'text/html' : 'text/plain',
    mtime,
    name,
    size: 100,
  } as ProjectFile;
}

// A promise the test resolves by hand, standing in for the post-run
// `refreshProjectFiles({ fresh: true })` that the completion continuation awaits.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderProjectView(projectId: string) {
  return render(
    <ProjectView
      project={{ id: projectId, name: 'Project', skillId: null, designSystemId: null } as never}
      routeFileName={null}
      config={
        { mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never
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

async function waitForSend() {
  await waitFor(() => {
    expect(chatPaneSpy).toHaveBeenCalled();
    expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
  });
  return chatPaneSpy.mock.calls.at(-1)?.[0] as {
    onSend?: (prompt: string, attachments: unknown[], comments: unknown[]) => Promise<void>;
  };
}

function latestWorkspaceProps() {
  return fileWorkspaceSpy.mock.calls.at(-1)?.[0] as {
    openRequest?: { name: string; nonce: number } | null;
    onTabsStateChange?: (next: OpenTabsState) => void;
    onRefreshFiles?: (options?: unknown) => Promise<unknown>;
  };
}

// Land another settled file list, the way a chokidar-driven refresh would.
async function landSettledFileList() {
  await act(async () => {
    await latestWorkspaceProps().onRefreshFiles?.({ fresh: true });
  });
}

// Distinct open requests the workspace received, in order. `openRequest` stays
// on the props across every later render, so the raw prop stream repeats one
// request many times; de-duping by nonce turns it back into "how many times was
// focus actually asked to move".
function openRequestKeys(): Array<{ name: string; nonce: number }> {
  const seen = new Set<string>();
  const requests: Array<{ name: string; nonce: number }> = [];
  for (const call of fileWorkspaceSpy.mock.calls) {
    const request = (call[0] as { openRequest?: { name: string; nonce: number } | null })
      .openRequest;
    if (!request) continue;
    const key = `${request.name}@${request.nonce}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requests.push(request);
  }
  return requests;
}

describe('ProjectView auto-open settle watcher lifecycle', () => {
  beforeEach(() => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchProjectFileText.mockResolvedValue('');
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    listProjectRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));
    saveMessage.mockImplementation(async (_p: string, _c: string, message: unknown) => message);
    cacheTabsLocally.mockImplementation((_id: string, state: unknown) => state);
    saveTabs.mockResolvedValue(undefined);
    patchConversation.mockResolvedValue(undefined);
    patchProject.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  // Drives one turn to terminal status with its post-run `fresh` read held
  // open — the window both guards are about.
  //
  // The hold is armed immediately before `onDone`, NOT by counting reads: the
  // send path takes its own pre-turn snapshot, so a fixed read index parks the
  // wrong request and the continuation sails straight through, which makes both
  // guard assertions pass without ever exercising the guard.
  async function runTurnHoldingCompletionRead(options: {
    projectId: string;
    tabs: OpenTabsState;
    preTurn: ProjectFile[];
    postRun: ProjectFile[];
    settled: ProjectFile[];
  }) {
    const heldRead = deferred<ProjectFile[]>();
    let holdNextRead = false;
    let turnDone = false;
    let heldReadRequested = false;

    loadTabs.mockResolvedValue(options.tabs);
    fetchProjectFiles.mockImplementation(async () => {
      if (holdNextRead) {
        holdNextRead = false;
        heldReadRequested = true;
        return heldRead.promise;
      }
      return turnDone ? options.settled : options.preTurn;
    });

    const handlers: Array<{ onDone: (fullText?: string) => void }> = [];
    streamViaDaemon.mockImplementation(
      async (opts: { handlers: { onDone: (fullText?: string) => void } }) => {
        handlers.push(opts.handlers);
        return new Promise<void>(() => {});
      },
    );

    renderProjectView(options.projectId);

    const sendProps = await waitForSend();
    await act(async () => {
      await sendProps.onSend!('build me a page', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    holdNextRead = true;
    await act(async () => {
      handlers[0]!.onDone('done');
    });
    // The continuation must actually be parked on the held read, or the
    // "while the finalizer waits" premise is fiction.
    await waitFor(() => expect(heldReadRequested).toBe(true));

    return {
      releaseCompletionRead: async () => {
        turnDone = true;
        await act(async () => {
          heldRead.resolve(options.postRun);
          await Promise.resolve();
        });
      },
    };
  }

  const turnStart = Date.now();
  // Pre-turn files. `other.md` is where the user moves in the focus test; its
  // mtime sits well before the turn, so it can never be selected as the turn's
  // artifact and confuse the assertions.
  const NOTES = projectFile('notes.md', 'text', turnStart - 60_000);
  const OTHER = projectFile('other.md', 'text', turnStart - 60_000);
  // The only file the turn's own post-run read carries. Deliberately a plain
  // `.txt`: the auto-open ranking opens markdown but leaves `.txt` alone, so
  // the turn-end pass selects nothing and the watcher's later pick is the ONLY
  // thing that can move focus. With a previewable file here instead, the
  // turn-end pass opens it and closes the watch in the same breath — and both
  // guard tests below pass whether or not the guards exist.
  const RUN_LOG = projectFile('run.txt', 'text', turnStart + 10);
  const INDEX = projectFile('index.html', 'html', turnStart + 20);

  // Positive control. If this stops opening index.html the two guard tests
  // prove nothing: they would pass simply because the watcher never fires here.
  it('opens the generated file once a later list settles and focus has not moved', async () => {
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-settle-control',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      settled: [NOTES, OTHER, RUN_LOG, INDEX],
    });

    await turn.releaseCompletionRead();
    await landSettledFileList();
    await landSettledFileList();

    expect(openRequestKeys().map((key) => key.name)).toContain('index.html');
  });

  it('does not steal focus when the user changes tabs while the finalizer waits', async () => {
    // The witness deciding "did focus move somewhere the turn did not put it"
    // must be sampled at terminal handoff. Sampled after the post-run awaits
    // instead, the tab the USER picks during them becomes the turn's own
    // baseline; the guard then sees no move and yanks them off their choice as
    // soon as index.html lands.
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-settle-focus',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      settled: [NOTES, OTHER, RUN_LOG, INDEX],
    });

    // The user picks a different tab while the completion read is still parked.
    await act(async () => {
      latestWorkspaceProps().onTabsStateChange?.({
        tabs: ['notes.md', 'other.md'],
        active: 'other.md',
      });
    });
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releaseCompletionRead();
    await landSettledFileList();
    await landSettledFileList();

    // Nothing at all may move focus after the user has chosen: not index.html
    // when it lands, and not the turn's own leftovers on the way there.
    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });

  it('does not let a superseded turn re-arm the watcher over a newer send', async () => {
    // Clearing the pending watch when a new turn starts cannot protect the
    // arming site: the previous turn's continuation is unawaited and reaches
    // that site afterwards. Without an owner token it reinstalls its own
    // producedFiles, and the NEW turn's file-list generations then drive the
    // OLD turn's artifact into focus.
    const TURN_A_HTML = projectFile('turn-a.html', 'html', turnStart + 20);

    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-settle-overlap',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      settled: [NOTES, OTHER, RUN_LOG, TURN_A_HTML],
    });

    // Turn B starts while turn A's finalizer is still parked.
    const sendPropsB = await waitForSend();
    await act(async () => {
      await sendPropsB.onSend!('turn B', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    const openedBeforeRelease = openRequestKeys().length;

    // Only now does turn A's read resolve, carrying its finalizer to the arming
    // site — after turn B already owns auto-open.
    await turn.releaseCompletionRead();
    await landSettledFileList();
    await landSettledFileList();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });
});
