import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { navigate, type EntryHomeView, type Route } from '../router';
import type { Project } from '../types';
import { Icon, type IconName } from './Icon';

type WorkspaceChromeTab =
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

interface WorkspaceTabsState {
  tabs: WorkspaceChromeTab[];
  activeTabId: string;
}

interface DisplayTab {
  id: string;
  title: string;
  meta: string;
  icon: IconName;
  tab: WorkspaceChromeTab;
}

interface Props {
  route: Route;
  projects: Project[];
}

const STORAGE_KEY = 'open-design:workspace-tabs:v1';
const OPEN_WORKSPACE_TAB_EVENT = 'open-design:workspace-tabs:open';
const MAX_SEARCH_RESULTS = 80;

export function openWorkspaceTab(route: Route): void {
  window.dispatchEvent(
    new CustomEvent<{ route: Route }>(OPEN_WORKSPACE_TAB_EVENT, {
      detail: { route },
    }),
  );
}

function nowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEntryTab(view: EntryHomeView, timestamp = Date.now()): WorkspaceChromeTab {
  return {
    id: `entry:${view}:${nowId()}`,
    kind: 'entry',
    view,
    createdAt: timestamp,
    lastActiveAt: timestamp,
  };
}

function tabFromRoute(route: Route, timestamp = Date.now()): WorkspaceChromeTab {
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

function routeForTab(tab: WorkspaceChromeTab): Route {
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

function reviveTab(value: unknown): WorkspaceChromeTab | null {
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

function uniqueIdForTab(tab: WorkspaceChromeTab): string {
  if (tab.kind === 'project') return `project:${tab.projectId}:${nowId()}`;
  if (tab.kind === 'marketplace') {
    return `marketplace:${tab.pluginId ?? 'index'}:${nowId()}`;
  }
  return `entry:${tab.view}:${nowId()}`;
}

function normalizeTabsState(state: WorkspaceTabsState): WorkspaceTabsState {
  let sourceTabs = state.tabs.length > 0 ? state.tabs : [createEntryTab('home')];

  // Deduplicate Home tabs (singleton constraint)
  const homeTabs = sourceTabs.filter((tab) => tab.kind === 'entry' && tab.view === 'home');
  if (homeTabs.length > 1) {
    // Find canonical Home tab:
    // 1. Is one of them currently active?
    // 2. Otherwise, pick the one with highest lastActiveAt.
    // 3. Otherwise, pick the first one.
    let canonicalHome = homeTabs.find((tab) => tab.id === state.activeTabId);
    if (!canonicalHome) {
      canonicalHome = homeTabs.reduce((newest, currentTab) =>
        currentTab.lastActiveAt > newest.lastActiveAt ? currentTab : newest,
        homeTabs[0]!
      );
    }
    // Filter out all duplicate Home tabs except the canonical one
    sourceTabs = sourceTabs.filter((tab) => {
      if (tab.kind === 'entry' && tab.view === 'home') {
        return tab.id === canonicalHome!.id;
      }
      return true;
    });
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

function initialTabsState(route: Route): WorkspaceTabsState {
  const fallback = tabFromRoute(route);
  if (typeof window === 'undefined') {
    return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') {
      return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
    }
    const record = parsed as Record<string, unknown>;
    const tabs = Array.isArray(record.tabs)
      ? record.tabs.map(reviveTab).filter((tab): tab is WorkspaceChromeTab => tab !== null)
      : [];
    const activeTabId = typeof record.activeTabId === 'string' ? record.activeTabId : '';
    if (tabs.length === 0) {
      return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
    }
    return syncStateToRoute({ tabs, activeTabId: activeTabId || tabs[0]!.id }, route);
  } catch {
    return syncStateToRoute({ tabs: [fallback], activeTabId: fallback.id }, route);
  }
}

function syncStateToRoute(state: WorkspaceTabsState, route: Route): WorkspaceTabsState {
  const timestamp = Date.now();
  const current = normalizeTabsState(state);
  const currentActive = current.tabs.find((tab) => tab.id === current.activeTabId) ?? null;

  // 1. If we are navigating to Home:
  if (route.kind === 'home' && route.view === 'home') {
    const existingHomeTab = current.tabs.find(
      (tab) => tab.kind === 'entry' && tab.view === 'home',
    );
    if (existingHomeTab) {
      return normalizeTabsState({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === existingHomeTab.id
            ? { ...tab, lastActiveAt: timestamp }
            : tab,
        ),
        activeTabId: existingHomeTab.id,
      });
    } else {
      const nextTab = tabFromRoute(route, timestamp);
      return normalizeTabsState({
        tabs: [...current.tabs, nextTab],
        activeTabId: nextTab.id,
      });
    }
  }

  // 2. If we are navigating to a project, and that project tab already exists:
  if (route.kind === 'project') {
    const existingProjectTab = current.tabs.find(
      (tab) => tab.kind === 'project' && tab.projectId === route.projectId,
    );
    if (existingProjectTab) {
      return normalizeTabsState({
        ...current,
        tabs: current.tabs.map((tab) =>
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

    // 3. If we are navigating to a project, and the project tab does NOT exist,
    // but the current active tab is the Home tab, we should NOT replace the Home tab.
    // Instead, we should append a new project tab!
    if (currentActive && currentActive.kind === 'entry' && currentActive.view === 'home') {
      const nextTab = tabFromRoute(route, timestamp);
      return normalizeTabsState({
        tabs: [...current.tabs, nextTab],
        activeTabId: nextTab.id,
      });
    }
  }

  if (!currentActive) {
    const nextTab = tabFromRoute(route, timestamp);
    return normalizeTabsState({
      tabs: [...current.tabs, nextTab],
      activeTabId: nextTab.id,
    });
  }

  const replacement = {
    ...tabFromRoute(route, currentActive.createdAt),
    id: currentActive.id,
    lastActiveAt: timestamp,
  };
  const nextTabs = current.tabs.map((tab) =>
    tab.id === currentActive.id ? replacement : tab,
  );
  return normalizeTabsState({ tabs: nextTabs, activeTabId: replacement.id });
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

interface HoverPreviewState {
  tabId: string;
  anchorLeft: number;
  anchorRight: number;
  anchorBottom: number;
}

const HOVER_PREVIEW_DELAY_MS = 380;

export function WorkspaceTabsBar({ route, projects }: Props) {
  const t = useT();
  const [state, setState] = useState<WorkspaceTabsState>(() => initialTabsState(route));
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  function clearHoverTimer() {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function scheduleHoverPreview(tabId: string, element: HTMLElement) {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setHoverPreview({
        tabId,
        anchorLeft: rect.left,
        anchorRight: rect.right,
        anchorBottom: rect.bottom,
      });
    }, HOVER_PREVIEW_DELAY_MS);
  }

  function dismissHoverPreview() {
    clearHoverTimer();
    setHoverPreview(null);
  }

  useEffect(() => () => clearHoverTimer(), []);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const displayTabs = useMemo(
    () => state.tabs.map((tab) => displayTabFor(tab, projectById, t)),
    [state.tabs, projectById, t],
  );
  const displayTabById = useMemo(
    () => new Map(displayTabs.map((tab) => [tab.id, tab])),
    [displayTabs],
  );
  const filteredTabs = useMemo(() => {
    const needle = normalizeSearch(query);
    const source = needle
      ? displayTabs.filter((tab) => {
          const haystack = `${tab.title} ${tab.meta}`.toLocaleLowerCase();
          return haystack.includes(needle);
        })
      : displayTabs;
    return source
      .slice()
      .sort((a, b) => b.tab.lastActiveAt - a.tab.lastActiveAt)
      .slice(0, MAX_SEARCH_RESULTS);
  }, [displayTabs, query]);

  useEffect(() => {
    setState((current) => syncStateToRoute(current, route));
  }, [route]);

  // Scroll the active tab into view when it changes. The strip itself
  // is native-scrollable horizontally (see CSS), so we just nudge the
  // browser's scroll position whenever the active id flips — keeps the
  // current tab visible after a route change even if the user had
  // scrolled the strip elsewhere.
  useEffect(() => {
    function onOpenWorkspaceTab(event: Event) {
      const detail = (event as CustomEvent<{ route?: Route }>).detail;
      const nextRoute = detail?.route;
      if (!nextRoute) return;
      const nextTab = tabFromRoute(nextRoute);
      setState((current) => {
        const normalized = normalizeTabsState(current);
        return normalizeTabsState({
          tabs: [...normalized.tabs, nextTab],
          activeTabId: nextTab.id,
        });
      });
      setTabsMenuOpen(false);
    }

    window.addEventListener(OPEN_WORKSPACE_TAB_EVENT, onOpenWorkspaceTab);
    return () => window.removeEventListener(OPEN_WORKSPACE_TAB_EVENT, onOpenWorkspaceTab);
  }, []);

  useEffect(() => {
    const stripElement = stripRef.current;
    if (!stripElement) return;
    const activeEl = stripElement.querySelector<HTMLElement>('.workspace-tab.is-active');
    if (!activeEl) return;
    if (typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [state.activeTabId, state.tabs.length]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Best-effort browser chrome state. Navigation itself remains URL-driven.
    }
  }, [state]);

  useEffect(() => {
    if (!tabsMenuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tabsMenuOpen]);

  useEffect(() => {
    if (!tabsMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const insideTrigger = menuRef.current?.contains(target) ?? false;
      // The popover is rendered through a portal into document.body to
      // escape the `contain: layout` containment block on
      // `.workspace-tabs-strip` (which would otherwise resolve our
      // fixed positioning against the strip instead of the viewport).
      // The portaled node is outside menuRef's subtree, so we also have
      // to count clicks inside it as "inside the menu".
      const insidePopover = popoverRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePopover) {
        setTabsMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setTabsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [tabsMenuOpen]);

  function openTab(tab: WorkspaceChromeTab) {
    setState((current) => ({
      tabs: normalizeTabsState(current).tabs.map((item) =>
        item.id === tab.id ? { ...item, lastActiveAt: Date.now() } : item,
      ),
      activeTabId: tab.id,
    }));
    setTabsMenuOpen(false);
    dismissHoverPreview();
    navigate(routeForTab(tab));
  }

  function createNewTab() {
    const normalized = normalizeTabsState(state);
    const existingHomeTab = normalized.tabs.find(
      (tab) => tab.kind === 'entry' && tab.view === 'home',
    );
    if (existingHomeTab) {
      setState({
        ...normalized,
        activeTabId: existingHomeTab.id,
      });
      navigate({ kind: 'home', view: 'home' });
    } else {
      const tab = createEntryTab('home');
      setState({
        tabs: [...normalized.tabs, tab],
        activeTabId: tab.id,
      });
      navigate({ kind: 'home', view: 'home' });
    }
    setTabsMenuOpen(false);
  }

  function closeTab(tabId: string) {
    dismissHoverPreview();
    const normalized = normalizeTabsState(state);
    const closingIndex = normalized.tabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) return;
    let nextRoute: Route | null = null;
    const nextTabs = normalized.tabs.filter((tab) => tab.id !== tabId);
    let nextState: WorkspaceTabsState;
    if (nextTabs.length === 0) {
      const homeTab = createEntryTab('home');
      nextRoute = routeForTab(homeTab);
      nextState = { tabs: [homeTab], activeTabId: homeTab.id };
    } else if (normalized.activeTabId !== tabId) {
      nextState = { ...normalized, tabs: nextTabs };
    } else {
      const replacement = nextTabs[Math.min(closingIndex, nextTabs.length - 1)] ?? nextTabs[0]!;
      nextRoute = routeForTab(replacement);
      nextState = { tabs: nextTabs, activeTabId: replacement.id };
    }
    setState(nextState);
    if (nextRoute) navigate(nextRoute);
  }

  return (
    <header className="app-chrome-header workspace-tabs-chrome" aria-label="Workspace tabs">
      <div className="app-chrome-traffic-space workspace-tabs-traffic" aria-hidden />
      <div
        className="workspace-tabs-strip"
        role="tablist"
        aria-label="Open workspaces"
        ref={stripRef}
      >
        {/* Render every open tab — the strip itself scrolls horizontally
            when the tabs exceed the available chrome width. Previous
            behaviour sliced to `visibleChromeTabs(...)` and squeezed
            the rest behind a "+N more" chip, which squished the entire
            chrome horizontally. The search-tabs popover still acts as
            a keyboard surface for finding a tab that's scrolled out of
            view. */}
        {state.tabs.map((tab) => {
          const display = displayTabById.get(tab.id) ?? displayTabFor(tab, projectById, t);
          const active = tab.id === state.activeTabId;
          return (
            <div
              key={tab.id}
              className={`workspace-tab${active ? ' is-active' : ''}`}
              role="tab"
              aria-selected={active}
              aria-describedby={hoverPreview?.tabId === tab.id ? 'workspace-tab-preview' : undefined}
              onMouseEnter={(event) => scheduleHoverPreview(tab.id, event.currentTarget)}
              onMouseLeave={dismissHoverPreview}
            >
              <button
                type="button"
                className="workspace-tab__main"
                onClick={() => openTab(tab)}
                onFocus={(event) => scheduleHoverPreview(tab.id, event.currentTarget.parentElement ?? event.currentTarget)}
                onBlur={dismissHoverPreview}
              >
                <span className="workspace-tab__icon" aria-hidden>
                  <Icon name={display.icon} size={14} />
                </span>
                <span className="workspace-tab__label">{display.title}</span>
              </button>
              <button
                type="button"
                className="workspace-tab__close"
                aria-label={t('common.close')}
                onClick={() => closeTab(tab.id)}
              >
                <Icon name="close" size={10} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="workspace-tabs-actions" ref={menuRef}>
        <button
          type="button"
          className="workspace-tabs-new-btn"
          onClick={createNewTab}
          title="New tab"
          aria-label="New tab"
        >
          <Icon name="plus" size={14} />
        </button>
        <button
          type="button"
          className={`workspace-tabs-icon-btn${tabsMenuOpen ? ' is-active' : ''}`}
          onClick={() => setTabsMenuOpen((open) => !open)}
          title="Search tabs"
          aria-label="Search tabs"
          aria-haspopup="dialog"
          aria-expanded={tabsMenuOpen}
        >
          <Icon name="search" size={15} />
        </button>
        {tabsMenuOpen && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="workspace-tabs-popover"
                role="dialog"
                aria-label="Search tabs"
                ref={popoverRef}
              >
                <div className="workspace-tabs-search">
                  <Icon name="search" size={14} />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tabs"
                    aria-label="Search tabs"
                  />
                </div>
                <div className="workspace-tabs-popover__section">
                  <span>Open tabs</span>
                  <span>{state.tabs.length}</span>
                </div>
                <div className="workspace-tabs-list" role="listbox" aria-label="Open tabs">
                  {filteredTabs.length > 0 ? (
                    filteredTabs.map((display) => {
                      const active = display.id === state.activeTabId;
                      return (
                        <div
                          key={display.id}
                          className={`workspace-tabs-list__item${active ? ' is-active' : ''}`}
                          role="option"
                          aria-selected={active}
                        >
                          <button
                            type="button"
                            className="workspace-tabs-list__main"
                            onClick={() => openTab(display.tab)}
                          >
                            <span className="workspace-tabs-list__icon" aria-hidden>
                              <Icon name={display.icon} size={15} />
                            </span>
                            <span className="workspace-tabs-list__text">
                              <span className="workspace-tabs-list__title">{display.title}</span>
                              <span className="workspace-tabs-list__meta">{display.meta}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="workspace-tabs-list__close"
                            onClick={() => closeTab(display.id)}
                            title={t('common.close')}
                            aria-label={t('common.close')}
                          >
                            <Icon name="close" size={11} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="workspace-tabs-empty">No tabs found</div>
                  )}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
      {hoverPreview && typeof document !== 'undefined' && !tabsMenuOpen
        ? createPortal(
            (() => {
              const previewTab = state.tabs.find((tab) => tab.id === hoverPreview.tabId);
              if (!previewTab) return null;
              const previewDisplay = displayTabById.get(previewTab.id)
                ?? displayTabFor(previewTab, projectById, t);
              const previewDetail = describePreviewDetail(previewTab, projectById);
              const previewWidth = 240;
              const anchorCenter = (hoverPreview.anchorLeft + hoverPreview.anchorRight) / 2;
              const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
              const left = Math.max(
                10,
                Math.min(viewportWidth - previewWidth - 10, anchorCenter - previewWidth / 2),
              );
              return (
                <div
                  id="workspace-tab-preview"
                  className="workspace-tab-preview"
                  role="tooltip"
                  style={{ left, top: hoverPreview.anchorBottom + 6, width: previewWidth }}
                >
                  <div className="workspace-tab-preview__icon" aria-hidden>
                    <Icon name={previewDisplay.icon} size={16} />
                  </div>
                  <div className="workspace-tab-preview__text">
                    <div className="workspace-tab-preview__title">{previewDisplay.title}</div>
                    <div className="workspace-tab-preview__meta">{previewDisplay.meta}</div>
                    {previewDetail ? (
                      <div className="workspace-tab-preview__detail">{previewDetail}</div>
                    ) : null}
                  </div>
                </div>
              );
            })(),
            document.body,
          )
        : null}
    </header>
  );
}

function describePreviewDetail(
  tab: WorkspaceChromeTab,
  projectById: Map<string, Project>,
): string | null {
  if (tab.kind === 'project') {
    if (tab.fileName) return tab.fileName;
    const project = projectById.get(tab.projectId);
    const brief = project?.pendingPrompt?.trim() || project?.customInstructions?.trim();
    if (brief) {
      return brief.length > 120 ? `${brief.slice(0, 117)}…` : brief;
    }
    return null;
  }
  if (tab.kind === 'marketplace') {
    return tab.pluginId ? tab.pluginId : null;
  }
  return null;
}

function displayTabFor(
  tab: WorkspaceChromeTab,
  projectById: Map<string, Project>,
  t: ReturnType<typeof useT>,
): DisplayTab {
  if (tab.kind === 'project') {
    const project = projectById.get(tab.projectId);
    return {
      id: tab.id,
      title: project?.name?.trim() || t('common.untitled'),
      meta: t('workspaceTabs.project'),
      icon: 'folder',
      tab,
    };
  }
  if (tab.kind === 'marketplace') {
    return {
      id: tab.id,
      title: tab.pluginId ? t('workspaceTabs.pluginDetails') : t('workspaceTabs.marketplace'),
      meta: t('entry.navPlugins'),
      icon: 'grid',
      tab,
    };
  }
  const entryTitle: Record<EntryHomeView, string> = {
    home: t('entry.navHome'),
    onboarding: t('settings.welcomeTitle'),
    projects: t('entry.navProjects'),
    tasks: t('entry.navTasks'),
    plugins: t('entry.navPlugins'),
    'design-systems': t('entry.navDesignSystems'),
    integrations: t('entry.navIntegrations'),
  };
  const entryIcon: Record<EntryHomeView, IconName> = {
    home: 'home',
    onboarding: 'sparkles',
    projects: 'folder',
    tasks: 'kanban',
    plugins: 'grid',
    'design-systems': 'blocks',
    integrations: 'link',
  };
  return {
    id: tab.id,
    title: entryTitle[tab.view],
    meta: tab.view === 'home' ? 'Start a new project' : 'Workspace',
    icon: entryIcon[tab.view],
    tab,
  };
}
