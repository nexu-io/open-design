/**
 * Off-thread entry point for {@link compile}.
 *
 * esbuild bundles this file to `dist/compile-worker.mjs`, beside
 * `dist/index.mjs`; {@link compileInWorker} spawns it so a CPU-heavy
 * exact-rational evaluation never stalls the caller's event loop.
 *
 * One-shot: the {@link CompileRequest} arrives as `workerData`, `compile()`
 * runs to completion, and the result crosses back as a JSON *string* — the
 * SAME serializer the HTTP layer runs, so the worker boundary can never pass
 * anything the eventual response can't (a class instance or cyclic graph that
 * `structuredClone` would happily transmit and `res.json()` would later choke
 * on fails HERE instead, where the stack trace is useful). Determinism is
 * unaffected: the kernel is a pure function of (trace, workBudget).
 */
import { parentPort, workerData } from "node:worker_threads";
import { compile } from "./pipeline.js";
import type { CompileRequest } from "./types.js";

interface WorkerData {
  request: CompileRequest;
  /** One Int32 cell, shared with the parent: nonzero means "cancel". Polled
   *  (never blocked on) at the kernel's work-meter checkpoints. */
  cancelBuf: SharedArrayBuffer;
}

async function main(): Promise<void> {
  if (!parentPort) {
    throw new Error("compile-worker must be run as a worker thread");
  }
  const port = parentPort;
  const { request, cancelBuf } = workerData as WorkerData;
  const cancelFlag = new Int32Array(cancelBuf);
  try {
    const result = await compile(request, {
      // Rebuilt worker-side from the shared flag — the function itself can't
      // cross the thread boundary, but the SharedArrayBuffer behind it does.
      shouldCancel: () => Atomics.load(cancelFlag, 0) !== 0,
    });
    port.postMessage({ ok: true, json: JSON.stringify(result) });
  } catch (err) {
    // compile() catches its own domain failures and returns them as issues, so
    // reaching here means an unexpected throw (or a crash on the way). Ship the
    // shape the parent needs to rebuild a real Error; a hard crash (OOM) is
    // caught by the parent's 'error'/'exit' handlers instead.
    const e = err as Error;
    port.postMessage({
      ok: false,
      name: typeof e?.name === "string" ? e.name : "Error",
      message: String(e?.message ?? err),
      stack: typeof e?.stack === "string" ? e.stack : undefined,
    });
  }
}

void main();
