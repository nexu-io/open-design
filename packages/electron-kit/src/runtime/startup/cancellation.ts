export class ElectronStartupCancelledError extends Error {
  readonly code = "electron-startup-cancelled";

  constructor(message = "Electron Shell startup was cancelled") {
    super(message);
    this.name = "ElectronStartupCancelledError";
  }
}

export function isElectronStartupCancelledError(error: unknown): error is ElectronStartupCancelledError {
  return error instanceof ElectronStartupCancelledError;
}

export type ElectronStartupQuitEvent = Readonly<{ preventDefault(): void }>;

export type ElectronStartupQuitApp = Readonly<{
  on(event: "before-quit", listener: (event: ElectronStartupQuitEvent) => void): void;
  removeListener(event: "before-quit", listener: (event: ElectronStartupQuitEvent) => void): void;
  quit(): void;
}>;

export type ElectronStartupQuitBarrier = Readonly<{
  readonly cancelled: boolean;
  readonly settled: Promise<void>;
  guard<T>(operation: Promise<T>): Promise<T>;
  cancel(error?: unknown): Promise<void>;
  commit(): void;
}>;

/**
 * Holds Electron's quit until startup-owned resources have been cancelled and
 * released. Repeated before-quit events share one cleanup and one final quit.
 */
export function installElectronStartupQuitBarrier(input: Readonly<{
  app: ElectronStartupQuitApp;
  cancelAttempt(): void;
  cleanup(error: unknown): void | Promise<void>;
  observeFailure?(error: unknown): void;
}>): ElectronStartupQuitBarrier {
  const controller = new AbortController();
  let phase: "starting" | "cancelling" | "cancelled" | "committed" = "starting";
  let quitAfterCleanup = false;
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });

  const cancel = (error: unknown): Promise<void> => {
    if (phase !== "starting") return settled;
    phase = "cancelling";
    try { input.cancelAttempt(); }
    finally { controller.abort(error); }
    void Promise.resolve()
      .then(() => input.cleanup(error))
      .catch((cleanupError: unknown) => {
        try { input.observeFailure?.(cleanupError); }
        catch { /* Diagnostics are non-authoritative. */ }
      })
      .finally(() => {
        phase = "cancelled";
        input.app.removeListener("before-quit", beforeQuit);
        resolveSettled();
        if (quitAfterCleanup) input.app.quit();
      });
    return settled;
  };

  const beforeQuit = (event: ElectronStartupQuitEvent): void => {
    if (phase === "committed") return;
    event.preventDefault();
    quitAfterCleanup = true;
    void cancel(new ElectronStartupCancelledError());
  };

  input.app.on("before-quit", beforeQuit);
  return Object.freeze({
    get cancelled() { return phase === "cancelling" || phase === "cancelled"; },
    settled,
    cancel,
    guard<T>(operation: Promise<T>): Promise<T> {
      if (controller.signal.aborted) return Promise.reject(controller.signal.reason);
      return new Promise<T>((resolve, reject) => {
        const abort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", abort, { once: true });
        void operation.then(resolve, reject).finally(() => {
          controller.signal.removeEventListener("abort", abort);
        });
      });
    },
    commit(): void {
      if (phase !== "starting") throw new ElectronStartupCancelledError();
      phase = "committed";
      input.app.removeListener("before-quit", beforeQuit);
      resolveSettled();
    },
  });
}

export type ElectronStartupCancellationSteps = Readonly<{
  disposeWarmup(): void | Promise<void>;
  settleRendererMount(): void | Promise<void>;
  releaseRendererIntegration(): void | Promise<void>;
  releaseStandaloneAttachment(): void | Promise<void>;
  failActivation(): void | Promise<void>;
  observe(failures: readonly unknown[]): void;
  flushObservation(): void | Promise<void>;
  destroyWindows(): void;
}>;

/** Run every startup owner cleanup even when an earlier owner fails. */
export async function completeElectronStartupCancellation(steps: ElectronStartupCancellationSteps): Promise<void> {
  const failures: unknown[] = [];
  const attempt = async (operation: () => void | Promise<void>): Promise<void> => {
    try { await operation(); }
    catch (error) { failures.push(error); }
  };
  await attempt(steps.disposeWarmup);
  await attempt(steps.settleRendererMount);
  await attempt(steps.releaseRendererIntegration);
  await attempt(steps.releaseStandaloneAttachment);
  await attempt(steps.failActivation);
  try { steps.observe(failures); }
  catch { /* Diagnostics are non-authoritative. */ }
  await attempt(steps.flushObservation);
  steps.destroyWindows();
  if (failures.length > 0) throw new AggregateError(failures, "Electron Shell startup cancellation failed");
}
