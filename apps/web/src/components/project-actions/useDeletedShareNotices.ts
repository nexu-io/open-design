import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectDeleteShareResidual, PublicFileStopListResponse, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../amrLoginPolling';

type NoticeRow = ProjectDeleteShareResidual & { busy?: boolean; failed?: boolean; recovered?: boolean };

function isStopList(value: unknown): value is PublicFileStopListResponse {
  if (!value || typeof value !== 'object' || !('tasks' in value) || !Array.isArray(value.tasks)) return false;
  return value.tasks.every(row => row && typeof row === 'object'
    && typeof row.projectId === 'string' && row.projectId.length > 0
    && typeof row.filePath === 'string' && row.filePath.length > 0
    && typeof row.slug === 'string' && row.slug.length > 0
    && typeof row.retrying === 'boolean');
}

const rowKey = (row: ProjectDeleteShareResidual) => JSON.stringify([row.filePath, row.slug]);
export interface DeletedShareNotice {
  id: number;
  projectId: string;
  scope: string;
  context: WorkspaceCollabContext | null;
  rows: ReadonlyArray<NoticeRow>;
}

/** App-owned warnings. Recovery requires the current verified directory witness;
 * legacy capture-only callers can omit it, but cannot read a protected queue. */
export function useDeletedShareNotices(context: WorkspaceCollabContext | null, verifiedGeneration?: string) {
  const [notices, setNotices] = useState<DeletedShareNotice[]>([]);
  const latestContext = useRef(context);
  latestContext.current = context;
  const sequence = useRef(0);
  // A local operation invalidates an older GET, never the local warning itself.
  const operations = useRef(0);
  const recovery = useRef<AbortController | null>(null);
  const inFlight = useRef(new Map<string, AbortController>());
  const liveScope = useCallback(() => workspaceAccountScopedCacheKey(latestContext.current), []);
  const scope = liveScope();
  useEffect(() => {
    const prune = () => {
      recovery.current?.abort();
      for (const controller of inFlight.current.values()) controller.abort();
      inFlight.current.clear();
      setNotices(items => items.filter(item => item.scope === liveScope()));
    };
    prune();
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, prune);
    return () => {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, prune);
      recovery.current?.abort();
      for (const controller of inFlight.current.values()) controller.abort();
      inFlight.current.clear();
    };
  }, [scope, liveScope]);

  // Only a newly verified directory witness can authorize recovery. An account
  // event alone must not re-use a retained context under the new generation.
  const authority = workspaceAccountScopedCacheKey(context, 0);
  useEffect(() => {
    const origin = latestContext.current;
    if (!verifiedGeneration || !origin || origin.memberStatus !== 'active' || origin.lifecycleState !== 'active') return;
    const issuedScope = liveScope();
    const issuedOperation = operations.current;
    const controller = new AbortController();
    recovery.current = controller;
    void (async () => {
      try {
        const response = await fetch('/api/public-file-stops', {
          signal: controller.signal, headers: workspaceProjectHeaders(origin),
        });
        if (!response.ok || controller.signal.aborted) return;
        const value: unknown = await response.json();
        if (!isStopList(value) || controller.signal.aborted || issuedScope !== liveScope() || issuedOperation !== operations.current || inFlight.current.size > 0) return;
        // Absence only reconciles GET-derived rows, not unqueued delete residuals.
        const groups = new Map<string, NoticeRow[]>();
        for (const task of value.tasks) {
          const rows = groups.get(task.projectId) ?? [];
          if (!rows.some(row => rowKey(row) === rowKey(task))) {
            rows.push({ filePath: task.filePath, slug: task.slug, retrying: task.retrying, recovered: true });
          }
          groups.set(task.projectId, rows);
        }
        const recovered = Array.from(groups, ([projectId, rows]) => ({
          id: ++sequence.current, projectId, scope: issuedScope, context: origin, rows,
        }));
        setNotices(items => {
          if (controller.signal.aborted || issuedScope !== liveScope() || issuedOperation !== operations.current || inFlight.current.size > 0) return items;
          const next = items.filter(item => item.scope === issuedScope)
            .map(item => ({ ...item, rows: item.rows.filter(row => !row.recovered) }))
            .filter(item => item.rows.length);
          for (const notice of recovered) {
            const existing = next.find(item => item.projectId === notice.projectId);
            if (!existing) next.push(notice);
            else {
              const pending = new Map(notice.rows.map(row => [rowKey(row), row]));
              existing.rows = existing.rows.map(row => {
                const task = pending.get(rowKey(row));
                pending.delete(rowKey(row));
                return task ? { ...row, retrying: task.retrying } : row;
              });
              existing.rows = [...existing.rows, ...pending.values()];
            }
          }
          return next;
        });
      } catch {
        // Offline, non-JSON and aborted reads are not successful empty lists.
      }
    })();
    return () => controller.abort();
  }, [authority, verifiedGeneration, liveScope]);

  const capture = useCallback((projectId: string, origin: WorkspaceCollabContext | null, generation = currentWorkspaceAccountGeneration()) => {
    const originScope = workspaceAccountScopedCacheKey(origin, generation);
    let delivered = false;
    return (rows: ReadonlyArray<ProjectDeleteShareResidual>) => {
      if (delivered || originScope !== liveScope() || !rows.length) return;
      delivered = true;
      const notice: DeletedShareNotice = { id: ++sequence.current, projectId, scope: originScope, context: origin, rows: rows.map(row => ({ ...row })) };
      operations.current += 1;
      setNotices(items => {
        const existing = items.find(item => item.scope === originScope && item.projectId === projectId);
        const unique = new Map(notice.rows.map(row => [rowKey(row), row]));
        if (!existing) return [...items, { ...notice, rows: [...unique.values()] }];
        for (const row of existing.rows) if (!unique.has(rowKey(row))) unique.set(rowKey(row), row);
        return items.map(item => item === existing ? { ...item, rows: [...unique.values()] } : item);
      });
    };
  }, [liveScope]);

  const dismiss = useCallback((id: number) => {
    operations.current += 1;
    setNotices(items => items.filter(item => item.id !== id));
  }, []);
  const dismissRow = useCallback((id: number, row: NoticeRow) => {
    operations.current += 1;
    setNotices(items => items
      .map(item => item.id === id ? { ...item, rows: item.rows.filter(candidate =>
        candidate.filePath !== row.filePath || candidate.slug !== row.slug) } : item)
      .filter(item => item.rows.length));
  }, []);
  const retry = async (notice: DeletedShareNotice, row: NoticeRow) => {
    const key = JSON.stringify([notice.id, row.filePath, row.slug]);
    if (row.retrying || notice.scope !== liveScope() || inFlight.current.has(key)) return;
    operations.current += 1;
    const controller = new AbortController();
    inFlight.current.set(key, controller);
    const matches = (candidate: NoticeRow) => candidate.filePath === row.filePath && candidate.slug === row.slug;
    const patch = (change: (rows: ReadonlyArray<NoticeRow>) => ReadonlyArray<NoticeRow>) => {
      if (notice.scope !== liveScope() || controller.signal.aborted) return;
      setNotices(items => items.map(item => item.id === notice.id ? { ...item, rows: change(item.rows) } : item).filter(item => item.rows.length));
    };
    patch(rows => rows.map(candidate => matches(candidate) ? { ...candidate, busy: true, failed: false } : candidate));
    try {
      const response = await fetch('/api/public-file-stops/retry', {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(notice.context ? workspaceProjectHeaders(notice.context) : {}) },
        body: JSON.stringify({ projectId: notice.projectId, filePath: row.filePath, slug: row.slug }),
      });
      const value = response.ok ? await response.json() : null;
      if (!value || value.status !== 'stopped' || value.projectId !== notice.projectId || value.filePath !== row.filePath || value.slug !== row.slug) throw new Error('Stop not confirmed');
      if (notice.scope === liveScope() && !controller.signal.aborted) operations.current += 1;
      patch(rows => rows.filter(candidate => !matches(candidate)));
    } catch {
      if (notice.scope === liveScope() && !controller.signal.aborted) operations.current += 1;
      patch(rows => rows.map(candidate => matches(candidate) ? { ...candidate, busy: false, failed: true } : candidate));
    } finally {
      inFlight.current.delete(key);
    }
  };
  return { notices: notices.filter(notice => notice.scope === scope), capture, dismiss, dismissRow, retry };
}
