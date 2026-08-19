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

// The slice of the daemon stream handlers these tests drive: terminal handoff,
// plus the agent events that carry a mid-run Write through to its own
// fire-and-forget file-list refresh.
interface StreamHandlers {
  onDone: (fullText?: string) => void;
  onAgentEvent: (event: Record<string, unknown>) => void;
}

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
    openRequest?: { name: string; nonce: number; source: string } | null;
    onTabsStateChange?: (next: OpenTabsState) => void;
    onUserActivateTab?: () => void;
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
function openRequestKeys(): Array<{ name: string; nonce: number; source: string }> {
  const seen = new Set<string>();
  const requests: Array<{ name: string; nonce: number; source: string }> = [];
  for (const call of fileWorkspaceSpy.mock.calls) {
    const request = (call[0] as {
      openRequest?: { name: string; nonce: number; source: string } | null;
    }).openRequest;
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
    // What an INDEPENDENT list read returns while the completion read is still
    // parked — a chokidar-driven refresh landing underneath the finalizer.
    // Only the newest request commits to the shared snapshot, so a list landed
    // here survives the older held read resolving afterwards, and the finalizer
    // then arms against a list its own read never saw.
    duringHold?: ProjectFile[];
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
      if (turnDone) return options.settled;
      return heldReadRequested && options.duringHold ? options.duringHold : options.preTurn;
    });

    const handlers: StreamHandlers[] = [];
    streamViaDaemon.mockImplementation(async (opts: { handlers: StreamHandlers }) => {
      handlers.push(opts.handlers);
      return new Promise<void>(() => {});
    });

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

  it('does not steal focus when the user activates a pending sketch while the finalizer waits', async () => {
    // Reviewer #6842 (nettee, 2026-08-17): the test above only covers tab changes
    // the parent hears about. `FileWorkspace.activatePending` deliberately flips
    // to an unsaved sketch WITHOUT calling `onTabsStateChange`, so this
    // interleaving leaves the focus witness reporting notes.md — the very tab the
    // turn recorded at handoff — while the user is looking at their sketch. The
    // guard then finds focus exactly where the turn left it and opens
    // index.html over the sketch. Same setup as the positive control at the top
    // of this file, so that control is what proves the watcher fires here at all.
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-settle-pending-sketch',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      settled: [NOTES, OTHER, RUN_LOG, INDEX],
    });

    // Exactly what the workspace does for a pending sketch: report the
    // activation, leave the persisted tab state (and so the witness) untouched.
    await act(async () => {
      latestWorkspaceProps().onUserActivateTab?.();
    });
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releaseCompletionRead();
    await landSettledFileList();
    await landSettledFileList();

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

  // The predicate the watcher sends along with a request, read back off the
  // props exactly as the workspace re-asks it when a parked activation runs.
  function latestSettleOwnership(): (() => boolean) | undefined {
    for (const call of [...fileWorkspaceSpy.mock.calls].reverse()) {
      const request = (call[0] as {
        openRequest?: { name: string; isStillOwned?: () => boolean } | null;
      }).openRequest;
      if (request) return request.isStillOwned;
    }
    return undefined;
  }

  it('disowns a queued settle-watch open when a newer same-conversation send starts', async () => {
    // Retiring the pending watch does not reach a request already handed to the
    // workspace — that request is no longer reachable from the ref the new send
    // clears. Its own predicate is the only thing left guarding it, and the
    // workspace can hold the activation behind an unsettled manual edit for as
    // long as the edit takes. Comparing only the conversation therefore leaves a
    // same-conversation turn B looking like the owner of turn A's request.
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-settle-queued-ownership',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      settled: [NOTES, OTHER, RUN_LOG, INDEX],
    });

    await turn.releaseCompletionRead();
    await landSettledFileList();
    await landSettledFileList();

    expect(openRequestKeys().map((key) => key.name)).toContain('index.html');
    const isStillOwned = latestSettleOwnership();
    // Positive control. Without it, "false after turn B" would also hold for a
    // predicate that never returns true at all — including one that fences the
    // parked activation out even while its own turn is still current.
    expect(isStillOwned?.()).toBe(true);

    // Turn B, in the same conversation. The conversation the request captured is
    // still the active one; only the generation moves.
    const sendPropsB = await waitForSend();
    await act(async () => {
      await sendPropsB.onSend!('turn B', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));

    expect(isStillOwned?.()).toBe(false);
  });

  // The turn's own post-run read already carries a previewable artifact, so the
  // completion pass opens it directly and never arms the watcher. That path is
  // parked behind the same awaits, so it needs the same owner token.
  const TURN_A_HTML = projectFile('turn-a.html', 'html', turnStart + 20);

  // Positive control for the two completion-path assertions below: with nobody
  // superseding the turn, releasing the read must actually open turn-a.html.
  // If this stops firing, "did not open" proves nothing.
  it('opens the turn artifact from the completion path when the turn still owns auto-open', async () => {
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-completion-control',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, TURN_A_HTML],
      settled: [NOTES, OTHER, TURN_A_HTML],
    });

    await turn.releaseCompletionRead();

    expect(openRequestKeys().map((key) => key.name)).toContain('turn-a.html');
  });

  it('does not open a superseded turn artifact from the completion path', async () => {
    // Reviewer #6842 (nettee, 2026-08-14): the generation check at the arming
    // site is too late for this. The completion pass reaches
    // `requestTurnOpenFile(producedArtifactToOpen)` BEFORE it, so a turn parked
    // in its post-run awaits could still send that request after a newer turn
    // had taken over — the watcher was fenced, the direct open was not.
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-completion-overlap',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, TURN_A_HTML],
      settled: [NOTES, OTHER, TURN_A_HTML],
    });

    const sendPropsB = await waitForSend();
    await act(async () => {
      await sendPropsB.onSend!('turn B', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releaseCompletionRead();
    await landSettledFileList();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });

  // Drives one turn whose mid-run Write refresh is held open, then carries the
  // turn to terminal status with a post-run list that has nothing previewable
  // in it — so the completion pass selects nothing and the released per-write
  // refresh is the only thing that can move focus.
  async function runTurnHoldingPerWriteRead(options: {
    projectId: string;
    tabs: OpenTabsState;
    preTurn: ProjectFile[];
    postRun: ProjectFile[];
    perWriteSettled: ProjectFile[];
    // Which file the mid-run Write touches. Its refresh is the one held open,
    // so the per-write auto-open decision is taken on this file.
    writePath?: string;
    // Further Writes the agent makes after it, whose refreshes are NOT held.
    // They still register as touched paths, which is what lets a file that has
    // not landed in any list yet be attributed to the turn once it does.
    alsoWritePaths?: string[];
    // Lists that land after the per-write refresh has been released, i.e. what
    // the settle watcher gets to re-evaluate against.
    settled?: ProjectFile[];
  }) {
    const heldRead = deferred<ProjectFile[]>();
    let holdNextRead = false;
    let heldReadRequested = false;
    let turnDone = false;
    let perWriteReleased = false;

    loadTabs.mockResolvedValue(options.tabs);
    fetchProjectFiles.mockImplementation(async () => {
      if (holdNextRead) {
        holdNextRead = false;
        heldReadRequested = true;
        return heldRead.promise;
      }
      if (!turnDone) return options.preTurn;
      return perWriteReleased && options.settled ? options.settled : options.postRun;
    });

    const handlers: StreamHandlers[] = [];
    streamViaDaemon.mockImplementation(async (opts: { handlers: StreamHandlers }) => {
      handlers.push(opts.handlers);
      return new Promise<void>(() => {});
    });

    renderProjectView(options.projectId);

    const sendProps = await waitForSend();
    await act(async () => {
      await sendProps.onSend!('build me a page', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    // The agent writes the artifact mid-run. Its file-list refresh is
    // fire-and-forget by design (a file can open while the run streams), so
    // park it and let the run finish underneath it.
    holdNextRead = true;
    await act(async () => {
      handlers[0]!.onAgentEvent({
        kind: 'tool_use',
        id: 'tool-write-1',
        name: 'Write',
        input: { path: options.writePath ?? 'turn-a.html' },
      });
      handlers[0]!.onAgentEvent({
        kind: 'tool_result',
        toolUseId: 'tool-write-1',
        content: '',
        isError: false,
      });
    });
    // The per-write refresh must actually be parked, or "delayed per-write"
    // is fiction and the assertions below hold for the wrong reason.
    await waitFor(() => expect(heldReadRequested).toBe(true));

    for (const [index, path] of (options.alsoWritePaths ?? []).entries()) {
      await act(async () => {
        handlers[0]!.onAgentEvent({
          kind: 'tool_use',
          id: `tool-write-extra-${index}`,
          name: 'Write',
          input: { path },
        });
        handlers[0]!.onAgentEvent({
          kind: 'tool_result',
          toolUseId: `tool-write-extra-${index}`,
          content: '',
          isError: false,
        });
      });
    }

    turnDone = true;
    await act(async () => {
      handlers[0]!.onDone('done');
    });

    return {
      releasePerWriteRead: async () => {
        await act(async () => {
          heldRead.resolve(options.perWriteSettled);
          await Promise.resolve();
          await Promise.resolve();
        });
        perWriteReleased = true;
      },
    };
  }

  // Positive control for the per-write guard below.
  it('opens from a delayed per-write refresh while the run still owns auto-open', async () => {
    const turn = await runTurnHoldingPerWriteRead({
      projectId: 'project-per-write-control',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      perWriteSettled: [NOTES, OTHER, RUN_LOG, TURN_A_HTML],
    });

    await turn.releasePerWriteRead();

    expect(openRequestKeys().map((key) => key.name)).toContain('turn-a.html');
  });

  it('does not let a delayed per-write refresh focus a superseded run', async () => {
    // Reviewer #6842 (nettee, 2026-08-14): this callback is guarded only by the
    // run-local `completionSelectedAutoOpen`, which a newer turn cannot flip.
    // A Write refresh from run A that settles during run B therefore focused
    // A's file even though every other auto-open path had been fenced.
    const turn = await runTurnHoldingPerWriteRead({
      projectId: 'project-per-write-overlap',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      perWriteSettled: [NOTES, OTHER, RUN_LOG, TURN_A_HTML],
    });

    const sendPropsB = await waitForSend();
    await act(async () => {
      await sendPropsB.onSend!('turn B', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releasePerWriteRead();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });

  it('retires the watch when the user leaves the conversation the turn ran in', async () => {
    // Reviewer #6842 (nettee, 2026-08-14): the owner token cannot cover this.
    // Switching chats starts no new turn, so nothing bumps the generation —
    // but ProjectView outlives conversation switches (only ChatPane is keyed by
    // the active conversation) and the file workspace is project-scoped, so the
    // watch stayed live and focused the previous chat's artifact underneath the
    // new one. Same setup as the positive control at the top of this file,
    // which is what proves the watcher would otherwise have opened index.html.
    listConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Conversation' },
      { id: 'conv-2', title: 'Second conversation' },
    ]);

    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-settle-conversation',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      settled: [NOTES, OTHER, RUN_LOG, INDEX],
    });

    const chatProps = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      onSelectConversation?: (id: string) => void;
    };
    await act(async () => {
      chatProps.onSelectConversation?.('conv-2');
    });
    await waitFor(() => {
      expect(
        (chatPaneSpy.mock.calls.at(-1)?.[0] as { activeConversationId?: string | null })
          .activeConversationId,
      ).toBe('conv-2');
    });
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releaseCompletionRead();
    await landSettledFileList();
    await landSettledFileList();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });

  it('does not let a delayed per-write refresh focus a run whose conversation the user left', async () => {
    // Reviewer #6842 (nettee, 2026-08-18, round 6): the owner token fences a
    // newer SEND, because only a send advances it. Leaving the conversation
    // advances nothing, so run A parked in a per-write refresh still passed the
    // token check on resume and opened its artifact into the workspace while
    // chat B was on screen. The watcher already refused to do that; this direct
    // opener was the way around it. Positive control is
    // "opens from a delayed per-write refresh while the run still owns
    // auto-open" above — without it, "did not open" proves nothing here.
    listConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Conversation' },
      { id: 'conv-2', title: 'Second conversation' },
    ]);

    const turn = await runTurnHoldingPerWriteRead({
      projectId: 'project-per-write-conversation',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      perWriteSettled: [NOTES, OTHER, RUN_LOG, TURN_A_HTML],
    });

    const chatProps = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      onSelectConversation?: (id: string) => void;
    };
    await act(async () => {
      chatProps.onSelectConversation?.('conv-2');
    });
    await waitFor(() => {
      expect(
        (chatPaneSpy.mock.calls.at(-1)?.[0] as { activeConversationId?: string | null })
          .activeConversationId,
      ).toBe('conv-2');
    });
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releasePerWriteRead();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });

  // The conversation guard above is evaluated in two places, and only one of
  // them re-renders first. Every LATER list runs the guard through an effect,
  // so it reads a fresh evaluator; the finalizer arms and evaluates in one go,
  // through the evaluator the send captured. The two tests below pin the
  // second path, where the target is already in the accepted list when the
  // finalizer arms — reached by landing an independent list underneath the
  // parked completion read.
  it('opens from the arming-site evaluation when the wanted list already landed', async () => {
    // Positive control for the conversation test below: it is the arming-site
    // evaluation, not a later effect-driven one, that opens index.html here —
    // nothing lands a further list between the release and the assertion.
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-arming-control',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      duringHold: [NOTES, OTHER, RUN_LOG, INDEX],
      settled: [NOTES, OTHER, RUN_LOG, INDEX],
    });

    await landSettledFileList();
    await turn.releaseCompletionRead();

    expect(openRequestKeys().map((key) => key.name)).toContain('index.html');
  });

  it('retires at the arming site too when the user has left the conversation', async () => {
    // Reviewer #6842 (nettee, 2026-08-17): the conversation guard compared the
    // watch against the render's `activeConversationId`, and the finalizer
    // calls the evaluator captured by the render that STARTED the run — a
    // dependency list cannot refresh a closure already in flight. So the guard
    // compared conversation A against conversation A and passed, and the
    // arming-site evaluation opened A's artifact underneath B. The later
    // effect-driven evaluation retires the watch, but only after focus moved.
    listConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Conversation' },
      { id: 'conv-2', title: 'Second conversation' },
    ]);

    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-arming-conversation',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      duringHold: [NOTES, OTHER, RUN_LOG, INDEX],
      settled: [NOTES, OTHER, RUN_LOG, INDEX],
    });

    await landSettledFileList();
    const chatProps = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      onSelectConversation?: (id: string) => void;
    };
    await act(async () => {
      chatProps.onSelectConversation?.('conv-2');
    });
    await waitFor(() => {
      expect(
        (chatPaneSpy.mock.calls.at(-1)?.[0] as { activeConversationId?: string | null })
          .activeConversationId,
      ).toBe('conv-2');
    });
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releaseCompletionRead();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });

  it('upgrades to the settled artifact after a delayed per-write open of the same run', async () => {
    // Reviewer #6842 (nettee, 2026-08-17): the watcher's focus-move guard was
    // handed only the files the COMPLETION continuation opened. A per-write
    // refresh that settles after terminal handoff opens its file through the
    // same run fence, so `plan.md` is this run's own activation — but it was
    // absent from the snapshot, so when `index.html` settled the guard read
    // focus as "the user moved on" and retired instead of upgrading. The bug
    // this PR exists to fix, re-entering through the fix's own bookkeeping.
    const PLAN = projectFile('plan.md', 'text', turnStart + 10);

    const turn = await runTurnHoldingPerWriteRead({
      projectId: 'project-per-write-then-settle',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, RUN_LOG],
      writePath: 'plan.md',
      // The agent writes the deliverable too, but no list has caught up with
      // it by turn end — the situation the settle watcher exists for.
      alsoWritePaths: ['index.html'],
      // The released per-write read carries only the support file, so it is
      // what moves focus; `index.html` lands afterwards.
      perWriteSettled: [NOTES, OTHER, RUN_LOG, PLAN],
      settled: [NOTES, OTHER, RUN_LOG, PLAN, INDEX],
    });

    await turn.releasePerWriteRead();
    // Polled rather than asserted on the tick after the release: the release
    // awaits a fixed number of microtasks, which is not a guarantee that the
    // continuation behind it has reached its open. Under full-suite load that
    // raced, and the failure looked like "the guard blocked it" rather than
    // "the assertion ran early" — the two are indistinguishable from an empty
    // list, which cost real debugging time.
    //
    // The default 1s poll window was still not enough: this chain crosses a
    // fire-and-forget per-write refresh, so under full-suite load it went red
    // roughly one run in three while passing every time the file ran alone.
    // The bound is here only so a genuine hang cannot run forever; nothing on
    // this path is expected to take anywhere near that long.
    await waitFor(
      () => expect(openRequestKeys().map((key) => key.name)).toContain('plan.md'),
      { timeout: 10_000 },
    );

    // The workspace follows the open request, exactly as it would in the app.
    await act(async () => {
      latestWorkspaceProps().onTabsStateChange?.({
        tabs: ['notes.md', 'plan.md'],
        active: 'plan.md',
      });
    });

    await landSettledFileList();
    await landSettledFileList();

    expect(openRequestKeys().map((key) => key.name)).toContain('index.html');
  });

  // Drives one turn to terminal status with no produced files but a standalone
  // HTML answer, so the completion path falls through to `persistArtifact`, and
  // parks that persistence's write — the window in which a newer send can take
  // auto-open over while the older run is still inside the persist helper.
  async function runTurnHoldingArtifactPersistence(options: {
    projectId: string;
    tabs: OpenTabsState;
    files: ProjectFile[];
    persistedFileName: string;
  }) {
    const heldWrite = deferred<{ name: string }>();
    let heldWriteRequested = false;

    loadTabs.mockResolvedValue(options.tabs);
    fetchProjectFiles.mockResolvedValue(options.files);
    writeProjectTextFile.mockImplementation(async () => {
      heldWriteRequested = true;
      return heldWrite.promise;
    });

    const handlers: StreamHandlers[] = [];
    streamViaDaemon.mockImplementation(async (opts: { handlers: StreamHandlers }) => {
      handlers.push(opts.handlers);
      return new Promise<void>(() => {});
    });

    renderProjectView(options.projectId);

    const sendProps = await waitForSend();
    await act(async () => {
      await sendProps.onSend!('build me a page', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    await act(async () => {
      handlers[0]!.onDone(
        '<!doctype html><html><head><title>Persisted</title></head>'
          + '<body><h1>Persisted</h1><p>A complete document.</p></body></html>',
      );
    });
    // The continuation must actually be parked inside the persistence, or
    // "while the write is in flight" is fiction.
    await waitFor(() => expect(heldWriteRequested).toBe(true));

    return {
      releasePersistence: async () => {
        await act(async () => {
          heldWrite.resolve({ name: options.persistedFileName });
          await Promise.resolve();
          await Promise.resolve();
        });
      },
    };
  }

  // Positive control for the persistence guard below.
  it('opens the persisted artifact when the run still owns auto-open', async () => {
    const turn = await runTurnHoldingArtifactPersistence({
      projectId: 'project-persist-control',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      files: [NOTES, OTHER],
      persistedFileName: 'persisted.html',
    });

    await turn.releasePersistence();

    expect(openRequestKeys().map((key) => key.name)).toContain('persisted.html');
  });

  it('does not open a superseded run’s persisted artifact', async () => {
    // Reviewer #6842 (nettee, 2026-08-17): `persistArtifact` auto-opens what it
    // writes, and that request went straight to the unfenced opener. The
    // completion path's own opens were fenced, so this was the one way a run
    // parked past a newer send could still move focus — through the helper it
    // delegates to rather than through any opener this run holds.
    const turn = await runTurnHoldingArtifactPersistence({
      projectId: 'project-persist-overlap',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      files: [NOTES, OTHER],
      persistedFileName: 'persisted.html',
    });

    const sendPropsB = await waitForSend();
    await act(async () => {
      await sendPropsB.onSend!('turn B', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releasePersistence();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });

  // Reviewer #6842 (nettee, 2026-08-17, round 5): `openRequest` is one prop
  // carrying two different kinds of open. The workspace can only tell a user's
  // chat file-link click from a run's auto-open by the `source` this side
  // stamps on it — get that wrong and the settle watcher is free to open its own
  // pick over the file the user just clicked. The workspace half of the contract
  // (what it does with each source, and when it reports) is pinned in
  // FileWorkspace.userActivationTiming.test.tsx; this is the producing half,
  // which is all a suite that mocks FileWorkspace out can see.
  it('stamps a chat file-chip open as the user’s and the run’s auto-open as internal', async () => {
    // The post-run read already carries a previewable artifact, so the watch's
    // FIRST evaluation — the one that runs at arming, before any later list
    // lands — is what opens it. Releasing the read is therefore the whole
    // trigger. The tests above instead wait for a second list, which is fine for
    // them (they release immediately) but would put this one, with a user
    // interaction inserted first, in reach of the 15s wall-clock deadline under
    // full-suite load.
    const turn = await runTurnHoldingCompletionRead({
      projectId: 'project-settle-open-source',
      tabs: { tabs: ['notes.md'], active: 'notes.md' },
      preTurn: [NOTES, OTHER],
      postRun: [NOTES, OTHER, TURN_A_HTML],
      settled: [NOTES, OTHER, TURN_A_HTML],
    });

    // The user clicks a produced-file chip in chat while the finalizer waits.
    await act(async () => {
      (chatPaneSpy.mock.calls.at(-1)?.[0] as {
        onRequestOpenFile?: (name: string) => void;
      }).onRequestOpenFile?.('other.md');
    });

    await turn.releaseCompletionRead();

    const bySource = new Map(
      openRequestKeys().map((request) => [request.name, request.source]),
    );
    expect(bySource.get('other.md')).toBe('user');
    // The run's own open still lands here — this suite's FileWorkspace is a
    // spy, so nothing consumed the 'user' report above. That it is stamped
    // 'internal' is the assertion: the real workspace is what turns the pair
    // into "do not move focus".
    expect(bySource.get('turn-a.html')).toBe('internal');
  });
});
