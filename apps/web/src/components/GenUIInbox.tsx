// Plan §3.C3 / spec §10.3.4 — GenUI Inbox drawer.
//
// Lists every persisted surface for a project (project / conversation
// tier) so the user can see what authorizations and confirmations have
// been remembered, and revoke any of them. Mirrors the
// `od ui list --project <id>` CLI surface; clicking Revoke calls
// POST /api/projects/:projectId/genui/:surfaceId/revoke.

import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { workspaceProjectHeaders } from '../collab/workspace-identity';

interface SurfaceRow {
  id: string;
  surfaceId: string;
  projectId: string;
  conversationId?: string | null;
  runId?: string | null;
  kind: string;
  persist: 'run' | 'conversation' | 'project';
  status: 'pending' | 'resolved' | 'timeout' | 'invalidated';
  respondedBy?: string | null;
  requestedAt: number;
  respondedAt?: number | null;
}

interface Props {
  projectId: string;
  workspaceContext?: WorkspaceCollabContext | null;
  // Pluggable for tests / storybook. Defaults to the daemon HTTP routes.
  fetchSurfaces?: (projectId: string) => Promise<SurfaceRow[]>;
  revokeSurface?: (projectId: string, surfaceId: string) => Promise<void>;
}

export function GenUIInbox(props: Props) {
  const [surfaces, setSurfaces] = useState<SurfaceRow[]>([]);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = props.fetchSurfaces
        ? await props.fetchSurfaces(props.projectId)
        : await defaultFetchSurfaces(props.projectId, props.workspaceContext);
      setSurfaces(rows);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [props.fetchSurfaces, props.projectId, props.workspaceContext]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRevoke = async (surfaceId: string) => {
    setPendingRevoke(surfaceId);
    setError(null);
    try {
      if (props.revokeSurface) {
        await props.revokeSurface(props.projectId, surfaceId);
      } else {
        await defaultRevokeSurface(
          props.projectId,
          surfaceId,
          props.workspaceContext,
        );
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingRevoke(null);
    }
  };

  return (
    <div className="genui-inbox" data-testid="genui-inbox">
      <header className="genui-inbox__header">
        <h2>Plugin memory</h2>
        <button
          type="button"
          className="genui-inbox__refresh"
          onClick={refresh}
          aria-label="Refresh"
        >
          Refresh
        </button>
      </header>
      {error ? <div role="alert" className="genui-inbox__error">{error}</div> : null}
      {surfaces.length === 0 ? (
        <div className="genui-inbox__empty">No persisted plugin answers.</div>
      ) : (
        <ul className="genui-inbox__list">
          {surfaces.map((s) => (
            <li key={s.id} className="genui-inbox__row" data-status={s.status}>
              <div className="genui-inbox__id">
                <strong>{s.surfaceId}</strong>{' '}
                <span className="genui-inbox__kind">({s.kind} / {s.persist})</span>
              </div>
              <div className="genui-inbox__status">
                {s.status}
                {s.respondedBy ? ` by ${s.respondedBy}` : ''}
              </div>
              {s.status === 'resolved' ? (
                <button
                  type="button"
                  className="genui-inbox__revoke"
                  onClick={() => onRevoke(s.surfaceId)}
                  disabled={pendingRevoke === s.surfaceId}
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function defaultFetchSurfaces(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<SurfaceRow[]> {
  const resp = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/genui`,
    workspaceContext ? { headers: workspaceProjectHeaders(workspaceContext) } : undefined,
  );
  if (!resp.ok) return [];
  const json = (await resp.json()) as { surfaces?: SurfaceRow[] };
  return json.surfaces ?? [];
}

async function defaultRevokeSurface(
  projectId: string,
  surfaceId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<void> {
  const resp = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/genui/${encodeURIComponent(surfaceId)}/revoke`,
    {
      method: 'POST',
      ...(workspaceContext ? { headers: workspaceProjectHeaders(workspaceContext) } : {}),
    },
  );
  if (!resp.ok) {
    throw new Error(`Failed to revoke ${surfaceId}: HTTP ${resp.status}`);
  }
}
