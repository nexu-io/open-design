import { useEffect, useState } from 'react';

import { RUNS_CHANGED_EVENT, listProjectRuns } from '../providers/daemon';

// A run counts as "running in the background" while it's queued or actively
// streaming. Terminal statuses (succeeded / failed / canceled) drop off.
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * The set of project ids that currently have an in-flight (queued/running)
 * agent or BYOK run. Polls the daemon's run registry and also refreshes on the
 * RUNS_CHANGED event so the indicator reacts immediately when a run starts or
 * finishes. Returns a stable Set reference while the membership is unchanged so
 * consumers don't re-render on every poll tick.
 */
export function useRunningProjectIds(enabled = true): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!enabled) {
      setIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const runs = await listProjectRuns();
      if (cancelled) return;
      const next = new Set<string>();
      for (const run of runs) {
        if (run.projectId && ACTIVE_RUN_STATUSES.has(run.status)) {
          next.add(run.projectId);
        }
      }
      setIds((prev) => (sameSet(prev, next) ? prev : next));
    };
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(RUNS_CHANGED_EVENT, onChange);
    const interval = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, onChange);
      window.clearInterval(interval);
    };
  }, [enabled]);

  return ids;
}
