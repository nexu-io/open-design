import { useCallback, useEffect, useRef, useState } from 'react';
import { projectHref, sessionHref } from './workspaceRouting';
import type { CreativeSession, CreationMode } from '../../../shared/session';
import { preservePresentation } from '../../../shared/workspace-url';

export type SavedProject = { id: string; title: string; templateId?: string; createdAt?: number; openedAt?: number };
type Job = { id: string; state: 'pending' | 'running' | 'completed' | 'failed'; error?: string };
export type WorkspaceStatus = { revision: string; projectId: string; projectTitle: string; exportJob: Job | null; sessionId?: string };
export type ProjectCatalog = { activeId: string; projects: SavedProject[]; sessions?: CreativeSession[]; activeSessionId?: string };
export async function motionApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch((path.startsWith('/sessions') || path.startsWith('/modes') ? '/design-api' : '/motion-api') + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '本地工作室连接失败');
  return data as T;
}
export function navigateWorkspace(url: string, replace = false) {
  // A document navigation releases every old edit session, observer and upload handler.
  const target = preservePresentation(url, location.search);
  if (replace) window.location.replace(target);
  else window.location.assign(target);
}
const jsonBody = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function useWorkspace(waitForSaves: () => Promise<void>, projectId?: string, sessionId?: string) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [sessions, setSessions] = useState<CreativeSession[]>([]);
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const acting = useRef(false);
  const pendingSession = useRef<{ key: string; id: string } | null>(null);
  const updateCatalog = useCallback((catalog: ProjectCatalog) => {
    const ordered = [...catalog.projects].sort((a, b) => (b.openedAt ?? b.createdAt ?? 0) - (a.openedAt ?? a.createdAt ?? 0));
    setProjects(previous => JSON.stringify(previous) === JSON.stringify(ordered) ? previous : ordered);
    const nextSessions = [...(catalog.sessions ?? [])].sort((a, b) => (b.openedAt ?? b.createdAt ?? 0) - (a.openedAt ?? a.createdAt ?? 0));
    setSessions(previous => JSON.stringify(previous) === JSON.stringify(nextSessions) ? previous : nextSessions);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [data, catalog] = await Promise.all([
          motionApi<WorkspaceStatus>('/project/status', { signal: controller.signal }),
          motionApi<ProjectCatalog>('/projects', { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (projectId && data.projectId !== projectId && !acting.current) {
          navigateWorkspace(data.sessionId ? sessionHref(data.sessionId, data.projectId, true) : projectHref(data.projectId), true); return;
        }
        const generated = !projectId && sessionId ? catalog.sessions?.find(item => item.id === sessionId)?.artifacts.find(item => item.projectId === data.projectId) : undefined;
        if (generated && !acting.current) { navigateWorkspace(sessionHref(sessionId!, generated.projectId, true), true); return; }
        setStatus(data); updateCatalog(catalog);
      } catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1800);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, sessionId, updateCatalog]);

  const transition = useCallback(async (path?: string, options?: { instruction?: string; mode?: string; templateId?: string; projectId?: string }, sessionRoute = false, revealArtifact = true) => {
    if (acting.current) return false;
    acting.current = true; setBusy(true); setError('');
    try {
      await waitForSaves();
      if (!path) { navigateWorkspace('/'); return true; }
      const current = await motionApi<WorkspaceStatus>('/project/status');
      if (projectId && current.projectId !== projectId) throw new Error('当前项目已切换，请刷新后重试。');
      const next = await motionApi<WorkspaceStatus>(path, {
        method: 'POST', ...jsonBody({ expectedRevision: current.revision, expectedProjectId: current.projectId, ...options }),
      });
      if (options?.instruction) { try { localStorage.removeItem('motion.home.draft.v1'); } catch {} }
      navigateWorkspace(sessionRoute && next.sessionId ? sessionHref(next.sessionId, next.projectId, revealArtifact) : projectHref(next.projectId));
      return true;
    } catch (err) { setError((err as Error).message); acting.current = false; setBusy(false); return false; }
  }, [waitForSaves, projectId]);
  const open = useCallback((kind: 'templates' | 'projects', id: string) => transition(`/${kind}/${encodeURIComponent(id)}/open`), [transition]);
  const create = useCallback((instruction?: string) => transition('/projects', instruction?.trim() ? { instruction: instruction.trim() } : undefined), [transition]);
  const home = useCallback(() => transition(), [transition]);
  const startSession = useCallback(async (instruction?: string, templateId?: string, mode: CreationMode = 'motion') => {
    if (acting.current) return false;
    acting.current = true; setBusy(true); setError('');
    let createdId: string | undefined;
    const options = { mode, ...(instruction?.trim() ? { instruction: instruction.trim() } : {}), ...(templateId ? { templateId } : {}) };
    const key = JSON.stringify(options);
    if (pendingSession.current?.key !== key) pendingSession.current = { key, id: crypto.randomUUID() };
    try {
      await waitForSaves();
      const created = await motionApi<{ sessionId: string; session: CreativeSession }>('/sessions', { method: 'POST', ...jsonBody({ ...options, id: pendingSession.current.id }) });
      createdId = created.sessionId;
      try { localStorage.removeItem('motion.home.draft.v1'); } catch {}
      const existing = created.session?.artifacts.find(item => item.id === created.session.activeArtifactId) ?? created.session?.artifacts[0];
      if (existing) { navigateWorkspace(sessionHref(createdId, existing.projectId, true)); return true; }
      const current = await motionApi<WorkspaceStatus>('/project/status');
      const next = await motionApi<WorkspaceStatus>(`/sessions/${createdId}/artifacts`, { method: 'POST', ...jsonBody({ expectedRevision: current.revision, expectedProjectId: current.projectId }) });
      navigateWorkspace(sessionHref(createdId, next.projectId, true)); return true;
    } catch (err) {
      if (createdId) {
        try { sessionStorage.setItem(`opendesign.session-error:${createdId}`, (err as Error).message); } catch {}
        navigateWorkspace(sessionHref(createdId)); return true;
      }
      setError((err as Error).message); acting.current = false; setBusy(false); return false;
    }
  }, [waitForSaves]);
  const openSession = useCallback((id: string, artifactProjectId?: string) => transition(`/sessions/${encodeURIComponent(id)}/open`, artifactProjectId ? { projectId: artifactProjectId } : undefined, true, Boolean(artifactProjectId)), [transition]);
  const createArtifact = useCallback((id: string, templateId?: string) => transition(`/sessions/${encodeURIComponent(id)}/artifacts`, templateId ? { templateId } : undefined, true), [transition]);
  const renameItem = useCallback(async (id: string, title: string, kind: 'projects' | 'sessions') => {
    if (acting.current) return false;
    acting.current = true; setBusy(true); setError('');
    try {
      updateCatalog(await motionApi<ProjectCatalog>(`/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', ...jsonBody({ title }) }));
      return true;
    } catch (err) { setError((err as Error).message); return false; }
    finally { acting.current = false; setBusy(false); }
  }, [updateCatalog]);
  const rename = useCallback((id: string, title: string) => renameItem(id, title, 'projects'), [renameItem]);
  const renameSession = useCallback((id: string, title: string) => renameItem(id, title, 'sessions'), [renameItem]);
  return { projects, sessions, session: sessions.find(item => item.id === sessionId), status, busy, error, open, create, home, rename, startSession, openSession, createArtifact, renameSession, clearError: () => setError('') };
}
