import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatRunService } from '../../src/runtimes/runs.js';

describe('chat run service shutdown', () => {
  it('exports terminal diagnostics without confusing a measured zero with missing data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T00:00:00.000Z'));
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-1',
      agentId: 'amr',
    }) as any;
    run.model = 'qwen3.8-max';
    run.resolvedModelId = 'qwen3.8-max';
    run.preflightAgentCliVersion = '1.2.3';
    run.analyticsTelemetry = {
      startRequestedAt: Date.now(),
      startChatRunStartedAt: Date.now(),
      firstModelEventAt: Date.now() + 100,
      firstVisibleOutputAt: Date.now() + 250,
    };
    runs.emit(run, 'agent', {
      type: 'diagnostic',
      name: 'assistant_message_lifecycle',
      source: 'amr-opencode',
      phase: 'start',
      status: 'running',
      assistantMessageIndex: 1,
      startedAtMs: Date.now(),
      provider: 'amr',
      model: 'qwen3.8-max',
    });
    for (let stepIndex = 1; stepIndex <= 10; stepIndex += 1) {
      const startedAtMs = Date.now() + stepIndex * 10_000;
      runs.emit(run, 'agent', {
        type: 'diagnostic',
        name: 'model_step_lifecycle',
        source: 'amr-opencode',
        phase: 'start',
        status: 'running',
        assistantMessageIndex: 1,
        stepIndex,
        startedAtMs,
      });
      runs.emit(run, 'agent', {
        type: 'diagnostic',
        name: 'model_step_lifecycle',
        source: 'amr-opencode',
        phase: 'end',
        status: 'completed',
        assistantMessageIndex: 1,
        stepIndex,
        startedAtMs,
        endedAtMs: startedAtMs + stepIndex * 1_000,
        durationMs: stepIndex * 1_000,
        ...(stepIndex === 1 ? { usage: { reasoningTokens: 7 } } : {}),
      });
    }
    runs.emit(run, 'agent', {
      type: 'usage',
      usage: { inputTokens: 10, outputTokens: 3 },
    });
    runs.emit(run, 'agent', {
      type: 'diagnostic',
      name: 'model_retry',
      source: 'amr-opencode',
      attempt: 1,
      errorClass: 'rate_limited',
    });
    vi.advanceTimersByTime(500);
    runs.emit(run, 'agent', {
      type: 'diagnostic',
      name: 'assistant_message_lifecycle',
      source: 'amr-opencode',
      phase: 'end',
      status: 'completed',
      assistantMessageIndex: 1,
      startedAtMs: Date.now() - 500,
      endedAtMs: Date.now(),
      durationMs: 500,
      provider: 'amr',
      model: 'qwen3.8-max',
    });
    runs.finish(run, 'succeeded', 0, null);

    const diagnostics = runs.statusBody(run).executionDiagnostics;
    if (!diagnostics) throw new Error('expected terminal execution diagnostics');
    expect(diagnostics).toMatchObject({
      schemaVersion: 1,
      eventStreamCompleteness: 'complete',
      timing: {
        firstModelEventWaitMs: { state: 'available', value: 100 },
        firstVisibleOutputWaitMs: { state: 'available', value: 250 },
      },
      tools: {
        total: { state: 'available', value: 0, complete: true },
      },
      modelSteps: {
        count: {
          state: 'available',
          value: 10,
        },
        totalDurationMs: { state: 'available', value: 55_000 },
        averageDurationMs: { state: 'available', value: 5_500 },
        p50DurationMs: { state: 'available', value: 5_000 },
        p90DurationMs: { state: 'available', value: 9_000 },
        maxDurationMs: { state: 'available', value: 10_000 },
        over60sCount: { state: 'available', value: 0 },
        durationSampleCount: { state: 'available', value: 10 },
        completed: { state: 'available', value: 10 },
        failed: { state: 'available', value: 0 },
        cancelled: { state: 'available', value: 0 },
        incomplete: { state: 'available', value: 0 },
        retryCount: { state: 'available', value: 1 },
        reasoningTokens: { state: 'available', value: 7, complete: false },
      },
      assistantMessages: {
        count: { state: 'available', value: 1 },
        totalDurationMs: { state: 'available', value: 500 },
        completed: { state: 'available', value: 1 },
      },
      anomalies: {
        retryCount: { state: 'available', value: 1 },
        rateLimitedCount: { state: 'available', value: 1 },
        timeoutCount: { state: 'available', value: 0 },
        upstreamErrorCount: { state: 'available', value: 0 },
      },
      environment: {
        provider: { state: 'available', value: 'amr' },
        resolvedModel: { state: 'available', value: 'qwen3.8-max' },
        agentCliVersion: { state: 'available', value: '1.2.3' },
      },
    });
    expect(diagnostics.modelSteps.reasoningDurationMs).toMatchObject({
      state: 'not_collected',
      missingReason: 'reasoning_interval_boundaries_not_exposed_by_runtime',
    });
    expect(diagnostics.modelSteps.p90DurationMs).toMatchObject({
      state: 'available',
      value: 9_000,
      complete: true,
    });
    expect(diagnostics.cache.cacheHitRatio).toMatchObject({
      state: 'upstream_unavailable',
      missingReason: 'model_provider_did_not_return_cache_usage',
    });
    vi.useRealTimers();
  });

  it('keeps model-step percentiles unavailable until the documented sample minimum', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1', agentId: 'amr' }) as any;
    for (let stepIndex = 1; stepIndex <= 2; stepIndex += 1) {
      runs.emit(run, 'agent', {
        type: 'diagnostic',
        name: 'model_step_lifecycle',
        phase: 'end',
        status: 'completed',
        assistantMessageIndex: 1,
        stepIndex,
        durationMs: stepIndex * 1_000,
      });
    }
    runs.finish(run, 'succeeded', 0, null);
    const diagnostics = runs.statusBody(run).executionDiagnostics;
    expect(diagnostics?.modelSteps.count).toMatchObject({ state: 'available', value: 2 });
    expect(diagnostics?.modelSteps.p50DurationMs).toMatchObject({
      state: 'upstream_unavailable',
      missingReason: 'insufficient_model_step_samples_min_3',
    });
    expect(diagnostics?.modelSteps.p90DurationMs).toMatchObject({
      state: 'upstream_unavailable',
      missingReason: 'insufficient_model_step_samples_min_10',
    });
  });

  it('keeps model steps missing for historical runtimes without lifecycle events', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1', agentId: 'amr' }) as any;
    runs.finish(run, 'succeeded', 0, null);
    expect(runs.statusBody(run).executionDiagnostics?.modelSteps.count).toMatchObject({
      state: 'not_collected',
      missingReason: 'assistant_message_lifecycle_not_exposed_by_runtime',
    });
  });

  it('keeps retry anomalies available without assistant-message lifecycle events', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1', agentId: 'amr' }) as any;
    runs.emit(run, 'agent', {
      type: 'diagnostic',
      name: 'model_retry',
      attempt: 1,
      errorClass: 'rate_limited',
    });
    runs.finish(run, 'succeeded', 0, null);

    const diagnostics = runs.statusBody(run).executionDiagnostics;
    expect(diagnostics?.assistantMessages.count).toMatchObject({
      state: 'not_collected',
      missingReason: 'assistant_message_lifecycle_not_exposed_by_runtime',
    });
    expect(diagnostics?.anomalies).toMatchObject({
      retryCount: { state: 'available', value: 1 },
      rateLimitedCount: { state: 'available', value: 1 },
      timeoutCount: { state: 'available', value: 0 },
      upstreamErrorCount: { state: 'available', value: 0 },
    });
  });

  it('keeps classified terminal anomalies available without assistant-message lifecycle events', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1', agentId: 'amr' }) as any;
    runs.emit(run, 'error', {
      error: {
        code: 'AGENT_EXECUTION_FAILED',
        message: 'upstream provider timed out',
        retryable: true,
      },
    });
    runs.finish(run, 'failed', 1, null);

    expect(runs.statusBody(run).executionDiagnostics?.anomalies).toMatchObject({
      retryCount: { state: 'available', value: 0 },
      rateLimitedCount: { state: 'available', value: 0 },
      timeoutCount: { state: 'available', value: 1 },
      upstreamErrorCount: { state: 'available', value: 0 },
    });
  });

  it('does not treat first-output fallback timing as a precise model-step duration', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1', agentId: 'amr' }) as any;
    runs.emit(run, 'agent', {
      type: 'diagnostic',
      name: 'model_step_lifecycle',
      phase: 'end',
      status: 'completed',
      assistantMessageIndex: 1,
      stepIndex: 1,
      durationMs: 9_999,
      timingEvidence: 'first_output_fallback',
    });
    runs.finish(run, 'succeeded', 0, null);
    const diagnostics = runs.statusBody(run).executionDiagnostics;
    expect(diagnostics?.modelSteps.count).toMatchObject({ state: 'available', value: 1 });
    expect(diagnostics?.modelSteps.durationSampleCount).toMatchObject({ state: 'available', value: 0 });
    expect(diagnostics?.modelSteps.totalDurationMs).toMatchObject({
      state: 'upstream_unavailable',
      missingReason: 'model_step_duration_boundary_incomplete',
    });
  });

  it('publishes the authoritative artifact count in status and terminal events', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });

    run.artifactCount = 2;
    const wait = runs.wait(run);
    runs.finish(run, 'succeeded', 0, null);

    expect(runs.statusBody(run)).toMatchObject({ status: 'succeeded', artifactCount: 2 });
    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: { status: 'succeeded', artifactCount: 2 },
    });
    await expect(wait).resolves.toMatchObject({ status: 'succeeded', artifactCount: 2 });
  });

  it('publishes authoritative project-relative artifact paths in status and terminal events', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });

    run.artifactCount = 2;
    run.artifactPaths = ['existing.png', 'renders/new.png'];
    const wait = runs.wait(run);
    runs.finish(run, 'succeeded', 0, null);

    expect(runs.statusBody(run)).toMatchObject({
      artifactPaths: ['existing.png', 'renders/new.png'],
    });
    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: { artifactPaths: ['existing.png', 'renders/new.png'] },
    });
    await expect(wait).resolves.toMatchObject({
      artifactPaths: ['existing.png', 'renders/new.png'],
    });
  });

  it('retains structured error details on failed run status bodies', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });

    const wait = runs.wait(run);
    runs.emit(run, 'error', {
      message: 'Agent stalled without emitting any new output for 1s.',
      error: {
        code: 'AGENT_EXECUTION_FAILED',
        message: 'Agent stalled without emitting any new output for 1s.',
        retryable: true,
      },
    });
    runs.finish(run, 'failed', 1, null);

    expect(runs.statusBody(run)).toMatchObject({
      status: 'failed',
      errorCode: 'AGENT_EXECUTION_FAILED',
      error: 'Agent stalled without emitting any new output for 1s.',
    });
    await expect(wait).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'AGENT_EXECUTION_FAILED',
      error: 'Agent stalled without emitting any new output for 1s.',
    });
  });

  it('reopens the same logical run for an explicit recharge recovery attempt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'));
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-1',
      clientRequestId: 'brief-1-cloud',
      requestFingerprint: 'same-logical-request',
      agentId: 'amr',
    });
    (run as any).failureAction = 'recharge';
    runs.emit(run, 'error', {
      error: {
        code: 'AMR_INSUFFICIENT_BALANCE',
        message: 'insufficient balance',
        retryable: false,
      },
    });
    runs.finish(run, 'failed', 1, null);
    vi.advanceTimersByTime(12_345);

    const resumed = runs.prepareRestart(run);

    expect(resumed).toBe(run);
    expect(runs.get(run.id)).toBe(run);
    expect(runs.statusBody(run)).toMatchObject({
      id: run.id,
      clientRequestId: 'brief-1-cloud',
      status: 'queued',
      error: null,
      errorCode: null,
      failureAction: null,
    });
    expect(run.manualResumeAttemptCount).toBe(1);
    expect(run.rechargeWaitDurationMs).toBe(12_345);
    expect(run.events.at(-1)).toMatchObject({
      event: 'run_resume_attempted',
      data: {
        runId: run.id,
        attempt: 1,
        reason: 'recharge',
        rechargeWaitDurationMs: 12_345,
      },
    });
    vi.useRealTimers();
  });

  it('keeps the first accepted plugin attribution immutable across request reuse', () => {
    const runs = createRuns();
    const request = {
      projectId: 'project-1',
      conversationId: 'conv-1',
      clientRequestId: 'logical-request-1',
      requestFingerprint: 'same-logical-request',
      agentId: 'amr',
      analyticsHints: {
        entrySurface: 'external_mcp',
        hostProduct: 'codex_cli',
        externalPluginId: 'open-design',
        externalPluginVersion: '0.4.0',
        distributionMechanism: 'git_marketplace',
        publisherClass: 'open_design_first_party',
        attributionQuality: 'session_correlated',
        pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
        logicalRequestDigest: 'a'.repeat(64),
        logicalRequestDigestVersion: 1,
        generationSloWindowMs: 45 * 60 * 1000,
      },
    };
    const created = runs.createOrReuse(request);
    expect(created.kind).toBe('created');
    const retried = runs.createOrReuse({
      ...request,
      analyticsHints: {
        ...request.analyticsHints,
        externalPluginVersion: '9.9.9',
        pluginWorkflowId: '018f6f2e-9999-7999-8999-999999999999',
      },
    });
    expect(retried.kind).toBe('reused');
    expect(retried.run.externalPluginAnalytics).toMatchObject({
      externalPluginVersion: '0.4.0',
      pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
    });
  });



  it('ignores subsequent finish attempts after the run reaches a terminal state', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });

    const wait = runs.wait(run);
    runs.finish(run, 'succeeded', 0, null);
    runs.finish(run, 'failed', 1, 'SIGTERM');

    expect(run.status).toBe('succeeded');
    expect(run.exitCode).toBe(0);
    expect(run.signal).toBeNull();
    expect(run.events.filter((event: { event: string }) => event.event === 'end')).toHaveLength(1);
    await expect(wait).resolves.toMatchObject({ status: 'succeeded', exitCode: 0, signal: null });
  });
  it('filters active runs by conversation within the same project', () => {
    const runs = createRuns();
    const runA = runs.create({ projectId: 'project-1', conversationId: 'conv-a' });
    const runB = runs.create({ projectId: 'project-1', conversationId: 'conv-b' });
    runA.status = 'running';
    runB.status = 'running';

    expect(
      runs.list({ projectId: 'project-1', conversationId: 'conv-b', status: 'active' }),
    ).toEqual([runB]);
  });

  it('normalizes session mode and run context metadata at creation', () => {
    const runs = createRuns();
    const workspaceContext = {
      workspaceItems: [{ id: 'active-file:index.html', label: 'index.html', kind: 'file' }],
    };

    const valid = runs.create({ sessionMode: 'plan', context: workspaceContext });
    expect(valid.sessionMode).toBe('plan');
    expect(valid.context).toEqual(workspaceContext);

    const invalid = runs.create({ sessionMode: 'review', context: [] });
    expect(invalid.sessionMode).toBeNull();
    expect(invalid.context).toBeNull();
  });

  it('cancels a queued run immediately without waiting for child process shutdown', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-queued' });

    const wait = runs.wait(run);
    await runs.cancel(run, 'user_stop');

    expect(run.status).toBe('canceled');
    expect(run.cancelRequested).toBe(true);
    expect(runs.statusBody(run).cancelOrigin).toBe('user_stop');
    expect(run.signal).toBe('SIGTERM');
    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: { status: 'canceled', signal: 'SIGTERM' },
    });
    await expect(wait).resolves.toMatchObject({
      status: 'canceled',
      signal: 'SIGTERM',
    });
  });

  describe('cancel kill fallback', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('sends SIGTERM immediately and escalates to SIGKILL after the cancel grace window', async () => {
      vi.useFakeTimers();
      vi.stubEnv('OD_CHAT_RUN_CANCEL_GRACE_MS', '25');
      const runs = createRuns();
      const child = new FakeChildProcess({ closeOn: 'SIGKILL' });
      const run = runs.create();
      run.status = 'running';
      (run as any).child = child;

      const cancelPromise = runs.cancel(run);

      expect(run.cancelRequested).toBe(true);
      expect(child.signals).toEqual(['SIGTERM']);

      await vi.advanceTimersByTimeAsync(24);
      expect(child.signals).toEqual(['SIGTERM']);

      await vi.advanceTimersByTimeAsync(1);
      expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
      await cancelPromise;
      expect(run.status).toBe('canceled');
      expect(run.signal).toBe('SIGKILL');
    });

    it('closes child stdin before signaling a canceled run', async () => {
      const runs = createRuns();
      const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
      const run = runs.create();
      run.status = 'running';
      run.stdinOpen = true;
      (run as any).child = child;

      await runs.cancel(run);

      expect(child.stdin.end).toHaveBeenCalledTimes(1);
      expect(run.stdinOpen).toBe(false);
      expect(child.lifecycle.slice(0, 2)).toEqual(['stdin.end', 'SIGTERM']);
      expect(child.signals).toEqual(['SIGTERM']);
    });

    it('uses ACP abort before falling back to process signals', async () => {
      vi.useFakeTimers();
      vi.stubEnv('PI_ABORT_GRACE_MS', '30');
      const runs = createRuns();
      const child = new FakeChildProcess({ closeOn: 'SIGKILL' });
      const order: string[] = [];
      const originalKill = child.kill.bind(child);
      vi.spyOn(child, 'kill').mockImplementation((signal: string) => {
        order.push(signal);
        return originalKill(signal);
      });
      const run = runs.create();
      run.status = 'running';
      run.stdinOpen = true;
      (run as any).child = child;
      (run as any).acpSession = {
        abort: vi.fn(() => {
          order.push('abort');
          expect(child.stdin.end).not.toHaveBeenCalled();
          expect(run.stdinOpen).toBe(true);
        }),
      };

      const cancelPromise = runs.cancel(run);

      expect((run as any).acpSession.abort).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['abort']);
      expect(child.stdin.end).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(30);
      expect(order).toEqual(['abort', 'SIGTERM']);
      expect(child.stdin.end).toHaveBeenCalledTimes(1);
      expect(run.stdinOpen).toBe(false);

      await vi.advanceTimersByTimeAsync(30);
      expect(order).toEqual(['abort', 'SIGTERM', 'SIGKILL']);
      await cancelPromise;
      expect(run.status).toBe('canceled');
      expect(run.signal).toBe('SIGKILL');
    });

    it('waits for a real process group to exit before returning canceled status', async () => {
      if (process.platform === 'win32') return;
      vi.stubEnv('OD_CHAT_RUN_CANCEL_GRACE_MS', '25');
      vi.stubEnv('OD_CHAT_RUN_CANCEL_FORCE_WAIT_MS', '250');
      const script = [
        "const { spawn } = require('node:child_process');",
        "process.on('SIGTERM', () => {});",
        "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM',()=>{}); setInterval(()=>{}, 1000);\"], { stdio: 'ignore' });",
        "process.stdout.write(JSON.stringify({ pid: process.pid, childPid: child.pid }) + '\\n');",
        "setInterval(() => {}, 1000);",
      ].join('\n');
      const child = spawn(process.execPath, ['-e', script], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        const line = await readOneLine(child.stdout);
        const payload = JSON.parse(line) as { childPid: number };
        const runs = createRuns();
        const run = runs.create();
        run.status = 'running';
        (run as any).child = child;
        (run as any).childPid = child.pid;
        (run as any).processGroupId = child.pid;

        const status = await runs.cancel(run);

        expect(status.status).toBe('canceled');
        expect(status.childPid).toBe(child.pid);
        expect(status.processGroupId).toBe(child.pid);
        expect(status.childExited).toBe(true);
        expect(status.signal).toBe('SIGKILL');
        await expectPidGone(payload.childPid);
      } finally {
        try {
          if (typeof child.pid === 'number') process.kill(-child.pid, 'SIGKILL');
        } catch {
          // already gone
        }
      }
    });
  });



  it('stores effective media execution policy on run status bodies', () => {
    const runs = createRuns();
    const defaultRun = runs.create({ projectId: 'project-1', conversationId: 'conv-a' });
    const scopedRun = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-b',
      mediaExecution: { mode: 'enabled', allowedSurfaces: ['image'] },
    });

    expect(runs.statusBody(defaultRun)).toMatchObject({
      mediaExecution: { mode: 'enabled' },
    });
    expect(runs.statusBody(scopedRun)).toMatchObject({
      mediaExecution: { mode: 'enabled', allowedSurfaces: ['image'] },
    });
  });

  it('stores Browser Use availability on run status bodies', () => {
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-a',
      browserUse: {
        requested: true,
        available: false,
        reason: 'no-matching-browser-backend',
        diagnostics: {
          registryPath: '/tmp/codex-browser-use',
          registryExists: false,
          socketCount: 0,
          candidateCount: 0,
          staleCount: 0,
          currentSessionIdPresent: null,
          probeFailureCategory: 'registry-missing',
          staleThresholdMs: 600_000,
        },
      },
    });

    expect(runs.statusBody(run)).toMatchObject({
      browserUse: {
        requested: true,
        available: false,
        reason: 'no-matching-browser-backend',
        diagnostics: {
          registryPath: '/tmp/codex-browser-use',
          probeFailureCategory: 'registry-missing',
        },
      },
    });
  });

  it('stores native session recovery metadata on run status bodies', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-a' });
    (run as any).nativeSessionRecovery = {
      agentId: 'codex',
      state: 'captured_not_resumed',
      acquisition: 'stream-captured',
      continuation: 'native-resume-by-id',
      handle: {
        present: true,
        kind: 'cli-thread-id',
        display: null,
        sha256: 'a'.repeat(64),
        redacted: true,
      },
      guardReason: null,
      fallbackReason: null,
      updatedAt: 123,
    };

    expect(runs.statusBody(run)).toMatchObject({
      nativeSessionRecovery: {
        agentId: 'codex',
        state: 'captured_not_resumed',
        handle: {
          display: null,
          sha256: 'a'.repeat(64),
          redacted: true,
        },
      },
    });
  });

  it('summarizes OD-owned project storage on run status bodies', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-a' });

    expect(runs.statusBody(run).workspace).toEqual({
      storage: {
        kind: 'od-owned',
        baseDir: null,
      },
      provenance: null,
    });
  });

  it('summarizes user-local folder provenance on run status bodies', () => {
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-a',
      projectMetadata: {
        importedFrom: 'folder',
        baseDir: '/Users/alice/site',
      },
    });

    expect(runs.statusBody(run).workspace).toEqual({
      storage: {
        kind: 'folder-backed',
        baseDir: '/Users/alice/site',
      },
      provenance: {
        kind: 'user-local',
        writeback: 'in-place',
      },
    });
  });

  it('recomputes workspace from updated project metadata on status bodies', () => {
    const runs = createRuns();
    const run = runs.create({
      projectId: 'routine-pending-project',
      conversationId: 'routine-pending-conversation',
    });

    expect(runs.statusBody(run).workspace).toEqual({
      storage: {
        kind: 'od-owned',
        baseDir: null,
      },
      provenance: null,
    });

    run.projectId = 'real-project';
    run.projectMetadata = {
      importedFrom: 'folder',
      baseDir: '/Users/alice/reused-project',
    };

    expect(runs.statusBody(run).workspace).toEqual({
      storage: {
        kind: 'folder-backed',
        baseDir: '/Users/alice/reused-project',
      },
      provenance: {
        kind: 'user-local',
        writeback: 'in-place',
      },
    });
  });

  it('summarizes orchestrator scratch workspace provenance on run status bodies', () => {
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-a',
      projectMetadata: {
        importedFrom: 'folder',
        baseDir: '/tmp/od-scratch',
        orchestratorWorkspace: {
          kind: 'scratch',
          sourceLabel: 'checkout:main',
          sourceRef: 'main@abc123',
          baseRevision: 'abc123',
          writeback: 'external',
        },
      },
    });

    expect(runs.statusBody(run).workspace).toEqual({
      storage: {
        kind: 'folder-backed',
        baseDir: '/tmp/od-scratch',
      },
      provenance: {
        kind: 'orchestrator-scratch',
        sourceLabel: 'checkout:main',
        sourceRef: 'main@abc123',
        baseRevision: 'abc123',
        writeback: 'external',
      },
    });
  });

  it('stores a run-scoped tool bundle and returns a redacted status summary', () => {
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-a',
      toolBundle: {
        mcpServers: [
          {
            id: 'run-tools',
            transport: 'stdio',
            command: 'node',
            args: ['server.js', '--token=secret'],
            env: { API_TOKEN: 'secret' },
          },
        ],
      },
    }) as any;

    expect(run.toolBundle.mcpServers).toHaveLength(1);
    expect(run.toolBundle.mcpServers[0]).toMatchObject({
      id: 'run-tools',
      command: 'node',
      env: { API_TOKEN: 'secret' },
    });

    const status = runs.statusBody(run);
    expect(status.toolBundle).toEqual({
      mcpServers: [
        {
          id: 'run-tools',
          transport: 'stdio',
          enabled: true,
        },
      ],
    });
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(JSON.stringify(status)).not.toContain('server.js');
  });

  it('cancels active runs and terminates their child process during daemon shutdown', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });
    run.status = 'running';
    (run as any).child = child;

    const wait = runs.wait(run);
    await runs.shutdownActive({ graceMs: 10 });

    expect(child.signals).toEqual(['SIGTERM']);
    expect(run.status).toBe('canceled');
    expect(run.cancelRequested).toBe(true);
    expect(runs.statusBody(run).cancelOrigin).toBe('daemon_shutdown');
    expect(run.signal).toBe('SIGTERM');
    await expect(wait).resolves.toMatchObject({ status: 'canceled', signal: 'SIGTERM' });
    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: { status: 'canceled', signal: 'SIGTERM' },
    });
  });

  it('escalates to SIGKILL when a child ignores the shutdown SIGTERM grace window', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGKILL' });
    const run = runs.create();
    run.status = 'running';
    (run as any).child = child;

    await runs.shutdownActive({ graceMs: 1 });

    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(run.status).toBe('canceled');
  });

  it('uses adapter abort before process signals for ACP-style runs', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const run = runs.create();
    run.status = 'running';
    run.stdinOpen = true;
    (run as any).child = child;
    (run as any).acpSession = {
      abort: vi.fn(() => {
        expect(child.stdin.end).not.toHaveBeenCalled();
        expect(run.stdinOpen).toBe(true);
      }),
    };

    await runs.shutdownActive({ graceMs: 10 });

    expect((run as any).acpSession.abort).toHaveBeenCalledTimes(1);
    expect(child.lifecycle.slice(0, 2)).toEqual(['stdin.end', 'SIGTERM']);
    expect(child.signals).toEqual(['SIGTERM']);
    expect(run.status).toBe('canceled');
  });

  it('closes child stdin for active runs during shutdown before signaling them', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const run = runs.create();
    run.status = 'running';
    run.stdinOpen = true;
    (run as any).child = child;

    await runs.shutdownActive({ graceMs: 10 });

    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(run.stdinOpen).toBe(false);
    expect(child.lifecycle.slice(0, 2)).toEqual(['stdin.end', 'SIGTERM']);
    expect(child.signals).toEqual(['SIGTERM']);
  });
});

describe('chat run service stream replay', () => {
  it('always replays the final event when a reattaching client cursor is at the end of a terminal run', () => {
    const sendCalls: Array<{ event: string; data: unknown; id: number }> = [];
    const endCalls: number[] = [];
    const runs = createChatRunService({
      createSseResponse: () => ({
        send: vi.fn((event: string, data: unknown, id: number) => {
          sendCalls.push({ event, data, id });
          return true;
        }),
        end: vi.fn(() => endCalls.push(1)),
        cleanup: vi.fn(),
      }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
    });

    const run = runs.create({ projectId: 'p', conversationId: 'c' }) as any;
    runs.emit(run, 'stdout', { text: 'hello' });
    runs.finish(run, 'succeeded', 0, null);

    const finalEventId = run.events.at(-1).id;
    const fakeReq = {
      get: () => null,
      query: { after: String(finalEventId) },
    } as never;
    const fakeRes = { on: () => {} } as never;

    sendCalls.length = 0;
    runs.stream(run, fakeReq, fakeRes);

    expect(sendCalls.length).toBeGreaterThanOrEqual(1);
    expect(sendCalls.at(-1)?.event).toBe('end');
    expect(endCalls.length).toBe(1);
  });

  it('does not duplicate events when the cursor sits before the final event', () => {
    const sendCalls: Array<{ event: string; data: unknown; id: number }> = [];
    const runs = createChatRunService({
      createSseResponse: () => ({
        send: vi.fn((event: string, data: unknown, id: number) => {
          sendCalls.push({ event, data, id });
          return true;
        }),
        end: vi.fn(),
        cleanup: vi.fn(),
      }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
    });

    const run = runs.create() as any;
    runs.emit(run, 'stdout', { text: 'a' });
    runs.emit(run, 'stdout', { text: 'b' });
    runs.finish(run, 'succeeded', 0, null);

    const cursor = run.events[0].id;
    runs.stream(
      run,
      { get: () => null, query: { after: String(cursor) } } as never,
      { on: () => {} } as never,
    );

    expect(sendCalls.map((c) => c.id)).toEqual(
      run.events.filter((e: { id: number }) => e.id > cursor).map((e: { id: number }) => e.id),
    );
  });
});

function createRuns() {
  return createChatRunService({
    createSseResponse: () => ({
      send: vi.fn(() => true),
      end: vi.fn(),
      cleanup: vi.fn(),
    }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

function readOneLine(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) return Promise.reject(new Error('missing stdout'));
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('timed out waiting for child readiness')), 1000);
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += String(chunk);
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        clearTimeout(timeout);
        resolve(buffer.slice(0, newline));
      }
    });
    stream.on('error', reject);
  });
}

async function expectPidGone(pid: number): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`expected pid ${pid} to be gone`);
}

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  killed = false;
  signals: string[] = [];
  lifecycle: string[] = [];
  stdin = {
    destroyed: false,
    end: vi.fn(() => {
      this.lifecycle.push('stdin.end');
      this.stdin.destroyed = true;
    }),
  };

  constructor(private readonly options: { closeOn: 'SIGTERM' | 'SIGKILL' }) {
    super();
  }

  kill(signal: string): boolean {
    this.killed = true;
    this.signals.push(signal);
    this.lifecycle.push(signal);
    if (signal === this.options.closeOn) {
      this.signalCode = signal;
      queueMicrotask(() => {
        this.emit('exit', null, signal);
        this.emit('close', null, signal);
      });
    }
    return true;
  }
}

// Persist every SSE event the daemon emits to a per-run JSONL file at
// <runsLogDir>/<runId>/events.jsonl. The path is surfaced on statusBody
// as `eventsLogPath`, which is what the MCP `get_run` tool returns to
// the external coding agent — so Codex / Cursor / Zed can `tail` the
// file in their own shell during a long-running OD generation, instead
// of cancelling the run because polling shows nothing changing.
describe('run event log persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-runs-log-test-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  function createRunsWithLog(runsLogDir: string | null) {
    return createChatRunService({
      createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
      // runs.ts is `// @ts-nocheck`, so the inferred type for the
      // `runsLogDir = null` default narrows to literal `null` from the
      // outside; cast to bypass and pass the real string. Production
      // callers (server.ts) use a string path directly.
      runsLogDir: runsLogDir as unknown as null,
    });
  }

  it('writes each emitted event as a JSONL line under runsLogDir/<runId>/events.jsonl', async () => {
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({ projectId: 'p1' });

    runs.emit(run, 'agent', { type: 'text_delta', delta: 'hello' });
    runs.emit(run, 'agent', { type: 'text_delta', delta: ' world' });
    runs.finish(run, 'succeeded', 0, null);

    // Wait for the write stream to fully flush to disk. The stream is
    // buffered through libuv; .end() is async and only resolves once
    // the kernel has accepted everything. Poll for the expected line
    // count with a short cap to keep the test snappy.
    const logPath = path.join(tmpDir, run.id, 'events.jsonl');
    let lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(logPath)) {
        const text = fs.readFileSync(logPath, 'utf8').trim();
        lines = text ? text.split('\n') : [];
        if (lines.length >= 3) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(fs.existsSync(logPath)).toBe(true);
    expect(lines.length).toBe(3); // 2 agent + 1 end
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0]).toMatchObject({ event: 'agent', data: { type: 'text_delta', delta: 'hello' } });
    expect(parsed[1]).toMatchObject({ event: 'agent', data: { type: 'text_delta', delta: ' world' } });
    expect(parsed[2]).toMatchObject({ event: 'end', data: { status: 'succeeded' } });
  });

  it('persists a restart-safe terminal state and telemetry checkpoints', () => {
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({
      projectId: 'p1',
      conversationId: 'c1',
      assistantMessageId: 'm1',
      agentId: 'claude',
      workspaceScope: {
        schemaVersion: 1,
        projectId: 'p1',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
        source: 'persisted_project_binding',
      },
      designSystemScope: {
        schemaVersion: 1,
        kind: 'workspace-resource',
        projectId: 'p1',
        designSystemId: 'user:brand-a',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
        bindingResourceId: 'user:brand-a',
        visibility: 'personal',
        bindingResourceState: 'active',
        bindingVersion: 1,
        bindingCreatedAt: 50,
        bindingUpdatedAt: 100,
        bindingCreatedByWorkspaceMemberId: 'member-a',
      },
    });
    const statePath = path.join(tmpDir, run.id, 'state.json');

    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      id: run.id,
      status: 'queued',
      assistantMessageId: 'm1',
      workspaceScope: {
        schemaVersion: 1,
        projectId: 'p1',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
        source: 'persisted_project_binding',
      },
      designSystemScope: {
        kind: 'workspace-resource',
        designSystemId: 'user:brand-a',
        bindingResourceId: 'user:brand-a',
        visibility: 'personal',
      },
    });

    runs.setAnalyticsRecovery(run, {
      context: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'desktop',
        locale: 'zh-CN',
      },
      properties: {
        page_name: 'chat_panel',
        area: 'chat_panel',
        project_id: 'p1',
        conversation_id: 'c1',
        run_id: run.id,
      },
      insertId: 'run-created-1',
    });
    run.status = 'running';
    runs.emit(run, 'start', { status: 'running' });
    runs.finish(run, 'failed', 1, null);
    runs.markAnalyticsCompleted(run);
    runs.markLangfuseCompleted(run);

    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toMatchObject({
      status: 'failed',
      exitCode: 1,
      analyticsRecovery: {
        insertId: 'run-created-1',
        completedAt: expect.any(Number),
      },
      langfuseCompletedAt: expect.any(Number),
    });
  });

  it('restores the accepted plugin workflow binding from durable run state', () => {
    const pluginWorkflowId = '018f6f2e-4444-7444-8444-444444444444';
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({
      projectId: 'p1',
      conversationId: 'c1',
      clientRequestId: '018f6f2e-5555-7555-8555-555555555555',
      requestFingerprint: 'same-logical-request',
      agentId: 'amr',
      analyticsHints: {
        entrySurface: 'external_mcp',
        hostProduct: 'codex_unknown',
        externalPluginId: 'open-design',
        externalPluginVersion: '0.4.0',
        distributionMechanism: 'git_marketplace',
        publisherClass: 'open_design_first_party',
        attributionQuality: 'session_correlated',
        pluginWorkflowId,
        logicalRequestDigest: 'a'.repeat(64),
        logicalRequestDigestVersion: 1,
        generationSloWindowMs: 45 * 60 * 1000,
      },
    });
    runs.finish(run, 'succeeded', 0, null);

    const restarted = createRunsWithLog(tmpDir);
    expect(restarted.findByPluginWorkflowId(pluginWorkflowId)).toMatchObject({
      id: run.id,
      projectId: 'p1',
      externalPluginAnalytics: {
        externalPluginId: 'open-design',
        pluginWorkflowId,
        logicalRequestDigest: 'a'.repeat(64),
      },
    });
  });

  it('retains the cancellation cause when hydrating durable status after restart', async () => {
    const beforeRestart = createRunsWithLog(tmpDir);
    const canceled = beforeRestart.create({ projectId: 'p1' });
    await beforeRestart.cancel(canceled, 'user_stop');

    const afterRestart = createRunsWithLog(tmpDir);
    const hydrated = afterRestart.get(canceled.id);

    expect(hydrated).not.toBeNull();
    expect(afterRestart.statusBody(hydrated)).toMatchObject({
      id: canceled.id,
      status: 'canceled',
      cancelOrigin: 'user_stop',
    });
  });

  it('reuses an interrupted durable request instead of starting it twice after restart', () => {
    const clientRequestId = '018f6f2e-6666-7666-8666-666666666666';
    const requestFingerprint = 'same-cloud-request';
    const beforeRestart = createRunsWithLog(tmpDir);
    const original = beforeRestart.create({
      agentId: 'amr',
      clientRequestId,
      projectId: 'p1',
      requestFingerprint,
    });
    const statePath = path.join(tmpDir, original.id, 'state.json');
    const runningState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    fs.writeFileSync(
      statePath,
      `${JSON.stringify({ ...runningState, status: 'running' })}\n`,
      'utf8',
    );

    const afterRestart = createRunsWithLog(tmpDir);
    const reused = afterRestart.createOrReuse({
      agentId: 'amr',
      clientRequestId,
      projectId: 'p1',
      requestFingerprint,
    });

    expect(reused.kind).toBe('reused');
    expect(reused.run).toMatchObject({
      id: original.id,
      status: 'failed',
      errorCode: 'DAEMON_RESTARTED',
      error: 'Run interrupted because the daemon restarted.',
    });
    expect(afterRestart.statusBody(reused.run).terminalTrigger).toBe('daemon_restart');
    expect(reused.run.events.slice(-2)).toMatchObject([
      { event: 'error', data: { error: { code: 'DAEMON_RESTARTED' } } },
      { event: 'end', data: { status: 'failed' } },
    ]);
    expect(fs.readdirSync(tmpDir)).toEqual([original.id]);
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toMatchObject({
      id: original.id,
      status: 'failed',
      errorCode: 'DAEMON_RESTARTED',
      terminalRecoveryReason: 'daemon_restart',
    });
  });

  it('persists native session recovery diagnostics in the run event log', async () => {
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({ projectId: 'p1' });

    runs.emit(run, 'diagnostic', {
      type: 'native_session_recovery',
      nativeSessionRecovery: {
        agentId: 'amr',
        state: 'resumed',
        acquisition: 'acp-session-load',
        continuation: 'acp-session-load',
        handle: {
          present: true,
          kind: 'acp-session-handle',
          display: null,
          sha256: 'b'.repeat(64),
          redacted: true,
        },
        guardReason: null,
        fallbackReason: null,
        updatedAt: 456,
      },
    });
    runs.finish(run, 'succeeded', 0, null);

    const logPath = path.join(tmpDir, run.id, 'events.jsonl');
    let text = '';
    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(logPath)) {
        text = fs.readFileSync(logPath, 'utf8');
        if (text.includes('native_session_recovery')) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const parsed = text.trim().split('\n').map((line) => JSON.parse(line));
    expect(parsed[0]).toMatchObject({
      event: 'diagnostic',
      data: {
        type: 'native_session_recovery',
        nativeSessionRecovery: {
          agentId: 'amr',
          state: 'resumed',
          handle: { display: null, redacted: true },
        },
      },
    });
  });

  it('exposes eventsLogPath on statusBody when runsLogDir is configured', () => {
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({ projectId: 'p1' });

    const body = runs.statusBody(run);
    expect(body.eventsLogPath).toBe(path.join(tmpDir, run.id, 'events.jsonl'));
  });

  it('reports eventsLogPath: null when runsLogDir is not configured (back-compat)', () => {
    const runs = createRunsWithLog(null);
    const run = runs.create({ projectId: 'p1' });

    const body = runs.statusBody(run);
    expect(body.eventsLogPath).toBeNull();
  });

  it('does not touch the filesystem when runsLogDir is not configured', () => {
    const runs = createRunsWithLog(null);
    const run = runs.create({ projectId: 'p1' });
    runs.emit(run, 'agent', { type: 'text_delta', delta: 'x' });
    runs.finish(run, 'succeeded', 0, null);

    // The tmpDir we'd otherwise have written under stays empty
    // because we configured runsLogDir=null.
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('does not re-open the event log stream for events emitted after the run finished (FD-leak guard)', () => {
    // finish() closes the per-run events.jsonl write stream and nulls it. The
    // stream is opened lazily on emit, so an event emitted AFTER finish (a late
    // async child-close diagnostic, a trailing tool callback, telemetry) would
    // re-open a NEW write stream that finish() — guarded against re-running on a
    // terminal run — never closes. Each such late emit then leaks one file
    // descriptor; over a long-lived daemon this exhausts the fd table and
    // posix_spawn starts returning EBADF (#3408 P1, distinct from the stdio
    // leak fixed in #4163).
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({ projectId: 'p1' });

    runs.emit(run, 'agent', { type: 'text_delta', delta: 'hi' }); // opens the stream
    runs.finish(run, 'succeeded', 0, null); // closes + nulls the stream
    expect(run.eventsLogStream).toBeNull();

    // A late event must NOT lazily re-open a stream that will never be closed.
    runs.emit(run, 'diagnostic', { type: 'runtime_close' });
    expect(run.eventsLogStream).toBeNull();
  });

  it("still writes finish()'s own end event for a run that finished with no prior events", async () => {
    // Regression for the FD-leak guard: finish() sets status terminal before
    // emitting `end`, so the guard must NOT block that in-progress emit — a
    // no-output failure / queued-run cancellation, where `end` is the only
    // event, must still leave a forensic events.jsonl on disk.
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({ projectId: 'p1' });

    runs.finish(run, 'canceled', null, 'SIGTERM'); // no prior emit; end is the only event

    const logPath = path.join(tmpDir, run.id, 'events.jsonl');
    let lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(logPath)) {
        const text = fs.readFileSync(logPath, 'utf8').trim();
        lines = text ? text.split('\n') : [];
        if (lines.length >= 1) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(fs.existsSync(logPath)).toBe(true);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'end', data: { status: 'canceled' } });
    // …but the stream is closed and a later emit still must not re-open it.
    expect(run.eventsLogStream).toBeNull();
    runs.emit(run, 'diagnostic', { type: 'runtime_close' });
    expect(run.eventsLogStream).toBeNull();
  });

  it('does not leak real file descriptors across many finished runs with late emits', async () => {
    // fd-level proof of the leak (the actual cause of spawn EBADF), not just the
    // JS-object proxy above. Repeatedly: open the log, finish, then emit late.
    // On the buggy code each late emit re-opens a WriteStream whose fd stays
    // open as long as the run object is referenced — so N iterations leak ~N
    // fds. With the fix the count stays flat. Linux/macOS expose the process's
    // open fds at /dev/fd; skip elsewhere (Windows has no equivalent dir).
    const fdDir = '/dev/fd';
    if (!fs.existsSync(fdDir)) return;
    const countFds = () => fs.readdirSync(fdDir).length;

    const runs = createRunsWithLog(tmpDir);
    const kept: unknown[] = []; // hold run refs so leaked streams can't be GC'd
    const ITER = 60;
    const before = countFds();
    for (let i = 0; i < ITER; i++) {
      const run = runs.create({ projectId: 'p1', conversationId: `c${i}` });
      kept.push(run);
      runs.emit(run, 'agent', { type: 'text_delta', delta: 'x' });
      runs.finish(run, 'succeeded', 0, null);
      runs.emit(run, 'diagnostic', { type: 'runtime_close' }); // late — must not re-open
    }
    // createWriteStream opens its fd asynchronously, so any leaked streams from
    // the late emits only hold their fd a tick later — wait for opens to settle
    // before counting, otherwise the leak is invisible to a synchronous count.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const after = countFds();
    // Generous noise margin, far below ITER. On the buggy code this grows by
    // ~ITER (each late emit re-opened a never-closed stream).
    expect(after - before).toBeLessThan(15);
    expect(kept.length).toBe(ITER);
  });
});
