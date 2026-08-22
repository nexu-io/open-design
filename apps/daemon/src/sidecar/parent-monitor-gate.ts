import { SIDECAR_ENV } from "@open-design/sidecar-proto";

let parentMonitorExitHolds = 0;

export function holdParentMonitorExit(): () => void {
  parentMonitorExitHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    parentMonitorExitHolds = Math.max(0, parentMonitorExitHolds - 1);
  };
}

export function isParentMonitorExitHeld(): boolean {
  return parentMonitorExitHolds > 0;
}

export function resetParentMonitorExitHoldForTests(): void {
  parentMonitorExitHolds = 0;
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function attachParentMonitor(
  stop: () => Promise<void>,
  options: {
    env?: NodeJS.ProcessEnv;
    exit?: (code?: number) => void;
    intervalMs?: number;
    isProcessAlive?: (pid: number) => boolean;
  } = {},
): () => void {
  const env = options.env ?? process.env;
  const parentPid = Number(env[SIDECAR_ENV.TOOLS_DEV_PARENT_PID]);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return () => undefined;

  const isAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const exit = options.exit ?? ((code) => process.exit(code));
  const intervalMs = options.intervalMs ?? 1000;
  let exiting = false;

  const timer = setInterval(() => {
    if (isAlive(parentPid) || isParentMonitorExitHeld() || exiting) return;
    exiting = true;
    clearInterval(timer);
    void stop().finally(() => exit(0));
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
