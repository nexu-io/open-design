// @vitest-environment jsdom
//
// Red spec: saving one HTML file re-navigates every other open preview.
//
// Measured live: saving `index.html` re-navigated the retained previews of
// `lru-5.html` and `lru-6.html` as well — reported by the L2 harness as
// `own=1, foreign=['lru-5.html','lru-6.html']`. Those documents lose their JS
// heap, timers, canvas and scroll, which is exactly what the runtime
// convergence exists to prevent.
//
// The cause is the project-wide wildcard key. `handleProjectEvent` advances
// both the exact changed path AND the `''` wildcard, and `FileWorkspace` folds
// the wildcard into every open file's refresh key with `Math.max`, so any
// change mints a new document identity for every preview.
//
// The wildcard is right for an ASSET. A changed stylesheet, script or image can
// be a dependency of any open page, and a real dependency graph is not
// obtainable — dynamic `import()`, `fetch`, CSS `url()` and JS-built URLs make
// it undecidable. Refreshing everything is the honest conservative answer, and
// removing it would break the ordinary loop of editing a stylesheet and
// watching the page update.
//
// It is not right for an HTML document. A stylesheet is authored to be
// referenced; an HTML document is authored to be opened. Scoping an HTML file's
// own change to itself needs no analysis at all — only the type of the file
// that changed — and `handleProjectEvent` already draws exactly this line for
// `add` events.
//
// The residual risk is narrow and nameable: page A iframes page B, B changes,
// and A keeps showing the old B until it is reloaded by hand.

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { ProjectView } from '../../src/components/ProjectView';
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
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import { fetchPreviewComments, fetchProjectFiles } from '../../src/providers/registry';
import { useProjectFileEvents } from '../../src/providers/project-events';

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
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => <div /> }));
vi.mock('../../src/components/ChatPane', () => ({ ChatPane: () => <div /> }));

/** Captures the refresh keys ProjectView hands down, which drive re-navigation. */
const observedRefreshKeys: { value: ReadonlyMap<string, number> } = { value: new Map() };
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: ({ fileContentRefreshKeys }: {
    fileContentRefreshKeys?: ReadonlyMap<string, number>;
  }) => {
    observedRefreshKeys.value = fileContentRefreshKeys ?? new Map();
    return <div data-testid="file-workspace" />;
  },
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedUseProjectFileEvents = vi.mocked(useProjectFileEvents);

const config: AppConfig = {
  mode: 'api', apiKey: '', baseUrl: '', model: '',
  agentId: null, skillId: null, designSystemId: null,
};
const project: Project = {
  id: 'project-scope', name: 'Scope', skillId: null, designSystemId: null,
  createdAt: 1, updatedAt: 1,
};
const conversation: Conversation = {
  id: 'conv-scope', projectId: project.id, title: null, createdAt: 1, updatedAt: 1,
};

function file(name: string, kind: 'html' | 'code'): ProjectFile {
  return {
    name, path: name, type: 'file', size: 256, mtime: 1,
    ...(kind === 'html'
      ? { kind: 'html' as const, mime: 'text/html' }
      : { kind: 'code' as const, mime: 'text/css' }),
  };
}

const PROJECT_FILES = [
  file('index.html', 'html'),
  file('other.html', 'html'),
  file('styles.css', 'code'),
];

/** The project-wide key every open preview folds in. */
const WILDCARD = '';

let emitFileEvent: ((event: { type: string; kind: string; path: string }) => void) | null = null;

function renderProjectView() {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      routeConversationId={null}
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
    />,
  );
}

describe('which previews a file change is allowed to disturb', () => {
  beforeEach(() => {
    mockedListConversations.mockResolvedValue([conversation]);
    mockedCreateConversation.mockResolvedValue(conversation);
    mockedListMessages.mockResolvedValue([]);
    mockedLoadTabs.mockResolvedValue({ tabs: ['index.html'], active: 'index.html' });
    mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchProjectFiles.mockResolvedValue(PROJECT_FILES);
    observedRefreshKeys.value = new Map();
    emitFileEvent = null;
    mockedUseProjectFileEvents.mockImplementation(((
      _projectId: string,
      _enabled: boolean,
      handler: (event: { type: string; kind: string; path: string }) => void,
    ) => {
      emitFileEvent = handler;
    }) as unknown as typeof useProjectFileEvents);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Control: an asset keeps the wildcard. Without this, the case below could
  // pass by disabling the mechanism entirely and silently break the ordinary
  // loop of editing a stylesheet and watching the page update.
  it('still refreshes every preview when an asset changes', async () => {
    renderProjectView();
    await waitFor(() => expect(emitFileEvent).not.toBeNull());

    emitFileEvent!({ type: 'file-changed', kind: 'change', path: 'styles.css' });

    await waitFor(() => {
      expect(observedRefreshKeys.value.get(WILDCARD)).toBeGreaterThan(0);
    });
  });

  // Every artifact save writes TWO files: the document and its
  // `<name>.artifact.json` manifest. The manifest is generated metadata — the
  // daemon hides it from the file listing and the app hides it from the file
  // tree — but it arrived as a plain project file change, which is not an HTML
  // document, which took the wildcard, which reloaded every open preview.
  // Measured live: saving index.html re-navigated lru-5.html and lru-6.html
  // with an unchanged content hash and a brand-new preview session.
  it('does not disturb other previews when an artifact manifest changes', async () => {
    renderProjectView();
    await waitFor(() => expect(emitFileEvent).not.toBeNull());

    emitFileEvent!({ type: 'file-changed', kind: 'change', path: 'index.html.artifact.json' });

    await waitFor(() => {
      expect(observedRefreshKeys.value.get('index.html')).toBeGreaterThan(0);
    });
    expect(observedRefreshKeys.value.get(WILDCARD) ?? 0).toBe(0);
  });

  it('does not disturb other previews when an HTML document changes', async () => {
    renderProjectView();
    await waitFor(() => expect(emitFileEvent).not.toBeNull());

    emitFileEvent!({ type: 'file-changed', kind: 'change', path: 'index.html' });

    await waitFor(() => {
      expect(observedRefreshKeys.value.get('index.html')).toBeGreaterThan(0);
    });
    // The changed document refreshes; nothing else is entitled to.
    expect(observedRefreshKeys.value.get(WILDCARD) ?? 0).toBe(0);
  });
});
