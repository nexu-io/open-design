/**
 * Off-thread evaluation — run {@link compile} on a dedicated worker thread so a
 * CPU-heavy exact-rational evaluation (a deep subdivide can run tens of
 * seconds) never stalls the caller's event loop. `compileInWorker` is a
 * drop-in async replacement for `compile`.
 *
 * Why the WHOLE compile, not just the kernel eval: `CompileRequest` and
 * `CompileResult` are JSON-safe by construction (the result is the HTTP body),
 * so both cross the thread boundary through a proven serializer. Moving only
 * the evaluator off-thread would force a bespoke boundary around the exact
 * mesh (rationals over bigint) — trading a proven boundary for an unproven one.
 * `child_process.spawn` (Blender) and `fs` work the same inside a worker; the
 * child is owned by the process, not the thread.
 *
 * One-shot per compile: a fresh worker gives a leak-proof, crash-isolated heap
 * — a pathological compile dies with its worker instead of poisoning a shared
 * pool. The spawn+load cost is noise against a multi-second Blender compile.
 */
import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "./pipeline.js";
import type { CompileRequest, CompileResult } from "./types.js";

/**
 * The bundled worker entry. It sits beside THIS module in `dist/` (esbuild
 * emits both), so it resolves relative to this file's URL — no package
 * `exports` entry required.
 */
const WORKER_URL = new URL("./compile-worker.mjs", import.meta.url);

/**
 * Whether the off-thread worker entry is present on disk, resolved ONCE at
 * module load. A relocated or re-bundled build (packaged Electron, asar) can
 * leave {@link WORKER_URL} pointing at a path that no longer exists; probing it
 * up front lets {@link compileInWorker} fall back to an inline compile *loudly*
 * rather than silently reintroducing the event-loop stall this module exists to
 * remove.
 */
export const workerEvalAvailable: boolean = (() => {
  try {
    return existsSync(fileURLToPath(WORKER_URL));
  } catch {
    return false;
  }
})();

export interface CompileInWorkerOptions {
  /**
   * Cooperative cancellation. When it aborts, a shared flag is flipped and the
   * worker's evaluation throws at its next work-meter checkpoint (once per
   * subdivide level), so a long CPU phase is abandoned promptly. The abandoned
   * worker is NOT terminated — it winds down on its own so a Blender child is
   * never orphaned — and the returned promise rejects with an `AbortError`.
   * Cancellation reaches the CPU evaluation phase and each pipeline stage
   * boundary (so no further Blender stage starts); a Blender stage already in
   * flight runs to completion, bounded by the request's per-stage `timeoutMs`.
   */
  signal?: AbortSignal;
  /**
   * Optional wall-clock backstop, in milliseconds. DEFAULT: none.
   *
   * Off-thread eval deliberately has NO arbitrary time cap: a legitimate dense
   * asset may take minutes, and capping wall-clock would reject real work. The
   * real guards already exist — the kernel work meter bounds the CPU phase, and
   * `compile()`'s own per-stage `timeoutMs` bounds Blender. Set this only as a
   * last-resort hang breaker; on fire the worker is terminated, which can
   * orphan a Blender child, so a caller that sets it owns that risk. Prefer
   * {@link signal} for ordinary cancellation.
   */
  hardTimeoutMs?: number;
  /**
   * Sink for the one-line warning emitted when eval falls back to a blocking
   * inline compile. Wire it to a real logger: a silent fallback hides a
   * genuine regression (the event loop is blocking again).
   */
  onFallback?: (reason: string) => void;
  /**
   * Fired EXACTLY ONCE when the underlying worker has fully exited (or, on the
   * inline path, when the compile settles) — i.e. when the scene directory is
   * no longer being written and the thread/Blender resources are released.
   *
   * This can fire AFTER the returned promise settles: an abort rejects the
   * caller promptly, but the worker keeps winding down (a Blender stage runs to
   * its own `timeoutMs`). A scheduler that bounds concurrency, or a caller that
   * guards a scene dir against concurrent writers, must hold its slot until
   * THIS fires — not until the promise settles — or an abandoned-but-still-live
   * worker would let a second compile overrun the limit or clobber the same
   * `out/`.
   */
  onExit?: () => void;
}

type WorkerReply =
  | { ok: true; json: string }
  | { ok: false; name?: string; message?: string; stack?: string };

/** The standard cancellation rejection — an `AbortError`, matching `fetch` and
 *  every other `AbortSignal` consumer, so callers branch on `err.name`. */
function abortError(): Error {
  return new DOMException("The compile was aborted", "AbortError");
}

/** Run {@link compile} inline when the worker is unavailable, honouring an
 *  abort signal through the same cooperative-cancel path and normalising the
 *  kernel's cancel throw to the standard `AbortError`. */
function compileInline(
  request: CompileRequest,
  signal: AbortSignal | undefined,
): Promise<CompileResult> {
  const control = signal ? { shouldCancel: () => signal.aborted } : {};
  return compile(request, control).catch((err: unknown) => {
    if (signal?.aborted || (err as Error)?.name === "EvalCancelledError") throw abortError();
    throw err;
  });
}

/**
 * Run {@link compile} off the caller's thread. See the module docblock for the
 * boundary and isolation rationale.
 */
export function compileInWorker(
  request: CompileRequest,
  options: CompileInWorkerOptions = {},
): Promise<CompileResult> {
  const { signal } = options;
  // Fire onExit exactly once, on whichever terminal path this call takes — so a
  // scheduler holding a slot on it is always released.
  let exitFired = false;
  const fireExit = (): void => {
    if (exitFired) return;
    exitFired = true;
    options.onExit?.();
  };

  if (signal?.aborted) {
    fireExit();
    return Promise.reject(abortError());
  }

  if (!workerEvalAvailable) {
    options.onFallback?.(
      `scene3d worker entry missing at ${WORKER_URL.href} — compiling inline (blocks the event loop)`,
    );
    return compileInline(request, signal).finally(fireExit);
  }

  return new Promise<CompileResult>((resolve, reject) => {
    // One shared Int32 cell the worker polls (never blocks on) at its work-meter
    // checkpoints — the only channel that can reach a synchronous eval loop,
    // which never yields to receive a message.
    const cancelBuf = new SharedArrayBuffer(4);
    const cancelFlag = new Int32Array(cancelBuf);

    let worker: Worker;
    try {
      worker = new Worker(WORKER_URL, { workerData: { request, cancelBuf } });
    } catch (err) {
      // Construction itself failed (a runtime without worker_threads). Fall
      // back loudly rather than fail the compile outright.
      options.onFallback?.(
        `scene3d worker failed to start (${(err as Error).message}) — compiling inline (blocks the event loop)`,
      );
      compileInline(request, signal).finally(fireExit).then(resolve, reject);
      return;
    }

    // A crashed worker (uncaught throw, OOM) surfaces as 'error' and/or a
    // nonzero 'exit', NOT a rejected promise. Every outcome funnels through one
    // settle-once guard so an OOM'd worker can never hang the caller forever.
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    };

    // Normal / crash / timeout outcomes: the worker is finished (a success
    // reply means compile() returned, so Blender is already done) or dead, so
    // terminating it is just cleanup.
    const settle = (act: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      void worker.terminate();
      act();
    };

    if (signal) {
      onAbort = () => {
        // Flip the shared flag so the worker's eval throws at its next
        // checkpoint. Storing it is harmless even after we've settled.
        Atomics.store(cancelFlag, 0, 1);
        if (settled) return;
        settled = true;
        cleanup();
        // Deliberately NOT worker.terminate(): a hard kill would orphan a
        // Blender child mid-run. The worker winds down cooperatively; unref so
        // the abandoned thread can't hold the event loop while it does.
        worker.unref();
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort);
    }

    worker.on("message", (msg: WorkerReply) => {
      if (msg && msg.ok) {
        settle(() => resolve(JSON.parse(msg.json) as CompileResult));
      } else if (msg && msg.name === "EvalCancelledError") {
        // The worker confirms it stopped for a cancel (a race where abort landed
        // just before the poll) — surface it as the standard AbortError.
        settle(() => reject(abortError()));
      } else {
        const err = new Error(msg?.message ?? "scene3d worker failed");
        if (msg?.name) err.name = msg.name;
        if (msg?.stack) err.stack = msg.stack;
        settle(() => reject(err));
      }
    });
    worker.on("error", (err) => settle(() => reject(err)));
    worker.on("exit", (code) => {
      // The worker is truly gone now — release any resource held on this call,
      // even when the caller already settled (a normal success we terminated,
      // or an abort we rejected while the worker was still winding down).
      fireExit();
      settle(() =>
        reject(new Error(`scene3d worker exited (code ${code}) before returning a result`)),
      );
    });

    // Guard Number.isFinite, not just > 0: Node clamps a non-finite or
    // overflowing timer delay to ~1ms rather than treating it as "no timeout",
    // so an Infinity slipping through would fire an INSTANT termination — the
    // opposite of the documented backstop.
    if (
      typeof options.hardTimeoutMs === "number" &&
      Number.isFinite(options.hardTimeoutMs) &&
      options.hardTimeoutMs > 0
    ) {
      timer = setTimeout(() => {
        settle(() =>
          reject(new Error(`scene3d worker exceeded hardTimeoutMs=${options.hardTimeoutMs}`)),
        );
      }, options.hardTimeoutMs);
    }
  });
}
