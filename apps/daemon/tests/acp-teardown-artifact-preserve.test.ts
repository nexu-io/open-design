/**
 * Regression test for #5528: ACP child_close / stream error after the run
 * has already written artifacts should preserve the run as 'succeeded'
 * instead of marking it a plain 'failed'.
 *
 * The close-handler logic lives as `salvageTeardownWithArtifact` inside a
 * deep closure in `startServer`, so these tests pin the classification
 * boundary at the export level (classifyChatRunCloseStatus + runSideEffectsForRun
 * on the same `run.events` shape the close handler reads).
 *
 * #5528 behaviour matrix:
 *   artifactWriteSeen=false, liveArtifactSeen=false  →  failed (existing)
 *   artifactWriteSeen=true,  liveArtifactSeen=false  →  succeeded + diagnostic
 *   artifactWriteSeen=false, liveArtifactSeen=true   →  succeeded + diagnostic
 */

import { describe, expect, it } from 'vitest';
import {
  classifyChatRunCloseStatus,
  shouldSalvageLateTeardown,
} from '../src/runtimes/chat-run-lifecycle.js';
import {
  runSideEffectsForRun,
} from '../src/runtimes/run-lifecycle-analytics.js';

describe('classifyChatRunCloseStatus — plain exit', () => {
  const base = {
    cancelRequested: false,
    code: 0,
    signal: null,
    acpCleanCompletion: false,
    artifactQuietShutdownRequested: false,
    turnCompletedCleanly: false,
  };

  it('exit 0 with no artifacts → succeeded', () => {
    expect(classifyChatRunCloseStatus({ ...base, code: 0, artifactProducedThisRun: false }))
      .toBe('succeeded');
  });

  it('exit non-zero, no artifacts, not canceled → failed', () => {
    expect(classifyChatRunCloseStatus({ ...base, code: 1, artifactProducedThisRun: false }))
      .toBe('failed');
  });

  it('exit non-zero WITH artifacts, not canceled → succeeded (the #5528 path)', () => {
    expect(classifyChatRunCloseStatus({ ...base, code: 1, artifactProducedThisRun: true }))
      .toBe('succeeded');
  });

  it('canceled → canceled regardless of artifacts', () => {
    expect(classifyChatRunCloseStatus({ ...base, cancelRequested: true, code: 1, artifactProducedThisRun: true }))
      .toBe('canceled');
    expect(classifyChatRunCloseStatus({ ...base, cancelRequested: true, code: 1, artifactProducedThisRun: false }))
      .toBe('canceled');
  });
});

describe('shouldSalvageLateTeardown — #5528 precise gate', () => {
  // Verifies mrcfps blocker 2: salvage only triggers on verified late
  // teardown conditions, NOT on every fatal/stream error after an artifact.
  it('returns false when no artifacts were produced', () => {
    expect(shouldSalvageLateTeardown({ code: 0, signal: null, artifactWriteSeen: false, liveArtifactSeen: false }))
      .toBe(false);
    expect(shouldSalvageLateTeardown({ code: null, signal: 'SIGTERM', artifactWriteSeen: false, liveArtifactSeen: false }))
      .toBe(false);
    expect(shouldSalvageLateTeardown({ code: 130, signal: null, artifactWriteSeen: false, liveArtifactSeen: false }))
      .toBe(false);
  });

  it('returns true for verified teardown conditions with artifacts', () => {
    expect(shouldSalvageLateTeardown({ code: 0, signal: null, artifactWriteSeen: true, liveArtifactSeen: false }))
      .toBe(true);
    expect(shouldSalvageLateTeardown({ code: null, signal: 'SIGTERM', artifactWriteSeen: false, liveArtifactSeen: true }))
      .toBe(true);
    expect(shouldSalvageLateTeardown({ code: 130, signal: null, artifactWriteSeen: true, liveArtifactSeen: false }))
      .toBe(true);
  });

  it('returns false for real provider/protocol errors with partial artifacts', () => {
    // These must NOT be salvaged — they should go through the normal failure
    // path so users see the real provider error.
    expect(shouldSalvageLateTeardown({ code: 1, signal: null, artifactWriteSeen: true, liveArtifactSeen: false }))
      .toBe(false);
    expect(shouldSalvageLateTeardown({ code: 2, signal: 'SIGKILL', artifactWriteSeen: true, liveArtifactSeen: false }))
      .toBe(false);
    expect(shouldSalvageLateTeardown({ code: null, signal: 'SIGKILL', artifactWriteSeen: true, liveArtifactSeen: false }))
      .toBe(false);
    expect(shouldSalvageLateTeardown({ code: null, signal: null, artifactWriteSeen: true, liveArtifactSeen: false }))
      .toBe(false);
    expect(shouldSalvageLateTeardown({ code: 137, signal: 'SIGKILL', artifactWriteSeen: true, liveArtifactSeen: false }))
      .toBe(false);
  });
});

describe('classifyChatRunCloseStatus — ACP forced shutdown', () => {
  const acpBase = {
    cancelRequested: false,
    acpCleanCompletion: true,
    artifactQuietShutdownRequested: false,
    turnCompletedCleanly: false,
    artifactProducedThisRun: false,
  };

  it('ACP clean + SIGTERM + null code → succeeded', () => {
    expect(classifyChatRunCloseStatus({
      ...acpBase, code: null, signal: 'SIGTERM',
    })).toBe('succeeded');
  });

  it('ACP clean + exit 130 → succeeded', () => {
    expect(classifyChatRunCloseStatus({
      ...acpBase, code: 130, signal: null,
    })).toBe('succeeded');
  });
});

describe('runSideEffectsForRun — event-based detection', () => {
  // The records' shape (from server.ts emit) is `{ event, data: {...} }`.
  it('returns liveArtifactSeen=true when events contain a live_artifact data event', () => {
    const run = {
      events: [
        { event: 'agent', data: { type: 'log', level: 'info', message: 'start' } },
        { event: 'agent', data: { type: 'live_artifact', name: 'index.html', path: '/tmp/index.html' } },
        { event: 'agent', data: { type: 'usage', tokens: 100 } },
      ],
    };
    const se = runSideEffectsForRun(run);
    expect(se.liveArtifactSeen).toBe(true);
    expect(se.artifactWriteSeen).toBe(false);
  });

  it('returns liveArtifactSeen=true for a top-level live_artifact event', () => {
    const run = {
      events: [
        { event: 'live_artifact', data: { path: '/tmp/a.html' } },
      ],
    };
    const se = runSideEffectsForRun(run);
    expect(se.liveArtifactSeen).toBe(true);
  });

  it('returns artifactWriteSeen=true for a direct artifact data event', () => {
    const run = {
      events: [
        { event: 'agent', data: { type: 'artifact', path: '/tmp/out.html' } },
      ],
    };
    const se = runSideEffectsForRun(run);
    expect(se.artifactWriteSeen).toBe(true);
  });

  it('returns artifactWriteSeen=false when no artifact events are present', () => {
    const run = {
      events: [
        { event: 'agent', data: { type: 'log', level: 'info', message: 'start' } },
        { event: 'agent', data: { type: 'session_update', status: 'running' } },
      ],
    };
    const se = runSideEffectsForRun(run);
    expect(se.artifactWriteSeen).toBe(false);
    expect(se.liveArtifactSeen).toBe(false);
  });

  it('prefers sideEffectLedger over scanning events', () => {
    const ledger: import('../src/runtimes/run-lifecycle-analytics.js').RunSideEffectLedger = {
      userVisibleOutputSeen: false,
      toolCallSeen: false,
      directArtifactEventSeen: false,
      liveArtifactSeen: false,
      artifactPaths: new Set(['/tmp/a.html']),
      designSystemFileWritten: false,
      previewModulePaths: new Set(),
      pendingWritePathById: new Map(),
    };
    const run = {
      sideEffectLedger: ledger,
      events: [] as unknown[],
    };
    const se = runSideEffectsForRun(run);
    // sideEffectLedger.artifactPaths.size > 0 → artifactWriteSeen=true
    expect(se.artifactWriteSeen).toBe(true);
  });
});
