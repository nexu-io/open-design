import { useEffect, useRef, useState } from 'react';
import type { SharePlanSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey } from '../../collab/workspace-identity';
import { fetchProjectFileSharePlan } from '../../providers/registry';

/** One retained viewer owns one content/account-scoped preflight, including a queued click. */
export function useSharePlan({ projectId, filePath, workspaceContext, enabled, contentKey = '' }: {
  projectId?: string;
  filePath?: string;
  workspaceContext: WorkspaceCollabContext | null;
  enabled: boolean;
  contentKey?: string;
}) {
  const key = JSON.stringify([projectId, filePath, workspaceAccountScopedCacheKey(workspaceContext),
    currentWorkspaceAccountGeneration(), contentKey]);
  const entryRef = useRef<{
    key: string;
    plan: SharePlanSummary | null;
    pending: Promise<SharePlanSummary | null> | null;
    waiting: boolean;
  } | null>(null);
  if (entryRef.current?.key !== key) entryRef.current = { key, plan: null, pending: null, waiting: false };
  const entry = entryRef.current;
  const [, refresh] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  function changed() {
    if (mounted.current) refresh(value => value + 1);
  }
  useEffect(() => {
    if (!enabled || !projectId || !filePath || entry.pending) return;
    // Keep a successful cached plan visible while revalidating. The daemon's
    // mutation still validates the actual package, including changed resources.
    const pending = fetchProjectFileSharePlan(projectId, filePath, workspaceContext).catch(() => null);
    entry.pending = pending;
    void pending.then(plan => {
      if (entryRef.current !== entry || entry.pending !== pending) return;
      entry.pending = null;
      if (plan) entry.plan = plan;
      changed();
    });
  }, [enabled, key, projectId, filePath, workspaceContext]);

  function run(action: () => Promise<void>): Promise<void> {
    if (entry.waiting) return Promise.resolve();
    const blocked = (plan: SharePlanSummary | null) => plan?.exceedsSizeLimit || Boolean(plan?.blockers?.length);
    if (blocked(entry.plan)) return Promise.resolve();
    if (entry.plan) return action();
    // A missing/failed first plan is not permission to publish. Reopening the
    // panel retries the read; a queued click must wait for a successful plan.
    if (!entry.pending) return Promise.resolve();
    entry.waiting = true;
    changed();
    return (async () => {
      try {
        const plan = await entry.pending;
        // A file/content/account change invalidates both cache and queued intent.
        if (!mounted.current || entryRef.current !== entry || !plan || blocked(plan)) return;
        await action();
      } finally {
        entry.waiting = false;
        if (entryRef.current === entry) changed();
      }
    })();
  }
  return { plan: entry.plan, waiting: entry.waiting, run };
}

export type SharePlanState = ReturnType<typeof useSharePlan>;
