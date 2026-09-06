/** Control-plane availability is not product readiness. */
export async function waitForElectronProductReady(input: Readonly<{
  readStatus(): Promise<unknown>;
  assertAlive(): void;
}>): Promise<unknown> {
  let deadline = Date.now() + 120_000;
  let observedDeadline = false;
  while (Date.now() < deadline) {
    const status = await input.readStatus();
    if (status != null && typeof status === "object" && "state" in status) {
      if (status.state === "running") return status;
      if (status.state === "failed" || status.state === "stopping") throw new Error(`Electron startup ${status.state}`);
      if (!observedDeadline && "startupDeadline" in status && typeof status.startupDeadline === "string") {
        const declared = Date.parse(status.startupDeadline);
        if (!Number.isFinite(declared) || declared > Date.now() + 3_600_000) throw new Error("Electron startup deadline is invalid");
        deadline = declared + 5_000;
        observedDeadline = true;
      }
    }
    input.assertAlive();
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("Electron did not become product-ready in time; inspect the Shell and its logs to diagnose startup");
}
