import { useEffect, useState } from 'react';
import type { ChatRunListResponse, ChatRunStatusResponse } from '@open-design/contracts';

import { RUNS_CHANGED_EVENT } from '../providers/daemon';

// A run counts as "running in the background" while it's queued or actively
// streaming. Terminal statuses (succeeded / failed / canceled) drop off.
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// Fetch with a `?status=active` filter so the URL has a query string. This
// achieves two things:
//   1. The daemon returns only queued/running rows — cheaper, no client filter
//      pass needed beyond the ACTIVE_RUN_STATUSES check below for safety.
//   2. Playwright route mocks like `page.route('**/api/runs', …)` (used by
//      workspace-keyboard-flows / api-empty-response) only match
//      bare `/api/runs` — a `?…` suffix is a different URL, so this polling
//      fetch can't trip a test that's counting `POST /api/runs` create calls.
async function fetchActiveProjectRuns(): Promise<ChatRunStatusResponse[]> {
  try {
    const resp = await fetch('/api/runs?status=active');
    if (!resp.ok) return [];
    const body = (await resp.json()) as ChatRunListResponse;
    return body.runs ?? [];
  } catch {
    return [];
  }
}

/**
 * The set of project ids that currently have an in-flight (queued/running)
 * agent or BYOK run. Refreshes on mount + on the RUNS_CHANGED event (fired
 * whenever this client starts/stops a run). No periodic polling — keeps the
 * indicator zero-cost on idle workspaces. Cross-session runs (started by
 * another browser or the CLI) update on next RUNS_CHANGED, page reload, or
 * tab focus change (visibilitychange).
 *
 * Returns a stable Set reference while the membership is unchanged so
 * consumers don't re-render on every tick.
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
      const runs = await fetchActiveProjectRuns();
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
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener(RUNS_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return ids;
}
