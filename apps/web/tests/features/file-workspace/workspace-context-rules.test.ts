import { describe, expect, it } from 'vitest';
import type { Conversation, DesignSystemSummary, LiveArtifactWorkspaceEntry, ProjectFile } from '../../../src/types';
import {
  computeActiveWorkspaceContext,
  computeWorkspaceContexts,
  computeWorkspaceTabIds,
  computeWorkspaceTabNames,
} from '../../../src/features/file-workspace/rules';
import type {
  BrowserWorkspaceTab,
  SketchState,
  TranslateFn,
  WorkspaceOrderedTab,
} from '../../../src/features/file-workspace/types';

const t: TranslateFn = (key) => key;

function browserTab(id: string, over: Partial<BrowserWorkspaceTab> = {}): BrowserWorkspaceTab {
  return { id, label: 'Browser', ...over };
}

function projectFile(over: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'a.md',
    path: 'a.md',
    size: 42,
    mtime: 1000,
    kind: 'text',
    mime: 'text/markdown',
    ...over,
  };
}

function makeSystem(over: Partial<DesignSystemSummary> = {}): DesignSystemSummary {
  return {
    id: 'sys1',
    title: 'Acme',
    category: 'brand',
    summary: '',
    status: 'draft',
    swatches: [],
    ...over,
  };
}

function sketchState(over: Partial<SketchState> = {}): SketchState {
  return {
    version: 1,
    rawItems: [],
    discardRawItemsOnSave: false,
    items: [],
    scene: { elements: [], appState: {}, files: {} } as SketchState['scene'],
    dirty: false,
    persisted: false,
    loaded: false,
    saving: false,
    ...over,
  };
}

describe('computeWorkspaceTabNames', () => {
  it('returns persisted tabs unchanged when there are no pending sketches', () => {
    expect(computeWorkspaceTabNames(['a.md', 'b.md'], {})).toEqual(['a.md', 'b.md']);
  });

  it('appends pending (unpersisted) sketch names not already in persistedTabs', () => {
    const sketches = {
      'a.md': sketchState({ persisted: true }),
      'pending.sketch.json': sketchState({ persisted: false }),
    };
    expect(computeWorkspaceTabNames(['a.md'], sketches)).toEqual(['a.md', 'pending.sketch.json']);
  });

  it('does not duplicate a pending sketch that is already a persisted tab', () => {
    const sketches = { 'a.md': sketchState({ persisted: false }) };
    expect(computeWorkspaceTabNames(['a.md'], sketches)).toEqual(['a.md']);
  });
});

describe('computeWorkspaceTabIds', () => {
  const ordered: WorkspaceOrderedTab[] = [
    { id: 'a.md', kind: 'file', name: 'a.md' },
    { id: '__browser__:1', kind: 'browser', browserTab: browserTab('__browser__:1') },
  ];

  it('includes the design-system tab only when a project is set', () => {
    expect(computeWorkspaceTabIds(null, ordered, false)).toEqual(['__design_files__', 'a.md', '__browser__:1']);
    expect(computeWorkspaceTabIds(makeSystem(), ordered, false)).toEqual([
      '__design_system__',
      '__design_files__',
      'a.md',
      '__browser__:1',
    ]);
  });

  it('includes the questions tab only when showQuestionsTab is true', () => {
    expect(computeWorkspaceTabIds(null, ordered, true)).toEqual([
      '__design_files__',
      '__questions__',
      'a.md',
      '__browser__:1',
    ]);
  });
});

describe('computeActiveWorkspaceContext', () => {
  const baseParams = {
    activeTab: '__design_files__',
    designSystemProject: null as DesignSystemSummary | null,
    designFilesTabIsEmpty: false,
    uploadDir: '',
    resolvedDir: null as string | null,
    t,
    browserTabs: [] as BrowserWorkspaceTab[],
    conversations: [] as Conversation[],
    activeLiveArtifact: null as LiveArtifactWorkspaceEntry | null,
    activeFile: null as ProjectFile | null,
  };

  it('returns a design-system context when the design-system tab is active', () => {
    const context = computeActiveWorkspaceContext({
      ...baseParams,
      activeTab: '__design_system__',
      designSystemProject: makeSystem(),
    });
    expect(context).toEqual({
      id: 'workspace:design-system',
      kind: 'design-system',
      label: 'dsManager.tabDesignSystem',
      tabId: '__design_system__',
    });
  });

  it('returns null for the Design Files tab when it is empty', () => {
    expect(computeActiveWorkspaceContext({ ...baseParams, designFilesTabIsEmpty: true })).toBeNull();
  });

  it('returns a folder context for the Design Files tab scoped to uploadDir', () => {
    const context = computeActiveWorkspaceContext({
      ...baseParams,
      uploadDir: '/assets/icons',
      resolvedDir: '/proj',
    });
    expect(context).toEqual({
      id: 'folder:/assets/icons',
      kind: 'folder',
      label: 'icons',
      tabId: '__design_files__',
      path: '/assets/icons',
      absolutePath: '/proj/assets/icons',
    });
  });

  it('returns a browser context for an active browser tab', () => {
    const context = computeActiveWorkspaceContext({
      ...baseParams,
      activeTab: '__browser__:1',
      browserTabs: [browserTab('__browser__:1', { title: 'Example', url: 'https://example.com' })],
    });
    expect(context).toEqual({
      id: 'browser:__browser__:1',
      kind: 'browser',
      label: 'Example',
      tabId: '__browser__:1',
      title: 'Example',
      url: 'https://example.com',
    });
  });

  it('returns null for a browser tab id with no matching entry', () => {
    expect(computeActiveWorkspaceContext({ ...baseParams, activeTab: '__browser__:9' })).toBeNull();
  });

  it('returns a terminal context for an active terminal tab', () => {
    const context = computeActiveWorkspaceContext({ ...baseParams, activeTab: 'terminal:t1' });
    expect(context).toEqual({
      id: 'terminal:t1',
      kind: 'terminal',
      label: 'workspace.newTerminal',
      tabId: 'terminal:t1',
    });
  });

  it('returns a side-chat context using the conversation title when known', () => {
    const context = computeActiveWorkspaceContext({
      ...baseParams,
      activeTab: 'chat:conv1',
      conversations: [{ id: 'conv1', projectId: 'p1', title: 'Landing page', createdAt: 0, updatedAt: 0 }],
    });
    expect(context).toEqual({
      id: 'side-chat:conv1',
      kind: 'side-chat',
      label: 'Landing page',
      tabId: 'chat:conv1',
    });
  });

  it('falls back to the default side-chat label when the conversation title is blank', () => {
    const context = computeActiveWorkspaceContext({
      ...baseParams,
      activeTab: 'chat:conv1',
      conversations: [{ id: 'conv1', projectId: 'p1', title: null, createdAt: 0, updatedAt: 0 }],
    });
    expect(context?.label).toBe('workspace.sideChatDefaultTitle');
  });

  it('returns a live-artifact context when activeLiveArtifact is set', () => {
    const activeLiveArtifact = {
      kind: 'live-artifact' as const,
      tabId: 'live:art1' as LiveArtifactWorkspaceEntry['tabId'],
      artifactId: 'art1',
      projectId: 'p1',
      title: 'Landing',
      slug: 'landing',
      status: 'ready' as LiveArtifactWorkspaceEntry['status'],
      refreshStatus: 'idle' as LiveArtifactWorkspaceEntry['refreshStatus'],
      pinned: false,
      preview: {} as LiveArtifactWorkspaceEntry['preview'],
      hasDocument: true,
      updatedAt: '2024-01-01',
    };
    const context = computeActiveWorkspaceContext({
      ...baseParams,
      activeTab: 'live:art1',
      activeLiveArtifact,
    });
    expect(context).toEqual({
      id: 'live-artifact:art1',
      kind: 'live-artifact',
      label: 'Landing',
      tabId: 'live:art1',
      path: 'landing',
    });
  });

  it('returns a file context for the active file, with an absolutePath when resolvedDir is set', () => {
    const context = computeActiveWorkspaceContext({
      ...baseParams,
      activeTab: 'design/a.md',
      resolvedDir: '/proj',
      activeFile: projectFile({ name: 'design/a.md', path: 'design/a.md' }),
    });
    expect(context).toEqual({
      id: 'file:design/a.md',
      kind: 'file',
      label: 'a.md',
      tabId: 'design/a.md',
      path: 'design/a.md',
      absolutePath: '/proj/design/a.md',
    });
  });

  it('returns null when nothing matches', () => {
    expect(computeActiveWorkspaceContext({ ...baseParams, activeTab: 'unknown-tab' })).toBeNull();
  });
});

describe('computeWorkspaceContexts', () => {
  const baseParams = {
    designSystemProject: null as DesignSystemSummary | null,
    uploadDir: '',
    resolvedDir: null as string | null,
    t,
    visibleFiles: [] as ProjectFile[],
    liveArtifactEntries: [] as LiveArtifactWorkspaceEntry[],
    tabNames: [] as string[],
    orderedWorkspaceTabs: [] as WorkspaceOrderedTab[],
    conversations: [] as Conversation[],
    sketches: {} as Record<string, SketchState>,
  };

  it('always includes the Design Files context first', () => {
    const contexts = computeWorkspaceContexts(baseParams);
    expect(contexts).toEqual([
      { id: 'workspace:design-files', kind: 'design-files', label: 'workspace.designFiles', tabId: '__design_files__' },
    ]);
  });

  it('prepends the design-system context when a project is set', () => {
    const contexts = computeWorkspaceContexts({ ...baseParams, designSystemProject: makeSystem() });
    expect(contexts[0]).toEqual({
      id: 'workspace:design-system',
      kind: 'design-system',
      label: 'dsManager.tabDesignSystem',
      tabId: '__design_system__',
    });
  });

  it('adds one entry per ordered tab, deduping by kind+id', () => {
    const file = projectFile({ name: 'a.md', path: 'a.md' });
    const contexts = computeWorkspaceContexts({
      ...baseParams,
      visibleFiles: [file],
      tabNames: ['a.md'],
      orderedWorkspaceTabs: [{ id: 'a.md', kind: 'file', name: 'a.md' }],
    });
    expect(contexts).toHaveLength(2);
    expect(contexts[1]).toEqual({
      id: 'file:a.md',
      kind: 'file',
      label: 'a.md',
      tabId: 'a.md',
      path: 'a.md',
    });
  });

  it('numbers terminal tabs by their ordinal among terminal tabs', () => {
    const orderedWorkspaceTabs: WorkspaceOrderedTab[] = [
      { id: 'terminal:t1', kind: 'file', name: 'terminal:t1' },
      { id: 'terminal:t2', kind: 'file', name: 'terminal:t2' },
    ];
    const contexts = computeWorkspaceContexts({
      ...baseParams,
      tabNames: ['terminal:t1', 'terminal:t2'],
      orderedWorkspaceTabs,
    });
    expect(contexts[1]?.label).toBe('workspace.newTerminal');
    expect(contexts[2]?.label).toBe('workspace.newTerminal 2');
  });

  it('skips a file-kind entry that matches neither a visible file nor a sketch', () => {
    const contexts = computeWorkspaceContexts({
      ...baseParams,
      tabNames: ['ghost.md'],
      orderedWorkspaceTabs: [{ id: 'ghost.md', kind: 'file', name: 'ghost.md' }],
    });
    expect(contexts).toHaveLength(1);
  });
});
