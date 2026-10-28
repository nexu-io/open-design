import { useEffect, useRef, useState } from 'react';
import type { SharePlanSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey } from '../../collab/workspace-identity';
import { fetchProjectFileSharePlan } from '../../providers/registry';

export type SharePreflightError = { kind: 'preflight-failed' };
type PreflightStatus = 'idle' | 'loading' | 'ready' | 'error';
type PreflightOwner = { readonly key: string };
// In-flight reads only: settlement removes the entry, never a cross-request cache.
const inFlight = new Map<string, { promise: Promise<SharePlanSummary>; owners: Set<PreflightOwner> }>();
function readPlan(key: string, projectId: string, filePath: string, context: WorkspaceCollabContext | null, owner: PreflightOwner) {
  const existing = inFlight.get(key);
  if (existing) { existing.owners.add(owner); return existing.promise; }
  const request = fetchProjectFileSharePlan(projectId, filePath, context);
  const read = { promise: request, owners: new Set([owner]) };
  inFlight.set(key, read);
  const clear = () => { if (inFlight.get(key) === read) inFlight.delete(key); };
  void request.then(clear, clear);
  return request;
}

/** One retained viewer owns one content/account-scoped preflight, including a queued click. */
export function useSharePlan({ projectId, filePath, workspaceContext, enabled, contentKey = '' }: {
  projectId?: string;
  filePath?: string;
  workspaceContext: WorkspaceCollabContext | null;
  enabled: boolean;
  contentKey?: string;
}) {
  const generation = currentWorkspaceAccountGeneration();
  const key = JSON.stringify([projectId, filePath, workspaceAccountScopedCacheKey(workspaceContext, generation), contentKey]);
  const entryRef = useRef<{
    key: string;
    plan: SharePlanSummary | null;
    pending: Promise<SharePlanSummary | null> | null;
    status: PreflightStatus;
    error: SharePreflightError | null;
    waiting: boolean;
  } | null>(null);
  if (entryRef.current?.key !== key) entryRef.current = { key, plan: null, pending: null, status: 'idle', error: null, waiting: false };
  const entry = entryRef.current;
  useEffect(() => {
    // StrictMode may detach and immediately reattach the same retained entry.
    if (entry.pending) inFlight.get(key)?.owners.add(entry);
    return () => {
      const read = inFlight.get(key);
      if (!read?.owners.delete(entry)) return;
      queueMicrotask(() => {
        if (read.owners.size === 0 && inFlight.get(key) === read) inFlight.delete(key);
      });
    };
  }, [key]);
  const [, refresh] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  function changed() {
    if (mounted.current) refresh(value => value + 1);
  }
  const isCurrent = () => mounted.current && entryRef.current === entry && currentWorkspaceAccountGeneration() === generation;

  function retry(): Promise<SharePlanSummary | null> {
    if (!isCurrent() || !enabled || !projectId || !filePath) return Promise.resolve(null);
    if (entry.pending) return entry.pending;
    // A cached plan remains visible, not authoritative for mutation while checking
    // or after failure. The actual publish still owns permissions/package validation.
    entry.status = 'loading';
    entry.error = null;
    const pending = readPlan(key, projectId, filePath, workspaceContext, entry).then(plan => {
      if (!isCurrent()) return null;
      entry.plan = plan;
      entry.status = 'ready';
      return plan;
    }, () => {
      if (isCurrent()) {
        entry.status = 'error';
        entry.error = { kind: 'preflight-failed' };
      }
      return null;
    }).finally(() => {
      if (entry.pending === pending) entry.pending = null;
      if (isCurrent()) changed();
    });
    entry.pending = pending;
    changed();
    return pending;
  }
  useEffect(() => {
    if (enabled) void retry();
    // key contains every request-relevant context field; object churn is not a recheck.
  }, [enabled, key]);

  function run(action: () => Promise<void>): Promise<void> {
    if (!isCurrent() || entry.waiting || entry.status === 'error') return Promise.resolve();
    const blocked = (plan: SharePlanSummary | null) => plan?.exceedsSizeLimit || Boolean(plan?.blockers?.length);
    if (!entry.pending && (entry.status !== 'ready' || !entry.plan || blocked(entry.plan))) return Promise.resolve();
    entry.waiting = true;
    changed();
    return (async () => {
      try {
        // Only an explicit Generate/Update click queues intent; retry never does.
        const plan = entry.pending ? await entry.pending : entry.plan;
        if (!isCurrent() || !plan || entry.status !== 'ready' || blocked(plan)) return;
        await action();
      } finally {
        entry.waiting = false;
        if (isCurrent()) changed();
      }
    })();
  }
  return { plan: entry.plan, status: entry.status, error: entry.error, retry, waiting: entry.waiting, run };
}

export type SharePlanState = ReturnType<typeof useSharePlan>;
