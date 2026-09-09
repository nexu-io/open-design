// @vitest-environment jsdom
//
// Red spec: a URL that names a file loses to auto-selection.
//
// Opening `/projects/:id/files/index.html` can end up showing a DIFFERENT
// file — whichever one in the project has the newest mtime — and then rewrite
// the URL to match, so it never self-corrects.
//
// The loop, all in ProjectView:
//
//   1. The route-sync effect has no `routeFileName` guard. On the first commit
//      `openTabsState.active` is still null, so `target` is null and it
//      navigates with `fileName: null`, STRIPPING the file out of the URL.
//   2. The auto-open guard is `if (routeFileName) return`, and `routeFileName`
//      is the *live* URL segment that step 1 just destroyed. The guard is now
//      open.
//   3. `selectPrimaryProjectFile` ranks every plain HTML file equally and
//      breaks the tie on newest mtime, so it opens the last-modified file.
//   4. That file is written back into the URL, and the wrong state latches.
//
// Why the existing suite cannot see this: `ProjectView.tabs-navigation.test.tsx`
// mocks `navigate` AND passes `routeFileName` as a static prop, so the
// URL -> `routeFileName` feedback in steps 1-2 never happens. This spec wires
// that loop back up — `navigate` updates the `routeFileName` it hands back to
// ProjectView, exactly like the real router does — which is the whole point.
//
// The conditions are the ones a real user hits with no cached tab state for
// the project: another machine, another browser, cleared site data, or a
// project this browser has never opened. `loadTabs` therefore resolves empty
// with `hasSavedState` absent.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { navigate } from '../../src/router';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  DesignSystemSummary,
  Project,
  ProjectFile,
  SkillSummary,
} from '../../src/types';
import {
  cacheTabsLocally,
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import { fetchPreviewComments, fetchProjectFiles } from '../../src/providers/registry';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({ navigate: vi.fn() }));

vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
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
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    cacheTabsLocally: vi.fn((_id: string, state: { tabs: string[]; active: string | null }) => state),
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn(),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    persistTabsToDaemonNow: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => <div data-testid="loader" /> }));
vi.mock('../../src/components/ChatPane', () => ({ ChatPane: () => <div data-testid="chat-pane" /> }));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: ({ tabsState, onTabsStateChange, openRequest }: {
    tabsState: { tabs: string[]; active: string | null };
    onTabsStateChange: (state: { tabs: string[]; active: string | null }) => void;
    openRequest?: { name: string; nonce: number } | null;
  }) => {
    // The real FileWorkspace mounts a viewer and fetches before the routed
    // file becomes the active tab. Opening it synchronously here would hide
    // the defect: an instantly-active tab makes the auto-open guard bail on
    // `openTabsState.active`, which is precisely the protection a slow machine
    // does not get.
    useEffect(() => {
      if (!openRequest?.name) return;
      if (tabsState.active === openRequest.name && tabsState.tabs.includes(openRequest.name)) return;
      const timer = setTimeout(() => {
        const tabs = tabsState.tabs.includes(openRequest.name)
          ? tabsState.tabs
          : [...tabsState.tabs, openRequest.name];
        onTabsStateChange({ tabs, active: openRequest.name });
      }, 10);
      return () => { clearTimeout(timer); };
    }, [onTabsStateChange, openRequest?.name, openRequest?.nonce, tabsState.tabs]);
    return <output data-testid="workspace-active-tab">{tabsState.active ?? ''}</output>;
  },
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedNavigate = vi.mocked(navigate);

const config: AppConfig = {
  mode: 'api', apiKey: '', baseUrl: '', model: '',
  agentId: null, skillId: null, designSystemId: null,
};

const project: Project = {
  id: 'project-deeplink', name: 'Deep link project',
  skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-deeplink', projectId: project.id, title: null, createdAt: 1, updatedAt: 1,
};

function htmlFile(name: string, mtime: number): ProjectFile {
  return {
    name, path: name, type: 'file', size: 512, mtime,
    kind: 'html', mime: 'text/html',
  };
}

/** The deep-linked file, and a newer sibling that auto-selection prefers. */
const DEEP_LINKED = 'index.html';
const NEWEST = 'zzz-latest.html';

/**
 * ProjectView wired to a router that actually behaves like the real one:
 * whatever `navigate` is told becomes the route the component sees next.
 *
 * Without this, `routeFileName` is a constant and the defect is unreachable —
 * which is exactly why the existing suite is green.
 */
function DeepLinkedProjectView({ initialFileName }: { initialFileName: string }) {
  const [routeFileName, setRouteFileName] = useState<string | null>(initialFileName);
  const [routeConversationId, setRouteConversationId] = useState<string | null>(null);

  const applyNavigation = useCallback((...args: Parameters<typeof navigate>) => {
    const [route] = args;
    if (route && typeof route === 'object' && (route as { kind?: string }).kind === 'project') {
      const next = route as { fileName?: string | null; conversationId?: string | null };
      setRouteFileName(next.fileName ?? null);
      setRouteConversationId(next.conversationId ?? null);
    }
  }, []);

  useEffect(() => {
    mockedNavigate.mockImplementation(((...args: Parameters<typeof navigate>) => {
      applyNavigation(...args);
    }) as typeof navigate);
  }, [applyNavigation]);

  return (
    <ProjectView
      project={project}
      routeFileName={routeFileName}
      routeConversationId={routeConversationId}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />
  );
}

describe('a URL that names a file wins over auto-selection', () => {
  beforeEach(() => {
    mockedListConversations.mockResolvedValue([conversation]);
    mockedCreateConversation.mockResolvedValue(conversation);
    mockedListMessages.mockResolvedValue([]);
    mockedFetchPreviewComments.mockResolvedValue([]);
    // No cached or persisted tab state: another machine, another browser,
    // cleared site data, or a project this browser has never opened.
    //
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    mockedFetchProjectFiles.mockResolvedValue([
      htmlFile(DEEP_LINKED, 1_000),
      htmlFile(NEWEST, 9_000),
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Control. If auto-selection did not prefer the newest file, the case below
  // would pass for the wrong reason.
  it('auto-selects the newest file when the URL names none', async () => {
    render(<DeepLinkedProjectView initialFileName={''} />);
    await waitFor(() => {
      expect(screen.getByTestId('workspace-active-tab').textContent).toBe(NEWEST);
    });
  });

  it('opens the file the URL names, not the most recently modified one', async () => {
    render(<DeepLinkedProjectView initialFileName={DEEP_LINKED} />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-active-tab').textContent).toBeTruthy();
    });
    // Let the route-sync effect and the auto-open effect both settle, so this
    // cannot pass merely by checking before the wrong file lands.
    await new Promise((resolve) => { setTimeout(resolve, 50); });

    expect(screen.getByTestId('workspace-active-tab').textContent).toBe(DEEP_LINKED);
  });

  it('never strips the routed file out of the URL', async () => {
    render(<DeepLinkedProjectView initialFileName={DEEP_LINKED} />);
    await new Promise((resolve) => { setTimeout(resolve, 50); });

    // Step 1 of the loop: the sync that clears `fileName` is what disarms the
    // auto-open guard. A route sync may legitimately add the conversation
    // segment, but it must never drop the file the user asked for.
    const clearedTheFile = mockedNavigate.mock.calls.some(([route]) => (
      route
      && typeof route === 'object'
      && (route as { kind?: string }).kind === 'project'
      && (route as { fileName?: string | null }).fileName == null
    ));
    expect(clearedTheFile).toBe(false);
  });
});
