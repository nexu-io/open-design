import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  getWorkspaceTabsDock,
  subscribeWorkspaceTabsDock,
} from './workspaceTabsDock';
import { useT } from '../i18n';
import { buildPath, navigate, type EntryHomeView, type Route } from '../router';
import type { Project } from '../types';
import {
  type ProjectDisplayStatus,
  type TeamProject,
  type WorkspaceCollabContext,
  workspaceContextHasTeamIdentity,
} from '@open-design/contracts';
import { Icon, type IconName } from './Icon';
import {
  hasCompletionNotice,
  hasRunStatusGlyph,
  ProjectCompletionDot,
  ProjectFolderGlyph,
  ProjectRunStatusIcon,
} from './ProjectRunStatusIcon';
import {
  ProjectHoverPreviewCard,
  useProjectHoverCover,
} from './entry-nav-rail/ProjectHoverPreview';
import { DeleteMark, MoreDotsMark, RenameMark } from './entry-nav-rail/RailRecentRow';
import { createSharedProjectPredicate } from '../collab/all-projects-list';
import { fetchTeamProjectsCatalog } from '../collab/team-projects-catalog';
import { projectOwnedBySelf } from './project-actions/ownership';
import {
  forgetOptimisticProjectOwnership,
  type OptimisticProjectOwnershipWitnesses,
  optimisticProjectOwnershipScopeKey,
  projectOwnerMemberIdsWithOptimisticWitnesses,
  recordOptimisticProjectOwnership,
} from '../collab/optimistic-project-ownership';
import { currentWorkspaceAccountGeneration } from '../collab/workspace-identity';
import { ProjectDeleteConfirmDialog } from './project-actions/ProjectDeleteConfirmDialog';
import {
  type ProjectDeleteHandler,
  useProjectDeleteFlow,
} from './project-actions/useProjectDeleteFlow';
import {
  type ProjectDuplicateHandler,
  useProjectDuplicateFlow,
} from './project-actions/useProjectDuplicateFlow';
import { useWorkspaceProjectMove } from './project-actions/useWorkspaceProjectMove';
import { MoveToTeamConfirmDialog, moveConfirmSkipped } from './MoveToTeamConfirmDialog';
import actionStyles from './WorkspaceProjectActions.module.css';
import { acknowledgeProjectCompletion, useProjectRunStatuses } from '../hooks/useProjectRunStatuses';
import { STATUS_LABEL_KEYS } from '../state/projectRunStatus';
import {
  HOME_APPLY_TEMPLATE_EVENT,
  orderedCreateChips,
  type HomeHeroChip,
} from './home-hero/chips';
import {
  ENTRY_RAIL_STATE_EVENT,
  ENTRY_RAIL_TOGGLE_EVENT,
  ENTRY_SEARCH_OPEN_EVENT,
  readStoredRailOpen,
} from './entryRailBridge';
import { useAnalytics } from '../analytics/provider';
import { trackEntryNavigationClick } from '../analytics/events';
import { entryViewToTracking } from '../analytics/workspace';
import { homeHeroChipLabel } from './home-hero/chip-labels';
import { isMacPlatform } from '../utils/platform';
import { useGlideIndicator } from '../hooks/useGlideIndicator';
import { useLiquidGlass } from '../hooks/useLiquidGlass';
import { WORKSPACE_CHROME_ACCOUNT_ACTIONS_ID } from './workspaceChromeActions';

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

interface PersistedWorkspaceTabsSnapshot {
  state: WorkspaceTabsState;
  updatedAt: number;
}

interface PersistedWorkspaceTabsStore {
  current: WorkspaceTabsState | null;
  scopeKey: string | undefined;
  scopes: Record<string, PersistedWorkspaceTabsSnapshot>;
}

interface DisplayTab {
  id: string;
  title: string;
  meta: string;
  icon: IconName;
  tab: WorkspaceChromeTab;
}

type TabDropEdge = 'before' | 'after';

interface TabDragTarget {
  tabId: string;
  edge: TabDropEdge;
}

interface Props {
  route: Route;
  projects: Project[];
  /**
   * Persisted Workspace binding for the project currently named by `route`.
   * `null` is an authoritative unbound/local project; `undefined` means the
   * current route is not a resolved project and must not relax scope resets.
   */
  activeProjectWorkspaceId?: string | null;
  // Once onboarding is finished, the permanent entry
  // tab must never linger on the 'onboarding' (Welcome) view — some completion
  // paths navigate straight to a new project/design-system and leave the entry
  // tab showing Welcome in the background. This flips it back to Home.
  onboardingCompleted?: boolean;
  /**
   * Stable "AMR account + active workspace" identity key the currently open
   * tabs belong to (derived in App.tsx from `amrLoginStatus` +
   * `workspaceContext` — see the comment there for the exact composition).
   * `null` means "not resolved yet" (before the first AMR status read
   * completes): the bar leaves whatever it already restored from
   * localStorage untouched rather than guessing.
   *
   * Once resolved, each value owns an isolated tab snapshot. Switching to a
   * different workspace restores only that scope's tabs (or a fresh Home tab
   * on first visit), so returning to a workspace keeps its order and active
   * tab without exposing those tabs in another scope.
   */
  identityScopeKey?: string | null;
  /**
   * Workspace headers for the per-project run lookups behind the dropdown's
   * status glyphs and the hover preview's cover read. Optional: without it the
   * requests go unscoped, which is correct for a local/unbound session and
   * simply returns nothing readable in a workspace one.
   */
  workspaceContext?: WorkspaceCollabContext | null;
  /**
   * The docked dropdown's per-row ⋮ menu (OPEND-2686 / OPEND-3128): 重命名 /
   * 复制项目 / 转入团队空间 / 删除, through the flows the rail's 最近项目 rows and
   * the project cards already share. Each item renders only when its handler
   * is supplied; 转入团队空间 needs no handler — it runs `moveWorkspaceProject`
   * itself — and shows under the rail row menu's conditions (a team workspace
   * with `canShareProjects`).
   */
  onRenameProject?: (id: string, name: string) => Promise<unknown> | void;
  onDuplicateProject?: ProjectDuplicateHandler;
  onDeleteProject?: ProjectDeleteHandler;
}

/* Dwell before the dock dropdown's hover preview commits to a row. Long
   enough that running the pointer down the list to reach the bottom entry
   mounts nothing on the way, short enough that stopping on a row feels
   immediate. */
const PREVIEW_HOVER_DELAY_MS = 180;

/* The preview card is the rail's own (`.entry-nav-rail__recent-preview`, 216px
   wide, centred on the row through translateY(-50%)). Kept in JS too because
   the card is portaled to <body> and has to decide for itself which side of
   the menu it fits on. */
const PREVIEW_WIDTH_PX = 216;
const PREVIEW_GAP_PX = 8;

/* The row ⋮ menu takes the preview's slot beside the dropdown (see
   `.menu` in WorkspaceProjectActions.module.css for the width). */
const DOCK_ACTIONS_WIDTH_PX = 160;

/**
 * Where a row's ⋮ menu sits: top-aligned with the row, just past the
 * dropdown's right edge — or its left edge when the window has no room there,
 * the same fallback the hover preview makes.
 */
function dockActionsAnchorFor(
  row: HTMLElement,
  menu: HTMLElement | null,
  viewportWidth: number,
): { top: number; left: number } {
  const menuRect = menu?.getBoundingClientRect() ?? row.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const right = menuRect.right + PREVIEW_GAP_PX;
  const fits = right + DOCK_ACTIONS_WIDTH_PX + PREVIEW_GAP_PX <= viewportWidth;
  return {
    top: rowRect.top,
    left: fits
      ? right
      : Math.max(PREVIEW_GAP_PX, menuRect.left - PREVIEW_GAP_PX - DOCK_ACTIONS_WIDTH_PX),
  };
}

const STORAGE_KEY = 'open-design:workspace-tabs:v1';
const OPEN_WORKSPACE_TAB_EVENT = 'open-design:workspace-tabs:open';
const REMOVE_WORKSPACE_PROJECT_TABS_EVENT = 'open-design:workspace-tabs:remove-project';
const MAX_PERSISTED_TAB_SCOPES = 12;
const TAB_DRAG_HAPTIC_MS = 8;
const TAB_DROP_HAPTIC_MS = 12;

function consumeWorkspaceTabShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function shouldDeferShortcutToProjectWorkspace(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector('[data-testid="file-workspace"]') !== null;
}

export function openWorkspaceTab(route: Route): void {
  window.dispatchEvent(
    new CustomEvent<{ route: Route }>(OPEN_WORKSPACE_TAB_EVENT, {
      detail: { route },
    }),
  );
}

export function removeWorkspaceProjectTabs(projectId: string): void {
  window.dispatchEvent(
    new CustomEvent<{ projectId: string }>(REMOVE_WORKSPACE_PROJECT_TABS_EVENT, {
      detail: { projectId },
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

function reorderTabsById(
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

function tabDragTargetKey(target: TabDragTarget): string {
  return `${target.tabId}:${target.edge}`;
}

/**
 * A tab's horizontal span in viewport X, measured from layout geometry
 * (offsetLeft/offsetWidth) instead of getBoundingClientRect. Layout geometry
 * excludes transforms, so the FLIP slide animation and drag styling never
 * shift the rects the drop hit-testing reads — a transformed hovered tab used
 * to move its own midpoint, flip the before/after edge, transform back, and
 * oscillate (visible jitter while dragging).
 */
function tabLayoutSpan(
  strip: HTMLElement,
  element: HTMLElement,
): { left: number; right: number; mid: number } {
  const stripLeft = strip.getBoundingClientRect().left - strip.scrollLeft;
  const left = stripLeft + element.offsetLeft;
  const width = element.offsetWidth;
  return { left, right: left + width, mid: left + width / 2 };
}

function tabDropEdgeFromElement(
  event: DragEvent<HTMLElement>,
  strip: HTMLElement,
  element: HTMLElement,
): TabDropEdge {
  return event.clientX > tabLayoutSpan(strip, element).mid ? 'after' : 'before';
}

function pulseTabDragHaptic(durationMs = TAB_DRAG_HAPTIC_MS) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // Haptics are opportunistic; unsupported environments should keep dragging normally.
  }
}

function reviveTabsState(value: unknown): WorkspaceTabsState | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const tabs = Array.isArray(record.tabs)
    ? record.tabs.map(reviveTab).filter((tab): tab is WorkspaceChromeTab => tab !== null)
    : [];
  if (tabs.length === 0) return null;
  const activeTabId = typeof record.activeTabId === 'string' ? record.activeTabId : '';
  return normalizeTabsState({ tabs, activeTabId: activeTabId || tabs[0]!.id });
}

function readPersistedTabsStore(): PersistedWorkspaceTabsStore {
  const empty: PersistedWorkspaceTabsStore = {
    current: null,
    scopeKey: undefined,
    scopes: {},
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return empty;
    const record = parsed as Record<string, unknown>;
    const current = reviveTabsState(record);
    const scopeKey = typeof record.scopeKey === 'string' ? record.scopeKey : undefined;
    const scopes: Record<string, PersistedWorkspaceTabsSnapshot> = {};
    if (record.scopes !== null && typeof record.scopes === 'object') {
      for (const [key, value] of Object.entries(record.scopes as Record<string, unknown>)) {
        if (!key || value === null || typeof value !== 'object') continue;
        const snapshotRecord = value as Record<string, unknown>;
        const state = reviveTabsState(snapshotRecord.state);
        if (!state) continue;
        scopes[key] = {
          state,
          updatedAt: typeof snapshotRecord.updatedAt === 'number'
            ? snapshotRecord.updatedAt
            : 0,
        };
      }
    }
    // Migrate the previous single-scope format in memory. It remains readable
    // at the top level while the next write adds the scoped registry.
    if (scopeKey && current && !scopes[scopeKey]) {
      scopes[scopeKey] = { state: current, updatedAt: 0 };
    }
    return { current, scopeKey, scopes };
  } catch {
    return empty;
  }
}

function persistTabsStore(
  store: PersistedWorkspaceTabsStore,
  currentScopeKey: string | undefined,
  current: WorkspaceTabsState,
): void {
  if (typeof window === 'undefined') return;
  try {
    const scopes = currentScopeKey
      ? {
          ...store.scopes,
          [currentScopeKey]: {
            state: normalizeTabsState(current),
            updatedAt: Date.now(),
          },
        }
      : store.scopes;
    const retainedScopes = Object.fromEntries(
      Object.entries(scopes)
        .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_PERSISTED_TAB_SCOPES),
    );
    const payloadScopeKey = currentScopeKey ?? store.scopeKey;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...normalizeTabsState(current),
        ...(payloadScopeKey ? { scopeKey: payloadScopeKey, scopes: retainedScopes } : {}),
      }),
    );
    store.current = current;
    store.scopeKey = payloadScopeKey;
    store.scopes = retainedScopes;
  } catch {
    // Best-effort browser chrome state. Navigation itself remains URL-driven.
  }
}

function freshHomeTabsState(): WorkspaceTabsState {
  const homeTab = createEntryTab('home');
  return { tabs: [homeTab], activeTabId: homeTab.id };
}

function initialTabsState(
  route: Route,
  persisted: PersistedWorkspaceTabsStore,
  identityScopeKey: string | null | undefined,
): WorkspaceTabsState {
  const fallback = tabFromRoute(route);
  const fallbackState = { tabs: [fallback], activeTabId: fallback.id };
  if (identityScopeKey === undefined) {
    return syncStateToRoute(persisted.current ?? fallbackState, route);
  }
  if (identityScopeKey === null) {
    // An unowned snapshot (no `scopeKey` stamp — written by a build that
    // predates tab scoping) cannot be attributed to whichever identity is
    // about to resolve, so it must not even be displayed provisionally
    // (recvqziATl6LlJ / recvqxKdOz0S6g). Owned snapshots keep the warm-reload
    // restore; the scope effect reconciles them once the identity resolves.
    if (persisted.scopeKey === undefined) {
      return syncStateToRoute(fallbackState, route);
    }
    return persisted.current ?? syncStateToRoute(fallbackState, route);
  }
  const scoped = persisted.scopes[identityScopeKey]?.state;
  if (persisted.scopeKey === identityScopeKey) {
    return syncStateToRoute(scoped ?? persisted.current ?? fallbackState, route);
  }
  if (persisted.scopeKey === undefined) {
    // Same attribution rule with the scope already resolved at mount time:
    // unowned storage never seeds a resolved scope. Route truth alone does.
    return syncStateToRoute(fallbackState, route);
  }
  return scoped ?? freshHomeTabsState();
}

function syncStateToRoute(state: WorkspaceTabsState, route: Route): WorkspaceTabsState {
  const timestamp = Date.now();
  const current = normalizeTabsState(state);
  const currentActive = current.tabs.find((tab) => tab.id === current.activeTabId) ?? null;

  // 1. If we are navigating to any entry view (home / projects / tasks /
  // design-systems / plugins / integrations / onboarding), reuse the single
  // entry tab and switch its view IN PLACE — all sidebar sections collapse
  // into the one leftmost tab. Only create one if none exists.
  if (route.kind === 'home') {
    const existingEntryTab = current.tabs.find((tab) => tab.kind === 'entry');
    if (existingEntryTab) {
      return normalizeTabsState({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === existingEntryTab.id
            ? { ...tab, view: route.view, lastActiveAt: timestamp }
            : tab,
        ),
        activeTabId: existingEntryTab.id,
      });
    }
    const nextTab = tabFromRoute(route, timestamp);
    return normalizeTabsState({
      tabs: [...current.tabs, nextTab],
      activeTabId: nextTab.id,
    });
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
    // but the current active tab is the (single) entry tab, we should NOT
    // replace it — append a new project tab instead, regardless of which entry
    // view it currently shows.
    if (currentActive && currentActive.kind === 'entry') {
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

function accountBucketForScope(scopeKey: string): string {
  return scopeKey.split('::', 1)[0] ?? scopeKey;
}

function workspaceBucketForScope(scopeKey: string): string | null {
  const separator = scopeKey.indexOf('::');
  return separator < 0 ? null : scopeKey.slice(separator + 2);
}

function shouldRehomeAuthorizedProjectAfterSignIn({
  previousScopeKey,
  nextScopeKey,
  route,
  activeProjectWorkspaceId,
}: {
  previousScopeKey: string;
  nextScopeKey: string;
  route: Route;
  activeProjectWorkspaceId: string | null | undefined;
}): boolean {
  const activeProjectMatchesIncomingScope =
    activeProjectWorkspaceId === null
    || (
      typeof activeProjectWorkspaceId === 'string'
      && activeProjectWorkspaceId === workspaceBucketForScope(nextScopeKey)
    );
  return (
    accountBucketForScope(previousScopeKey) === 'anon'
    && accountBucketForScope(nextScopeKey) !== 'anon'
    && route.kind === 'project'
    && activeProjectWorkspaceId !== undefined
    && activeProjectMatchesIncomingScope
  );
}


/** Corner home glyph (per product: the brand tile gave way to a plain home
 *  icon). Renders the SAME glyph as the rail's 首页 item (`Icon name="home"`)
 *  rather than a hand-inlined path: the two sit on one vertical axis, so a
 *  different house drawing read as a bug. `currentColor` so it follows the
 *  button's muted/hover ink. */
function ChromeHomeGlyph() {
  return <Icon name="home" size={16} className="workspace-chrome-logo" />;
}

/**
 * The glyph leading one dropdown row.
 *
 * A project row with a LIVE run to report shows its run status; a project row
 * with nothing live to report — nothing running, a status that draws nothing
 * (not_started), a finished run (which reports through `completionNoticeFor`
 * instead), a status that has not arrived yet — leads with the folder. Both
 * are the very components the rail's 最近项目 rows lead with (RailRecentRow),
 * so the two can never tell different stories about the same project: not for
 * its status (OPEND-2694) and not for its resting state either (OPEND-3129 —
 * this slot and the rail used to draw different resting marks, and one project
 * read as two). A non-project tab such as the plugin marketplace keeps its own
 * icon. The slot is therefore never empty, and the column never has to decide
 * whether to exist.
 *
 * Unknown is deliberately treated as "nothing to report" rather than guessed
 * at: a guess would flash the wrong status glyph on every open.
 */
function leadGlyphFor(
  tab: WorkspaceChromeTab,
  display: DisplayTab,
  runStatusByProjectId: ReadonlyMap<string, ProjectDisplayStatus>,
  t: ReturnType<typeof useT>,
): ReactNode {
  if (tab.kind !== 'project') {
    return <Icon name={display.icon} size={14} />;
  }
  const status = runStatusByProjectId.get(tab.projectId);
  if (!status || !hasRunStatusGlyph(status)) {
    return <ProjectFolderGlyph size={14} />;
  }
  return (
    <ProjectRunStatusIcon status={status} size={14} label={t(STATUS_LABEL_KEYS[status])} />
  );
}

/**
 * The unread dot at the END of one dropdown row (OPEND-3133): a project whose
 * run finished and has not been opened since. `openTab` spends it through the
 * same shared store the rail's rows read, so the rail drops its dot in the
 * same moment. Nothing for every other tab and status.
 */
function completionNoticeFor(
  tab: WorkspaceChromeTab,
  runStatusByProjectId: ReadonlyMap<string, ProjectDisplayStatus>,
  t: ReturnType<typeof useT>,
): ReactNode {
  if (tab.kind !== 'project') return null;
  const status = runStatusByProjectId.get(tab.projectId);
  if (!status || !hasCompletionNotice(status)) return null;
  return (
    <ProjectCompletionDot
      className="workspace-tabs-dropdown__row-unread"
      label={t(STATUS_LABEL_KEYS[status])}
      testId="workspace-tabs-dropdown-unread"
    />
  );
}

/**
 * The hovered row's preview: the rail's own card (`ProjectHoverPreviewCard`),
 * parked beside the open menu. Its own component so the cover hook runs for
 * exactly one project at a time — the one under the pointer — and re-mounts
 * (fresh cover, fresh plate) when the hovered row changes.
 */
function DockRowPreview({
  project,
  workspaceContext,
  anchor,
}: {
  project: Project;
  workspaceContext: WorkspaceCollabContext | null;
  anchor: { top: number; left: number };
}) {
  const cover = useProjectHoverCover(project, workspaceContext);
  const { resolveCover } = cover;
  useEffect(() => {
    void resolveCover();
  }, [resolveCover]);
  return createPortal(
    <ProjectHoverPreviewCard
      project={project}
      cover={cover}
      style={{ top: anchor.top, left: anchor.left }}
      testId="workspace-tabs-dropdown-preview"
    />,
    document.body,
  );
}

export function WorkspaceTabsBar({
  route,
  projects,
  activeProjectWorkspaceId,
  onboardingCompleted = false,
  identityScopeKey,
  workspaceContext = null,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  // Same binding the rail's own collapse control advertised (EntryShell owns
  // the keydown handler); named here so the expand direction says it too.
  const expandHint = `${t('entry.navExpand')} ${isMacPlatform() ? '⌘B' : 'Ctrl+B'}`;
  const collapseHint = `${t('entry.navCollapse')} ${isMacPlatform() ? '⌘B' : 'Ctrl+B'}`;
  const searchHint = `${t('common.search')} ${isMacPlatform() ? '⌘K' : 'Ctrl+K'}`;
  const [persistedTabsStore] = useState(readPersistedTabsStore);
  const [state, setState] = useState<WorkspaceTabsState>(
    () => initialTabsState(route, persistedTabsStore, identityScopeKey),
  );
  const lastSeenScopeKeyRef = useRef<string | undefined>(persistedTabsStore.scopeKey);
  const resolvedScopeOnceRef = useRef(false);
  const pendingScopeStateRef = useRef<{
    scopeKey: string;
    state: WorkspaceTabsState;
  } | null>(null);
  const pendingScopeRouteRef = useRef<{
    scopeKey: string;
    path: string;
  } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // #5517 corner fan: the "+" button opens a corner-anchored radial menu of
  // template wedges instead of immediately spawning a home tab.
  const [radialMenu, setRadialMenu] = useState<{ x: number; y: number } | null>(null);
  // Docked-mode white dropdown (project route): open state of its tab list.
  const [dockMenuOpen, setDockMenuOpen] = useState(false);
  // Most-recently-activated tab ids, newest first — the dropdown lists tabs
  // in this order (最近打开的在前). Session-local: falls back to strip order
  // for tabs never activated since launch.
  const tabMruRef = useRef<string[]>([]);
  useEffect(() => {
    const id = state.activeTabId;
    if (!id) return;
    tabMruRef.current = [id, ...tabMruRef.current.filter((x) => x !== id)].slice(0, 50);
  }, [state.activeTabId]);
  const [radialHoverId, setRadialHoverId] = useState<string | null>(null);
  useEffect(() => {
    if (!radialMenu) setRadialHoverId(null);
  }, [radialMenu]);
  useEffect(() => {
    if (!radialMenu) return;
    // Uniform page blur: filter on the shell blurs every descendant equally
    // (backdrop-filter on the scrim sampled composited layers unevenly).
    document.documentElement.classList.add('od-radial-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRadialMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('od-radial-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [radialMenu]);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const previousOnboardingCompletedRef = useRef(onboardingCompleted);
  const resetEntryToHomeAfterOnboardingRef = useRef(false);
  const dragSuppressClickRef = useRef(false);
  const draggingTabIdRef = useRef<string | null>(null);
  const dragHapticTargetRef = useRef<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<TabDragTarget | null>(null);
  // recvq5eKj2kdF0: `projects` is the Home view's own fetch (recent/drafts,
  // capped) — navigating Home refetches and REPLACES it (App.tsx's
  // reconcileFetchedProjects), which drops any project that is open in a
  // background tab but falls outside that scope. `displayTabFor` then found
  // no entry for the tab's projectId and fell back to the untitled label,
  // even though the project genuinely has a name — the tab just "forgot" it
  // the moment Home reloaded. This ref remembers the last real name seen for
  // each project id so a tab never regresses to untitled once it has shown a
  // real one; it is intentionally a ref (not state) because it must not
  // itself trigger a render — the incoming `projects`/`state.tabs` change
  // that recomputes `displayTabs` already will.
  const knownProjectNamesRef = useRef<Map<string, string>>(new Map());

  // Liquid-glass glide indicator: one persistent pill that slides to the
  // active tab (see useGlideIndicator + .workspace-tabs-glide in routines.css).
  const glideRef = useRef<HTMLDivElement | null>(null);
  const glidePillRef = useRef<HTMLDivElement | null>(null);
  const glideGlassRef = useLiquidGlass<HTMLDivElement>({ strength: 0.2 });
  const setGlidePillRef = useCallback(
    (node: HTMLDivElement | null) => {
      glidePillRef.current = node;
      glideGlassRef(node);
    },
    [glideGlassRef],
  );

  // FLIP slide for live drag-reordering: when the tab order changes mid-drag,
  // each displaced tab starts at its previous slot (inverted transform) and
  // transitions to its new one instead of teleporting. Positions come from
  // offsetLeft (layout space, transform-free), so the in-flight slides never
  // feed back into the drop hit-testing in findTabDropTarget.
  const tabFlipLeftsRef = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const previousLefts = tabFlipLeftsRef.current;
    const nextLefts = new Map<string, number>();
    for (const element of strip.querySelectorAll<HTMLElement>('[data-workspace-tab-id]')) {
      const id = element.dataset.workspaceTabId;
      if (!id) continue;
      nextLefts.set(id, element.offsetLeft);
      const before = previousLefts.get(id);
      if (before === undefined) continue;
      const delta = before - element.offsetLeft;
      if (!delta) continue;
      // The dragged tab itself snaps — its native drag ghost is what tracks
      // the pointer; animating the in-row placeholder would lag behind it.
      if (id === draggingTabIdRef.current) continue;
      element.style.transition = 'none';
      element.style.transform = `translateX(${delta}px)`;
      // Commit the inverted start position before re-enabling transitions.
      void element.offsetWidth;
      element.style.transition = '';
      element.style.transform = '';
    }
    tabFlipLeftsRef.current = nextLefts;
  });

  // Layout epoch for the glide indicator: any change in tab identity/order or
  // the overflow state can shift the active tab without changing which tab is
  // active — those reposition instantly (no fake slide).
  const tabsLayoutKey = useMemo(
    () => `${state.tabs.map((tab) => tab.id).join('|')}:${tabsOverflowing ? 1 : 0}`,
    [state.tabs, tabsOverflowing],
  );
  const activeChromeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  // The pinned entry tab renders only a flat rail-toggle whenever it's active —
  // the sidebar toggle on Home, the Home button in every other entry section
  // (settings / all-projects / community / design-systems). In ALL of these the
  // glide pill must not park its filled "active tab" surface over it, so key off
  // `kind === 'entry'` rather than the Home view alone (which left the pill
  // filling the button in the other sections).
  const activeIsEntryRailToggle = activeChromeTab?.kind === 'entry';
  useGlideIndicator({
    containerRef: stripRef,
    indicatorRef: glideRef,
    pillRef: glidePillRef,
    // On an entry section, target a never-matching selector so the glide pill
    // fades out over the toggle instead of filling it. (jsdom-safe — no `:has()`
    // in querySelector.)
    activeSelector: activeIsEntryRailToggle
      ? '.workspace-tab.is-active.__no-glide__'
      : '.workspace-tab.is-active',
    activeKey: state.activeTabId,
    layoutKey: tabsLayoutKey,
    frozen: draggingTabId !== null,
    // The pinned entry tab is position: sticky — its visual position diverges
    // from layout coords while the strip is scrolled, so chase it on scroll.
    trackScroll: activeChromeTab?.kind === 'entry',
  });

  // While the app is on the onboarding (Welcome) route, opening a new tab
  // would navigate away from onboarding and bypass the Connect gate. Key off
  // the live `route` (the URL truth), NOT `onboardingCompleted` and NOT the
  // internal tab `view`: a user who finished onboarding before (completion
  // persisted) can still land on /onboarding, and the entry tab's view can be
  // mid-rewrite by the post-completion effect. Gating in `createNewTab` blocks
  // both the "+" button and the Cmd/Ctrl+T shortcut from one place.
  const onboardingActive = route.kind === 'home' && route.view === 'onboarding';

  // Mirror of EntryShell's entry nav-rail open state, only used to reflect it
  // on the pinned Home tab's sidebar toggle (aria-expanded). EntryShell owns
  // the state and broadcasts changes as a window event because it renders in a
  // sibling React tree; the localStorage seed covers the frames before the
  // first broadcast arrives.
  const [entryRailOpen, setEntryRailOpen] = useState<boolean>(readStoredRailOpen);
  useEffect(() => {
    const onRailState = (event: Event) => {
      const open = (event as CustomEvent<{ open?: unknown }>).detail?.open;
      if (typeof open === 'boolean') setEntryRailOpen(open);
    };
    window.addEventListener(ENTRY_RAIL_STATE_EVENT, onRailState);
    return () => window.removeEventListener(ENTRY_RAIL_STATE_EVENT, onRailState);
  }, []);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  // Project-route dock (workspaceTabsDock.ts): when ProjectView registers a
  // dock element at the top of the chat column, the strip portals there and
  // the full-width chrome row collapses (`is-docked` + the :has() row rule in
  // routines.css). Whenever no dock exists — home/marketplace, focus mode —
  // the strip renders in the chrome row as before.
  const [tabsDockEl, setTabsDockEl] = useState<HTMLElement | null>(() => getWorkspaceTabsDock());
  useEffect(
    () => subscribeWorkspaceTabsDock(() => setTabsDockEl(getWorkspaceTabsDock())),
    [],
  );
  useEffect(() => {
    if (!tabsDockEl) setDockMenuOpen(false);
  }, [tabsDockEl]);

  // Run status for the dock dropdown's rows. Only fetched while that menu is
  // open: it costs one request per open project tab, and the glyphs it feeds
  // are not on screen otherwise.
  const dropdownProjectIds = useMemo(
    () =>
      state.tabs
        .filter((tab): tab is Extract<WorkspaceChromeTab, { kind: 'project' }> =>
          tab.kind === 'project')
        .map((tab) => tab.projectId),
    [state.tabs],
  );
  const runStatusByProjectId = useProjectRunStatuses(dropdownProjectIds, {
    enabled: dockMenuOpen,
    workspaceContext,
  });

  // Hovered row in the dock dropdown — the one the preview card is showing.
  // A row only claims it after a short dwell: sweeping the pointer down the
  // list would otherwise mount (and abandon) one cover read per row it
  // crossed. Leaving the menu clears it, so at most one preview is ever live.
  const [previewTabId, setPreviewTabId] = useState<string | null>(null);
  const [previewAnchor, setPreviewAnchor] = useState<{ top: number; left: number } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockMenuRef = useRef<HTMLDivElement | null>(null);
  const cancelPreviewTimer = useCallback(() => {
    if (previewTimerRef.current === null) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }, []);
  // The card is the rail's: 216px wide, centred on the hovered ROW
  // (translateY(-50%)), and parked just past the menu's right edge — or its
  // left when the window has no room there (narrow window, chat column docked
  // on the right).
  const anchorPreviewTo = useCallback((row: HTMLElement) => {
    const menuRect = dockMenuRef.current?.getBoundingClientRect() ?? row.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const right = menuRect.right + PREVIEW_GAP_PX;
    const fits = right + PREVIEW_WIDTH_PX + PREVIEW_GAP_PX <= window.innerWidth;
    return {
      top: rowRect.top + rowRect.height / 2,
      left: fits ? right : Math.max(PREVIEW_GAP_PX, menuRect.left - PREVIEW_GAP_PX - PREVIEW_WIDTH_PX),
    };
  }, []);
  const queuePreview = useCallback((tabId: string, row: HTMLElement) => {
    cancelPreviewTimer();
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      setPreviewAnchor(anchorPreviewTo(row));
      setPreviewTabId(tabId);
    }, PREVIEW_HOVER_DELAY_MS);
  }, [anchorPreviewTo, cancelPreviewTimer]);
  const showPreviewNow = useCallback((tabId: string, row: HTMLElement) => {
    cancelPreviewTimer();
    setPreviewAnchor(anchorPreviewTo(row));
    setPreviewTabId(tabId);
  }, [anchorPreviewTo, cancelPreviewTimer]);
  const clearPreview = useCallback(() => {
    cancelPreviewTimer();
    setPreviewTabId(null);
    setPreviewAnchor(null);
  }, [cancelPreviewTimer]);
  // Closing the menu (or unmounting) must not leave a queued preview to fire
  // into a menu that is gone.
  useEffect(() => {
    if (!dockMenuOpen) clearPreview();
  }, [dockMenuOpen, clearPreview]);
  useEffect(() => cancelPreviewTimer, [cancelPreviewTimer]);

  // ---- Row ⋮ menu (OPEND-2686 / OPEND-3128) ------------------------------
  // The project whose ⋮ menu is open, and where that menu sits. Keyed by
  // project rather than tab: the move flow re-opens it by project id once the
  // request is on its way (see `onMoveStart`), and a project has one row here.
  const [dockActionsProjectId, setDockActionsProjectId] = useState<string | null>(null);
  const [dockActionsAnchor, setDockActionsAnchor] = useState<{ top: number; left: number } | null>(null);
  const dockActionsRef = useRef<HTMLDivElement | null>(null);
  // 重命名 edits in place, in the row (the rail row does the same).
  const [dockRenamingProjectId, setDockRenamingProjectId] = useState<string | null>(null);
  const [dockRenameDraft, setDockRenameDraft] = useState('');
  // 复制项目: one at a time, and a failure stays in the menu until it closes.
  const [dockDuplicatingId, setDockDuplicatingId] = useState<string | null>(null);
  const [dockDuplicateFailedId, setDockDuplicateFailedId] = useState<string | null>(null);
  // Closing the dropdown takes everything it hosts with it. The dialogs below
  // are portalled and outlive it on purpose.
  useEffect(() => {
    if (dockMenuOpen) return;
    setDockActionsProjectId(null);
    setDockActionsAnchor(null);
    setDockRenamingProjectId(null);
    setDockDuplicateFailedId(null);
  }, [dockMenuOpen]);
  // Outside pointer / Escape / anything that moves the dropdown closes the
  // menu — the same dismissals the rail row menu answers to.
  useEffect(() => {
    if (!dockActionsProjectId) return undefined;
    const close = () => setDockActionsProjectId(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (dockActionsRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[data-dock-actions-trigger]')) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [dockActionsProjectId]);

  // 转入团队空间 shows under the rail row menu's conditions: a team plane to
  // move into AND the right to share. A personal workspace hides the item.
  const moveToTeamAvailable =
    workspaceContextHasTeamIdentity(workspaceContext)
    && workspaceContext?.permissions?.canShareProjects === true;
  // Shared / foreign rows are decided from the same evidence the rail uses —
  // the team hub's catalog — read once per dropdown open (coalesced and cached
  // by the catalog module, so this is not a second poll) rather than through
  // `useTeamProjects`, which would keep polling on the project route.
  const [teamCatalog, setTeamCatalog] = useState<readonly TeamProject[]>([]);
  useEffect(() => {
    if (!dockMenuOpen || !workspaceContextHasTeamIdentity(workspaceContext) || !workspaceContext) {
      return undefined;
    }
    let cancelled = false;
    fetchTeamProjectsCatalog({ context: workspaceContext })
      .then((catalog) => {
        if (!cancelled) setTeamCatalog(catalog);
      })
      .catch((error: unknown) => {
        // Off-team / offline / no hub: the rows read as unshared and owned,
        // which is what the rail shows with no catalog either.
        console.warn('[WorkspaceTabsBar] team project catalog read failed:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [dockMenuOpen, workspaceContext]);
  // Moves made from this menu flip the row's shared state at once; the
  // catalog read on the next open confirms it. The move response is also the
  // row's ownership witness until then — without it a just-shared row would
  // read as someone else's (shared, no attribution) and lose its actions,
  // which is the same lag EntryShell's optimistic layer covers for the cards.
  const [sharedThisSession, setSharedThisSession] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [ownershipWitnesses, setOwnershipWitnesses] = useState<OptimisticProjectOwnershipWitnesses>(
    () => new Map(),
  );
  const ownershipScopeKey = optimisticProjectOwnershipScopeKey(
    workspaceContext,
    currentWorkspaceAccountGeneration(),
  );
  const isSharedProject = useMemo(
    () => createSharedProjectPredicate({
      teamProjects: teamCatalog,
      localProjects: projects,
      workspaceContext,
      sharedThisSession,
    }),
    [projects, sharedThisSession, teamCatalog, workspaceContext],
  );
  const teamProjectOwnerMemberIds = useMemo(
    () => projectOwnerMemberIdsWithOptimisticWitnesses({
      scopeKey: ownershipScopeKey,
      teamProjects: teamCatalog,
      witnesses: ownershipWitnesses,
    }),
    [ownershipScopeKey, ownershipWitnesses, teamCatalog],
  );
  const dockRowOwnedBySelf = useCallback(
    (projectId: string) => projectOwnedBySelf({
      projectId,
      ownerMemberIds: teamProjectOwnerMemberIds,
      selfMemberId: workspaceContext?.workspaceMemberId,
      isShared: isSharedProject,
    }),
    [isSharedProject, teamProjectOwnerMemberIds, workspaceContext?.workspaceMemberId],
  );
  // The dropdown only exists on the project route, where no project-collection
  // page is on screen; its actions file under Home, as the rail's do off the
  // collection views.
  const deleteFlow = useProjectDeleteFlow({
    onDelete: onDeleteProject,
    analyticsPage: 'home',
    workspaceContext,
  });
  const duplicateFlow = useProjectDuplicateFlow({
    onDuplicate: onDuplicateProject,
    analyticsPage: 'home',
    workspaceContext,
  });
  const moveFlow = useWorkspaceProjectMove({
    workspaceContext,
    analyticsPage: 'home',
    onProjectShared: (moved) => {
      setSharedThisSession((prev) => new Set(prev).add(moved.id));
      setOwnershipWitnesses((prev) => recordOptimisticProjectOwnership(prev, {
        scopeKey: ownershipScopeKey,
        context: workspaceContext,
        project: moved,
      }));
    },
    onProjectShareFailed: (projectId) => {
      setSharedThisSession((prev) => {
        if (!prev.has(projectId)) return prev;
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
      setOwnershipWitnesses((prev) => forgetOptimisticProjectOwnership(prev, projectId));
    },
    // Progress and failure show in the row's ⋮ menu, which the confirm dialog
    // dismissed: re-open it once the request is on its way, close it again on
    // success (the rail section does the same with its row menu).
    onMoveStart: (project) => setDockActionsProjectId(project.id),
    onMoveSettled: (project, _action, ok) => {
      if (ok) setDockActionsProjectId((current) => (current === project.id ? null : current));
    },
  });
  const [moveTarget, setMoveTarget] = useState<Project | null>(null);
  const requestMoveToTeam = useCallback((project: Project) => {
    setDockActionsProjectId(null);
    if (moveConfirmSkipped()) {
      void moveFlow.shareToTeam(project);
      return;
    }
    setMoveTarget(project);
  }, [moveFlow]);
  const duplicateFromDock = useCallback(async (project: Project) => {
    if (dockDuplicatingId) return;
    setDockDuplicateFailedId(null);
    setDockDuplicatingId(project.id);
    const ok = await duplicateFlow.duplicate(project);
    setDockDuplicatingId(null);
    if (ok) {
      // The shell opens the copy; the list this dropdown showed is behind it.
      setDockActionsProjectId(null);
      setDockMenuOpen(false);
      return;
    }
    setDockDuplicateFailedId(project.id);
  }, [dockDuplicatingId, duplicateFlow]);
  const commitDockRename = useCallback((project: Project) => {
    const next = dockRenameDraft.trim();
    setDockRenamingProjectId(null);
    if (!next || next === project.name) return;
    void onRenameProject?.(project.id, next);
  }, [dockRenameDraft, onRenameProject]);

  // Full-page settings borrows CHAT's chrome row: a lone Home logo at the left
  // edge, no search / rail toggle. App swaps EntryShell out for the settings
  // surface on this route, so the rail those two controls drive isn't mounted —
  // the toggle collapses nothing and the ⌘K search (an EntryShell listener)
  // never hears the event. The strip stays undocked here, so the row is the
  // docked layout minus the dock: same button, same x, nothing else.
  const settingsPageChrome = route.kind === 'home' && route.view === 'settings';

  // Refresh the fallback cache from whatever this fetch actually returned,
  // before `displayTabFor` below reads it — same render pass, so a tab
  // reading a name for the first time never has to wait a tick for it.
  for (const project of projects) {
    const name = project.name?.trim();
    if (name) knownProjectNamesRef.current.set(project.id, name);
  }

  const displayTabs = useMemo(
    () => state.tabs.map((tab) => displayTabFor(tab, projectById, t, knownProjectNamesRef.current)),
    [state.tabs, projectById, t],
  );
  const displayTabById = useMemo(
    () => new Map(displayTabs.map((tab) => [tab.id, tab])),
    [displayTabs],
  );
  useEffect(() => {
    if (identityScopeKey === null) return;
    const pendingScopeRoute = pendingScopeRouteRef.current;
    if (
      pendingScopeRoute
      && pendingScopeRoute.scopeKey === identityScopeKey
    ) {
      // React StrictMode replays mount effects without remounting refs. Keep
      // rejecting the outgoing workspace URL until the router commits the
      // route selected for the incoming scope.
      if (pendingScopeRoute.path !== buildPath(route)) return;
      pendingScopeRouteRef.current = null;
    }
    if (
      typeof identityScopeKey === 'string'
      && lastSeenScopeKeyRef.current !== identityScopeKey
    ) {
      // A workspace transition owns route reconciliation: the current URL can
      // still describe the outgoing workspace for this render and must never
      // be folded into the incoming workspace's snapshot.
      return;
    }
    setState((current) => syncStateToRoute(current, route));
  }, [route, identityScopeKey]);

  useEffect(() => {
    if (!previousOnboardingCompletedRef.current && onboardingCompleted) {
      resetEntryToHomeAfterOnboardingRef.current = true;
    }
    previousOnboardingCompletedRef.current = onboardingCompleted;
  }, [onboardingCompleted]);

  // Auto-close the Welcome tab once onboarding ends: rewrite any entry tab
  // still parked on the 'onboarding' view back to 'home'. This catches every
  // finish path uniformly — last-step Continue and any future route that
  // navigates away while leaving the entry tab on Welcome in the background.
  useEffect(() => {
    if (!onboardingCompleted) return;
    // Don't rewrite the tab back to 'home' while the user is *still* on the
    // onboarding route — a previously-completed user who re-opens /onboarding
    // should keep the "Onboarding" tab label, not flip to "Home". The rewrite
    // still fires the moment they navigate away (onboardingActive turns false).
    if (onboardingActive) return;
    const resetDesignSystemsEntry =
      resetEntryToHomeAfterOnboardingRef.current && route.kind === 'project';
    if (resetDesignSystemsEntry) {
      resetEntryToHomeAfterOnboardingRef.current = false;
    }
    setState((current) => {
      if (!current.tabs.some((tab) =>
        tab.kind === 'entry' &&
        (tab.view === 'onboarding' || (resetDesignSystemsEntry && tab.view === 'design-systems')),
      )) {
        return current;
      }
      return normalizeTabsState({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.kind === 'entry' &&
          (tab.view === 'onboarding' || (resetDesignSystemsEntry && tab.view === 'design-systems'))
            ? { ...tab, view: 'home' }
            : tab,
        ),
      });
    });
  }, [onboardingCompleted, onboardingActive, route.kind]);

  // Tab-scope enforcement: every AMR account + workspace key owns one isolated
  // snapshot. Save the outgoing state before loading the incoming state, and
  // navigate to that snapshot's active tab. The persistent registry is capped
  // (MAX_PERSISTED_TAB_SCOPES), so workspace bouncing remains recoverable
  // without turning localStorage into an unbounded recently-closed cache.
  //
  // Suppressed while onboarding is active: `createNewTab`/`openRadialMenu`
  // are both gated on `onboardingActive`, so the ONLY tab that can exist
  // during onboarding is the single pinned entry tab — there is nothing to
  // protect against yet, and forcing a close+navigate-home mid-flow would
  // eject the user from the Connect step before they finish it (a real
  // scenario: finishing AMR sign-in mid-onboarding is exactly a scope change
  // per this design). The new key is still recorded via the ref so the
  // reconciliation does not re-fire the moment onboarding completes with a
  // scope that has not changed again since.
  useEffect(() => {
    if (typeof identityScopeKey !== 'string') return;
    const previous = lastSeenScopeKeyRef.current;
    lastSeenScopeKeyRef.current = identityScopeKey;
    const firstResolvedScope = !resolvedScopeOnceRef.current;
    resolvedScopeOnceRef.current = true;
    if (previous === identityScopeKey) return;

    if (previous === undefined) {
      // Upgrade compatibility, held to the attribution rule (recvqziATl6LlJ /
      // recvqxKdOz0S6g): a legacy single snapshot has no owner stamp, so it
      // must never be adopted into whichever scope happens to resolve first —
      // the account that opened those tabs may have switched since (pre-scoping
      // builds never closed tabs on an account swap), and adopting would
      // surface another account's project tabs inside the current account's
      // workspace. Tabs are bookmarks: when attribution is unknowable, drop
      // the snapshot and rebuild from route truth (fresh Home plus whatever
      // tab the current URL already points at). A session with no unowned
      // snapshot in storage (fresh install / already-scoped storage) keeps
      // adopting its own live, session-created state unchanged.
      const unownedSnapshotInStorage =
        persistedTabsStore.scopeKey === undefined && persistedTabsStore.current !== null;
      const adopted = syncStateToRoute(
        unownedSnapshotInStorage ? freshHomeTabsState() : stateRef.current,
        route,
      );
      persistedTabsStore.scopes[identityScopeKey] = {
        state: adopted,
        updatedAt: Date.now(),
      };
      pendingScopeStateRef.current = { scopeKey: identityScopeKey, state: adopted };
      setState(adopted);
      return;
    }

    if (!firstResolvedScope) {
      persistedTabsStore.scopes[previous] = {
        state: stateRef.current,
        updatedAt: Date.now(),
      };
    }

    if (onboardingActive) {
      // Onboarding must not be interrupted by sign-in resolving a workspace:
      // never navigate away from the flow. But re-homing the live state to
      // the new scope is attribution, and the live state is not always the
      // single pinned entry tab the flow itself creates — a snapshot restored
      // at mount can ride along (browser localStorage outlives a daemon
      // data-dir reset that replays onboarding). Within one account that is
      // the owner's own state; across accounts (a direct mid-onboarding
      // account swap) it must fail closed to a fresh Home state instead
      // (recvqziATl6LlJ leak family) — visually identical for the legitimate
      // sign-in-mid-onboarding case (a single entry tab either way, synced to
      // the onboarding route), and never a cross-account tab transfer.
      const rehomed =
        accountBucketForScope(previous) === accountBucketForScope(identityScopeKey)
          ? stateRef.current
          : syncStateToRoute(freshHomeTabsState(), route);
      persistedTabsStore.scopes[identityScopeKey] = {
        state: rehomed,
        updatedAt: Date.now(),
      };
      if (rehomed !== stateRef.current) {
        pendingScopeStateRef.current = { scopeKey: identityScopeKey, state: rehomed };
        setState(rehomed);
      }
      return;
    }

    // Settings is app-local rather than Workspace-owned. Keep that explicit
    // destination when leaving a project-pinned Workspace scope for the same
    // account's ambient scope, and through the failed-run CTA's anonymous ->
    // signed-in authorization handoff. Rebuild from a fresh entry tab so no
    // project tab crosses the scope boundary. Account A -> B still falls
    // through to the fail-closed reset below.
    const previousAccountBucket = accountBucketForScope(previous);
    const nextAccountBucket = accountBucketForScope(identityScopeKey);
    if (
      route.kind === 'home'
      && route.view === 'settings'
      && (
        previousAccountBucket === nextAccountBucket
        || (previousAccountBucket === 'anon' && nextAccountBucket !== 'anon')
      )
    ) {
      const rehomed = syncStateToRoute(freshHomeTabsState(), route);
      persistedTabsStore.scopes[identityScopeKey] = {
        state: rehomed,
        updatedAt: Date.now(),
      };
      pendingScopeStateRef.current = { scopeKey: identityScopeKey, state: rehomed };
      pendingScopeRouteRef.current = null;
      setState(rehomed);
      return;
    }

    // Inline "Authorize & retry" must finish the same run in place. Re-home
    // only the live route tab (plus a fresh Home tab) when anonymous login
    // resolves either an unbound local project or an exact witness for the
    // project's persisted Workspace. Unresolved projects, Workspace
    // mismatches, sign-out, authenticated account A→B, and Team/Personal
    // workspace switches all retain the fail-closed reset below.
    if (shouldRehomeAuthorizedProjectAfterSignIn({
      previousScopeKey: previous,
      nextScopeKey: identityScopeKey,
      route,
      activeProjectWorkspaceId,
    })) {
      const rehomed = syncStateToRoute(freshHomeTabsState(), route);
      persistedTabsStore.scopes[identityScopeKey] = {
        state: rehomed,
        updatedAt: Date.now(),
      };
      pendingScopeStateRef.current = { scopeKey: identityScopeKey, state: rehomed };
      pendingScopeRouteRef.current = null;
      setState(rehomed);
      return;
    }

    // Preserve the prior fail-closed authentication boundary: workspace
    // bouncing within one account is recoverable, but sign-out or an account
    // change always lands on a fresh Home state instead of reviving browser
    // chrome from a previous authenticated session.
    const mayRestore =
      accountBucketForScope(previous) === accountBucketForScope(identityScopeKey);
    const nextState = mayRestore
      ? persistedTabsStore.scopes[identityScopeKey]?.state ?? freshHomeTabsState()
      : freshHomeTabsState();
    pendingScopeStateRef.current = { scopeKey: identityScopeKey, state: nextState };
    setState(nextState);
    const activeTab =
      nextState.tabs.find((tab) => tab.id === nextState.activeTabId) ?? nextState.tabs[0]!;
    const nextRoute = routeForTab(activeTab);
    const nextPath = buildPath(nextRoute);
    pendingScopeRouteRef.current = buildPath(route) === nextPath
      ? null
      : { scopeKey: identityScopeKey, path: nextPath };
    navigate(nextRoute);
  }, [
    activeProjectWorkspaceId,
    identityScopeKey,
    onboardingActive,
    persistedTabsStore,
    route,
  ]);

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
      setState((current) => {
        const normalized = normalizeTabsState(current);
        // Mirror syncStateToRoute: reuse an existing project tab for the same
        // projectId instead of appending a duplicate on repeated opens.
        if (nextRoute.kind === 'project') {
          const existingProjectTab = normalized.tabs.find(
            (tab) => tab.kind === 'project' && tab.projectId === nextRoute.projectId,
          );
          if (existingProjectTab) {
            const timestamp = Date.now();
            return normalizeTabsState({
              ...normalized,
              tabs: normalized.tabs.map((tab) =>
                tab.id === existingProjectTab.id
                  ? {
                      ...tab,
                      conversationId: nextRoute.conversationId ?? null,
                      fileName: nextRoute.fileName,
                      lastActiveAt: timestamp,
                    }
                  : tab,
              ),
              activeTabId: existingProjectTab.id,
            });
          }
        }
        const nextTab = tabFromRoute(nextRoute);
        return normalizeTabsState({
          tabs: [...normalized.tabs, nextTab],
          activeTabId: nextTab.id,
        });
      });
    }

    function onRemoveWorkspaceProjectTabs(event: Event) {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      const projectId = detail?.projectId;
      if (!projectId) return;
      setState((current) => {
        const normalized = normalizeTabsState(current);
        const nextTabs = normalized.tabs.filter(
          (tab) => tab.kind !== 'project' || tab.projectId !== projectId,
        );
        if (nextTabs.length === normalized.tabs.length) return normalized;
        const removedActiveTab = normalized.tabs.some(
          (tab) => tab.id === normalized.activeTabId
            && tab.kind === 'project'
            && tab.projectId === projectId,
        );
        return normalizeTabsState({
          tabs: nextTabs,
          activeTabId: removedActiveTab
            ? nextTabs.find((tab) => tab.kind === 'entry')?.id ?? ''
            : normalized.activeTabId,
        });
      });
    }

    window.addEventListener(OPEN_WORKSPACE_TAB_EVENT, onOpenWorkspaceTab);
    window.addEventListener(
      REMOVE_WORKSPACE_PROJECT_TABS_EVENT,
      onRemoveWorkspaceProjectTabs,
    );
    return () => {
      window.removeEventListener(OPEN_WORKSPACE_TAB_EVENT, onOpenWorkspaceTab);
      window.removeEventListener(
        REMOVE_WORKSPACE_PROJECT_TABS_EVENT,
        onRemoveWorkspaceProjectTabs,
      );
    };
  }, []);

  useEffect(() => {
    const stripElement = stripRef.current;
    if (!stripElement) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setTabsOverflowing(stripElement.scrollWidth > stripElement.clientWidth + 1);
    };
    const requestMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    requestMeasure();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(requestMeasure);
    if (resizeObserver) {
      resizeObserver.observe(stripElement);
      // Skip the glide indicator: its width transitions with every tab
      // switch and would feed a resize event into overflow measurement.
      Array.from(stripElement.children)
        .filter((child) => !child.classList.contains('workspace-tabs-glide'))
        .forEach((child) => resizeObserver.observe(child));
    }
    window.addEventListener('resize', requestMeasure);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', requestMeasure);
    };
  }, [state.tabs.length]);

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
    const pending = pendingScopeStateRef.current;
    if (pending) {
      // Effects from the render that observed a NEW scope still close over the
      // OLD scope's state. Wait for React to commit the selected snapshot
      // before associating any state with the incoming key.
      if (pending.scopeKey !== identityScopeKey || pending.state !== state) return;
      pendingScopeStateRef.current = null;
    }
    if (identityScopeKey === null) return;
    persistTabsStore(
      persistedTabsStore,
      typeof identityScopeKey === 'string' ? identityScopeKey : undefined,
      state,
    );
  }, [state, identityScopeKey, persistedTabsStore]);

  useEffect(() => {
    function onWorkspaceTabShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      const key = event.key;
      const lowerKey = key.toLocaleLowerCase();
      const primaryModifier = event.metaKey || event.ctrlKey;
      const primaryWithoutAlt = primaryModifier && !event.altKey;
      const ctrlWithoutPlatformModifiers = event.ctrlKey && !event.metaKey && !event.altKey;
      const isBrowserStyleTabShortcut =
        (primaryWithoutAlt && !event.shiftKey && (lowerKey === 't' || lowerKey === 'w'))
        || (ctrlWithoutPlatformModifiers && key === 'Tab')
        || (ctrlWithoutPlatformModifiers && !event.shiftKey && (key === 'PageDown' || key === 'PageUp'))
        || (primaryWithoutAlt && !event.shiftKey && /^[1-9]$/u.test(key));

      if (isBrowserStyleTabShortcut && shouldDeferShortcutToProjectWorkspace()) {
        return;
      }

      if (primaryWithoutAlt && !event.shiftKey && lowerKey === 't') {
        consumeWorkspaceTabShortcut(event);
        createNewTab();
        return;
      }

      if (primaryWithoutAlt && !event.shiftKey && lowerKey === 'w') {
        consumeWorkspaceTabShortcut(event);
        closeActiveTab();
        return;
      }

      if (ctrlWithoutPlatformModifiers && key === 'Tab') {
        consumeWorkspaceTabShortcut(event);
        activateTabByOffset(event.shiftKey ? -1 : 1);
        return;
      }

      if (ctrlWithoutPlatformModifiers && !event.shiftKey && key === 'PageDown') {
        consumeWorkspaceTabShortcut(event);
        activateTabByOffset(1);
        return;
      }

      if (ctrlWithoutPlatformModifiers && !event.shiftKey && key === 'PageUp') {
        consumeWorkspaceTabShortcut(event);
        activateTabByOffset(-1);
        return;
      }

      if (primaryWithoutAlt && !event.shiftKey && /^[1-9]$/u.test(key)) {
        consumeWorkspaceTabShortcut(event);
        const normalized = normalizeTabsState(state);
        const targetIndex = key === '9'
          ? normalized.tabs.length - 1
          : Number(key) - 1;
        activateTabByIndex(targetIndex);
      }
    }

    window.addEventListener('keydown', onWorkspaceTabShortcut, true);
    return () => window.removeEventListener('keydown', onWorkspaceTabShortcut, true);
  }, [state]);

  function activateTab(tab: WorkspaceChromeTab) {
    setState((current) => ({
      tabs: normalizeTabsState(current).tabs.map((item) =>
        item.id === tab.id ? { ...item, lastActiveAt: Date.now() } : item,
      ),
      activeTabId: tab.id,
    }));
    navigate(routeForTab(tab));
  }

  function activateTabByOffset(offset: number) {
    const normalized = normalizeTabsState(state);
    if (normalized.tabs.length === 0) return;
    const activeIndex = Math.max(
      0,
      normalized.tabs.findIndex((tab) => tab.id === normalized.activeTabId),
    );
    const targetIndex =
      (activeIndex + offset + normalized.tabs.length) % normalized.tabs.length;
    activateTab(normalized.tabs[targetIndex]!);
  }

  function activateTabByIndex(index: number) {
    const normalized = normalizeTabsState(state);
    if (index < 0 || index >= normalized.tabs.length) return;
    activateTab(normalized.tabs[index]!);
  }

  function closeActiveTab() {
    const normalized = normalizeTabsState(state);
    closeTab(normalized.activeTabId);
  }

  function openTab(tab: WorkspaceChromeTab) {
    if (dragSuppressClickRef.current) {
      dragSuppressClickRef.current = false;
      return;
    }
    // Clicking the pinned Home tab always lands on the home page, whatever
    // entry section (projects / design-systems / …) the tab last showed.
    // Keyboard tab-cycling goes through activateTab directly and keeps the
    // remembered section.
    if (tab.kind === 'entry' && tab.view !== 'home') {
      activateTab({ ...tab, view: 'home' });
      return;
    }
    // Opening a project is what spends its ✓ (per product) — the same rule,
    // in the same shared feed, as the rail's 最近项目 rows (OPEND-2795).
    if (tab.kind === 'project') acknowledgeProjectCompletion(tab.projectId);
    activateTab(tab);
  }

  // Corner-anchored radial fan menu on the "+" button: three concentric bands
  // sweep down-left from the button (the pivot at the top-right corner),
  // carrying the composer Template picker's icons. Each band is a ring split
  // into angular wedges — 3 / 4 from the inner bands outward, with the outer
  // band absorbing every remaining template (see `radialSlots`).
  // Picking a wedge opens the home tab with that template applied to the hero.
  const RADIAL_SIZE = 300;
  const RADIAL_PAD = 24;
  const RADIAL_R_IN = 56;
  const RADIAL_R_OUT = 264;
  const RADIAL_BANDS = [3, 4, 3];
  const RADIAL_START = 96; // fan start angle (screen degrees) …
  const RADIAL_SWEEP = 78; // … total arc, fanning toward the left
  const RADIAL_GAP = 0; // wedges abut; hairline strokes are the dividers
  const RADIAL_CX = RADIAL_SIZE - RADIAL_PAD;
  const RADIAL_CY = RADIAL_PAD;

  function radialBandRadius(band: number): number {
    return RADIAL_R_IN + ((RADIAL_R_OUT - RADIAL_R_IN) * band) / RADIAL_BANDS.length;
  }

  // Per-template placement across the bands, aligned to template order.
  const radialSlots = useMemo(() => {
    const chips = orderedCreateChips().filter((chip) => chip.action.kind === 'apply-scenario');
    const slots: Array<{ chip: HomeHeroChip; band: number; seg: number; segCount: number }> = [];
    let cursor = 0;
    RADIAL_BANDS.forEach((count, band) => {
      const isLast = band === RADIAL_BANDS.length - 1;
      const remaining = Math.max(chips.length - cursor, 0);
      const take = isLast ? remaining : Math.min(count, remaining);
      for (let seg = 0; seg < take; seg += 1) {
        const chip = chips[cursor + seg];
        if (chip) slots.push({ chip, band, seg, segCount: take });
      }
      cursor += take;
    });
    return slots;
  }, []);

  function radialWedgeAngles(seg: number, segCount: number): [number, number] {
    const step = RADIAL_SWEEP / segCount;
    return [RADIAL_START + seg * step + RADIAL_GAP / 2, RADIAL_START + (seg + 1) * step - RADIAL_GAP / 2];
  }

  function radialSectorPath(cx: number, cy: number, a1: number, a2: number, r0: number, r1: number): string {
    const rad = (a: number) => (a * Math.PI) / 180;
    const px = (r: number, a: number) => `${(cx + r * Math.cos(rad(a))).toFixed(2)} ${(cy + r * Math.sin(rad(a))).toFixed(2)}`;
    return `M ${px(r1, a1)} A ${r1} ${r1} 0 0 1 ${px(r1, a2)} L ${px(r0, a2)} A ${r0} ${r0} 0 0 0 ${px(r0, a1)} Z`;
  }

  function openEntryView(view: EntryHomeView) {
    const normalized = normalizeTabsState(state);
    const existingEntryTab = normalized.tabs.find((tab) => tab.kind === 'entry');
    if (existingEntryTab) {
      setState({ ...normalized, activeTabId: existingEntryTab.id });
    } else {
      const tab = createEntryTab(view);
      setState({ tabs: [...normalized.tabs, tab], activeTabId: tab.id });
    }
    navigate({ kind: 'home', view });
    setRadialMenu(null);
  }

  function openTemplateFromRadial(chip: HomeHeroChip) {
    openEntryView('home');
    // Hand the pick to the hero once the home tab has mounted/activated —
    // HomeHero applies the chip exactly as if its own picker was clicked.
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(HOME_APPLY_TEMPLATE_EVENT, { detail: { chipId: chip.id } }),
      );
    }, 50);
  }

  function openRadialMenu(event: React.MouseEvent<HTMLButtonElement>) {
    if (onboardingActive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setRadialMenu((cur) => (cur ? null : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
  }

  function createNewTab() {
    // Onboarding gate — see `onboardingActive`. Covers the "+" button and the
    // Cmd/Ctrl+T keyboard shortcut, since both funnel through here.
    if (onboardingActive) return;
    const normalized = normalizeTabsState(state);
    const existingEntryTab = normalized.tabs.find((tab) => tab.kind === 'entry');
    if (existingEntryTab) {
      setState({
        ...normalized,
        activeTabId: existingEntryTab.id,
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
  }

  function closeTab(tabId: string) {
    const normalized = normalizeTabsState(state);
    const closingIndex = normalized.tabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) return;
    // The single entry tab is permanent — never close it, whatever section
    // (home / projects / design-systems / …) it currently shows.
    const closingTab = normalized.tabs[closingIndex]!;
    if (closingTab.kind === 'entry') return;
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

  function reorderTab(sourceId: string, targetId: string, edge: TabDropEdge) {
    setState((current) => {
      const normalized = normalizeTabsState(current);
      const tabs = reorderTabsById(normalized.tabs, sourceId, targetId, edge);
      if (tabs === normalized.tabs) return normalized;
      // Re-normalize so the Home tab is re-pinned to the leftmost slot even when
      // a drop would otherwise have placed a tab before it. Home is the one
      // permanent, non-closable tab and must always sit first.
      return normalizeTabsState({ ...normalized, tabs });
    });
  }

  function findTabDropTarget(event: DragEvent<HTMLElement>, sourceId: string): TabDragTarget | null {
    const strip = stripRef.current;
    if (!strip) return null;

    // The single entry tab is pinned leftmost: never expose a drop target that
    // would place another tab before it. Coerce any 'before entry' edge to
    // 'after entry' so the live drag indicator and persisted order keep it first.
    const entryTabId = state.tabs.find((tab) => tab.kind === 'entry')?.id;
    const resolveTarget = (target: TabDragTarget): TabDragTarget =>
      target.tabId === entryTabId && target.edge === 'before'
        ? { tabId: target.tabId, edge: 'after' }
        : target;

    const eventTarget = event.target;
    if (eventTarget instanceof HTMLElement) {
      const tabElement = eventTarget.closest<HTMLElement>('[data-workspace-tab-id]');
      if (tabElement && strip.contains(tabElement)) {
        const tabId = tabElement.dataset.workspaceTabId;
        if (tabId && tabId !== sourceId) {
          return resolveTarget({ tabId, edge: tabDropEdgeFromElement(event, strip, tabElement) });
        }
      }
    }

    let lastTarget: TabDragTarget | null = null;
    for (const tabElement of strip.querySelectorAll<HTMLElement>('[data-workspace-tab-id]')) {
      const tabId = tabElement.dataset.workspaceTabId;
      if (!tabId || tabId === sourceId) continue;
      const span = tabLayoutSpan(strip, tabElement);
      if (event.clientX <= span.mid) return resolveTarget({ tabId, edge: 'before' });
      if (event.clientX <= span.right) return resolveTarget({ tabId, edge: 'after' });
      lastTarget = { tabId, edge: 'after' };
    }
    return lastTarget;
  }

  function handleTabDragStart(tabId: string, event: DragEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('.workspace-tab__close')) {
      event.preventDefault();
      return;
    }
    dragSuppressClickRef.current = true;
    draggingTabIdRef.current = tabId;
    dragHapticTargetRef.current = `${tabId}:self`;
    setDragOverTarget(null);
    setDraggingTabId(tabId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
    pulseTabDragHaptic();
  }

  function handleStripDragOver(event: DragEvent<HTMLDivElement>) {
    const sourceId = draggingTabIdRef.current ?? event.dataTransfer.getData('text/plain');
    if (!sourceId) return;
    const target = findTabDropTarget(event, sourceId);
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const targetKey = tabDragTargetKey(target);
    setDragOverTarget((current) =>
      current && tabDragTargetKey(current) === targetKey ? current : target,
    );
    if (dragHapticTargetRef.current !== targetKey) {
      dragHapticTargetRef.current = targetKey;
      pulseTabDragHaptic();
    }
    reorderTab(sourceId, target.tabId, target.edge);
  }

  function handleStripDrop(event: DragEvent<HTMLDivElement>) {
    const sourceId = draggingTabIdRef.current ?? event.dataTransfer.getData('text/plain');
    if (sourceId) {
      event.preventDefault();
    }
    const target = sourceId ? findTabDropTarget(event, sourceId) : null;
    if (sourceId && target) {
      reorderTab(sourceId, target.tabId, target.edge);
      pulseTabDragHaptic(TAB_DROP_HAPTIC_MS);
    }
    draggingTabIdRef.current = null;
    dragHapticTargetRef.current = null;
    setDragOverTarget(null);
    setDraggingTabId(null);
    window.setTimeout(() => {
      dragSuppressClickRef.current = false;
    }, 0);
  }

  function handleStripDragLeave(event: DragEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragOverTarget(null);
  }

  function handleTabDragEnd() {
    draggingTabIdRef.current = null;
    dragHapticTargetRef.current = null;
    setDragOverTarget(null);
    setDraggingTabId(null);
    window.setTimeout(() => {
      dragSuppressClickRef.current = false;
    }, 0);
  }

  const dockPortal = (node: ReactNode) =>
    tabsDockEl ? createPortal(node, tabsDockEl) : node;

  // Docked (project-route) presentation: one white dropdown spanning the chat
  // column instead of the pill strip. The strip still renders (hidden by CSS)
  // so its measurement/drag hooks keep their DOM.
  const dockDropdownNode = (() => {
    if (!tabsDockEl) return null;
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0];
    if (!activeTab) return null;
    const activeDisplay =
      displayTabById.get(activeTab.id)
        ?? displayTabFor(activeTab, projectById, t, knownProjectNamesRef.current);
    const isEntryActive = activeTab.kind === 'entry';
    // Most recently opened first. The active tab ranks first even before the
    // MRU effect has run for it; never-activated tabs keep strip order after.
    const mru = tabMruRef.current;
    const mruRank = (tab: WorkspaceChromeTab): number => {
      if (tab.id === state.activeTabId) return -1;
      const index = mru.indexOf(tab.id);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const projectTabs = state.tabs
      .filter((tab) => tab.kind !== 'entry')
      .sort((a, b) => mruRank(a) - mruRank(b));
    // The hovered row's project, if the ambient list actually carries it. A tab
    // can name a project this list has not loaded (deep link, other workspace);
    // that row simply previews nothing rather than showing an empty card.
    const previewTab = previewTabId
      ? projectTabs.find((tab) => tab.id === previewTabId)
      : undefined;
    const previewProject =
      previewTab && previewTab.kind === 'project'
        ? projectById.get(previewTab.projectId) ?? null
        : null;
    // The row whose ⋮ menu is open, and what that menu has to say about it.
    const dockActionsProject = dockActionsProjectId
      ? projectById.get(dockActionsProjectId) ?? null
      : null;
    const dockActionsOwnedBySelf = dockActionsProject
      ? dockRowOwnedBySelf(dockActionsProject.id)
      : true;
    const dockActionsForeignTitle = dockActionsOwnedBySelf
      ? undefined
      : t('recentProjects.ownOnlyMutation');
    const dockActionsShared = dockActionsProject ? isSharedProject(dockActionsProject.id) : false;
    const dockActionsSharing =
      dockActionsProject !== null && moveFlow.sharingId === dockActionsProject.id;
    const dockActionsShareError =
      dockActionsProject && moveFlow.error?.projectId === dockActionsProject.id
        ? moveFlow.error.kind
        : null;
    return (
      <div className="workspace-tabs-dropdown" data-testid="workspace-tabs-dropdown">
        <button
          type="button"
          className="workspace-tabs-dropdown__trigger"
          aria-haspopup="listbox"
          aria-expanded={dockMenuOpen}
          onClick={() => setDockMenuOpen((v) => !v)}
          data-testid="workspace-tabs-dropdown-trigger"
        >
          <span className="workspace-tabs-dropdown__icon" aria-hidden>
            <Icon name={isEntryActive ? 'home' : activeDisplay.icon} size={14} />
          </span>
          <span className="workspace-tabs-dropdown__label">{activeDisplay.title}</span>
          <Icon name="chevron-down" size={14} />
        </button>
        {dockMenuOpen ? (
          <>
            <div
              className="workspace-tabs-dropdown__backdrop"
              onClick={() => setDockMenuOpen(false)}
            />
            <div
              ref={dockMenuRef}
              className="workspace-tabs-dropdown__menu"
              role="listbox"
              onMouseLeave={clearPreview}
            >
              {projectTabs.map((tab) => {
                const display =
                  displayTabById.get(tab.id)
                    ?? displayTabFor(tab, projectById, t, knownProjectNamesRef.current);
                const active = tab.id === state.activeTabId;
                // The row's project, when the ambient list carries it — the ⋮
                // menu acts on a Project, so a tab naming one this list has
                // not loaded (deep link, other workspace) offers no menu.
                const rowProject =
                  tab.kind === 'project' ? projectById.get(tab.projectId) ?? null : null;
                const actionsOpen = rowProject !== null && dockActionsProjectId === rowProject.id;
                return (
                  <div
                    key={tab.id}
                    className={`workspace-tabs-dropdown__row${active ? ' is-active' : ''}${
                      rowProject ? ` ${actionStyles.row}` : ''
                    }`}
                  >
                    {rowProject && dockRenamingProjectId === rowProject.id ? (
                      <input
                        className={actionStyles.rename}
                        value={dockRenameDraft}
                        aria-label={t('designs.menuRename')}
                        autoFocus
                        onChange={(event) => setDockRenameDraft(event.target.value)}
                        onBlur={() => commitDockRename(rowProject)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitDockRename(rowProject);
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setDockRenameDraft(rowProject.name);
                            setDockRenamingProjectId(null);
                          }
                        }}
                      />
                    ) : (
                    <button
                      type="button"
                      className="workspace-tabs-dropdown__row-main"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setDockMenuOpen(false);
                        openTab(tab);
                      }}
                      /* Focus previews too, so the card is not mouse-only:
                         arrowing/tabbing the list shows the same picture. An
                         open ⋮ menu outranks the hover (it took the preview's
                         slot, and the user asked for it by clicking). */
                      onMouseEnter={(event) => {
                        if (dockActionsProjectId) return;
                        queuePreview(tab.id, event.currentTarget);
                      }}
                      onFocus={(event) => {
                        if (dockActionsProjectId) return;
                        showPreviewNow(tab.id, event.currentTarget);
                      }}
                    >
                      {/* Always up: every row fills the slot now — a live run
                          status when there is one, the folder otherwise — so
                          the column can't half-exist and names stay on one
                          shared left edge. */}
                      <span className="workspace-tabs-dropdown__row-lead">
                        {leadGlyphFor(tab, display, runStatusByProjectId, t)}
                      </span>
                      <span className="workspace-tabs-dropdown__row-label">{display.title}</span>
                      {completionNoticeFor(tab, runStatusByProjectId, t)}
                      {active ? (
                        <Icon name="check" size={14} className="workspace-tabs-dropdown__row-check" />
                      ) : null}
                    </button>
                    )}
                    {rowProject && (onRenameProject || onDuplicateProject || onDeleteProject || moveToTeamAvailable) ? (
                      <button
                        type="button"
                        className={actionStyles.more}
                        aria-label={t('designs.menuMore')}
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                        data-dock-actions-trigger
                        data-testid="workspace-tabs-dropdown-row-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (actionsOpen) {
                            setDockActionsProjectId(null);
                            return;
                          }
                          const row = event.currentTarget.parentElement;
                          if (row) {
                            setDockActionsAnchor(
                              dockActionsAnchorFor(row, dockMenuRef.current, window.innerWidth),
                            );
                          }
                          clearPreview();
                          setDockDuplicateFailedId(null);
                          moveFlow.clearError();
                          setDockActionsProjectId(rowProject.id);
                        }}
                      >
                        <MoreDotsMark />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {/* The open row's ⋮ menu, in the preview's slot beside the
                dropdown and portalled for the same reason the preview is.
                Items, in order: 重命名 / 复制项目 / 转入团队空间 (team
                workspaces only) / 删除 — the rail row menu's list, through
                the flows it shares with the project cards. */}
            {dockActionsProject && dockActionsAnchor && typeof document !== 'undefined' ? createPortal(
              <div
                ref={dockActionsRef}
                className={actionStyles.menu}
                role="menu"
                data-testid="workspace-tabs-dropdown-row-menu"
                style={{ top: dockActionsAnchor.top, left: dockActionsAnchor.left }}
              >
                {onRenameProject ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!dockActionsOwnedBySelf}
                    title={dockActionsForeignTitle}
                    onClick={() => {
                      setDockActionsProjectId(null);
                      setDockRenameDraft(dockActionsProject.name);
                      setDockRenamingProjectId(dockActionsProject.id);
                    }}
                  >
                    <RenameMark />
                    <span>{t('designs.menuRename')}</span>
                  </button>
                ) : null}
                {onDuplicateProject ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!dockActionsOwnedBySelf || dockDuplicatingId !== null}
                    title={dockActionsForeignTitle}
                    onClick={() => { void duplicateFromDock(dockActionsProject); }}
                  >
                    <Icon name="copy" size={14} />
                    <span>
                      {dockDuplicatingId === dockActionsProject.id
                        ? t('recentProjects.duplicateInProgress')
                        : t('designs.menuDuplicate')}
                    </span>
                  </button>
                ) : null}
                {dockDuplicateFailedId === dockActionsProject.id ? (
                  <div className={actionStyles.error} role="alert">
                    {t('ds.actionFailed')}
                  </div>
                ) : null}
                {/* Hidden, not disabled, without a team plane (see
                    `moveToTeamAvailable`); a shared row and a foreign row
                    keep the item and explain themselves instead. */}
                {moveToTeamAvailable ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={dockActionsSharing || dockActionsShared || !dockActionsOwnedBySelf}
                    title={dockActionsForeignTitle}
                    data-testid="workspace-tabs-dropdown-move-to-team"
                    onClick={() => requestMoveToTeam(dockActionsProject)}
                  >
                    <Icon name="share" size={14} />
                    <span>
                      {dockActionsSharing
                        ? t('recentProjects.shareInProgress')
                        : dockActionsShared
                          ? t('recentProjects.sharedInTeam')
                          : t('recentProjects.moveToTeam')}
                    </span>
                  </button>
                ) : null}
                {dockActionsShareError ? (
                  <div className={actionStyles.error} role="alert">
                    {t(
                      dockActionsShareError === 'unshare'
                        ? 'recentProjects.unshareFailed'
                        : dockActionsShareError === 'owner-conflict'
                          ? 'recentProjects.shareOwnerConflict'
                          : 'recentProjects.shareFailed',
                    )}
                  </div>
                ) : null}
                {onDeleteProject ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={actionStyles.danger}
                    disabled={!dockActionsOwnedBySelf}
                    title={dockActionsForeignTitle}
                    onClick={() => {
                      // The confirmation (the shared project delete dialog,
                      // OPEND-2797) is modal; the dropdown has nothing left
                      // to show under it.
                      setDockActionsProjectId(null);
                      setDockMenuOpen(false);
                      deleteFlow.request(dockActionsProject);
                    }}
                  >
                    <DeleteMark />
                    <span>{t('designs.menuDelete')}</span>
                  </button>
                ) : null}
              </div>,
              document.body,
            ) : null}
            {/* Preview of the hovered row, parked beside the menu — the rail's
                own card, so the switcher and the 最近项目 list show one and the
                same picture for a project. Purely informational (aria-hidden,
                no pointer events), so it can't sit between the pointer and a
                row. */}
            {!dockActionsProjectId && previewProject && previewAnchor && typeof document !== 'undefined' ? (
              <DockRowPreview
                /* Keyed by project so switching rows remounts the card instead
                   of pointing a live cover at a new project. */
                key={previewProject.id}
                project={previewProject}
                workspaceContext={workspaceContext}
                anchor={previewAnchor}
              />
            ) : null}
          </>
        ) : null}
      </div>
    );
  })();

  return (
    <header
      className={`app-chrome-header workspace-tabs-chrome${tabsDockEl ? ' is-docked' : ''}`}
      aria-label="Workspace tabs"
    >
      <div className="app-chrome-traffic-space workspace-tabs-traffic" aria-hidden />
      {/* Docked mode: the chrome row keeps the brand-logo button plus the
          account actions host at the window's top-right; the strip renders in
          the chat column's dock, level with
          the workspace 设计文件 row. The strip's own pinned entry tab hides
          inside the dock (CSS) — this button is its chrome-row stand-in.
          In chat the logo means 回到首页. */}
      {(tabsDockEl || settingsPageChrome) && state.tabs[0] ? (
        <button
          type="button"
          className="workspace-tabs-home-chrome od-tooltip"
          aria-label={t('entry.navHome')}
          title={t('entry.navHome')}
          data-tooltip={t('entry.navHome')}
          data-tooltip-placement="bottom"
          data-testid="workspace-home-chrome"
          onClick={() => openTab(state.tabs[0]!)}
        >
          <ChromeHomeGlyph />
        </button>
      ) : null}
      {dockPortal(
      <>
      {dockDropdownNode}
      <div
        className={`workspace-tabs-strip${tabsOverflowing ? ' is-overflowing' : ''}`}
        role="tablist"
        aria-label="Open workspaces"
        ref={stripRef}
        onDragOver={handleStripDragOver}
        onDrop={handleStripDrop}
        onDragLeave={handleStripDragLeave}
      >
        {/* Render every open tab — the strip itself scrolls horizontally
            when the tabs exceed the available chrome width. Previous
            behaviour sliced to `visibleChromeTabs(...)` and squeezed
            the rest behind a "+N more" chip, which squished the entire
            chrome horizontally. The search-tabs popover still acts as
            a keyboard surface for finding a tab that's scrolled out of
            view. */}
        {/* Liquid-glass active-tab pill: positioned by useGlideIndicator in
            the strip's content coordinates, painted by the __pill (frosted
            everywhere, SDF refraction on Chromium via useLiquidGlass). First
            child so `.workspace-tab + .workspace-tab` sibling selectors and
            [data-workspace-tab-id] queries stay untouched. */}
        <div className="workspace-tabs-glide" ref={glideRef} aria-hidden="true">
          <div
            className="workspace-tabs-glide__pill od-glass-refract"
            ref={setGlidePillRef}
          />
        </div>
        {/* Every tab always renders a strip row — rows are the state/
            measurement/drag DOM the tab machinery (and its tests) rely on.
            The chrome row VISUALLY shows only the pinned Home tab (per
            product: 顶部只保留 home 和头像/积分): undocked project rows are
            hidden by CSS (routines.css), the same way the docked strip hides
            behind the chat-column dropdown. */}
        {state.tabs.map((tab) => {
          const display =
            displayTabById.get(tab.id) ?? displayTabFor(tab, projectById, t, knownProjectNamesRef.current);
          const active = tab.id === state.activeTabId;
          // The single entry tab is permanent and pinned leftmost: it cannot be
          // closed or dragged out of the first slot, whatever section it shows.
          const isPinned = tab.kind === 'entry';
          const dragOverClass =
            dragOverTarget?.tabId === tab.id && draggingTabId !== tab.id
              ? ` is-drag-over-${dragOverTarget.edge}`
              : '';
          return (
            <div
              key={tab.id}
              className={`workspace-tab${active ? ' is-active' : ''}${isPinned ? ' is-pinned' : ''}${draggingTabId === tab.id ? ' is-dragging' : ''}${dragOverClass}`}
              data-workspace-tab-id={tab.id}
              role="tab"
              aria-selected={active}
              draggable={!isPinned && state.tabs.length > 1}
              onDragStart={(event) => handleTabDragStart(tab.id, event)}
              onDragEnd={handleTabDragEnd}
            >
              {isPinned && active && tab.view === 'home' ? (
                /* Home view: the pinned tab is the brand-logo button. The
                   COLLAPSE control moved into the rail (after its search box),
                   so the logo only re-opens a collapsed rail — with the rail
                   open it is inert (you are already home, nothing to expand). */
                <button
                  type="button"
                  className={`workspace-tab__rail-toggle od-tooltip${entryRailOpen ? ' is-inert' : ''}`}
                  aria-label={entryRailOpen ? t('entry.navHome') : t('entry.navExpand')}
                  aria-expanded={entryRailOpen}
                  title={entryRailOpen ? undefined : expandHint}
                  data-tooltip={entryRailOpen ? undefined : expandHint}
                  aria-keyshortcuts={isMacPlatform() ? 'Meta+B' : 'Control+B'}
                  data-tooltip-placement="bottom"
                  data-testid="workspace-home-rail-toggle"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!entryRailOpen) {
                      window.dispatchEvent(new CustomEvent(ENTRY_RAIL_TOGGLE_EVENT));
                    }
                  }}
                >
                  <ChromeHomeGlyph />
                  {/* Collapsed-rail hover swaps the logo for the expand-sidebar
                      glyph, so the button telegraphs its one action. CSS keys
                      the swap off :not(.is-inert):hover. */}
                  <svg
                    className="workspace-chrome-logo-swap"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M5 5H13V19H5V5ZM19 19H15V5H19V19ZM4 3C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21H20C20.5523 21 21 20.5523 21 20V4C21 3.44772 20.5523 3 20 3H4ZM11 12L7 8.5V15.5L11 12Z" />
                  </svg>
                </button>
              ) : isPinned && active ? (
                /* Any other entry section (settings / all-projects / community /
                   design-systems …): the logo reads as Home; clicking returns
                   home. */
                <button
                  type="button"
                  className="workspace-tab__rail-toggle od-tooltip"
                  aria-label={t('entry.navHome')}
                  title={t('entry.navHome')}
                  data-tooltip={t('entry.navHome')}
                  data-tooltip-placement="bottom"
                  data-testid="workspace-home-nav"
                  onClick={(event) => {
                    event.stopPropagation();
                    openTab(tab);
                  }}
                >
                  <ChromeHomeGlyph />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="workspace-tab__main"
                    onClick={() => openTab(tab)}
                  >
                    <span className="workspace-tab__icon" aria-hidden>
                      {/* The pinned entry tab remembers its last section
                          (settings / community / …), but clicking it always
                          lands on home (openTab), so it must read as the Home
                          button — the brand logo — not the remembered
                          section's icon. */}
                      {isPinned ? (
                        <ChromeHomeGlyph />
                      ) : (
                        <Icon name={display.icon} size={14} />
                      )}
                    </span>
                    <span className="workspace-tab__label">{display.title}</span>
                  </button>
                  {isPinned ? null : (
                    <button
                      type="button"
                      className="workspace-tab__close od-tooltip"
                      aria-label={t('common.close')}
                      title={t('common.close')}
                      data-tooltip={t('common.close')}
                      data-tooltip-placement="bottom"
                      onClick={() => closeTab(tab.id)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        {/* The rail toggle + search, moved out of the rail and up into the
            chrome row (per product: 搜索和收起跟 home icon 一起放在顶部). They
            are this row's only controls now — the pinned Home pill is hidden
            here by CSS (routines.css), so the toggle owns BOTH directions: it
            stays rendered while the rail is collapsed, where the pill used to
            be the expand control. The toggle takes the FIRST slot after the
            traffic-light space (OPEND-2685: the sidebar switch sits where a
            macOS sidebar switch is expected, right beside the window
            controls, and stays put across open/collapsed so the expand entry
            is the same target as the collapse one); the search follows it.
            Only the undocked (entry) chrome shows them, and only on routes
            that actually mount EntryShell — in chat the strip lives in the
            column dock and there is no entry rail to toggle, and full-page
            settings replaces the rail outright (settingsPageChrome). Both
            targets live in EntryShell's tree, so the clicks travel as window
            events (see entryRailBridge). The classes are the rail's own, so
            the controls keep their look. */}
        {!tabsDockEl && !settingsPageChrome ? (
          <div className="entry-nav-rail__search-row workspace-tabs-rail-actions">
            <button
              type="button"
              className="entry-nav-rail__collapse od-tooltip"
              aria-label={entryRailOpen ? t('entry.navCollapse') : t('entry.navExpand')}
              aria-expanded={entryRailOpen}
              aria-keyshortcuts={isMacPlatform() ? 'Meta+B' : 'Control+B'}
              title={entryRailOpen ? collapseHint : expandHint}
              data-tooltip={entryRailOpen ? collapseHint : expandHint}
              data-tooltip-placement="bottom"
              data-testid="entry-rail-collapse"
              onClick={() => {
                window.dispatchEvent(new CustomEvent(ENTRY_RAIL_TOGGLE_EVENT));
              }}
            >
              {/* The bar sits on the side the rail is on while it is open, and
                  flips out of the frame once it is collapsed. Both glyphs stay
                  mounted, stacked, so the swap cross-fades (CSS keys it off
                  `is-current`) instead of popping — an unmount would skip the
                  exit transition. */}
              <Icon
                name="layout-left"
                size={16}
                className={`entry-nav-rail__collapse-glyph${entryRailOpen ? ' is-current' : ''}`}
              />
              <Icon
                name="layout-right"
                size={16}
                className={`entry-nav-rail__collapse-glyph${entryRailOpen ? '' : ' is-current'}`}
              />
            </button>
            <button
              type="button"
              className="entry-nav-rail__search od-tooltip"
              aria-label={t('common.search')}
              aria-keyshortcuts={isMacPlatform() ? 'Meta+K' : 'Control+K'}
              /* The rail revealed ⌘K by widening the control on hover; here the
                 toggle sits right beside it and would get shoved sideways, so
                 the shortcut rides the hover bubble instead — same as the
                 toggle's own 收起侧栏 ⌘B. */
              title={searchHint}
              data-tooltip={searchHint}
              data-tooltip-placement="bottom"
              data-testid="entry-nav-search"
              onClick={() => {
                const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
                trackEntryNavigationClick(analytics.track, {
                  // Same event the control fired from inside the rail; only
                  // `entry_from` is dropped, since neither of its two values
                  // (sidebar / workspace_switcher) describes the chrome row.
                  page_name:
                    activeTab?.kind === 'entry' ? entryViewToTracking(activeTab.view) : 'project',
                  area: 'entry_nav',
                  element: 'search',
                  target: 'search',
                });
                window.dispatchEvent(new CustomEvent(ENTRY_SEARCH_OPEN_EVENT));
              }}
            >
              <Icon name="search" size={16} />
            </button>
          </div>
        ) : null}
        {/* #5517 drops the top-right "+"; new tab stays reachable through
            ⌘/Ctrl+T. That "+" was the ONLY caller of openRadialMenu, so the
            radial template menu below is now unreachable — its state and
            markup stay, as the reference keeps them.

            The tab-search button (and its popover) was removed per request
            (2026-07-24); a tab scrolled out of view is reached by scrolling
            the strip or cycling with Ctrl+Tab / ⌘1-9. */}
      </div>
      </>,
      )}
      <div
        id={WORKSPACE_CHROME_ACCOUNT_ACTIONS_ID}
        className="workspace-chrome-account-actions"
        data-testid="workspace-chrome-account-actions"
      />
      {/* Portalled: the chrome header is a backdrop-filtered box, which would
          contain a fixed dialog rendered inside it. `MoveToTeamConfirmDialog`
          portals itself. */}
      {deleteFlow.target && typeof document !== 'undefined' ? createPortal(
        <ProjectDeleteConfirmDialog
          projectName={deleteFlow.target.name}
          pending={deleteFlow.pending}
          failed={deleteFlow.failed}
          onCancel={deleteFlow.cancel}
          onConfirm={() => void deleteFlow.commit()}
        />,
        document.body,
      ) : null}
      {moveTarget ? (
        <MoveToTeamConfirmDialog
          action="to-team"
          onCancel={() => setMoveTarget(null)}
          onConfirm={() => {
            const project = moveTarget;
            setMoveTarget(null);
            void moveFlow.shareToTeam(project);
          }}
        />
      ) : null}
      {radialMenu ? createPortal(
        <div className="workspace-radial-layer" onMouseDown={() => setRadialMenu(null)}>
          <div
            className="workspace-radial-menu"
            style={{ left: radialMenu.x - (RADIAL_SIZE - RADIAL_PAD), top: radialMenu.y - RADIAL_PAD, width: RADIAL_SIZE, height: RADIAL_SIZE }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <svg width={RADIAL_SIZE} height={RADIAL_SIZE} viewBox={`0 0 ${RADIAL_SIZE} ${RADIAL_SIZE}`}>
              {radialSlots.map((slot) => {
                const [a1, a2] = radialWedgeAngles(slot.seg, slot.segCount);
                const r0 = radialBandRadius(slot.band);
                const r1 = radialBandRadius(slot.band + 1);
                const isHover = slot.chip.id === radialHoverId;
                return (
                  <path
                    key={slot.chip.id}
                    className={`workspace-radial-sector-path${isHover ? ' is-hover' : ''}`}
                    d={radialSectorPath(RADIAL_CX, RADIAL_CY, a1, a2, r0, r1)}
                    role="menuitem"
                    aria-label={homeHeroChipLabel(slot.chip.id, t)}
                    data-testid={`workspace-radial-template-${slot.chip.id}`}
                    onMouseEnter={() => setRadialHoverId(slot.chip.id)}
                    onMouseLeave={() => setRadialHoverId((v) => (v === slot.chip.id ? null : v))}
                    onClick={() => openTemplateFromRadial(slot.chip)}
                  />
                );
              })}
            </svg>
            {radialSlots.map((slot) => {
              const [a1, a2] = radialWedgeAngles(slot.seg, slot.segCount);
              const mid = (a1 + a2) / 2;
              const rmid = (radialBandRadius(slot.band) + radialBandRadius(slot.band + 1)) / 2;
              const ix = RADIAL_CX + rmid * Math.cos((mid * Math.PI) / 180);
              const iy = RADIAL_CY + rmid * Math.sin((mid * Math.PI) / 180);
              const isHover = slot.chip.id === radialHoverId;
              return (
                <span
                  key={slot.chip.id}
                  className={`workspace-radial-icon-btn${isHover ? ' is-hover' : ''}`}
                  aria-hidden
                  style={{ left: ix, top: iy }}
                  title={homeHeroChipLabel(slot.chip.id, t)}
                >
                  <Icon name={slot.chip.icon} size={17} />
                </span>
              );
            })}
          </div>
          <button
            type="button"
            className="workspace-radial-close"
            style={{ left: radialMenu.x, top: radialMenu.y }}
            aria-label={t('common.close')}
            title={t('common.close')}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setRadialMenu(null)}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>,
        document.body,
      ) : null}
    </header>
  );
}

function displayTabFor(
  tab: WorkspaceChromeTab,
  projectById: Map<string, Project>,
  t: ReturnType<typeof useT>,
  knownProjectNames?: Map<string, string>,
): DisplayTab {
  if (tab.kind === 'project') {
    const project = projectById.get(tab.projectId);
    // recvq5eKj2kdF0: `projectById` only covers this render's fetched list
    // (Home's fetch is capped/scoped and does not include every open tab's
    // project) — fall back to the last real name this tab showed before
    // falling back further to the untitled label, so a tab with a real name
    // never regresses to "untitled" just because Home reloaded.
    const title = project?.name?.trim() || knownProjectNames?.get(tab.projectId) || t('common.untitled');
    return {
      id: tab.id,
      title,
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
    library: 'Library',
    brands: t('entry.navBrands'),
    integrations: t('entry.navIntegrations'),
    community: t('pluginsHome.title'),
    drafts: t('entry.navDrafts'),
    'all-projects': t('entry.navAllProjects'),
    members: t('entry.navMembers'),
    board: t('entry.navBoard'),
    'workspace-settings': t('entry.navWorkspaceSettings'),
    settings: t('settings.title'),
  };
  const entryIcon: Record<EntryHomeView, IconName> = {
    home: 'home',
    onboarding: 'sparkles',
    projects: 'folder',
    tasks: 'kanban',
    plugins: 'grid',
    'design-systems': 'blocks',
    library: 'image',
    brands: 'blocks',
    integrations: 'link',
    community: 'globe',
    drafts: 'file',
    'all-projects': 'folder',
    members: 'users',
    board: 'kanban',
    'workspace-settings': 'settings',
    settings: 'settings',
  };
  return {
    id: tab.id,
    title: entryTitle[tab.view],
    meta: tab.view === 'home' ? 'Start a new project' : 'Workspace',
    icon: entryIcon[tab.view],
    tab,
  };
}
