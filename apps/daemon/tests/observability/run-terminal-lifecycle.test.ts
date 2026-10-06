import { describe, expect, it } from 'vitest';

import {
  beginPosthogTerminalDelivery,
  boundedRuntimeGenerationId,
  classifyMatureUnfinishedRun,
  deriveRunTerminationOrigin,
  finalizePosthogTerminalDelivery,
  recordIgnoredTerminalClaim,
  terminalLifecycleSnapshot,
  terminalPersistenceErrorType,
} from '../../src/observability/run-terminal-lifecycle.js';

function lifecycle(
  overrides: Partial<Parameters<typeof terminalLifecycleSnapshot>[0]> = {},
) {
  return terminalLifecycleSnapshot({
    terminalPersistence: { status: 'acknowledged', errorType: null },
    ...overrides,
  });
}

describe('run terminal lifecycle observability', () => {
  it.each([
    [{ cancelOrigin: 'user_stop' as const }, 'user_cancel'],
    [{ cancelOrigin: 'project_cleanup' as const }, 'project_cleanup'],
    [{ terminalTrigger: 'first_output_deadline' as const }, 'watchdog_cleanup'],
    [{ terminalTrigger: 'inactivity_watchdog' as const }, 'watchdog_cleanup'],
    [{ terminalTrigger: 'acp_stage_timeout' as const }, 'watchdog_cleanup'],
    [{ cancelOrigin: 'daemon_shutdown' as const }, 'unknown'],
    [{ terminalTrigger: 'daemon_restart' as const }, 'unknown'],
    [{}, 'unknown'],
  ])('derives only evidence-backed termination origin from %j', (input, expected) => {
    expect(deriveRunTerminationOrigin(input)).toBe(expected);
  });

  it('accepts only an anonymous Vela-owned UUID runtime generation', () => {
    expect(boundedRuntimeGenerationId('0F2D4D9E-F034-4ED5-8330-314BD1D525CC'))
      .toBe('0f2d4d9e-f034-4ed5-8330-314bd1d525cc');
    expect(boundedRuntimeGenerationId('pid=1234')).toBeNull();
    expect(boundedRuntimeGenerationId('/local/path')).toBeNull();
    expect(boundedRuntimeGenerationId('not-a-uuid')).toBeNull();
  });

  it.each([
    ['still_running', { runStatus: 'running' as const }],
    ['terminated_persistence_missing', {
      runStatus: 'terminal' as const,
      terminalLifecycle: lifecycle({
        terminalPersistence: { status: 'failed', errorType: 'storage_full' },
      }),
    }],
    ['terminal_persisted_posthog_failed', {
      runStatus: 'terminal' as const,
      terminalLifecycle: lifecycle({
        terminalPersistence: { status: 'acknowledged', errorType: null },
        posthogDelivery: {
          status: 'failed', acknowledgement: 'none', attemptCount: 1,
          errorType: 'enqueue_failed',
        },
      }),
    }],
    ['recovery_pending', {
      runStatus: 'terminal' as const,
      terminalLifecycle: lifecycle({
        terminalPersistence: { status: 'acknowledged', errorType: null },
        posthogDelivery: {
          status: 'in_flight', acknowledgement: 'none', attemptCount: 1,
          errorType: null,
        },
      }),
    }],
    ['permanently_missing', {
      runStatus: 'terminal' as const,
      terminalLifecycle: lifecycle({
        terminalIntegrity: 'permanently_missing',
        terminalPersistence: { status: 'unknown', errorType: null },
      }),
    }],
    ['unknown', { runStatus: 'unknown' as const }],
  ])('classifies mature unfinished state %s without changing the denominator', (expected, input) => {
    expect(classifyMatureUnfinishedRun(input)).toBe(expected);
  });

  it.each(['failed', 'in_flight'] as const)(
    'keeps unfinished state unknown when persistence is unknown and delivery is %s',
    (deliveryStatus) => {
      const snapshot = terminalLifecycleSnapshot({
        terminalPersistence: { status: 'unknown', errorType: null },
      });
      const afterDelivery = deliveryStatus === 'failed'
        ? finalizePosthogTerminalDelivery(snapshot, {
            status: 'failed',
            acknowledgement: 'none',
            errorType: 'enqueue_failed',
          })
        : beginPosthogTerminalDelivery(snapshot);

      expect(afterDelivery.unfinishedState).toBe('unknown');
    },
  );

  it.each([
    ['EACCES', 'permission_denied'],
    ['EROFS', 'read_only_storage'],
    ['ENOSPC', 'storage_full'],
    ['EDQUOT', 'storage_full'],
    ['EIO', 'storage_unavailable'],
    ['UNLISTED', 'unknown'],
  ])('maps storage error %s to bounded type %s', (code, expected) => {
    expect(terminalPersistenceErrorType(Object.assign(new Error('sensitive detail'), { code })))
      .toBe(expected);
  });

  it('keeps late integrity when a matching duplicate arrives afterward', () => {
    const afterLate = recordIgnoredTerminalClaim(lifecycle(), 'late');
    const afterDuplicate = recordIgnoredTerminalClaim(afterLate, 'duplicate');

    expect(afterDuplicate).toMatchObject({
      terminalIntegrity: 'late',
      duplicateTerminalCount: 1,
      lateTerminalCount: 1,
    });
  });

  it('upgrades duplicate integrity when a late claim arrives afterward', () => {
    const afterDuplicate = recordIgnoredTerminalClaim(lifecycle(), 'duplicate');
    const afterLate = recordIgnoredTerminalClaim(afterDuplicate, 'late');

    expect(afterLate).toMatchObject({
      terminalIntegrity: 'late',
      duplicateTerminalCount: 1,
      lateTerminalCount: 1,
    });
  });

  it.each([
    'reconciled',
    'overwritten',
    'permanently_missing',
    'post_terminal_activity',
  ] as const)('preserves hydrated %s integrity while counting ignored claims', (terminalIntegrity) => {
    const afterDuplicate = recordIgnoredTerminalClaim(
      lifecycle({ terminalIntegrity }),
      'duplicate',
    );
    const afterLate = recordIgnoredTerminalClaim(afterDuplicate, 'late');

    expect(afterLate).toMatchObject({
      terminalIntegrity,
      duplicateTerminalCount: 1,
      lateTerminalCount: 1,
    });
  });
});
