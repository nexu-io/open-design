import { describe, expect, it, vi } from 'vitest';
import {
  createInternalRunCreationService,
  type InternalPhysicalRun,
  type InternalRunCreateInput,
  type InternalRunRegistry,
} from '../../src/services/internal-run-service.js';

interface TestRun extends InternalPhysicalRun {
  assistantMessageId: string | null;
}

function createHarness(initial: {
  creation?: 'created' | 'reused' | 'conflict';
  claimOk?: boolean;
  claimThrows?: boolean;
  restartOk?: boolean;
} = {}) {
  const run: TestRun = {
    id: 'run-1',
    status: initial.creation === 'reused' ? 'failed' : 'queued',
    assistantMessageId: 'assistant-1',
  };
  const drop = vi.fn();
  const start = vi.fn((startedRun: TestRun, starter: () => Promise<unknown>) => {
    void starter();
    return startedRun;
  });
  const registry: InternalRunRegistry<InternalRunCreateInput, TestRun> = {
    createOrReuse: vi.fn(() => ({
      kind: initial.creation ?? 'created',
      run,
    } as
      | { kind: 'created'; run: TestRun }
      | { kind: 'reused'; run: TestRun }
      | { kind: 'conflict'; run: TestRun })),
    prepareRestart: vi.fn(() => {
      if (initial.restartOk === false) return null;
      run.status = 'queued';
      return run;
    }),
    get: vi.fn(() => null),
    drop,
    start,
    isTerminal: vi.fn((status) => ['succeeded', 'failed', 'canceled'].includes(status)),
  };
  const claimAssistantMessage = vi.fn((
    _claimedRun: TestRun,
    options?: { beforeClaimCommit?: () => void },
  ) => {
    if (initial.claimThrows) throw new Error('claim failed');
    if (initial.claimOk === false) {
      return { ok: false as const, reason: 'active' as const };
    }
    options?.beforeClaimCommit?.();
    return { ok: true as const };
  });
  const install = vi.fn();
  const service = createInternalRunCreationService({
    runs: registry,
    claimAssistantMessage,
    analyticsLifecycle: { install },
  });
  return { claimAssistantMessage, drop, install, registry, run, service, start };
}

describe('internal run creation service', () => {
  it('creates, claims, and starts a prepared physical run with the same resolved input', async () => {
    const harness = createHarness();
    const meta: InternalRunCreateInput = {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentId: 'codex',
      currentPrompt: 'Build the page',
      appliedPluginSnapshotId: 'snapshot-1',
      sessionMode: 'design',
      analyticsHints: { sourceRunId: 'run-0' },
    };
    const prepared = harness.service.prepare({ meta });

    expect(prepared).toEqual({
      kind: 'ready',
      run: harness.run,
      creationKind: 'created',
      resumed: false,
    });
    expect(harness.registry.createOrReuse).toHaveBeenCalledWith(meta);
    expect(harness.claimAssistantMessage).toHaveBeenCalledOnce();

    const starter = vi.fn(async () => undefined);
    if (prepared.kind !== 'ready') throw new Error('expected ready run');
    harness.service.start(
      prepared.run,
      { body: { ...meta }, requestAnalyticsContext: null },
      starter,
    );
    expect(harness.start).toHaveBeenCalledOnce();
    expect(starter).toHaveBeenCalledWith(harness.run);
  });

  // Every physical Run is started here, so this is the one place that can
  // guarantee analytics without each caller remembering to ask for it. Four
  // daemon-internal callers used to start Runs another way and reported
  // nothing at all (OPEND-2365).
  it('arms the analytics lifecycle for the run before it starts', async () => {
    const harness = createHarness();
    const starter = vi.fn(async () => undefined);
    const facts = {
      body: { projectId: 'project-1' },
      requestAnalyticsContext: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'web' as const,
        locale: 'en',
        requestId: null,
      },
      creationKind: 'created' as const,
      resumed: false,
    };

    harness.service.start(harness.run, facts, starter);

    expect(harness.install).toHaveBeenCalledWith({ ...facts, run: harness.run });
    expect(harness.install.mock.invocationCallOrder[0]!)
      .toBeLessThan(harness.start.mock.invocationCallOrder[0]!);
  });

  it('starts the run even when no caller identity is available', async () => {
    // A scheduled Automation has nobody to attribute the Run to. It still goes
    // through the one start path so the Run is never silently uninstrumented
    // for a reason other than "there was no identity".
    const harness = createHarness();
    const starter = vi.fn(async () => undefined);

    harness.service.start(harness.run, { body: {}, requestAnalyticsContext: null }, starter);

    expect(harness.install).toHaveBeenCalledOnce();
    expect(harness.start).toHaveBeenCalledOnce();
  });

  it('drops an optimistic run when the assistant ownership claim is rejected', () => {
    const harness = createHarness({ claimOk: false });
    const beforeClaimCommit = vi.fn();

    expect(harness.service.prepare({ meta: {}, beforeClaimCommit })).toEqual({
      kind: 'assistant_claim_conflict',
      run: harness.run,
      reason: 'active',
    });
    expect(beforeClaimCommit).not.toHaveBeenCalled();
    expect(harness.drop).toHaveBeenCalledWith(harness.run);
    expect(harness.start).not.toHaveBeenCalled();
  });

  it('runs message seeding inside a successful ownership claim', () => {
    const harness = createHarness();
    const beforeClaimCommit = vi.fn();

    expect(harness.service.prepare({ meta: {}, beforeClaimCommit }).kind).toBe('ready');
    expect(beforeClaimCommit).toHaveBeenCalledOnce();
    expect(beforeClaimCommit).toHaveBeenCalledWith(harness.run);
  });

  it('drops an optimistic run when the claim transaction throws', () => {
    const harness = createHarness({ claimThrows: true });

    expect(() => harness.service.prepare({ meta: {} })).toThrow('claim failed');
    expect(harness.drop).toHaveBeenCalledWith(harness.run);
    expect(harness.start).not.toHaveBeenCalled();
  });

  it('returns an existing idempotent run without claiming or starting it', () => {
    const harness = createHarness({ creation: 'reused' });

    expect(harness.service.prepare({ meta: {} })).toEqual({
      kind: 'reused',
      run: harness.run,
    });
    expect(harness.claimAssistantMessage).not.toHaveBeenCalled();
    expect(harness.start).not.toHaveBeenCalled();
  });

  it('reclaims and rearms an eligible resumed run before it can start', () => {
    const harness = createHarness({ creation: 'reused' });

    expect(harness.service.prepare({
      meta: {},
      resume: { requested: true, canResume: () => true },
    })).toEqual({
      kind: 'ready',
      run: harness.run,
      creationKind: 'reused',
      resumed: true,
    });
    expect(harness.claimAssistantMessage).toHaveBeenCalledWith(
      harness.run,
      expect.objectContaining({ status: 'queued' }),
    );
    expect(harness.registry.prepareRestart).toHaveBeenCalledWith(harness.run);
  });

  it('preserves a reused terminal run when resume eligibility fails', () => {
    const harness = createHarness({ creation: 'reused' });

    expect(harness.service.prepare({
      meta: {},
      resume: { requested: true, canResume: () => false },
    })).toEqual({ kind: 'resume_not_allowed', run: harness.run });
    expect(harness.drop).not.toHaveBeenCalled();
    expect(harness.claimAssistantMessage).not.toHaveBeenCalled();
  });
});
