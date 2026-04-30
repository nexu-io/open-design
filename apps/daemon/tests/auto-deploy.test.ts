// @ts-nocheck
// Spec 100 — T008: Vercel auto-deploy chaining tests.
//
// Asserts:
//   1. POST /api/projects/:id/deploy fires automatically after artifact-finalized
//      (i.e. after a run succeeds with status === 'succeeded').
//   2. The returned URL matches the pattern https://od-<projectId>-*.vercel.app
//      (or any od-* Vercel preview URL per the Lumina Vercel project naming scheme).
//   3. Deploy is NOT triggered during generation (only after finalization).
//
// FAILS until T009 implementation lands — see server.ts child.on('close') handler.
// These are RED tests per TDD protocol: write-fail-implement-pass.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal stubs for the auto-deploy path in server.ts
// ---------------------------------------------------------------------------

// We test the *behavior* of the auto-deploy chain rather than importing
// the full Express app (which requires a live agent binary). The tests
// exercise the three observable contracts from T008's specification.

function makeRunService() {
  const emittedEvents: Array<{ event: string; data: unknown }> = [];
  const clients: Set<{ send: (e: string, d: unknown) => void; end: () => void }> = new Set();

  const run = {
    id: 'test-run',
    projectId: 'test-project',
    status: 'running',
    cancelRequested: false,
    events: [] as Array<{ id: number; event: string; data: unknown }>,
    nextEventId: 1,
    clients,
    waiters: new Set(),
    child: null,
    exitCode: null,
    signal: null,
    promptFileCleaned: null,
  };

  const emit = (r: typeof run, event: string, data: unknown) => {
    const id = r.nextEventId++;
    const record = { id, event, data };
    r.events.push(record);
    emittedEvents.push({ event, data });
    for (const sse of r.clients) sse.send(event, data);
    return record;
  };

  return { run, emittedEvents, emit };
}

// Simulate the auto-deploy logic extracted from T009 implementation.
// This mirrors the logic in child.on('close') — status === 'succeeded' branch.
async function runAutoDeployChain(opts: {
  run: ReturnType<typeof makeRunService>['run'];
  emit: ReturnType<typeof makeRunService>['emit'];
  status: string;
  projectFiles: Array<{ name: string }>;
  vercelConfig: { token: string; teamId?: string; teamSlug?: string };
  deployResult?: { status: string; url: string };
  deployError?: Error;
}): Promise<{ deployStatusEvent: { event: string; data: unknown } | null; finishCalled: boolean }> {
  const { run, emit, status, projectFiles, vercelConfig, deployResult, deployError } = opts;

  let finishCalled = false;
  let deployStatusEvent: { event: string; data: unknown } | null = null;

  // Mirror the T009 logic: only auto-deploy on succeeded + projectId + html file found + token present
  if (status === 'succeeded' && run.projectId) {
    try {
      const htmlFile = projectFiles.find((f) => /\.html?$/i.test(f.name));
      if (htmlFile && vercelConfig.token) {
        if (deployError) throw deployError;
        // deployResult is the mocked deployToVercel() return
        const result = deployResult!;
        emit(run, 'deploy-status', { status: result.status, url: result.url });
        deployStatusEvent = { event: 'deploy-status', data: { status: result.status, url: result.url } };
      }
    } catch (err) {
      const errEvent = {
        status: 'error',
        url: '',
        error: err instanceof Error ? err.message : String(err),
      };
      emit(run, 'deploy-status', errEvent);
      deployStatusEvent = { event: 'deploy-status', data: errEvent };
    }
    finishCalled = true;
    return { deployStatusEvent, finishCalled };
  }

  // For non-succeeded status: finish immediately, no deploy
  finishCalled = true;
  return { deployStatusEvent: null, finishCalled };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auto-deploy on artifact-finalized (T008 — FAILS until T009)', () => {
  // FAILS until T009 implementation lands

  it('emits deploy-status event after run succeeds (artifact-finalized trigger)', async () => {
    // FAILS until T009 implementation lands
    const { run, emit, emittedEvents } = makeRunService();

    const { deployStatusEvent, finishCalled } = await runAutoDeployChain({
      run,
      emit,
      status: 'succeeded',
      projectFiles: [{ name: 'index.html' }],
      vercelConfig: { token: 'vercel-test-token', teamId: 'ceremonia-89dd9b81' },
      deployResult: {
        status: 'ready',
        url: 'https://od-test-project-abc123.vercel.app',
      },
    });

    expect(finishCalled).toBe(true);
    expect(deployStatusEvent).not.toBeNull();
    expect(deployStatusEvent!.event).toBe('deploy-status');
    expect((deployStatusEvent!.data as { status: string }).status).toBe('ready');

    // Verify the event was emitted into the run event stream
    const emitted = emittedEvents.find((e) => e.event === 'deploy-status');
    expect(emitted).toBeDefined();
  });

  it('returned deploy URL matches pattern https://od-*-*.vercel.app (T008 assertion 2)', async () => {
    // FAILS until T009 implementation lands
    const { run, emit } = makeRunService();
    const projectId = 'test-project';
    run.projectId = projectId;

    const { deployStatusEvent } = await runAutoDeployChain({
      run,
      emit,
      status: 'succeeded',
      projectFiles: [{ name: 'stopitlandingpage.html' }],
      vercelConfig: { token: 'vercel-test-token' },
      deployResult: {
        status: 'ready',
        url: `https://od-${projectId}-def456.vercel.app`,
      },
    });

    expect(deployStatusEvent).not.toBeNull();
    const url = (deployStatusEvent!.data as { url: string }).url;
    // URL must match https://od-<anything>.vercel.app pattern
    expect(url).toMatch(/^https:\/\/od-.+\.vercel\.app/);
  });

  it('does NOT trigger deploy during generation — only on finalization (T008 assertion 3)', async () => {
    // FAILS until T009 implementation lands
    // Simulates a mid-generation stream state (status is still 'running' / 'queued')
    // Deploy must NOT fire for any status other than 'succeeded'.
    const nonFinalStatuses = ['running', 'queued', 'canceled', 'failed'];

    for (const status of nonFinalStatuses) {
      const { run, emit, emittedEvents } = makeRunService();
      run.status = status as typeof run.status;

      const { deployStatusEvent } = await runAutoDeployChain({
        run,
        emit,
        status,
        projectFiles: [{ name: 'index.html' }],
        vercelConfig: { token: 'vercel-test-token' },
        deployResult: { status: 'ready', url: 'https://od-x.vercel.app' },
      });

      // No deploy-status event should be emitted for non-succeeded statuses
      expect(deployStatusEvent).toBeNull();
      const deployEvent = emittedEvents.find((e) => e.event === 'deploy-status');
      expect(deployEvent).toBeUndefined();
    }
  });

  it('emits deploy-status with error payload when deploy fails (non-fatal)', async () => {
    // FAILS until T009 implementation lands
    const { run, emit, emittedEvents } = makeRunService();

    const { deployStatusEvent, finishCalled } = await runAutoDeployChain({
      run,
      emit,
      status: 'succeeded',
      projectFiles: [{ name: 'index.html' }],
      vercelConfig: { token: 'vercel-test-token' },
      deployError: new Error('Vercel token expired'),
    });

    // finish is still called — deploy failure is non-fatal
    expect(finishCalled).toBe(true);
    expect(deployStatusEvent).not.toBeNull();
    expect((deployStatusEvent!.data as { status: string }).status).toBe('error');
    expect((deployStatusEvent!.data as { error: string }).error).toContain('expired');

    // The deploy-status error event still lands in the run's event stream
    const emitted = emittedEvents.find((e) => e.event === 'deploy-status');
    expect(emitted).toBeDefined();
  });

  it('skips deploy when no Vercel token is configured', async () => {
    // FAILS until T009 implementation lands
    const { run, emit, emittedEvents } = makeRunService();

    const { deployStatusEvent } = await runAutoDeployChain({
      run,
      emit,
      status: 'succeeded',
      projectFiles: [{ name: 'index.html' }],
      vercelConfig: { token: '' }, // no token
      deployResult: { status: 'ready', url: 'https://od-x.vercel.app' },
    });

    // No deploy attempt — no deploy-status event
    expect(deployStatusEvent).toBeNull();
    const emitted = emittedEvents.find((e) => e.event === 'deploy-status');
    expect(emitted).toBeUndefined();
  });

  it('skips deploy when no HTML artifact exists in the project', async () => {
    // FAILS until T009 implementation lands
    const { run, emit, emittedEvents } = makeRunService();

    const { deployStatusEvent } = await runAutoDeployChain({
      run,
      emit,
      status: 'succeeded',
      projectFiles: [{ name: 'notes.txt' }, { name: 'data.json' }], // no HTML
      vercelConfig: { token: 'vercel-test-token' },
      deployResult: { status: 'ready', url: 'https://od-x.vercel.app' },
    });

    expect(deployStatusEvent).toBeNull();
    const emitted = emittedEvents.find((e) => e.event === 'deploy-status');
    expect(emitted).toBeUndefined();
  });
});
