import type { ElectronBackgroundUpdatePolicy } from "@open-design/electron-kit/contracts";

/** Session-owned polling only. The injected operation owns update policy and
 * must not interpret a successful download as permission to activate it. */
export function startElectronUpdateScheduler(input: Readonly<{
  schedule: ElectronBackgroundUpdatePolicy["schedule"];
  signal: AbortSignal;
  check(signal: AbortSignal): Promise<void>;
  observe(event: "started" | "completed" | "failed", detail?: unknown): void;
}>): void {
  const { schedule, signal } = input;
  for (const [key, value] of Object.entries(schedule)) {
    if (!Number.isSafeInteger(value) || value < (key === "initialDelayMs" ? 0 : 1)) {
      throw new Error(`invalid Electron update schedule: ${key}`);
    }
  }
  if (schedule.backoffMaxMs < schedule.backoffInitialMs) throw new Error("invalid Electron update backoff bounds");
  if (signal.aborted) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let backoffMs = schedule.backoffInitialMs;
  const stop = () => { clearTimeout(timer); signal.removeEventListener("abort", stop); };
  const enqueue = (delay: number) => {
    if (!signal.aborted) timer = setTimeout(() => { void tick(); }, delay).unref();
  };
  const tick = async () => {
    if (signal.aborted) return;
    let nextDelay = schedule.intervalMs;
    try {
      input.observe("started");
      await input.check(signal);
      if (!signal.aborted) input.observe("completed");
      backoffMs = schedule.backoffInitialMs;
    } catch (error) {
      nextDelay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, schedule.backoffMaxMs);
      if (!signal.aborted) input.observe("failed", error);
    } finally {
      enqueue(nextDelay);
    }
  };
  signal.addEventListener("abort", stop, { once: true });
  enqueue(schedule.initialDelayMs);
}
