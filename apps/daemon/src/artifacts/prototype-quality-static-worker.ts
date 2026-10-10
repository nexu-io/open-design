import { parentPort, workerData } from 'node:worker_threads';
import { collectPrototypeStatic, type PrototypeStaticInput } from './prototype-quality-static.js';

/** Compiled daemon worker; it parses source as data and never executes generated code. */
if (!parentPort) throw new Error('prototype_static_worker_requires_parent');
const port = parentPort;
try {
  const result = workerData.job === 'finalize_deliverable'
    ? await (await import('./prototype-quality-finalizer-worker.js')).collectPrototypeFinalizer(workerData.input)
    : await collectPrototypeStatic(workerData as PrototypeStaticInput);
  port.postMessage({ ok: true, result });
} catch (error) {
  const message = error instanceof Error ? error.message : 'static_check_failed';
  port.postMessage({ ok: false, reason: ['snapshot_limit', 'snapshot_path_outside_project', 'snapshot_unsupported_file'].includes(message) ? message : 'static_check_incomplete' });
}
port.close();
