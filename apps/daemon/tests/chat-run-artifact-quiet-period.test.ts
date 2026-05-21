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
