/**
 * Artifact quiet-period plumbing (#1451).
 *
 * Live-artifact registration now feeds back into the chat-run
 * inactivity watchdog: once the deliverable exists, the daemon
 * switches to a shorter "quiet period" timeout instead of the
 * 10-minute pre-artifact ceiling, and a watchdog trip after the
 * artifact is in place is treated as "agent finished and went idle"
 * rather than "agent stalled with nothing to show".
 *
 * The full watchdog state machine sits inside a deep closure in
 * `startServer`, so these tests pin the emit/handle plumbing at the
 * boundary (via the `__forTest*` exports) and pin the env resolver
 * directly. The integration story — fake agent + live-artifact
 * create over HTTP + run-status check — would require setting up a
 * project, minting a tool token, and reproducing the chat-run path;
 * that is covered by manual verification in the PR body.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __forTestChatRunHandles,
  __forTestEmitLiveArtifactEvent,
  applyClaudeStreamJsonRunBookkeeping,
  classifyChatRunCloseStatus,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
} from '../src/server.js';

const ENV_KEY = 'OD_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS';
const ONE_MINUTE_MS = 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

describe('resolveChatRunArtifactQuietPeriodMs', () => {
  const originalEnv = process.env[ENV_KEY];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it('returns the 1-minute default when no env override is set', () => {
    delete process.env[ENV_KEY];
    expect(resolveChatRunArtifactQuietPeriodMs()).toBe(ONE_MINUTE_MS);
  });

  it('honors the env override when it is a finite number', () => {
    process.env[ENV_KEY] = '5000';
    expect(resolveChatRunArtifactQuietPeriodMs()).toBe(5_000);
  });

  it('falls back to the default when the env value is not parseable as a number', () => {
    process.env[ENV_KEY] = 'not-a-number';
    expect(resolveChatRunArtifactQuietPeriodMs()).toBe(ONE_MINUTE_MS);
  });

  it('clamps an oversized env override to the 24-hour ceiling (so Node does not silently downgrade the timer to 1ms)', () => {
    process.env[ENV_KEY] = String(TWENTY_FOUR_HOURS_MS * 100);
    expect(resolveChatRunArtifactQuietPeriodMs()).toBe(TWENTY_FOUR_HOURS_MS);
  });

  it('floors negative env overrides to 0 rather than scheduling a negative-delay timer', () => {
    process.env[ENV_KEY] = '-1000';
    expect(resolveChatRunArtifactQuietPeriodMs()).toBe(0);
  });

  it('honors env=0 to disable the artifact quiet-period entirely', () => {
    process.env[ENV_KEY] = '0';
    expect(resolveChatRunArtifactQuietPeriodMs()).toBe(0);
  });
});

describe('live-artifact create → chat-run handle hook (#1451)', () => {
  afterEach(() => {
    // Avoid leaking handles into other test files that touch the same
    // server-internal registry.
    __forTestChatRunHandles.clear();
  });

  it('calls noteArtifactRegistered on the registered handle when emit fires with action="created"', () => {
    // The boundary contract: emitLiveArtifactEvent must route a
    // `created` action back into the chat run's quiet-period switch,
    // not just into the project SSE stream. Without this hook the
    // watchdog would never shorten, the user would still wait the
    // full 10 minutes, and `Working` would still get stuck after the
    // deliverable was already in the chat.
    const noteArtifactRegistered = vi.fn();
    __forTestChatRunHandles.set('run-1', { noteArtifactRegistered });

    __forTestEmitLiveArtifactEvent(
      { runId: 'run-1', projectId: 'project-1' },
      'created',
      { id: 'artifact-1', projectId: 'project-1', title: 'Daily digest' },
    );

    expect(noteArtifactRegistered).toHaveBeenCalledTimes(1);
  });

  it('does not call noteArtifactRegistered on "updated" — only the first registration shortens the watchdog', () => {
    // An updated artifact is the same deliverable being rewritten,
    // not a fresh handoff. The watchdog already switched the first
    // time `created` fired (if it ever did); the chat run's
    // own noteAgentActivity path handles activity-driven resets
    // separately. Re-firing the hook here would be a no-op at best
    // and a double-arming bug at worst.
    const noteArtifactRegistered = vi.fn();
    __forTestChatRunHandles.set('run-1', { noteArtifactRegistered });

    __forTestEmitLiveArtifactEvent(
      { runId: 'run-1', projectId: 'project-1' },
      'updated',
      { id: 'artifact-1', projectId: 'project-1' },
    );
    __forTestEmitLiveArtifactEvent(
      { runId: 'run-1', projectId: 'project-1' },
      'deleted',
      { id: 'artifact-1', projectId: 'project-1' },
    );

    expect(noteArtifactRegistered).not.toHaveBeenCalled();
  });

  it('does not throw when no chat-run handle is registered for the runId (live-artifact emit from /api/projects path with no chat run)', () => {
    expect(() =>
      __forTestEmitLiveArtifactEvent(
        { runId: 'no-such-run', projectId: 'project-1' },
        'created',
        { id: 'artifact-1', projectId: 'project-1' },
      ),
    ).not.toThrow();
  });

  it('does not throw when emit fires without a runId on the grant (project-scoped live-artifact emit)', () => {
    // The same `emitLiveArtifactEvent` is used by background refresh
    // routes where there is no owning chat run; passing a grant
    // without a runId must be a no-op for the handle path.
    const noteArtifactRegistered = vi.fn();
    __forTestChatRunHandles.set('run-1', { noteArtifactRegistered });

    expect(() =>
      __forTestEmitLiveArtifactEvent(
        { projectId: 'project-1' },
        'created',
        { id: 'artifact-1', projectId: 'project-1' },
      ),
    ).not.toThrow();
    expect(noteArtifactRegistered).not.toHaveBeenCalled();
  });

  it('does not propagate exceptions thrown from the handle hook (the artifact emit must not fail because of a broken consumer)', () => {
    // The chat run's noteArtifactRegistered touches local timer
    // state; a future refactor could throw if e.g. the timer was
    // already cleared mid-shutdown. The artifact-create endpoint
    // already wrote the deliverable, so the HTTP response must not
    // 500 because of a downstream hook failure.
    __forTestChatRunHandles.set('run-1', {
      noteArtifactRegistered: () => {
        throw new Error('boom');
      },
    });
    expect(() =>
      __forTestEmitLiveArtifactEvent(
        { runId: 'run-1', projectId: 'project-1' },
        'created',
        { id: 'artifact-1', projectId: 'project-1' },
      ),
    ).not.toThrow();
  });
});

describe('resolveActiveInactivityTimeoutMs (#1451 quiet-period switch)', () => {
  const TEN_MIN = 10 * 60 * 1000;
  const ONE_MIN = 60 * 1000;

  it('returns the pre-artifact ceiling when no artifact has been registered yet', () => {
    expect(
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs: TEN_MIN,
        artifactQuietPeriodMs: ONE_MIN,
        artifactRegistered: false,
      }),
    ).toBe(TEN_MIN);
  });

  it('switches to the quiet ceiling once an artifact has been registered', () => {
    expect(
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs: TEN_MIN,
        artifactQuietPeriodMs: ONE_MIN,
        artifactRegistered: true,
      }),
    ).toBe(ONE_MIN);
  });

  it('treats artifactQuietPeriodMs=0 as "disable the quiet period" — keeps the pre-artifact ceiling after registration', () => {
    // The bug from the #2585 review: when an operator sets
    // OD_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS=0, the prior implementation
    // dropped the active ceiling to 0 once the artifact was registered,
    // which made noteAgentActivity() early-return without rescheduling,
    // stranding the pre-artifact timer. Falling back to the pre-artifact
    // ceiling instead means subsequent activity keeps the timer fresh
    // and the existing pre-artifact stalled-error path still works.
    expect(
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs: TEN_MIN,
        artifactQuietPeriodMs: 0,
        artifactRegistered: true,
      }),
    ).toBe(TEN_MIN);
  });

  it('keeps a 0 pre-artifact ceiling at 0 when no artifact is registered (watchdog fully disabled)', () => {
    expect(
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs: 0,
        artifactQuietPeriodMs: ONE_MIN,
        artifactRegistered: false,
      }),
    ).toBe(0);
  });

  it('honors a 0 pre-artifact ceiling after artifact registration when quiet is also 0 (both disabled)', () => {
    expect(
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs: 0,
        artifactQuietPeriodMs: 0,
        artifactRegistered: true,
      }),
    ).toBe(0);
  });
});

describe('classifyChatRunCloseStatus (#1451 close-handler classification)', () => {
  const base = {
    cancelRequested: false,
    code: 0 as number | null,
    signal: null as string | null,
    acpCleanCompletion: false,
    artifactQuietShutdownRequested: false,
    turnCompletedCleanly: false,
  };

  it('returns canceled when cancelRequested wins regardless of other signals', () => {
    expect(
      classifyChatRunCloseStatus({ ...base, cancelRequested: true, code: 0 }),
    ).toBe('canceled');
    expect(
      classifyChatRunCloseStatus({
        ...base,
        cancelRequested: true,
        code: null,
        signal: 'SIGTERM',
        artifactQuietShutdownRequested: true,
      }),
    ).toBe('canceled');
  });

  it('returns succeeded on clean exit code 0', () => {
    expect(classifyChatRunCloseStatus({ ...base, code: 0 })).toBe('succeeded');
  });

  it('returns succeeded on ACP forced shutdown (SIGTERM + clean ACP completion)', () => {
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: null,
        signal: 'SIGTERM',
        acpCleanCompletion: true,
      }),
    ).toBe('succeeded');
  });

  it('returns failed when ACP shutdown was via SIGKILL (not the narrow override)', () => {
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: null,
        signal: 'SIGKILL',
        acpCleanCompletion: true,
      }),
    ).toBe('failed');
  });

  it('returns succeeded when the watchdog-initiated quiet-period SIGTERM fires', () => {
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: null,
        signal: 'SIGTERM',
        artifactQuietShutdownRequested: true,
      }),
    ).toBe('succeeded');
  });

  it('returns succeeded when the watchdog quiet-period escalates to SIGKILL (kill-grace timer)', () => {
    // After SIGTERM the inactivityKillGraceMs timer escalates to
    // SIGKILL if the child has not exited yet. Both signals belong to
    // the same daemon-initiated shutdown, so the close handler must
    // accept either when the flag is set.
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: null,
        signal: 'SIGKILL',
        artifactQuietShutdownRequested: true,
      }),
    ).toBe('succeeded');
  });

  it('returns failed when SIGTERM/SIGKILL arrive but no quiet-period shutdown was requested', () => {
    // The reviewer-correctness fix: external `kill`, OOM, container
    // shutdown after a successful artifact registration must NOT be
    // silently reclassified as `succeeded`. The previous version only
    // checked `artifactRegistered` (true here, implied via the flag
    // being false because we never called failForInactivity), which
    // would have flipped these to succeeded incorrectly.
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: null,
        signal: 'SIGTERM',
        artifactQuietShutdownRequested: false,
      }),
    ).toBe('failed');
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: null,
        signal: 'SIGKILL',
        artifactQuietShutdownRequested: false,
      }),
    ).toBe('failed');
  });

  it('returns failed on a non-zero exit code when the turn never completed (regardless of the quiet-period flag)', () => {
    // The quiet-period override is signal-only; a non-zero process exit
    // *before the model emitted a clean terminal turn* is a real failure
    // (agent CLI bug, model error, mid-turn crash) and must propagate as
    // such. `turnCompletedCleanly` stays false here — this is the genuine
    // failure case the post-completion carve-out below must NOT swallow.
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: 1,
        signal: null,
        artifactQuietShutdownRequested: true,
      }),
    ).toBe('failed');
  });

  it('returns failed on the standard failure shape (non-zero exit, turn not completed, no special flags)', () => {
    expect(
      classifyChatRunCloseStatus({ ...base, code: 1, signal: null }),
    ).toBe('failed');
  });

  // Issue #3372: post-completion hook failure must not fail the run.
  //
  // Reproduction of the screenshot bug. The daemon spawns `claude`,
  // the model emits a clean terminal `turn_end`/`usage` (so the daemon
  // closes stdin and sets `turnCompletedCleanly`), and only THEN a
  // SessionEnd hook (e.g. the Honcho memory plugin) exits non-zero,
  // which makes the `claude` process itself exit with code 1. That
  // post-result exit is a teardown artifact, not a generation failure —
  // the deliverable was already produced. This is the same family as
  // the `acpForcedShutdown` and `artifactQuietShutdown` carve-outs:
  // "the work completed; the odd exit is teardown noise."
  it('returns succeeded on a non-zero exit when the turn already completed cleanly (post-result hook failure)', () => {
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: 1,
        signal: null,
        turnCompletedCleanly: true,
      }),
    ).toBe('succeeded');
  });

  it('returns succeeded on a signal death after a clean turn completion (hook killed during teardown)', () => {
    // A SessionEnd hook that hangs past its own grace window can be
    // SIGKILLed during teardown after the turn already completed. Same
    // invariant: a clean terminal turn was emitted, so the late signal
    // exit is teardown noise, not a generation failure.
    expect(
      classifyChatRunCloseStatus({
        ...base,
        code: null,
        signal: 'SIGKILL',
        turnCompletedCleanly: true,
      }),
    ).toBe('succeeded');
  });

  it('still prefers canceled over a clean-completion non-zero exit when the user cancelled', () => {
    // Cancel intent always wins; a post-cancel hook exit must not
    // reclassify a user-cancelled run as succeeded.
    expect(
      classifyChatRunCloseStatus({
        ...base,
        cancelRequested: true,
        code: 1,
        signal: null,
        turnCompletedCleanly: true,
      }),
    ).toBe('canceled');
  });
});

describe('applyClaudeStreamJsonRunBookkeeping', () => {
  it('records clean completion when the host-answer path already closed stdin', () => {
    const run = {
      stdinOpen: false,
      pendingHostAnswers: new Set<string>(),
      turnCompletedCleanly: false,
      child: {
        stdin: {
          destroyed: false,
          end: vi.fn(),
        },
      },
    };

    applyClaudeStreamJsonRunBookkeeping(run, {
      type: 'turn_end',
      stopReason: 'end_turn',
    });

    expect(run.turnCompletedCleanly).toBe(true);
    expect(run.child.stdin.end).not.toHaveBeenCalled();
  });

  it('keeps waiting when a terminal event arrives with host answers still pending', () => {
    const run = {
      stdinOpen: true,
      pendingHostAnswers: new Set(['toolu_1']),
      turnCompletedCleanly: false,
      child: {
        stdin: {
          destroyed: false,
          end: vi.fn(),
        },
      },
    };

    applyClaudeStreamJsonRunBookkeeping(run, {
      type: 'turn_end',
      stopReason: 'end_turn',
    });

    expect(run.turnCompletedCleanly).toBe(false);
    expect(run.stdinOpen).toBe(true);
    expect(run.child.stdin.end).not.toHaveBeenCalled();
  });
});
