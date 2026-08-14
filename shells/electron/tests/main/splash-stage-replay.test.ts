// Review follow-up on the splash boot-stage PR (#4223): the first stage
// update (the daemon phase) is fired from the packaged entry right after the
// splash window is created — potentially before the splash data-URL has
// finished loading and defined `window.__odSplashSetProgress`. Without a
// load-ready guard that update reaches a renderer that has no setter yet, so
// the "Starting the local engine" label silently never renders on exactly the
// slow cold-boot path this feature targets.
//
// This spec pins the invariant with a structural mock (no real Electron):
// a stage fired before `did-finish-load` must be DEFERRED, not dropped, and
// replayed once the page reports it has loaded.

import { describe, expect, test } from 'vitest';

import {
  registerSplashStageTracking,
  setSplashStandaloneProgress,
  setSplashStage,
  type SplashStageSurface,
} from '../../src/main/runtime.js';

type MockSplash = {
  surface: SplashStageSurface;
  executed: string[];
  emitDidFinishLoad: () => void;
  destroy: () => void;
};

function createMockSplash(): MockSplash {
  const executed: string[] = [];
  let didFinishLoad: (() => void) | null = null;
  let destroyed = false;
  const surface: SplashStageSurface = {
    isDestroyed: () => destroyed,
    webContents: {
      executeJavaScript: (code: string) => {
        executed.push(code);
        return Promise.resolve(undefined);
      },
      once: (event, listener) => {
        if (event === 'did-finish-load') didFinishLoad = listener;
      },
    },
  };
  return {
    surface,
    executed,
    emitDidFinishLoad: () => didFinishLoad?.(),
    destroy: () => {
      destroyed = true;
    },
  };
}

describe('splash boot-stage replay guard', () => {
  test('defers a stage fired before the page loads, then replays it on did-finish-load', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);

    // Daemon phase fires while the splash data-URL is still loading. It must
    // NOT reach the renderer yet — the setter does not exist there.
    setSplashStage(splash.surface, 'engine');
    expect(splash.executed).toEqual([]);

    // Page reports loaded → the deferred stage is replayed exactly once.
    splash.emitDidFinishLoad();
    expect(splash.executed).toHaveLength(1);
    expect(splash.executed[0]).toContain('Starting the local engine');
  });

  test('replays only the latest stage when several arrive before load', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);

    setSplashStage(splash.surface, 'engine');
    setSplashStage(splash.surface, 'interface');
    expect(splash.executed).toEqual([]);

    splash.emitDidFinishLoad();
    expect(splash.executed).toHaveLength(1);
    expect(splash.executed[0]).toContain('Preparing the interface');
  });

  test('applies immediately once the page has loaded', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);
    splash.emitDidFinishLoad();

    setSplashStage(splash.surface, 'workspace');
    expect(splash.executed).toHaveLength(1);
    expect(splash.executed[0]).toContain('Opening your workspace');
  });

  test('replays the latest Standalone progress through the canonical surface after load', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);

    setSplashStandaloneProgress(splash.surface, {
      initialLoad: true,
      schemaVersion: 2,
      stage: 'discovering',
      subject: { id: 'standalone', kind: 'standalone', title: 'Standalone' },
    });
    setSplashStandaloneProgress(splash.surface, {
      initialLoad: true,
      progress: { completed: 8, total: 16, unit: 'bytes' },
      schemaVersion: 2,
      stage: 'downloading',
      subject: { id: 'standalone', kind: 'standalone', title: 'Standalone' },
    });
    expect(splash.executed).toEqual([]);

    splash.emitDidFinishLoad();
    expect(splash.executed).toHaveLength(1);
    expect(splash.executed[0]).toContain('__odSplashSetProgress');
    expect(splash.executed[0]).toContain('First launch · Downloading Standalone');
    expect(splash.executed[0]).toContain('"percent":50');
  });

  test('uses the same canonical surface for warm verification and updates', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);
    splash.emitDidFinishLoad();

    setSplashStandaloneProgress(splash.surface, {
      initialLoad: false,
      schemaVersion: 2,
      stage: 'verifying',
      subject: { id: 'standalone', kind: 'standalone', title: 'Standalone' },
    });
    setSplashStandaloneProgress(splash.surface, {
      initialLoad: false,
      progress: { completed: 1, total: 3, unit: 'components' },
      schemaVersion: 2,
      stage: 'materializing',
      subject: { id: 'standalone', kind: 'standalone', title: 'Standalone' },
    });

    expect(splash.executed[0]).toContain('__odSplashSetProgress');
    expect(splash.executed[0]).toContain('Verifying Standalone');
    expect(splash.executed[1]).toContain('__odSplashSetProgress');
    expect(splash.executed[1]).toContain('1 / 3 components');
  });

  test('renders resource-owned byte progress without teaching the Shell about Vela', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);
    splash.emitDidFinishLoad();

    setSplashStandaloneProgress(splash.surface, {
      initialLoad: false,
      progress: { completed: 19 * 1024 * 1024, total: 55 * 1024 * 1024, unit: 'bytes' },
      schemaVersion: 2,
      stage: 'downloading',
      subject: { id: 'vela-runtime', kind: 'resource', title: 'Local engine' },
    });

    expect(splash.executed[0]).toContain('Downloading local engine');
    expect(splash.executed[0]).toContain('19 MB / 55 MB');
    expect(splash.executed[0]).not.toContain('vela-runtime');
  });

  test('is a no-op on a destroyed splash window', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);
    splash.emitDidFinishLoad();
    splash.destroy();

    setSplashStage(splash.surface, 'engine');
    expect(splash.executed).toEqual([]);
  });

  test('keeps non-quantitative boot phases indeterminate', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);
    splash.emitDidFinishLoad();

    setSplashStage(splash.surface, 'starting');
    setSplashStage(splash.surface, 'finishing');

    expect(splash.executed).toHaveLength(2);
    const [firstCall, lastCall] = splash.executed;
    const firstPayload = JSON.parse(
      firstCall.match(/__odSplashSetProgress\((\{.*\})\);/)?.[1] ?? '{}',
    ) as { detail: string; percent: number | null; label: string };
    const lastPayload = JSON.parse(
      lastCall.match(/__odSplashSetProgress\((\{.*\})\);/)?.[1] ?? '{}',
    ) as { detail: string; percent: number | null; label: string };

    expect(firstPayload).toMatchObject({ detail: '', percent: null });
    expect(lastPayload).toMatchObject({ detail: '', percent: null });
    expect(lastPayload.label).toBe('Almost ready');
  });

  test('Standalone owns the single surface until it is ready', () => {
    const splash = createMockSplash();
    registerSplashStageTracking(splash.surface);
    splash.emitDidFinishLoad();

    setSplashStage(splash.surface, 'engine');
    setSplashStandaloneProgress(splash.surface, {
      initialLoad: true,
      progress: { completed: 5, total: 20, unit: 'bytes' },
      schemaVersion: 2,
      stage: 'downloading',
      subject: { id: 'standalone', kind: 'standalone', title: 'Standalone' },
    });
    setSplashStage(splash.surface, 'interface');
    setSplashStandaloneProgress(splash.surface, {
      initialLoad: true,
      schemaVersion: 2,
      stage: 'ready',
      subject: { id: 'standalone', kind: 'standalone', title: 'Standalone' },
    });
    setSplashStage(splash.surface, 'workspace');

    expect(splash.executed).toHaveLength(4);
    expect(splash.executed[1]).toContain('Downloading Standalone');
    expect(splash.executed[1]).toContain('"percent":25');
    expect(splash.executed.some((call) => call.includes('Preparing the interface'))).toBe(false);
    expect(splash.executed[3]).toContain('Opening your workspace');
    expect(splash.executed.every((call) => call.includes('__odSplashSetProgress'))).toBe(true);
  });
});
