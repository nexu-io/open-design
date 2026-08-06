// Tiny URL router. We avoid pulling in react-router for two reasons:
// the surface area we need is small (three routes, plain pushState), and
// we want a single source of truth for "what file is open" — encoding
// that in the URL is the simplest way to make it deep-linkable.

import { useSyncExternalStore } from 'react';
import { LIBRARY_UI_VISIBLE } from './features/libraryUi';

// Entry-shell sub-views. The home/project landing renders one of three
// columns and each sub-view now owns a top-level path so the browser
// back/forward buttons work, deep links are shareable, and per-tab
// state isn't trapped behind a `useState` boundary.
export type EntryHomeView =
  | 'home'
  | 'onboarding'
  | 'projects'
  | 'tasks'
  | 'plugins'
  | 'design-systems'
  | 'library'
  | 'brands'
  | 'integrations'
  // Team-edition navigation-shell destinations. `community` is the shared
  // template gallery surfaced as a rail destination (rather than only a home
  // sub-section); the rest are team-workspace slots (project spaces + members +
  // board + workspace settings) whose views are provided by other lanes.
  | 'community'
  | 'drafts'
  | 'all-projects'
  | 'members'
  | 'board'
  | 'workspace-settings'
  // Full-page personal Settings surface. `/settings` renders the same
  // SettingsDialog component in its `page` presentation instead of the modal.
  | 'settings';

export type Route =
  | {
      kind: 'home';
      view: EntryHomeView;
      /**
       * Optional preselected brand for the Brands tab. The tab renders
       * everything inline in its preview panel (there is no separate detail
       * view), so a `/brands/:id` deep-link simply drives which brand the
       * inline preview shows. Lets external surfaces (the rail, a chat link)
       * select a specific brand without leaving the tab.
       */
      brandId?: string;
    }
  | { kind: 'design-system-create' }
  | { kind: 'design-system-detail'; designSystemId: string }
  | {
      kind: 'project';
      projectId: string;
      /**
       * Deep-link to a specific conversation inside the project. When
       * present, the project view picks this conversation as the active
       * one instead of defaulting to `list[0]`. Falls back to the
       * default picker when the routed conversation no longer exists.
       * Added for issue #1505 (Routines history → specific conversation).
       */
      conversationId?: string | null;
      fileName: string | null;
    }
  | { kind: 'marketplace' }
  | { kind: 'marketplace-detail'; pluginId: string }
  // Team collaboration demo surface. Drives the live presence + sync loop
  // against the real daemon routes with a clearly-stubbed demo identity (real
  // B identity / D visibility integration pending). Deep-linkable so a second
  // browser tab can join the same project and appear in the presence overlay.
  | { kind: 'collab-demo'; projectId: string | null }
  // Community template gallery — browse and remix shared design templates.
  | { kind: 'community' };

export function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'home', view: 'home' };
  if (parts[0] === 'onboarding') {
    return { kind: 'home', view: 'onboarding' };
  }
  if (parts[0] === 'projects') {
    if (parts[1]) {
      const projectId = decodeURIComponent(parts[1]);
      // /projects/:id/conversations/:cid[/files/...]
      if (parts[2] === 'conversations' && parts[3]) {
        const conversationId = decodeURIComponent(parts[3]);
        if (parts[4] === 'files' && parts[5]) {
          return {
            kind: 'project',
            projectId,
            conversationId,
            fileName: decodeURIComponent(parts.slice(5).join('/')),
          };
        }
        return { kind: 'project', projectId, conversationId, fileName: null };
      }
      // /projects/:id/files/...
      if (parts[2] === 'files' && parts[3]) {
        return {
          kind: 'project',
          projectId,
          conversationId: null,
          fileName: decodeURIComponent(parts.slice(3).join('/')),
        };
      }
      return { kind: 'project', projectId, conversationId: null, fileName: null };
    }
    return { kind: 'home', view: 'projects' };
  }
  if (parts[0] === 'design-systems') {
    if (parts[1] === 'create') {
      return { kind: 'design-system-create' };
    }
    if (parts[1]) {
      return { kind: 'design-system-detail', designSystemId: decodeURIComponent(parts[1]) };
    }
    return { kind: 'home', view: 'design-systems' };
  }
  if (parts[0] === 'brands') {
    // Brands merged into Design systems: a brand is a `user:<id>` design system
    // and extraction now starts from the design-system create wizard. Legacy
    // `/brands` and `/brands/:id` deep-links redirect onto the unified tab.
    return { kind: 'home', view: 'design-systems' };
  }
  if (parts[0] === 'automations' || parts[0] === 'tasks') {
    return { kind: 'home', view: 'tasks' };
  }
  if (parts[0] === 'plugins' && !parts[1]) {
    return { kind: 'home', view: 'plugins' };
  }
  if (LIBRARY_UI_VISIBLE && parts[0] === 'library' && !parts[1]) {
    return { kind: 'home', view: 'library' };
  }
  if (parts[0] === 'integrations') {
    return { kind: 'home', view: 'integrations' };
  }
  if (parts[0] === 'settings') {
    return { kind: 'home', view: 'settings' };
  }
  if (parts[0] === 'collab-demo') {
    return { kind: 'collab-demo', projectId: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  if (parts[0] === 'community') {
    // Community is now a rail destination inside the entry shell so the nav rail
    // stays visible alongside the gallery.
    return { kind: 'home', view: 'community' };
  }
  if (parts[0] === 'drafts' && !parts[1]) {
    return { kind: 'home', view: 'drafts' };
  }
  if (parts[0] === 'all-projects' && !parts[1]) {
    return { kind: 'home', view: 'all-projects' };
  }
  if (parts[0] === 'members' && !parts[1]) {
    return { kind: 'home', view: 'members' };
  }
  if (parts[0] === 'board' && !parts[1]) {
    return { kind: 'home', view: 'board' };
  }
  if (parts[0] === 'workspace-settings' && !parts[1]) {
    return { kind: 'home', view: 'workspace-settings' };
  }
  // Phase 2B / spec §11.6 — marketplace deep UI routes. Two paths:
  //   /marketplace            → catalog grid (MarketplaceView)
  //   /marketplace/<pluginId> → detail page (PluginDetailView)
  // Aliases to /plugins remain reserved for the public site (spec §13);
  // in-app we keep /marketplace canonical.
  if (parts[0] === 'marketplace' || parts[0] === 'plugins') {
    if (parts[1]) {
      return { kind: 'marketplace-detail', pluginId: decodeURIComponent(parts[1]) };
    }
    return { kind: 'marketplace' };
  }
  return { kind: 'home', view: 'home' };
}

export function buildPath(route: Route): string {
  if (route.kind === 'home') {
    if (route.view === 'onboarding') return '/onboarding';
    if (route.view === 'projects') return '/projects';
    if (route.view === 'tasks') return '/automations';
    if (route.view === 'plugins') return '/plugins';
    if (route.view === 'design-systems') return '/design-systems';
    if (route.view === 'library') return LIBRARY_UI_VISIBLE ? '/library' : '/';
    if (route.view === 'brands') {
      return route.brandId ? `/brands/${encodeURIComponent(route.brandId)}` : '/brands';
    }
    if (route.view === 'integrations') return '/integrations';
    if (route.view === 'community') return '/community';
    if (route.view === 'drafts') return '/drafts';
    if (route.view === 'all-projects') return '/all-projects';
    if (route.view === 'members') return '/members';
    if (route.view === 'board') return '/board';
    if (route.view === 'workspace-settings') return '/workspace-settings';
    if (route.view === 'settings') return '/settings';
    return '/';
  }
  if (route.kind === 'marketplace') return '/marketplace';
  if (route.kind === 'marketplace-detail') return `/marketplace/${encodeURIComponent(route.pluginId)}`;
  if (route.kind === 'collab-demo') {
    return route.projectId ? `/collab-demo/${encodeURIComponent(route.projectId)}` : '/collab-demo';
  }
  if (route.kind === 'community') return '/community';
  if (route.kind === 'design-system-create') return '/design-systems/create';
  if (route.kind === 'design-system-detail') {
    return `/design-systems/${encodeURIComponent(route.designSystemId)}`;
  }
  const id = encodeURIComponent(route.projectId);
  const file = route.fileName
    ? route.fileName.split('/').map((s) => encodeURIComponent(s)).join('/')
    : null;
  if (route.conversationId) {
    const cid = encodeURIComponent(route.conversationId);
    return file
      ? `/projects/${id}/conversations/${cid}/files/${file}`
      : `/projects/${id}/conversations/${cid}`;
  }
  return file ? `/projects/${id}/files/${file}` : `/projects/${id}`;
}

// Centralized navigation. Components call this instead of mutating
// `window.location` directly so we can fan the change out to any
// `useRoute()` subscriber via a custom event.
//
// The `popstate` dispatch is deferred to a microtask so that callers
// can safely invoke `navigate()` from inside a `useState` updater or
// during a render commit phase without triggering React's
// "Cannot update a component while rendering a different component"
// warning. The `history` API call itself stays synchronous so the URL
// bar updates immediately; only the `useRoute()` subscriber updates
// are deferred past the current render.
// Each history entry carries a monotonic depth (`odIndex`) so `goBack()` can
// tell whether there is an in-app entry behind the current one. We store it in
// `history.state` — nothing else reads host history state — so it survives
// reloads and the browser's own back/forward. The very first entry (a fresh
// load or deep link) has no state, which reads as index 0.
interface HistoryState {
  odIndex: number;
}

export type NavigationGuard = () => boolean | Promise<boolean>;

const navigationGuards = new Set<NavigationGuard>();
let guardedNavigationSequence = 0;

interface AcceptedHistoryLocation {
  pathname: string;
  index: number;
}

interface ApprovedHistoryTraversal {
  expectedIndex: number;
  sequence: number;
}

const routeSubscribers = new Set<() => void>();
let popstateListenerInstalled = false;
let dispatchingCommittedPopstate = false;
let acceptedHistoryLocation: AcceptedHistoryLocation | null = null;
let pendingHistoryRepair: AcceptedHistoryLocation | null = null;
let approvedHistoryTraversal: ApprovedHistoryTraversal | null = null;

export function registerNavigationGuard(guard: NavigationGuard): () => void {
  navigationGuards.add(guard);
  ensurePopstateCoordinator();
  return () => {
    navigationGuards.delete(guard);
    maybeRemovePopstateCoordinator();
  };
}

async function navigationGuardsAllow(): Promise<boolean> {
  for (const guard of [...navigationGuards]) {
    try {
      if (!(await guard())) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function runGuardedNavigation(action: (sequence: number) => void): void {
  // Every newer navigation intent invalidates an older async guard, including
  // the no-guard fast path and a same-path no-op.
  const sequence = ++guardedNavigationSequence;
  approvedHistoryTraversal = null;
  if (navigationGuards.size === 0) {
    action(sequence);
    return;
  }
  void navigationGuardsAllow().then((allowed) => {
    if (allowed && sequence === guardedNavigationSequence) action(sequence);
  });
}

function readHistoryIndex(): number {
  const state = window.history.state as Partial<HistoryState> | null;
  return typeof state?.odIndex === 'number' ? state.odIndex : 0;
}

function readHistoryLocation(): AcceptedHistoryLocation {
  return { pathname: window.location.pathname, index: readHistoryIndex() };
}

function isSameHistoryLocation(
  left: AcceptedHistoryLocation | null,
  right: AcceptedHistoryLocation,
): boolean {
  return left?.pathname === right.pathname && left.index === right.index;
}

function repairHistoryTraversal(
  previous: AcceptedHistoryLocation,
  target: AcceptedHistoryLocation,
): void {
  // A newer navigation may already have committed while an older native
  // Back/Forward guard was pending. Only repair when the browser is still on
  // that unapproved target and the UI authority is still the previous route.
  if (
    !isSameHistoryLocation(readHistoryLocation(), target)
    || !isSameHistoryLocation(acceptedHistoryLocation, previous)
  ) {
    return;
  }

  const repairDelta = previous.index - target.index;
  if (repairDelta !== 0) {
    pendingHistoryRepair = previous;
    window.history.go(repairDelta);
    return;
  }

  // A foreign/deep-link entry may not carry a distinct odIndex. Preserve the
  // accepted route without recursively dispatching another popstate.
  window.history.pushState({ odIndex: previous.index }, '', previous.pathname);
  acceptedHistoryLocation = previous;
}

function notifyRouteSubscribers(): void {
  for (const subscriber of [...routeSubscribers]) subscriber();
}

function ensurePopstateCoordinator(): void {
  if (popstateListenerInstalled) return;
  acceptedHistoryLocation = readHistoryLocation();
  window.addEventListener('popstate', handlePopstate);
  popstateListenerInstalled = true;
}

function maybeRemovePopstateCoordinator(): void {
  if (!popstateListenerInstalled || navigationGuards.size > 0 || routeSubscribers.size > 0) return;
  window.removeEventListener('popstate', handlePopstate);
  popstateListenerInstalled = false;
  acceptedHistoryLocation = null;
  pendingHistoryRepair = null;
  approvedHistoryTraversal = null;
  guardedNavigationSequence += 1;
}

function handlePopstate(): void {
  const target = readHistoryLocation();
  if (dispatchingCommittedPopstate) {
    acceptedHistoryLocation = target;
    notifyRouteSubscribers();
    return;
  }

  if (
    pendingHistoryRepair
    && pendingHistoryRepair.pathname === target.pathname
    && pendingHistoryRepair.index === target.index
  ) {
    acceptedHistoryLocation = pendingHistoryRepair;
    pendingHistoryRepair = null;
    return;
  }
  pendingHistoryRepair = null;

  // goBack() already waited for the guard before asking the browser to move.
  // Consume that exact traversal here instead of running the same async safe
  // exit twice. A mismatched popstate is a different navigation and must still
  // pass through the normal guard path.
  const approvedTraversal = approvedHistoryTraversal;
  approvedHistoryTraversal = null;
  if (
    approvedTraversal
    && approvedTraversal.sequence === guardedNavigationSequence
    && approvedTraversal.expectedIndex === target.index
  ) {
    acceptedHistoryLocation = target;
    notifyRouteSubscribers();
    return;
  }

  const previous = acceptedHistoryLocation ?? target;
  const sequence = ++guardedNavigationSequence;
  if (navigationGuards.size === 0) {
    acceptedHistoryLocation = target;
    notifyRouteSubscribers();
    return;
  }

  void navigationGuardsAllow().then((allowed) => {
    if (sequence !== guardedNavigationSequence) {
      repairHistoryTraversal(previous, target);
      return;
    }
    if (allowed) {
      acceptedHistoryLocation = target;
      notifyRouteSubscribers();
      return;
    }
    repairHistoryTraversal(previous, target);
  });
}

interface NavigationOptions {
  replace?: boolean;
  onCommit?: () => void;
}

function commitNavigation(route: Route, opts: NavigationOptions = {}): void {
  const target = buildPath(route);
  if (target === window.location.pathname) return;
  const index = readHistoryIndex();
  // `replace` keeps the current depth (it swaps the entry in place); a push
  // adds one level so the entry we are leaving becomes the "previous layer".
  const nextState: HistoryState = { odIndex: opts.replace ? index : index + 1 };
  if (opts.replace) {
    window.history.replaceState(nextState, '', target);
  } else {
    window.history.pushState(nextState, '', target);
  }
  acceptedHistoryLocation = readHistoryLocation();
  opts.onCommit?.();
  queueMicrotask(() => {
    dispatchingCommittedPopstate = true;
    try {
      window.dispatchEvent(new PopStateEvent('popstate'));
    } finally {
      dispatchingCommittedPopstate = false;
    }
  });
}

export function navigate(route: Route, opts: NavigationOptions = {}): void {
  runGuardedNavigation(() => commitNavigation(route, opts));
}

// Step back to the route the user actually came from. We pop the browser
// history stack (which `navigate()` builds via pushState) so "back" lands on
// the real previous layer — Projects, Tasks, a design system, wherever — not a
// hardcoded destination. When the current entry is the first in-app entry
// (`odIndex` 0: deep link or fresh load), there is nothing in-app to pop, so we
// navigate to `fallback` instead of letting `history.back()` escape the app.
export function goBack(fallback: Route): void {
  runGuardedNavigation((sequence) => {
    const index = readHistoryIndex();
    if (index > 0) {
      approvedHistoryTraversal = { expectedIndex: index - 1, sequence };
      window.history.back();
    } else {
      commitNavigation(fallback, { replace: true });
    }
  });
}

let cachedPathname: string | null = null;
let cachedRoute: Route | null = null;

function getRouteSnapshot(): Route {
  // Native Back/Forward mutates window.location before its asynchronous guard
  // resolves. Keep render-time reads on the last accepted route until the
  // coordinator explicitly publishes the traversal.
  const pathname = acceptedHistoryLocation?.pathname ?? window.location.pathname;
  if (cachedPathname !== pathname || cachedRoute === null) {
    cachedPathname = pathname;
    cachedRoute = parseRoute(pathname);
  }
  return cachedRoute;
}

function subscribeToRouteChanges(onStoreChange: () => void): () => void {
  routeSubscribers.add(onStoreChange);
  ensurePopstateCoordinator();
  return () => {
    routeSubscribers.delete(onStoreChange);
    maybeRemovePopstateCoordinator();
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeToRouteChanges, getRouteSnapshot, getRouteSnapshot);
}
