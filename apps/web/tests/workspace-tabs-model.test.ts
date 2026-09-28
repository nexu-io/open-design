import { describe, expect, it } from 'vitest';

import {
  normalizeTabsState,
  openRouteInTabsState,
  projectSwitcherTabs,
  type WorkspaceChromeTab,
} from '../src/components/workspaceTabsModel';

function entryTab(id: string, lastActiveAt = 0): WorkspaceChromeTab {
  return { id, kind: 'entry', view: 'home', createdAt: 0, lastActiveAt };
}

function projectTab(id: string, projectId: string, lastActiveAt = 0): WorkspaceChromeTab {
  return {
    id,
    kind: 'project',
    projectId,
    conversationId: null,
    fileName: null,
    createdAt: 0,
    lastActiveAt,
  };
}

function marketplaceTab(
  id: string,
  pluginId: string | null,
  lastActiveAt = 0,
): WorkspaceChromeTab {
  return { id, kind: 'marketplace', pluginId, createdAt: 0, lastActiveAt };
}

describe('normalizeTabsState marketplace coalescing', () => {
  it('collapses the persisted plugin-tab pile-up to one tab per pluginId plus one index tab', () => {
    // Shape of the corrupted state reported in issue #8493: one tab appended
    // per plugin-applying run (two plugins applied twice, plus the index).
    const state = {
      tabs: [
        entryTab('entry:home:1', 10),
        projectTab('project:p1:1', 'p1', 11),
        marketplaceTab('marketplace:pa:1', 'pa', 12),
        marketplaceTab('marketplace:pa:2', 'pa', 13),
        marketplaceTab('marketplace:pb:1', 'pb', 14),
        marketplaceTab('marketplace:pb:2', 'pb', 15),
        marketplaceTab('marketplace:index:1', null, 16),
        marketplaceTab('marketplace:index:2', null, 17),
      ],
      activeTabId: 'project:p1:1',
    };

    const result = normalizeTabsState(state);
    const marketplace = result.tabs.filter((tab) => tab.kind === 'marketplace');

    expect(marketplace).toHaveLength(3);
    expect(
      marketplace
        .map((tab) => (tab.kind === 'marketplace' ? tab.pluginId : null))
        .sort((a, b) => (a ?? '').localeCompare(b ?? '')),
    ).toEqual([null, 'pa', 'pb']);
    // The newest duplicate of each pluginId survives.
    expect(marketplace.map((tab) => tab.id).sort()).toEqual([
      'marketplace:index:2',
      'marketplace:pa:2',
      'marketplace:pb:2',
    ]);
    // Project and entry tabs are untouched; entry stays pinned leftmost.
    expect(result.tabs[0]?.kind).toBe('entry');
    expect(result.tabs.filter((tab) => tab.kind === 'project')).toHaveLength(1);
    expect(result.activeTabId).toBe('project:p1:1');
  });

  it('keeps the currently active marketplace tab as the canonical duplicate', () => {
    const state = {
      tabs: [
        entryTab('entry:home:1', 1),
        marketplaceTab('marketplace:pa:older', 'pa', 5),
        marketplaceTab('marketplace:pa:newer', 'pa', 9),
      ],
      activeTabId: 'marketplace:pa:older',
    };

    const result = normalizeTabsState(state);

    expect(result.tabs.filter((tab) => tab.kind === 'marketplace')).toHaveLength(1);
    expect(result.activeTabId).toBe('marketplace:pa:older');
  });

  it('leaves a single marketplace tab untouched', () => {
    const state = {
      tabs: [entryTab('entry:home:1'), marketplaceTab('marketplace:pa:1', 'pa', 3)],
      activeTabId: 'marketplace:pa:1',
    };

    const result = normalizeTabsState(state);

    expect(result.tabs).toHaveLength(2);
  });
});

describe('openRouteInTabsState marketplace reuse', () => {
  it('reuses the same tab when the same plugin is opened by repeated runs', () => {
    const initial = {
      tabs: [entryTab('entry:home:1', 1)],
      activeTabId: 'entry:home:1',
    };
    const detail = { kind: 'marketplace-detail', pluginId: 'pa' } as const;

    const first = openRouteInTabsState(initial, detail, 100);
    expect(first.tabs.filter((tab) => tab.kind === 'marketplace')).toHaveLength(1);

    const second = openRouteInTabsState(first, detail, 200);
    // Repeated runs of the SAME plugin must not append another tab.
    expect(second.tabs.filter((tab) => tab.kind === 'marketplace')).toHaveLength(1);
    expect(second.activeTabId).toBe(first.activeTabId);
    const opened = second.tabs.find((tab) => tab.id === first.activeTabId);
    expect(opened && opened.kind === 'marketplace' ? opened.lastActiveAt : 0).toBe(200);
  });

  it('keeps one tab per distinct plugin instead of one per open', () => {
    const initial = {
      tabs: [entryTab('entry:home:1', 1)],
      activeTabId: 'entry:home:1',
    };

    const afterPa = openRouteInTabsState(initial, {
      kind: 'marketplace-detail',
      pluginId: 'pa',
    }, 100);
    const afterPb = openRouteInTabsState(afterPa, {
      kind: 'marketplace-detail',
      pluginId: 'pb',
    }, 101);
    // Opening 'pa' again after 'pb' must refocus the existing tab, not append.
    const afterPaAgain = openRouteInTabsState(afterPb, {
      kind: 'marketplace-detail',
      pluginId: 'pa',
    }, 102);

    expect(afterPaAgain.tabs.filter((tab) => tab.kind === 'marketplace')).toHaveLength(2);
    expect(afterPaAgain.activeTabId).toBe(afterPa.activeTabId);
  });

  it('reuses the index tab for marketplace navigations', () => {
    const initial = {
      tabs: [entryTab('entry:home:1', 1)],
      activeTabId: 'entry:home:1',
    };

    const first = openRouteInTabsState(initial, { kind: 'marketplace' }, 100);
    const second = openRouteInTabsState(first, { kind: 'marketplace' }, 101);

    expect(second.tabs.filter((tab) => tab.kind === 'marketplace')).toHaveLength(1);
    const indexTab = second.tabs.find((tab) => tab.kind === 'marketplace');
    expect(indexTab && indexTab.kind === 'marketplace' ? indexTab.pluginId : 'x').toBeNull();
  });

  it('still reuses an existing project tab for the same projectId', () => {
    const initial = {
      tabs: [entryTab('entry:home:1', 1)],
      activeTabId: 'entry:home:1',
    };
    const route = { kind: 'project', projectId: 'p1', fileName: null } as const;

    const first = openRouteInTabsState(initial, route, 100);
    const second = openRouteInTabsState(first, route, 200);

    expect(second.tabs.filter((tab) => tab.kind === 'project')).toHaveLength(1);
    expect(second.activeTabId).toBe(first.activeTabId);
  });
});

describe('projectSwitcherTabs', () => {
  it('only offers project tabs to the project dropdown, in MRU order', () => {
    const tabs = [
      entryTab('entry:home:1', 1),
      projectTab('project:p1:1', 'p1', 5),
      marketplaceTab('marketplace:pa:1', 'pa', 6),
      projectTab('project:p2:1', 'p2', 9),
    ];

    const dropdown = projectSwitcherTabs(tabs, (tab) => -tab.lastActiveAt);

    expect(dropdown.map((tab) => tab.id)).toEqual(['project:p2:1', 'project:p1:1']);
  });

  it('returns an empty list for a workspace with no open projects', () => {
    const tabs = [entryTab('entry:home:1', 1), marketplaceTab('marketplace:pa:1', 'pa', 6)];

    expect(projectSwitcherTabs(tabs, (tab) => -tab.lastActiveAt)).toEqual([]);
  });
});
