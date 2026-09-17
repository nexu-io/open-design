// @vitest-environment jsdom

// #6842 round 6, reviewer point 2: a live artifact's auto-open is issued from
// inside a fire-and-forget `refreshLiveArtifacts()` continuation, so it is
// subject to the same run-boundary overlap as the per-write refresh.
//
// Kept in its own file rather than alongside the other settle-watcher
// regressions: parking `fetchLiveArtifacts` needs a mock regime the sibling
// suite does not use, and running the two in one file made an unrelated
// per-write test go red under full-suite load. Vitest isolates per file, so a
// separate file is the fix rather than a workaround for that interference.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectFile } from '../../src/types';

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

const turnStart = Date.now();
const NOTES = projectFile('notes.md', 'text', turnStart - 60_000);
const OTHER = projectFile('other.md', 'text', turnStart - 60_000);

describe('ProjectView live-artifact auto-open ownership', () => {
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
  // A live artifact's open is issued from inside a fire-and-forget
  // `refreshLiveArtifacts()` continuation, so it is subject to exactly the same
  // overlap as the per-write refresh above — it was simply not going through
  // the run's opener at all.
  async function runTurnHoldingLiveArtifactRefresh(projectId: string) {
    const heldRefresh = deferred<unknown[]>();
    // Armed immediately before the event is emitted, NOT by counting calls:
    // other things read the live-artifact list too, so "park the first read"
    // parks the wrong one and the handler's own refresh resolves instantly —
    // which makes the overlap assertion below pass without ever exercising the
    // deferred path. (Same trap as the completion-read helper at the top.)
    let holdNextRefresh = false;
    let heldRefreshRequested = false;

    loadTabs.mockResolvedValue({ tabs: ['notes.md'], active: 'notes.md' });
    fetchProjectFiles.mockResolvedValue([NOTES, OTHER]);
    fetchLiveArtifacts.mockImplementation(async () => {
      if (holdNextRefresh) {
        holdNextRefresh = false;
        heldRefreshRequested = true;
        return heldRefresh.promise;
      }
      return [];
    });

    const handlers: StreamHandlers[] = [];
    streamViaDaemon.mockImplementation(async (opts: { handlers: StreamHandlers }) => {
      handlers.push(opts.handlers);
      return new Promise<void>(() => {});
    });

    renderProjectView(projectId);

    const sendProps = await waitForSend();
    await act(async () => {
      await sendProps.onSend!('build me a page', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    holdNextRefresh = true;
    await act(async () => {
      handlers[0]!.onAgentEvent({
        kind: 'live_artifact',
        action: 'created',
        artifactId: 'artifact-a',
      });
    });
    // The handler's own refresh must actually be parked, or "deferred refresh"
    // is fiction and both assertions below hold for the wrong reason.
    await waitFor(() => expect(heldRefreshRequested).toBe(true));

    // End the turn with the refresh still parked. Without this the composer
    // stays disabled and the overlap test cannot start turn B at all — it just
    // times out in `waitForSend`, which is not the same as passing.
    await act(async () => {
      handlers[0]!.onDone('done');
    });

    return {
      releaseRefresh: async () => {
        await act(async () => {
          heldRefresh.resolve([]);
          await Promise.resolve();
          await Promise.resolve();
        });
      },
    };
  }

  // Positive control for the overlap assertion below.
  it('opens a live artifact from a deferred refresh while the run still owns auto-open', async () => {
    const turn = await runTurnHoldingLiveArtifactRefresh('project-live-control');

    await turn.releaseRefresh();

    expect(openRequestKeys().map((key) => key.name)).toContain('live:artifact-a');
  });

  it('does not let a deferred live-artifact refresh focus a superseded run', async () => {
    // Reviewer #6842 (nettee, 2026-08-18, round 6): this callback issued a raw
    // `requestOpenFile`, so it was fenced by nothing — a newer send could not
    // stop run A's live tab from taking focus once its refresh resolved. Going
    // through the run's opener also records the name, which matters separately:
    // an unrecorded open landing after terminal handoff reads to the settle
    // watcher as the user moving focus, and retires the watch.
    const turn = await runTurnHoldingLiveArtifactRefresh('project-live-overlap');

    const sendPropsB = await waitForSend();
    await act(async () => {
      await sendPropsB.onSend!('turn B', [], []);
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(2));
    const openedBeforeRelease = openRequestKeys().length;

    await turn.releaseRefresh();

    expect(openRequestKeys().slice(openedBeforeRelease)).toEqual([]);
  });
});
