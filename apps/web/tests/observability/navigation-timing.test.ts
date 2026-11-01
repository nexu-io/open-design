// @vitest-environment jsdom
import { StrictMode, createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNavigationTiming,
  navigationTiming,
  useProjectNavigationReady,
  usePageNavigationReady,
  type NavigationResult,
} from '../../src/observability/navigation-timing';
import { reportSafetyEvent } from '../../src/analytics/error-tracking';

vi.mock('../../src/analytics/error-tracking', () => ({ reportSafetyEvent: vi.fn() }));

const home = { kind: 'home', view: 'projects' } as const;
const project = (projectId: string) => ({ kind: 'project', projectId });

beforeEach(() => {
  navigationTiming.cancel('page_exit');
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  navigationTiming.cancel('page_exit');
  vi.unstubAllGlobals();
});

describe('navigation lifecycle from intent, not mount', () => {
  function setup() {
    let time = 10;
    let sequence = 0;
    const events: NavigationResult[] = [];
    const timing = createNavigationTiming({
      now: () => time,
      id: () => `nav-${++sequence}`,
      emit: (event) => events.push(event),
    });
    return { timing, events, at: (value: number) => { time = value; } };
  }

  it('still opens projects when crypto.randomUUID is unavailable on an insecure web origin', () => {
    vi.stubGlobal('crypto', {});
    const id = navigationTiming.begin(home, { projectId: 'a' });
    expect(id).toBeTruthy();
    expect(navigationTiming.isCurrent(id)).toBe(true);
  });

  it('keeps navigation bookkeeping usable when the reporter throws', () => {
    const timing = createNavigationTiming({
      now: () => 10,
      id: () => 'nav-failed-reporter',
      emit: () => { throw new Error('reporter unavailable'); },
    });
    const id = timing.begin(home, { projectId: 'a' });
    timing.commit(id);
    expect(timing.getSnapshot()?.routeCommitted).toBe(true);
    timing.finish(id, 'ready');
    expect(timing.getSnapshot()).toBeNull();
  });

  it('includes async pre-route work and emits only one terminal result', () => {
    const { timing, events, at } = setup();
    const id = timing.begin(home, { projectId: 'a' });
    at(110);
    timing.observeRoute(project('a'));
    at(260);
    timing.finish(id, 'ready');
    timing.finish(id, 'ready');
    expect(events.map((e) => e.status)).toEqual(['started', 'ready']);
    expect(events[1]).toMatchObject({ navigation_id: id, duration_ms: 250, navigation_type: 'project_entry' });
  });

  it('cancels an earlier click, even for the same project, and ignores its late completion', () => {
    const { timing, events, at } = setup();
    const first = timing.begin(home, { projectId: 'a' });
    at(30);
    const second = timing.begin(home, { projectId: 'a' });
    timing.finish(first, 'ready');
    at(80);
    timing.commit(second);
    timing.finish(second, 'ready');
    expect(first).not.toBe(second);
    expect(events.map((e) => e.status)).toEqual(['started', 'cancelled', 'started', 'ready']);
    expect(events[1]).toMatchObject({ reason: 'superseded', duration_ms: 20 });
    expect(events[3]).toMatchObject({ navigation_id: second, duration_ms: 50 });
  });

  it('cancels when leaving the source before the target mounts', () => {
    const { timing, events } = setup();
    const id = timing.begin(home, { projectId: 'a' });
    timing.observeRoute(home);
    timing.observeRoute({ kind: 'home', view: 'settings' });
    expect(timing.isCurrent(id)).toBe(false);
    timing.finish(id, 'ready');
    expect(events.map((e) => e.status)).toEqual(['started', 'cancelled']);
  });

  it('cancels on leaving a loading project and gives re-entry a new id', () => {
    const { timing, events } = setup();
    const old = timing.begin(home, { projectId: 'a' });
    timing.observeRoute(project('a'));
    timing.observeRoute(home);
    const next = timing.begin(home, { projectId: 'a' });
    timing.finish(old, 'failed', 'messages_unavailable');
    timing.commit(next);
    timing.finish(next, 'ready');
    expect(events.filter((e) => e.status === 'ready').map((e) => e.navigation_id)).toEqual([next]);
    expect(events.filter((e) => e.status === 'cancelled')).toHaveLength(1);
  });

  it('keeps failures out of Ready and separates conversation switches', () => {
    const { timing, events } = setup();
    const id = timing.begin(project('a'), { projectId: 'a', conversationId: 'c2' });
    timing.observeRoute({ ...project('a'), conversationId: 'c2' });
    timing.finish(id, 'failed', 'messages_unavailable');
    expect(events[1]).toMatchObject({ status: 'failed', navigation_type: 'conversation_switch', target_type: 'conversation' });
    expect(events.some((e) => e.status === 'ready')).toBe(false);
  });

  it('never infers an intent from an initial route/deep link or file-tab sync', () => {
    const { timing, events } = setup();
    timing.observeRoute(project('a'));
    expect(events).toEqual([]);
    const id = timing.begin(home, { projectId: 'a' });
    timing.observeRoute({ ...project('a'), fileName: 'index.html' });
    expect(timing.isCurrent(id)).toBe(true);
  });
});

describe('committed project readiness', () => {
  let frames: Map<number, FrameRequestCallback>;
  let sequence: number;
  function frame() {
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((cb) => cb(performance.now()));
    });
  }
  const results = () => vi.mocked(reportSafetyEvent).mock.calls
    .filter(([event]) => event === 'client_navigation_result')
    .map(([, properties]) => properties);

  beforeEach(() => {
    frames = new Map();
    sequence = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(++sequence, cb);
      return sequence;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  it('waits for actionable data and cancels a queued Ready when switching away', () => {
    const id = navigationTiming.begin(home, { projectId: 'a' });
    const { rerender } = renderHook(({ ready }) => useProjectNavigationReady({
      projectId: 'a', conversationId: 'c1', ready, failure: null,
    }), { initialProps: { ready: false } });
    frame();
    expect(results().map((e) => e?.status)).toEqual(['started']);
    rerender({ ready: true });
    act(() => navigationTiming.observeRoute({ kind: 'home', view: 'settings' }));
    frame();
    expect(results().map((e) => e?.status)).toEqual(['started', 'cancelled']);
    expect(navigationTiming.isCurrent(id)).toBe(false);
  });

  it('ignores an old project or conversation surface and emits once after readiness', () => {
    navigationTiming.begin(home, { projectId: 'a', conversationId: 'c2' });
    navigationTiming.observeRoute({ kind: 'project', projectId: 'a', conversationId: 'c2' });
    const { rerender } = renderHook(({ conversationId }) => useProjectNavigationReady({
      projectId: 'a', conversationId, ready: true, failure: null,
    }), { initialProps: { conversationId: 'c1' } });
    frame();
    expect(results()).toHaveLength(1);
    rerender({ conversationId: 'c2' });
    frame();
    rerender({ conversationId: 'c2' });
    frame();
    expect(results().map((e) => e?.status)).toEqual(['started', 'ready']);
  });

  it('does not report background Ready and resumes after foreground return', () => {
    let visibility = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState);
    navigationTiming.begin(home, { projectId: 'a' });
    navigationTiming.observeRoute(project('a'));
    renderHook(() => useProjectNavigationReady({
      projectId: 'a', conversationId: 'c1', ready: true, failure: null,
    }));
    frame();
    expect(results().map((e) => e?.status)).toEqual(['started']);
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    frame();
    expect(results().map((e) => e?.status)).toEqual(['started', 'ready']);
    vi.restoreAllMocks();
  });

  it('survives StrictMode setup/cleanup replay without cancellation or duplicate Ready', () => {
    navigationTiming.begin(home, { projectId: 'a' });
    navigationTiming.observeRoute(project('a'));
    renderHook(() => useProjectNavigationReady({
      projectId: 'a', conversationId: 'c1', ready: true, failure: null,
    }), { wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children) });
    frame();
    expect(results().map((e) => e?.status)).toEqual(['started', 'ready']);
  });

  it('reports a load failure without waiting for a paint or reporting success', () => {
    navigationTiming.begin(home, { projectId: 'a' });
    navigationTiming.observeRoute(project('a'));
    renderHook(() => useProjectNavigationReady({
      projectId: 'a', conversationId: 'c1', ready: false, failure: 'messages_unavailable',
    }));
    frame();
    expect(results().map((e) => e?.status)).toEqual(['started', 'failed']);
  });
});

it('records first visible separately from interactive Ready and admits the canonical schema', async () => {
  const { parseClientMetricEvent, buildClientTelemetryParams } = await import('@open-design/contracts/analytics');
  navigationTiming.begin(home, { projectId: 'a' });
  const id = navigationTiming.getSnapshot()!.id;
  navigationTiming.observeRoute(project('a'));
  navigationTiming.firstVisible(id); navigationTiming.firstVisible(id);
  expect(navigationTiming.isCurrent(id)).toBe(true);
  navigationTiming.finish(id, 'ready');
  const properties = vi.mocked(reportSafetyEvent).mock.calls
    .filter(([event]) => event === 'client_navigation_result').map(([, value]) => value!);
  expect(properties.map(value => value.result)).toEqual(['started', 'first_visible', 'ready']);
  for (const value of properties) {
    const common = buildClientTelemetryParams(value, { eventId: 'event', deviceId: 'install', appSessionId: 'session',
      appVersion: '1.0.0', clientType: 'web', captureSource: 'web/test', env: 'test', reportedAt: new Date().toISOString() });
    expect(parseClientMetricEvent('client_navigation_result', { ...value, ...common })).not.toBeNull();
  }
});


it('page readiness waits for router commit, then distinguishes visible from interactive', () => {
  const id = navigationTiming.beginPage(home, { kind: 'home', view: 'settings' });
  const { rerender } = renderHook(({ ready }) => usePageNavigationReady({ page: 'settings', visible: true, ready }), { initialProps: { ready: false } });
  navigationTiming.observeRoute({ kind: 'home', view: 'settings' });
  expect(navigationTiming.getSnapshot()?.routeCommitted).toBe(false);
  act(() => navigationTiming.commit(id));
  // rAF is stubbed in the following dedicated controller test; no eager Ready here.
  expect(navigationTiming.isCurrent(id)).toBe(true);
  rerender({ ready: true });
  cleanup(); navigationTiming.cancel('page_exit');
});

it('page state machine deduplicates terminal results, excludes rejected/stale completions', () => {
  const events: NavigationResult[] = [];
  let tick = 100;
  const timing = createNavigationTiming({ now: () => tick, id: () => String(++tick), emit: e => events.push(e) });
  const id = timing.beginPage(home, { kind: 'home', view: 'settings' });
  timing.firstVisible(id); timing.finish(id, 'ready');
  expect(events.map(e => e.status)).toEqual(['started']);
  timing.commit(id); tick += 20; timing.firstVisible(id); timing.firstVisible(id);
  timing.finish(id, 'ready'); timing.finish(id, 'ready');
  expect(events.map(e => e.status)).toEqual(['started', 'first_visible', 'ready']);
  expect(events[2]).toMatchObject({ navigation_type: 'page_switch', target_type: 'page', target_page: 'settings', duration_ms: 20 });
  const next = timing.beginPage(home, { kind: 'home', view: 'tasks' });
  timing.finish(next, 'cancelled', 'guard_rejected'); timing.commit(next); timing.finish(next, 'ready');
  expect(events.at(-1)?.status).toBe('cancelled');
});

it('page hook emits visible then Ready on foreground frames and cancels on scope changes', () => {
  let callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { callbacks.push(cb); return callbacks.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const flush = () => act(() => { const queued = callbacks; callbacks = []; queued.forEach(cb => cb(0)); });
  const id = navigationTiming.beginPage(home, { kind: 'home', view: 'settings' });
  const { rerender, unmount } = renderHook(({ ready, scopeKey }) => usePageNavigationReady({ page: 'settings', visible: true, ready, scopeKey }), { initialProps: { ready: false, scopeKey: 'a' } });
  flush(); expect(navigationTiming.getSnapshot()?.firstVisible).toBe(false);
  act(() => navigationTiming.commit(id)); flush();
  expect(navigationTiming.getSnapshot()?.firstVisible).toBe(true);
  rerender({ ready: true, scopeKey: 'a' }); flush();
  expect(navigationTiming.getSnapshot()).toBeNull();
  const next = navigationTiming.beginPage(home, { kind: 'home', view: 'settings' });
  act(() => navigationTiming.commit(next));
  rerender({ ready: false, scopeKey: 'b' }); flush();
  expect(navigationTiming.getSnapshot()).toBeNull();
  unmount(); vi.unstubAllGlobals();
});
