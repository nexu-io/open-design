import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { T } from '@/timeouts';
import { runVelaContract } from '@/amr/vela-contract';
import { attachAcpSession } from '../../../apps/daemon/src/agent-protocol/acp/session.ts';
import { summarizeRunToolProgress } from '../../../apps/daemon/src/run-diagnostics.ts';
import { decideSafeRunRetry } from '../../../apps/daemon/src/run-retry-policy.ts';

// This resolves the exact dependency used by packaging; no developer PATH fallback.
const requirePack = createRequire(new URL('../../../tools/pack/package.json', import.meta.url));
const resolveBinary = () => (requirePack('@powerformer/vela-cli') as { resolveVelaCliBin: (input: { strict: boolean }) => string }).resolveVelaCliBin({ strict: true });

class ReplayChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill() { return true; }
}

// Replay the *actual* binary transcript through the current daemon consumer.
function consume(result: Awaited<ReturnType<typeof runVelaContract>>) {
  const child = new ReplayChild();
  const events: Array<{ event: string; data: unknown }> = [];
  const session = attachAcpSession({ child: child as never, prompt: 'contract', model: 'contract-model',
    send: (event, data) => events.push({ event, data }) });
  for (const frame of result.received) {
    // Host cancellation precedes the agent acknowledgement in the real flow.
    if (frame.result?.stopReason === 'cancelled') session.abort();
    child.stdout.write(`${JSON.stringify(frame)}\n`);
  }
  const completed = session.completedSuccessfully();
  const fatal = session.hasFatalError();
  session.abort();
  return { events, completed, fatal, progress: summarizeRunToolProgress(events) };
}

describe.skipIf(process.platform === 'win32')('Vela package dependency / daemon wire contract', () => {
  let root: string;
  let binary: string;
  let failed = false;
  afterEach(({ task }) => { failed ||= task.result?.state === 'fail'; });
  beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'od-vela-contract-')); binary = resolveBinary(); });
  afterAll(async () => {
    if (failed) console.error(`Vela contract scratch retained: ${root}`);
    else if (root) await rm(root, { recursive: true, force: true });
  }, T.long);

  it('[P1] runs the exact package pin rather than trusting initialize agentInfo', () => {
    const pin = (requirePack('./package.json') as { optionalDependencies: Record<string, string> }).optionalDependencies['@powerformer/vela-cli'];
    expect(execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim()).toBe(pin);
  }, T.long);

  it('[P1] accepts a compaction continuation only after its terminal model step', async () => {
    const result = await runVelaContract({ binary, directory: join(root, 'complete'), scenario: 'complete' });
    expect(result.terminal.result?.stopReason).toBe('end_turn');
    const consumed = consume(result);
    expect(consumed.completed).toBe(true);
    expect(consumed.fatal).toBe(false);
    expect(consumed.progress).toMatchObject({ toolCallSeen: true, toolResultSent: true, hasOutstandingTool: false });
    expect(result.openCodeRequests.filter(request => request.path.endsWith('/prompt_async'))).toHaveLength(1);
  }, T.long);

  it('[P1] preserves 0.0.35 incomplete protection and never turns committed tools into an automatic full replay', async () => {
    const result = await runVelaContract({ binary, directory: join(root, 'incomplete'), scenario: 'incomplete' });
    expect(result.terminal.result).toBeUndefined();
    expect(result.terminal.error).toMatchObject({ data: { kind: 'opencode_prompt_error', runtime: 'opencode', phase: 'event_stream', lastToolStatus: 'completed' } });
    expect(result.terminal.error?.message).toContain('compaction continuation ended before prompt completion');
    const consumed = consume(result);
    expect(consumed.completed).toBe(false);
    expect(consumed.fatal).toBe(true);
    expect(consumed.progress.toolResultSent).toBe(true);
    expect(decideSafeRunRetry({ result: 'failed', attemptCount: 0, failure: { failure_category: 'upstream_unavailable', failure_detail: 'stream_disconnected', retryable: true }, sideEffects: { toolCallSeen: true, artifactWriteSeen: true } }).shouldRetry).toBe(false);
    expect(result.sent.filter(frame => frame.method === 'session/prompt')).toHaveLength(1);
    expect(result.openCodeRequests.filter(request => request.path.endsWith('/prompt_async'))).toHaveLength(1);
  }, T.long);

  it('[P1] cancels an outstanding Write without claiming success or resending it', async () => {
    const result = await runVelaContract({ binary, directory: join(root, 'cancel'), scenario: 'write-stall', cancel: true });
    expect(result.terminal.result?.stopReason).toBe('cancelled');
    expect(result.openCodeRequests.filter(request => request.path.endsWith('/abort'))).toHaveLength(1);
    expect(result.openCodeRequests.filter(request => request.path.endsWith('/prompt_async'))).toHaveLength(1);
    const consumed = consume(result);
    expect(consumed.completed).toBe(false);
    expect(consumed.progress.hasOutstandingTool).toBe(true);
  }, T.long);

  it('[P1] does not let a completed tool hide an outstanding parallel Write', async () => {
    const result = await runVelaContract({ binary, directory: join(root, 'outstanding'), scenario: 'incomplete-outstanding' });
    expect(result.terminal.error).toBeDefined();
    expect(result.terminal.result).toBeUndefined();
    expect(consume(result).progress).toMatchObject({ toolCallSeen: true, toolResultSent: false, hasOutstandingTool: true });
  }, T.long);

  it('[P1] keeps unknown runtime errors unsuccessful', async () => {
    const result = await runVelaContract({ binary, directory: join(root, 'unknown'), scenario: 'unknown-error' });
    expect(result.terminal.error?.data?.kind).toBe('opencode_prompt_error');
    expect(result.terminal.result).toBeUndefined();
    expect(consume(result)).toMatchObject({ completed: false, fatal: true });
  }, T.long);
});
