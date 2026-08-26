export type ElectronShutdownSteps = Readonly<{
  waitForHeartbeat(): void | Promise<void>;
  releaseRendererIntegration(): void | Promise<void>;
  disposeWarmup(): void | Promise<void>;
  releaseStandalone(): void | Promise<void>;
  stopActivation(): void | Promise<void>;
  observe(failures: readonly unknown[]): void;
  flushObservation(): void | Promise<void>;
  destroyWindow(): void;
}>;

/** Complete authoritative runtime ownership before destroying the last window. */
export async function completeElectronShutdown(steps: ElectronShutdownSteps): Promise<void> {
  const failures: unknown[] = [];
  const attempt = async (operation: () => void | Promise<void>): Promise<void> => {
    try { await operation(); }
    catch (error) { failures.push(error); }
  };
  await attempt(steps.waitForHeartbeat);
  await attempt(steps.releaseRendererIntegration);
  await attempt(steps.disposeWarmup);
  await attempt(steps.releaseStandalone);
  await attempt(steps.stopActivation);
  try { steps.observe(failures); }
  catch { /* Diagnostics are non-authoritative. */ }
  await attempt(steps.flushObservation);
  steps.destroyWindow();
  if (failures.length > 0) throw new AggregateError(failures, "Electron Shell shutdown failed");
}
