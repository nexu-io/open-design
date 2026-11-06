export interface LaneMoveRefreshDeps {
  refreshAfterLaneMove?: () => void;
}

/** Refresh only after the complete lane transaction persisted successfully. */
export function refreshAfterDurableLaneMove(
  pending: Promise<boolean>,
  deps: LaneMoveRefreshDeps,
): Promise<boolean> {
  return pending.then((persisted) => {
    if (persisted) deps.refreshAfterLaneMove?.();
    return persisted;
  });
}
