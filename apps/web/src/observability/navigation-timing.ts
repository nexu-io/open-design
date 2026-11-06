// Intent tracking is web-owned; emitted payloads use the shared metric schema.
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { reportSafetyEvent } from '../analytics/error-tracking';
import { clearChatOpenIntent, markChatOpenIntent } from './chat-health';

export interface NavigationLocation {
  kind: string;
  view?: string;
  projectId?: string | null;
  conversationId?: string | null;
  fileName?: string | null;
}

export type NavigationFailure =
  | 'open_unavailable'
  | 'project_unavailable'
  | 'scope_unavailable'
  | 'conversations_unavailable'
  | 'messages_unavailable'
  | 'page_unavailable';
export type NavigationCancellation = 'superseded' | 'route_changed' | 'page_exit' | 'scope_changed' | 'guard_rejected' | 'same_route';
export interface NavigationResult {
  navigation_id: string;
  navigation_type: 'project_entry' | 'conversation_switch' | 'page_switch';
  source_type: string;
  target_type: 'project' | 'conversation' | 'home' | 'page';
  source_page?: string;
  target_page?: string;
  status: 'started' | 'first_visible' | 'ready' | 'cancelled' | 'failed';
  started_at: string;
  duration_ms: number;
  reason?: NavigationFailure | NavigationCancellation;
}
interface NavigationAttempt {
  id: string;
  startedAt: number;
  startedAtIso: string;
  firstVisible: boolean;
  routeCommitted: boolean;
  source: string;
  projectId: string;
  targetPage?: string;
  sourcePage?: string;
  conversationId?: string;
  navigationType: NavigationResult['navigation_type'];
  sourceType: string;
}

export function navigationPage(route: NavigationLocation): string {
  return route.kind === 'home' ? route.view ?? 'home' : route.kind;
}

function routeKey(route: NavigationLocation): string {
  // File tab persistence updates the URL during hydration; it is not a new
  // project/conversation intent and must not cancel the measurement.
  return JSON.stringify([route.kind, route.view, route.projectId, route.conversationId ?? null]);
}

export function createNavigationTiming(deps: {
  now: () => number;
  id: () => string;
  emit: (result: NavigationResult) => void;
}) {
  let active: NavigationAttempt | null = null;
  let arrived = false;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const emit = (attempt: NavigationAttempt, status: NavigationResult['status'], reason?: NavigationResult['reason']) => {
    try { deps.emit({
      navigation_id: attempt.id,
      started_at: attempt.startedAtIso,
      navigation_type: attempt.navigationType,
      source_type: attempt.sourceType,
      target_type: attempt.targetPage ? (attempt.targetPage === 'home' ? 'home' : 'page') : attempt.conversationId ? 'conversation' : 'project',
      ...(attempt.targetPage ? { source_page: attempt.sourcePage, target_page: attempt.targetPage } : {}),
      status,
      duration_ms: status === 'started' ? 0 : Math.max(0, Math.round(deps.now() - attempt.startedAt)),
      ...(reason ? { reason } : {}),
    }); } catch { /* Reporting failures must not interrupt navigation. */ }
  };
  const finish = (id: string, status: 'ready' | 'cancelled' | 'failed', reason?: NavigationResult['reason']) => {
    if (!active || active.id !== id || (status === 'ready' && !active.routeCommitted)) return;
    const attempt = active;
    active = null;
    arrived = false;
    emit(attempt, status, reason);
    notify();
  };
  const cancel = (reason: NavigationCancellation) => {
    if (active) finish(active.id, 'cancelled', reason);
  };
  const commit = (id: string) => {
    if (!active || active.id !== id || active.routeCommitted) return;
    active = { ...active, routeCommitted: true };
    arrived = true;
    notify();
  };
  return {
    commit,
    begin(source: NavigationLocation, target: { projectId: string; conversationId?: string }): string {
      cancel('superseded');
      const attempt: NavigationAttempt = {
        id: deps.id(), startedAt: deps.now(), startedAtIso: new Date().toISOString(), firstVisible: false, routeCommitted: false, source: routeKey(source),
        projectId: target.projectId, conversationId: target.conversationId,
        navigationType: target.conversationId ? 'conversation_switch' : 'project_entry',
        sourceType: source.kind === 'home' ? `home_${source.view ?? 'home'}` : source.kind,
      };
      active = attempt;
      arrived = false;
      emit(attempt, 'started');
      notify();
      return attempt.id;
    },
    beginPage(source: NavigationLocation, target: NavigationLocation, origin?: { at: number; iso: string }): string {
      cancel('superseded');
      const attempt: NavigationAttempt = {
        id: deps.id(), startedAt: origin?.at ?? deps.now(), startedAtIso: origin?.iso ?? new Date().toISOString(),
        firstVisible: false, routeCommitted: false, source: routeKey(source),
        projectId: '', targetPage: navigationPage(target), sourcePage: navigationPage(source),
        navigationType: 'page_switch', sourceType: source.kind === 'home' ? 'home' : source.kind,
      };
      active = attempt; arrived = false; emit(attempt, 'started'); notify();
      return attempt.id;
    },
    observeRoute(route: NavigationLocation): void {
      if (!active) return;
      if (active.targetPage) {
        // observeRoute is a render witness; router onCommit alone owns the gate.
        if (navigationPage(route) !== active.targetPage && (arrived || routeKey(route) !== active.source)) cancel('route_changed');
        return;
      }
      const matchesTarget = route.kind === 'project' && route.projectId === active.projectId
        && (!active.conversationId || route.conversationId === active.conversationId);
      if (matchesTarget) commit(active.id);
      else if (arrived || routeKey(route) !== active.source) cancel('route_changed');
    },
    firstVisible(id: string) {
      if (!active || active.id !== id || !active.routeCommitted || active.firstVisible) return;
      active.firstVisible = true;
      emit(active, 'first_visible');
    },
    finish,
    cancel,
    isCurrent: (id: string): boolean => active?.id === id,
    getSnapshot: (): NavigationAttempt | null => active,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** Observation failures never escape into a business handler or route commit. */
export function observeNavigation<T>(observe: () => T): T | undefined {
  try { return observe(); } catch { return undefined; }
}

export const navigationTiming = createNavigationTiming({
  now: () => performance.now(),
  // randomUUID is secure-context-only; LAN HTTP web clients still need to
  // navigate. This correlation id is not a credential or security boundary.
  id: () => globalThis.crypto?.randomUUID?.()
    ?? `nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  emit: (result) => {
    if (result.status === 'started' && result.navigation_type !== 'page_switch') {
      markChatOpenIntent(result.navigation_type === 'project_entry' ? 'project_switch' : 'conversation_switch');
    } else if (result.status !== 'ready' && result.status !== 'first_visible') {
      clearChatOpenIntent();
    }
    reportSafetyEvent('client_navigation_result', { ...result,
      navigation_type: result.navigation_type === 'project_entry' ? 'project_enter' : result.navigation_type,
      source_type: result.source_type.startsWith('home') ? 'home'
        : ['project', 'conversation', 'page'].includes(result.source_type) ? result.source_type : 'unknown',
      result: result.status, reason_code: result.reason,
      ...(result.status === 'ready' ? { readiness_point: 'interactive_ready' }
        : result.status === 'first_visible' ? { readiness_point: 'first_visible' } : {}),
      metric_schema_version: 1, telemetry_capability: 'supported',
    });
  },
});

const serverSnapshot = () => null;

/** No intent is synthesized on mount. Ready requires the caller's business
 * gates, a committed surface, and a foreground animation-frame check. */
export function useProjectNavigationReady(input: {
  projectId: string;
  conversationId: string | null;
  ready: boolean;
  visible?: boolean;
  failure: NavigationFailure | null;
}): void {
  const attempt = useSyncExternalStore(navigationTiming.subscribe, navigationTiming.getSnapshot, serverSnapshot);
  const { projectId, conversationId, ready, failure, visible = false } = input;
  useLayoutEffect(() => {
    if (!attempt || attempt.projectId !== projectId
      || (attempt.conversationId && attempt.conversationId !== conversationId)) return;
    if (failure) {
      navigationTiming.finish(attempt.id, 'failed', failure);
      return;
    }
    if (!attempt.routeCommitted || (!ready && !visible)) return;
    let frame: number | null = null;
    const check = () => {
      if (document.visibilityState === 'hidden' || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (document.visibilityState !== 'hidden') {
          if (visible) navigationTiming.firstVisible(attempt.id);
          if (ready) navigationTiming.finish(attempt.id, 'ready');
        }
      });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', check);
    };
  }, [attempt, projectId, conversationId, ready, failure, visible]);
}


/** Targets call this after their data/actions commit. Router commit is necessary
 * but insufficient; mounting a route placeholder never declares Ready. */
export function usePageNavigationReady(input: {
  page: string; visible: boolean; ready: boolean; failure?: boolean; scopeKey?: string;
}): void {
  const attempt = useSyncExternalStore(navigationTiming.subscribe, navigationTiming.getSnapshot, serverSnapshot);
  const { page, visible, ready, failure = false, scopeKey } = input;
  const scope = useRef<{ id: string; key: string | undefined } | null>(null);
  useLayoutEffect(() => {
    if (!attempt?.targetPage || attempt.targetPage !== page) return;
    if (scope.current?.id === attempt.id && scope.current.key !== scopeKey) {
      navigationTiming.finish(attempt.id, 'cancelled', 'scope_changed'); return;
    }
    scope.current = { id: attempt.id, key: scopeKey };
    if (failure) { navigationTiming.finish(attempt.id, 'failed', 'page_unavailable'); return; }
    if (!attempt.routeCommitted || (!visible && !ready)) return;
    let frame: number | null = null;
    const check = () => {
      if (document.visibilityState !== 'visible' || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (document.visibilityState !== 'visible') return;
        if (visible) navigationTiming.firstVisible(attempt.id);
        if (ready) navigationTiming.finish(attempt.id, 'ready');
      });
    };
    check(); document.addEventListener('visibilitychange', check);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', check);
    };
  }, [attempt, page, visible, ready, failure, scopeKey]);
}
