import { type EntryHomeView, type Route } from '../router';

/**
 * Pure model for the workspace tab strip: tab kinds, route conversion,
 * persistence revival, normalization invariants, and the mutation helpers
 * shared by the WorkspaceTabsBar component and its window events. Kept free
 * of React and DOM so the invariants stay unit-testable.
 */

export type WorkspaceChromeTab =
  | {
      id: string;
      kind: 'entry';
      view: EntryHomeView;
      createdAt: number;
      lastActiveAt: number;
    }
  | {
      id: string;
      kind: 'project';
      projectId: string;
      conversationId: string | null;
      fileName: string | null;
      createdAt: number;
      lastActiveAt: number;
    }
  | {
      id: string;
      kind: 'marketplace';
      pluginId: string | null;
      createdAt: number;
      lastActiveAt: number;
    };

export interface WorkspaceTabsState {
  tabs: WorkspaceChromeTab[];
  activeTabId: string;
}

function nowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEntryTab(view: EntryHomeView, timestamp = Date.now()): WorkspaceChromeTab {
  return {
    id: `entry:${view}:${nowId()}`,
    kind: 'entry',
    view,
    createdAt: timestamp,
    lastActiveAt: timestamp,
  };
}

export function tabFromRoute(route: Route, timestamp = Date.now()): WorkspaceChromeTab {
  if (route.kind === 'project') {
    return {
      id: `project:${route.projectId}:${nowId()}`,
      kind: 'project',
      projectId: route.projectId,
      conversationId: route.conversationId ?? null,
      fileName: route.fileName,
      createdAt: timestamp,
      lastActiveAt: timestamp,
    };
  }
  if (route.kind === 'marketplace' || route.kind === 'marketplace-detail') {
    const pluginId = route.kind === 'marketplace-detail' ? route.pluginId : null;
    return {
      id: `marketplace:${pluginId ?? 'index'}:${nowId()}`,
      kind: 'marketplace',
      pluginId,
      createdAt: timestamp,
      lastActiveAt: timestamp,
    };
  }
  return createEntryTab(route.kind === 'home' ? route.view : 'design-systems', timestamp);
}

export function routeForTab(tab: WorkspaceChromeTab): Route {
  if (tab.kind === 'project') {
    return {
      kind: 'project',
      projectId: tab.projectId,
      conversationId: tab.conversationId,
      fileName: tab.fileName,
    };
  }
  if (tab.kind === 'marketplace') {
    return tab.pluginId
      ? { kind: 'marketplace-detail', pluginId: tab.pluginId }
      : { kind: 'marketplace' };
  }
  return { kind: 'home', view: tab.view };
}

export function reviveTab(value: unknown): WorkspaceChromeTab | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
  const lastActiveAt = typeof record.lastActiveAt === 'number' ? record.lastActiveAt : createdAt;
  if (!id) return null;
  if (record.kind === 'entry') {
    const view = record.view;
    if (
      view === 'home'
      || view === 'projects'
      || view === 'tasks'
      || view === 'plugins'
      || view === 'design-systems'
      || view === 'integrations'
    ) {
      return { id, kind: 'entry', view, createdAt, lastActiveAt };
    }
  }
  if (record.kind === 'project' && typeof record.projectId === 'string') {
    return {
      id,
      kind: 'project',
      projectId: record.projectId,
      conversationId: typeof record.conversationId === 'string' ? record.conversationId : null,
      fileName: typeof record.fileName === 'string' ? record.fileName : null,
      createdAt,
      lastActiveAt,
    };
  }
  if (record.kind === 'marketplace') {
    return {
      id,
      kind: 'marketplace',
      pluginId: typeof record.pluginId === 'string' ? record.pluginId : null,
      createdAt,
      lastActiveAt,
    };
  }
  return null;
}

export function uniqueIdForTab(tab: WorkspaceChromeTab): string {
  if (tab.kind === 'project') return `project:${tab.projectId}:${nowId()}`;
  if (tab.kind === 'marketplace') {
    return `marketplace:${tab.pluginId ?? 'index'}:${nowId()}`;
  }
  return `entry:${tab.view}:${nowId()}`;
}

export function normalizeTabsState(state: WorkspaceTabsState): WorkspaceTabsState {
  let sourceTabs = state.tabs.length > 0 ? state.tabs : [createEntryTab('home')];

  // Deduplicate entry tabs (singleton constraint): all sidebar sections
  // (home / projects / tasks / design-systems / plugins / integrations) share
  // ONE entry tab that switches its view in place. Keep the canonical one:
  // 1. Is one of them currently active?
  // 2. Otherwise, pick the one with highest lastActiveAt.
  // 3. Otherwise, pick the first one.
  const entryTabs = sourceTabs.filter((tab) => tab.kind === 'entry');
  if (entryTabs.length > 1) {
    let canonicalEntry = entryTabs.find((tab) => tab.id === state.activeTabId);
    if (!canonicalEntry) {
      canonicalEntry = entryTabs.reduce((newest, currentTab) =>
        currentTab.lastActiveAt > newest.lastActiveAt ? currentTab : newest,
        entryTabs[0]!
      );
    }
    // Drop every other entry tab; the survivor keeps its own view so the
    // section the user was on is preserved.
    sourceTabs = sourceTabs.filter(
      (tab) => tab.kind !== 'entry' || tab.id === canonicalEntry!.id,
    );
  }

  // Coalesce duplicate project tabs (one-project/one-tab invariant): a
  // workspace restored from localStorage can already hold several tabs for the
  // same projectId if the user hit the duplicate-tab bug before upgrading.
  // Keep one canonical tab per projectId — the active match, else the newest —
  // and drop the rest. This runs on every normalize, so it repairs persisted
  // state as well as preventing new corruption. See issue #2641.
  const projectTabs = sourceTabs.filter((tab) => tab.kind === 'project');
  if (projectTabs.length > 0) {
    const canonicalByProject = new Map<string, WorkspaceChromeTab>();
    for (const tab of projectTabs) {
      const existing = canonicalByProject.get(tab.projectId);
      if (!existing) {
        canonicalByProject.set(tab.projectId, tab);
        continue;
      }
      // Prefer the currently active tab; otherwise keep the most recently used.
      const tabIsActive = tab.id === state.activeTabId;
      const existingIsActive = existing.id === state.activeTabId;
      const keepTab =
        (tabIsActive && !existingIsActive) ||
        (!existingIsActive && tab.lastActiveAt > existing.lastActiveAt);
      if (keepTab) canonicalByProject.set(tab.projectId, tab);
    }
    const canonicalProjectIds = new Set(
      Array.from(canonicalByProject.values()).map((tab) => tab.id),
    );
    sourceTabs = sourceTabs.filter(
      (tab) => tab.kind !== 'project' || canonicalProjectIds.has(tab.id),
    );
  }

  // Coalesce marketplace tabs (one-per-plugin invariant, mirroring the
  // project-tabs rule above): repeated plugin opens and plugin-applying runs
  // used to append a fresh tab each time, so a workspace restored from
  // localStorage can hold several identical-looking plugin tabs for the same
  // pluginId (issue #8493). Keep one tab per pluginId — the active match, else
  // the newest — and at most one index tab (pluginId === null); drop the rest.
  // This runs on every normalize, so it repairs persisted state as well as
  // preventing new corruption.
  const marketplaceTabs = sourceTabs.filter((tab) => tab.kind === 'marketplace');
  if (marketplaceTabs.length > 1) {
    const canonicalByPlugin = new Map<string, WorkspaceChromeTab>();
    for (const tab of marketplaceTabs) {
      const pluginKey = tab.pluginId ?? 'index';
      const existing = canonicalByPlugin.get(pluginKey);
      if (!existing) {
        canonicalByPlugin.set(pluginKey, tab);
        continue;
      }
      // Prefer the currently active tab; otherwise keep the most recently used.
      const tabIsActive = tab.id === state.activeTabId;
      const existingIsActive = existing.id === state.activeTabId;
      const keepTab =
        (tabIsActive && !existingIsActive) ||
        (!existingIsActive && tab.lastActiveAt > existing.lastActiveAt);
      if (keepTab) canonicalByPlugin.set(pluginKey, tab);
    }
    const canonicalMarketplaceIds = new Set(
      Array.from(canonicalByPlugin.values()).map((tab) => tab.id),
    );
    sourceTabs = sourceTabs.filter(
      (tab) => tab.kind !== 'marketplace' || canonicalMarketplaceIds.has(tab.id),
    );
  }

  // Pin the single entry tab to the leftmost position (Figma-style). It is the
  // one permanent, non-closable tab regardless of which section it currently
  // shows; project / marketplace tabs always sit to its right in insertion
  // order. If no entry tab survives normalization — e.g. a user who reopens on
  // a saved `[project, ...]` workspace — create one so the invariant "an entry
  // tab always exists and is leftmost" holds for migrated state too.
  const entryIndex = sourceTabs.findIndex((tab) => tab.kind === 'entry');
  if (entryIndex < 0) {
    sourceTabs = [createEntryTab('home'), ...sourceTabs];
  } else if (entryIndex > 0) {
    const [entryTab] = sourceTabs.splice(entryIndex, 1);
    sourceTabs = [entryTab!, ...sourceTabs];
  }

  const usedIds = new Set<string>();
  let activeTabId = '';
  let activeClaimed = false;
  const tabs = sourceTabs.map((tab) => {
    const wasActive = tab.id === state.activeTabId && !activeClaimed;
    if (wasActive) activeClaimed = true;
    const id = tab.id && !usedIds.has(tab.id) ? tab.id : uniqueIdForTab(tab);
    usedIds.add(id);
    if (wasActive) activeTabId = id;
    return id === tab.id ? tab : { ...tab, id };
  });
  return {
    tabs,
    activeTabId: activeTabId || tabs[0]!.id,
  };
}

export type TabDropEdge = 'before' | 'after';

export function reorderTabsById(
  tabs: WorkspaceChromeTab[],
  sourceId: string,
  targetId: string,
  edge: TabDropEdge,
): WorkspaceChromeTab[] {
  if (sourceId === targetId) return tabs;
  const movedTab = tabs.find((tab) => tab.id === sourceId);
  if (!movedTab) return tabs;

  const nextTabs = tabs.filter((tab) => tab.id !== sourceId);
  const targetIndex = nextTabs.findIndex((tab) => tab.id === targetId);
  if (targetIndex < 0) return tabs;
  nextTabs.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, movedTab);
  if (nextTabs.every((tab, index) => tab.id === tabs[index]?.id)) return tabs;
  return nextTabs;
}

/**
 * Tabs eligible for the project switcher dropdown: project tabs only, in
 * most-recently-used order. Marketplace and plugin-detail views are transient
 * navigation, not workspace entities, and must not appear alongside projects
 * (issue #8493).
 */
export function projectSwitcherTabs(
  tabs: WorkspaceChromeTab[],
  mruRank: (tab: WorkspaceChromeTab) => number,
): WorkspaceChromeTab[] {
  return tabs
    .filter((tab) => tab.kind === 'project')
    .sort((a, b) => mruRank(a) - mruRank(b));
}

/**
 * Apply an `openWorkspaceTab` navigation to the current tab state: reuse an
 * existing tab when the route targets one that is already open (same project,
 * same pluginId, or the marketplace index), otherwise append a new tab and
 * focus it. Every open used to append unconditionally, which piled up
 * identical plugin tabs across repeated runs (issue #8493).
 */
export function openRouteInTabsState(
  current: WorkspaceTabsState,
  route: Route,
  timestamp = Date.now(),
): WorkspaceTabsState {
  const normalized = normalizeTabsState(current);
  // Reuse an existing project tab for the same projectId instead of appending
  // a duplicate on repeated opens.
  if (route.kind === 'project') {
    const existingProjectTab = normalized.tabs.find(
      (tab) => tab.kind === 'project' && tab.projectId === route.projectId,
    );
    if (existingProjectTab) {
      return normalizeTabsState({
        ...normalized,
        tabs: normalized.tabs.map((tab) =>
          tab.id === existingProjectTab.id
            ? {
                ...tab,
                conversationId: route.conversationId ?? null,
                fileName: route.fileName,
                lastActiveAt: timestamp,
              }
            : tab,
        ),
        activeTabId: existingProjectTab.id,
      });
    }
  }
  // Reuse the existing marketplace tab for the same pluginId (or the index
  // tab) instead of appending a duplicate on repeated opens.
  if (route.kind === 'marketplace' || route.kind === 'marketplace-detail') {
    const pluginId = route.kind === 'marketplace-detail' ? route.pluginId : null;
    const existingMarketplaceTab = normalized.tabs.find(
      (tab) => tab.kind === 'marketplace' && (tab.pluginId ?? null) === pluginId,
    );
    if (existingMarketplaceTab) {
      return normalizeTabsState({
        ...normalized,
        tabs: normalized.tabs.map((tab) =>
          tab.id === existingMarketplaceTab.id
            ? { ...tab, lastActiveAt: timestamp }
            : tab,
        ),
        activeTabId: existingMarketplaceTab.id,
      });
    }
  }
  const nextTab = tabFromRoute(route, timestamp);
  return normalizeTabsState({
    tabs: [...normalized.tabs, nextTab],
    activeTabId: nextTab.id,
  });
}
