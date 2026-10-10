import { Worker } from 'node:worker_threads';
import type { PrototypeStaticInput, PrototypeStaticResult } from './prototype-quality-static.js';
import type { PrototypeFinalizerInput, PrototypeFinalizerResult } from './prototype-quality-finalizer-worker.js';

export type { PrototypeStaticInput, PrototypeStaticResult } from './prototype-quality-static.js';
export type { PrototypeFinalizerInput, PrototypeFinalizerResult } from './prototype-quality-finalizer-worker.js';
interface WorkerBudget { deadlineAtMs: number; signal?: AbortSignal | undefined }
/**
 * Absolute deadline includes worker startup, filesystem snapshot and synchronous
 * parsers. Termination is awaited before returning, so timed-out parsing cannot
 * keep consuming the daemon's CPU or later publish a stale result.
 */
export async function runPrototypeStatic(input: PrototypeStaticInput & {
  deadlineAtMs: number; signal?: AbortSignal | undefined;
}): Promise<PrototypeStaticResult> {
  const result = await runWorker<PrototypeStaticResult>({ ...input });
  return { hash: result.hash, checks: result.checks,
    files: new Map([...result.files].map(([file, content]) => [file, Buffer.from(content)])) };
}

export async function runPrototypeFinalizer(input: PrototypeFinalizerInput & WorkerBudget): Promise<PrototypeFinalizerResult> {
  const { deadlineAtMs, signal, ...finalizerInput } = input;
  return runWorker<PrototypeFinalizerResult>({ job: 'finalize_deliverable', input: { ...finalizerInput, deadlineAtMs }, deadlineAtMs, signal });
}

async function runWorker<T>(input: Record<string, unknown> & WorkerBudget): Promise<T> {
  if (input.signal?.aborted) throw new Error('canceled');
  const remaining = input.deadlineAtMs - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('host_budget_exhausted');
  const { deadlineAtMs: _deadline, signal, ...workerInput } = input;
  // Both src/artifacts and dist/artifacts resolve to the same built worker.
  // Source test imports therefore also exercise the shipped JS, with no tsx loader.
  const worker = new Worker(new URL('../../dist/artifacts/prototype-quality-static-worker.js', import.meta.url), {
    workerData: workerInput, execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(new Error('canceled'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      timer = setTimeout(() => reject(new Error('host_budget_exhausted')), Math.max(1, input.deadlineAtMs - Date.now()));
      worker.once('message', (message: { ok: boolean; result?: T; reason?: string }) => {
        if (Date.now() >= input.deadlineAtMs) { reject(new Error('host_budget_exhausted')); return; }
        if (message.ok && message.result) resolve(message.result);
        else reject(new Error(message.reason ?? 'static_check_incomplete'));
      });
      worker.once('error', () => reject(new Error('static_check_incomplete')));
      worker.once('exit', () => reject(new Error('static_check_incomplete')));
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    await worker.terminate();
  }
}
