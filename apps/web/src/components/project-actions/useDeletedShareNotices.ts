import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectDeleteShareResidual, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../amrLoginPolling';

type NoticeRow = ProjectDeleteShareResidual & { busy?: boolean; failed?: boolean };
export interface DeletedShareNotice {
  id: number;
  projectId: string;
  scope: string;
  context: WorkspaceCollabContext | null;
  rows: ReadonlyArray<NoticeRow>;
}

/** App-owned, manual-dismiss queue: navigation and subsequent deletes cannot overwrite delivery. */
export function useDeletedShareNotices(context: WorkspaceCollabContext | null) {
  const [notices, setNotices] = useState<DeletedShareNotice[]>([]);
  const latestContext = useRef(context);
  latestContext.current = context;
  const sequence = useRef(0);
  const inFlight = useRef(new Map<string, AbortController>());
  const liveScope = useCallback(() => workspaceAccountScopedCacheKey(latestContext.current), []);
  const scope = liveScope();
  useEffect(() => {
    const prune = () => {
      setNotices(items => items.filter(item => item.scope === liveScope()));
    };
    prune();
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, prune);
    return () => {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, prune);
      for (const controller of inFlight.current.values()) controller.abort();
      inFlight.current.clear();
    };
  }, [scope, liveScope]);

  const capture = useCallback((projectId: string, origin: WorkspaceCollabContext | null, generation = currentWorkspaceAccountGeneration()) => {
    const originScope = workspaceAccountScopedCacheKey(origin, generation);
    let delivered = false;
    return (rows: ReadonlyArray<ProjectDeleteShareResidual>) => {
      if (delivered || originScope !== liveScope() || !rows.length) return;
      delivered = true;
      const notice: DeletedShareNotice = { id: ++sequence.current, projectId, scope: originScope, context: origin, rows: rows.map(row => ({ ...row })) };
      setNotices(items => [...items, notice]);
    };
  }, [liveScope]);

  const dismiss = useCallback((id: number) => setNotices(items => items.filter(item => item.id !== id)), []);
  const dismissRow = useCallback((id: number, row: NoticeRow) => setNotices(items => items
    .map(item => item.id === id ? { ...item, rows: item.rows.filter(candidate =>
      candidate.filePath !== row.filePath || candidate.slug !== row.slug) } : item)
    .filter(item => item.rows.length)), []);
  const retry = async (notice: DeletedShareNotice, row: NoticeRow) => {
    const key = JSON.stringify([notice.id, row.filePath, row.slug]);
    if (row.retrying || notice.scope !== liveScope() || inFlight.current.has(key)) return;
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
      patch(rows => rows.filter(candidate => !matches(candidate)));
    } catch {
      patch(rows => rows.map(candidate => matches(candidate) ? { ...candidate, busy: false, failed: true } : candidate));
    } finally {
      inFlight.current.delete(key);
    }
  };
  return { notices: notices.filter(notice => notice.scope === scope), capture, dismiss, dismissRow, retry };
}
