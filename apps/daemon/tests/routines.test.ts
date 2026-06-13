import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  nextRunAtForSchedule,
  RoutineService,
  type Routine,
  type RoutineRun,
  type RoutineRunHandlerStart,
  validateSchedule,
  validateTarget,
} from '../src/routines.js';

function partsIn(timezone: string, at: Date): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  if (out.hour === '24') out.hour = '00';
  return out;
}

class SharedRoutinePersistence {
  readonly runs: RoutineRun[] = [];
  readonly claimedSlots = new Set<string>();
  failScheduledInsertAttempts = 0;

  constructor(private readonly routines: Routine[]) {}

  list(): Routine[] {
    return this.routines;
  }

  insertRun(run: RoutineRun, options: { scheduledSlotAt?: number } = {}): boolean {
    if (options.scheduledSlotAt != null) {
      if (this.failScheduledInsertAttempts > 0) {
        this.failScheduledInsertAttempts -= 1;
        throw new Error('scheduled slot claim unavailable');
      }
      const key = `${run.routineId}:${options.scheduledSlotAt}`;
      if (this.claimedSlots.has(key)) return false;
      this.claimedSlots.add(key);
    }
    this.runs.push(run);
    return true;
  }

  updateRun(id: string, patch: Partial<RoutineRun>): void {
    const run = this.runs.find((candidate) => candidate.id === id);
    if (run) Object.assign(run, patch);
  }

  getLatestRun(routineId: string): RoutineRun | null {
    return this.runs.find((run) => run.routineId === routineId) ?? null;
  }
}

function fixtureRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
    name: 'Daily brief',
    prompt: 'Summarize the day',
    schedule: { kind: 'hourly', minute: 1 },
    target: { mode: 'create_each_run' },
    skillId: null,
    agentId: null,
    context: {},
    enabled: true,
    nextRunAt: null,
    lastRun: null,
    createdAt: Date.UTC(2026, 4, 17, 0, 0),
    updatedAt: Date.UTC(2026, 4, 17, 0, 0),
    ...overrides,
  };
}

function handlerStart(agentRunId: string, onStart?: () => void): RoutineRunHandlerStart {
  const start = onStart ? { start: onStart } : {};
  return {
    projectId: 'project-1',
    conversationId: 'conversation-1',
    agentRunId,
    completion: Promise.resolve({ status: 'succeeded' }),
    ...start,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('nextRunAtForSchedule DST handling', () => {
  it('does not fire before the requested wall time on a spring-forward gap day', () => {
    // 2026-03-08 in America/New_York: clocks jump 02:00 EST → 03:00 EDT, so
    // a daily routine scheduled at 02:30 has no valid wall clock that day.
    // Prior to the fix, tzWallToUtc returned 06:30Z which renders back as
    // 01:30 EST — an hour before the requested time. The fixed scheduler
    // must instead advance to a valid post-gap instant on the same day.
    const now = new Date('2026-03-08T05:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '02:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('America/New_York', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('03');
    expect(parts.day).toBe('08');

    const wallMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    expect(wallMinutes).toBeGreaterThanOrEqual(2 * 60 + 30);
  });

  it('still fires the second occurrence when the wall time itself is in the repeated hour', () => {
    // 2026-11-01 in America/New_York: 01:30 happens twice — first at
    // 05:30Z (EDT) and again at 06:30Z (EST) after clocks fall back.
    // If the daemon checks at 05:45Z (between the two occurrences),
    // a daily routine at 01:30 must still fire today at 06:30Z, not
    // skip to 2026-11-02 because the EDT instance is already past.
    const now = new Date('2026-11-01T05:45:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '01:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    expect(next.getTime()).toBe(Date.UTC(2026, 10, 1, 6, 30));
    const parts = partsIn('America/New_York', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('11');
    expect(parts.day).toBe('01');
    expect(parts.hour).toBe('01');
    expect(parts.minute).toBe('30');
  });

  it('returns the first occurrence in the repeated hour when now is before either instance', () => {
    // Before 05:30Z on the fall-back day, the next 01:30 NY is the
    // first (EDT) occurrence at 05:30Z.
    const now = new Date('2026-11-01T05:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '01:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.getTime()).toBe(Date.UTC(2026, 10, 1, 5, 30));
  });

  it('selects the post-fall-back instance on a fall-back day with ambiguous wall times', () => {
    // 2026-11-01 in America/New_York: 01:30 happens twice (EDT and EST).
    // For a daily routine at 02:30, the only valid instance is 02:30 EST,
    // which renders to 07:30Z. Make sure we pick that one regardless of
    // candidate ordering inside tzWallToUtc.
    const now = new Date('2026-11-01T05:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '02:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('America/New_York', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('11');
    expect(parts.day).toBe('01');
    expect(parts.hour).toBe('02');
    expect(parts.minute).toBe('30');
  });

  it('returns the requested wall time on non-transition days', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '02:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('America/New_York', next);
    expect(parts.hour).toBe('02');
    expect(parts.minute).toBe('30');
  });

  it('returns the next hourly slot strictly after now', () => {
    const now = new Date('2026-05-13T10:45:30Z');
    const next = nextRunAtForSchedule({ kind: 'hourly', minute: 15 }, now);
    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.toISOString()).toBe('2026-05-13T11:15:00.000Z');
  });

  it('returns the next weekday occurrence for weekday schedules', () => {
    const now = new Date('2026-05-16T00:00:00Z'); // Saturday
    const next = nextRunAtForSchedule(
      { kind: 'weekdays', time: '09:00', timezone: 'UTC' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('UTC', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('05');
    expect(parts.day).toBe('18');
    expect(parts.hour).toBe('09');
    expect(parts.minute).toBe('00');
  });

  it('returns the next requested weekday for weekly schedules', () => {
    const now = new Date('2026-05-13T10:00:00Z'); // Wednesday
    const next = nextRunAtForSchedule(
      { kind: 'weekly', weekday: 5, time: '08:30', timezone: 'UTC' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('UTC', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('05');
    expect(parts.day).toBe('15');
    expect(parts.hour).toBe('08');
    expect(parts.minute).toBe('30');
  });
});

describe('RoutineService scheduled run idempotency', () => {
  it('starts only one scheduled run when two scheduler instances fire the same slot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));

    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    const first = new RoutineService(persistence);
    const second = new RoutineService(persistence);
    const starts: string[] = [];

    first.setRunHandler(async ({ runId }) => {
      return handlerStart('agent-run-1', () => starts.push(runId));
    });
    second.setRunHandler(async ({ runId }) => {
      return handlerStart('agent-run-2', () => starts.push(runId));
    });

    try {
      first.start();
      second.start();

      await vi.advanceTimersByTimeAsync(61_000);

      expect(starts).toHaveLength(1);
      expect(persistence.runs).toHaveLength(1);
      expect(persistence.claimedSlots).toEqual(new Set(['routine-1:1779012060000']));
    } finally {
      first.stop();
      second.stop();
    }
  });

  it('retries the same scheduled slot when durable run insertion fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));

    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    persistence.failScheduledInsertAttempts = 1;
    const service = new RoutineService(persistence);
    const starts: string[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    service.setRunHandler(async ({ runId }) => {
      return handlerStart('agent-run-1', () => starts.push(runId));
    });

    try {
      service.start();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(starts).toHaveLength(0);
      expect(persistence.runs).toHaveLength(0);
      expect(persistence.claimedSlots.size).toBe(0);

      await vi.advanceTimersByTimeAsync(1_000);

      expect(starts).toHaveLength(1);
      expect(persistence.runs).toHaveLength(1);
      expect(persistence.claimedSlots).toEqual(new Set(['routine-1:1779012060000']));
    } finally {
      service.stop();
      errors.mockRestore();
    }
  });

  it('terminates the in-memory run and persists real IDs when prepare fails after assigning them', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));

    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    const updatePatches: Array<Partial<RoutineRun>> = [];
    const originalUpdate = persistence.updateRun.bind(persistence);
    persistence.updateRun = (id: string, patch: Partial<RoutineRun>) => {
      updatePatches.push({ ...patch });
      originalUpdate(id, patch);
    };

    const service = new RoutineService(persistence);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    let discardCalls = 0;
    let completionResolved = false;
    let resolveCompletion!: () => void;
    const completion = new Promise<{ status: 'canceled' }>((resolve) => {
      resolveCompletion = () => {
        completionResolved = true;
        resolve({ status: 'canceled' });
      };
    });

    service.setRunHandler(async () => {
      return {
        // Placeholder IDs mirror server.ts's `scheduledPlaceholder*`
        // values — these are what the row gets inserted with before
        // `prepare()` patches them with real IDs.
        projectId: 'routine-pending-project',
        conversationId: 'routine-pending-conversation',
        agentRunId: 'routine-pending-run',
        completion,
        prepare: (run: RoutineRun) => {
          // Match persistPreparedRun(): mutate the routine run with real
          // IDs before any later fallible work could throw.
          run.projectId = 'real-project';
          run.conversationId = 'real-conversation';
          run.agentRunId = 'real-agent-run';
          throw new Error('prepare exploded');
        },
        discard: () => {
          discardCalls += 1;
          resolveCompletion();
        },
        start: () => {
          throw new Error('start should not run after a failed prepare');
        },
      };
    });

    try {
      service.start();

      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(0);

      // The in-memory chat run was terminated, releasing the completion
      // promise so it does not leak.
      expect(discardCalls).toBe(1);
      expect(completionResolved).toBe(true);

      // The persisted row ends in the terminal failed state and carries
      // the real IDs that prepare() assigned — no `routine-pending-*`
      // placeholders left behind.
      expect(persistence.runs).toHaveLength(1);
      const stored = persistence.runs[0]!;
      expect(stored.status).toBe('failed');
      expect(stored.projectId).toBe('real-project');
      expect(stored.conversationId).toBe('real-conversation');
      expect(stored.agentRunId).toBe('real-agent-run');
      expect(stored.completedAt).toBeTypeOf('number');
      expect(stored.error).toContain('prepare exploded');

      // The failure-path updateRun explicitly carried the real IDs so the
      // real persistence layer (column-level UPDATE) replaces the
      // placeholders, not just the in-memory shared reference.
      const failurePatch = updatePatches.find((patch) => patch.status === 'failed');
      expect(failurePatch).toBeDefined();
      expect(failurePatch?.projectId).toBe('real-project');
      expect(failurePatch?.conversationId).toBe('real-conversation');
      expect(failurePatch?.agentRunId).toBe('real-agent-run');
    } finally {
      service.stop();
      errors.mockRestore();
    }
  });

  it('does not persist scheduled placeholder IDs when prepare fails before assigning real IDs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));

    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    const updatePatches: Array<Partial<RoutineRun>> = [];
    const originalUpdate = persistence.updateRun.bind(persistence);
    persistence.updateRun = (id: string, patch: Partial<RoutineRun>) => {
      updatePatches.push({ ...patch });
      originalUpdate(id, patch);
    };

    const service = new RoutineService(persistence);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    let discardCalls = 0;

    service.setRunHandler(async ({ runId }) => {
      return {
        projectId: `routine-pending-project-${runId}`,
        conversationId: `routine-pending-conv-${runId}`,
        agentRunId: 'agent-run-1',
        completion: Promise.resolve({ status: 'canceled' as const }),
        prepare: () => {
          // Mirrors createRoutineConversation() failing before
          // persistPreparedRun() can copy real IDs onto the chat run or
          // routine run.
          throw new Error('project create failed');
        },
        discard: () => {
          discardCalls += 1;
        },
        start: () => {
          throw new Error('start should not run after a failed prepare');
        },
      };
    });

    try {
      service.start();

      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(0);

      expect(discardCalls).toBe(1);
      expect(persistence.runs).toHaveLength(1);
      const stored = persistence.runs[0]!;
      expect(stored.status).toBe('failed');
      expect(stored.completedAt).toBeTypeOf('number');
      expect(stored.error).toContain('project create failed');
      expect(stored.projectId).toBe('');
      expect(stored.conversationId).toBe('');
      expect(stored.agentRunId).toBe('agent-run-1');
      expect(stored.projectId).not.toContain('routine-pending-project');
      expect(stored.conversationId).not.toContain('routine-pending-conv');

      const failurePatch = updatePatches.find((patch) => patch.status === 'failed');
      expect(failurePatch).toBeDefined();
      expect(failurePatch?.projectId).toBe('');
      expect(failurePatch?.conversationId).toBe('');
      expect(failurePatch?.agentRunId).toBe('agent-run-1');
    } finally {
      service.stop();
      errors.mockRestore();
    }
  });

  it('prepares manual runs exactly once through the service path', async () => {
    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    const service = new RoutineService(persistence);
    let prepareCalls = 0;

    service.setRunHandler(async () => ({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentRunId: 'agent-run-1',
      completion: Promise.resolve({ status: 'succeeded' as const }),
      prepare: () => {
        prepareCalls += 1;
      },
    }));

    await service.runNow('routine-1');
    await Promise.resolve();

    expect(prepareCalls).toBe(1);
    expect(persistence.runs).toHaveLength(1);
    expect(persistence.runs[0]).toMatchObject({
      trigger: 'manual',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentRunId: 'agent-run-1',
    });
  });

  it('returns prepared IDs from successful manual runs', async () => {
    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    const service = new RoutineService(persistence);

    service.setRunHandler(async () => ({
      projectId: 'routine-pending-project',
      conversationId: 'routine-pending-conversation',
      agentRunId: 'routine-pending-run',
      completion: Promise.resolve({ status: 'succeeded' as const }),
      prepare: (run: RoutineRun) => {
        run.projectId = 'real-project';
        run.conversationId = 'real-conversation';
        run.agentRunId = 'real-agent-run';
      },
    }));

    const started = await service.runNow('routine-1');
    await Promise.resolve();

    expect(started).toMatchObject({
      projectId: 'real-project',
      conversationId: 'real-conversation',
      agentRunId: 'real-agent-run',
    });
    expect(persistence.runs).toHaveLength(1);
    expect(persistence.runs[0]).toMatchObject({
      trigger: 'manual',
      projectId: 'real-project',
      conversationId: 'real-conversation',
      agentRunId: 'real-agent-run',
    });
  });

  it('still finalizes the failed row when prepare cleanup itself throws', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));

    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    const service = new RoutineService(persistence);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    let discardCalls = 0;

    service.setRunHandler(async () => {
      return {
        projectId: 'routine-pending-project',
        conversationId: 'routine-pending-conversation',
        agentRunId: 'routine-pending-run',
        completion: Promise.resolve({ status: 'canceled' as const }),
        prepare: (run: RoutineRun) => {
          run.projectId = 'real-project';
          run.conversationId = 'real-conversation';
          run.agentRunId = 'real-agent-run';
          throw new Error('prepare exploded');
        },
        discard: () => {
          discardCalls += 1;
          throw new Error('cleanup blew up');
        },
        start: () => {},
      };
    });

    try {
      service.start();

      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(0);

      expect(discardCalls).toBe(1);

      // The cleanup failure is surfaced via console.error and does not
      // swallow the prepare failure — the routine row is still finalized
      // and the original prepare error reaches the scheduler.
      expect(errors.mock.calls.some((call) =>
        call.some((value) => String(value).includes('cleanup blew up')),
      )).toBe(true);
      expect(errors.mock.calls.some((call) =>
        call.some((value) => String(value).includes('prepare exploded')),
      )).toBe(true);

      expect(persistence.runs).toHaveLength(1);
      const stored = persistence.runs[0]!;
      expect(stored.status).toBe('failed');
      expect(stored.projectId).toBe('real-project');
      expect(stored.conversationId).toBe('real-conversation');
      expect(stored.agentRunId).toBe('real-agent-run');
      expect(stored.error).toContain('prepare exploded');
    } finally {
      service.stop();
      errors.mockRestore();
    }
  });

  it('retries the same scheduled slot when duplicate loser cleanup fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));

    const persistence = new SharedRoutinePersistence([fixtureRoutine()]);
    persistence.claimedSlots.add('routine-1:1779012060000');
    const service = new RoutineService(persistence);
    let discardAttempts = 0;
    let discardFailures = 1;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    service.setRunHandler(async ({ runId }) => {
      return {
        ...handlerStart(runId),
        discard: () => {
          discardAttempts += 1;
          if (discardFailures > 0) {
            discardFailures -= 1;
            throw new Error('duplicate loser cleanup failed');
          }
        },
      };
    });

    try {
      service.start();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(discardAttempts).toBe(1);
      expect(persistence.runs).toHaveLength(0);
      expect(persistence.claimedSlots).toEqual(new Set(['routine-1:1779012060000']));

      await vi.advanceTimersByTimeAsync(1_000);

      expect(discardAttempts).toBe(2);
      expect(persistence.runs).toHaveLength(0);
      expect(errors.mock.calls.some((call) =>
        call.some((value) => String(value).includes('duplicate loser cleanup failed')),
      )).toBe(true);
    } finally {
      service.stop();
      errors.mockRestore();
    }
  });
});

describe('routine validation', () => {
  it('accepts valid schedule and target shapes', () => {
    expect(() =>
      validateSchedule({ kind: 'weekly', weekday: 1, time: '09:00', timezone: 'UTC' }),
    ).not.toThrow();
    expect(() => validateTarget({ mode: 'create_each_run' })).not.toThrow();
    expect(() => validateTarget({ mode: 'reuse', projectId: 'proj-1' })).not.toThrow();
  });

  it('rejects invalid wall times and timezones', () => {
    expect(() =>
      validateSchedule({ kind: 'daily', time: '25:00', timezone: 'UTC' }),
    ).toThrow(/Invalid time/);
    expect(() =>
      validateSchedule({ kind: 'daily', time: '09:00', timezone: 'Mars\/Olympus' }),
    ).toThrow(/Invalid timezone/);
  });

  it('rejects invalid weekday and unsupported target mode', () => {
    expect(() =>
      validateSchedule({ kind: 'weekly', weekday: 9 as 0, time: '09:00', timezone: 'UTC' }),
    ).toThrow(/weekly\.weekday/);
    expect(() =>
      validateTarget({ mode: 'teleport' } as unknown as Parameters<typeof validateTarget>[0]),
    ).toThrow(/Unsupported routine target mode/);
  });

  it('rejects reuse targets without a project id', () => {
    expect(() =>
      validateTarget({ mode: 'reuse', projectId: '' }),
    ).toThrow(/projectId/);
  });
});
