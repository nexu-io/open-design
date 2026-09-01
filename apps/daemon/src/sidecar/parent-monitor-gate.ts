let parentMonitorExitHolds = 0;
const releaseWaiters: Array<() => void> = [];

function notifyReleaseWaiters(): void {
  if (parentMonitorExitHolds > 0) return;
  const waiters = releaseWaiters.splice(0);
  for (const waiter of waiters) waiter();
}

export function holdParentMonitorExit(): () => void {
  parentMonitorExitHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    parentMonitorExitHolds = Math.max(0, parentMonitorExitHolds - 1);
    notifyReleaseWaiters();
  };
}

export function isParentMonitorExitHeld(): boolean {
  return parentMonitorExitHolds > 0;
}

export function waitForParentMonitorRelease(): Promise<void> {
  if (parentMonitorExitHolds === 0) return Promise.resolve();
  return new Promise((resolve) => {
    releaseWaiters.push(resolve);
  });
}

export function resetParentMonitorExitHoldForTests(): void {
  parentMonitorExitHolds = 0;
  notifyReleaseWaiters();
}
