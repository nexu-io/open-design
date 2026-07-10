import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  TeamProject,
  WorkspaceBillingResponse,
  WorkspaceBillingSummary,
  WorkspaceCollabContext,
  WorkspaceContextResponse,
  WorkspaceTeamProjectsResponse,
} from '@open-design/contracts';

// One shared read of the workspace context (`GET /api/workspace/context`) for the
// navigation shell. The daemon proxies B's `CurrentWorkspaceContext`; `context` is
// null off-team (personal, signed out, or B unavailable). Every team surface in the
// entry shell (nav rail, workspace switcher, gating) consumes THIS one read so the
// two-state shell never re-derives role/permission judgements or fans out duplicate
// fetches. See `packages/contracts/src/api/collab.ts` for the shape.
export interface WorkspaceContextState {
  context: WorkspaceCollabContext | null;
  loading: boolean;
}

export function useWorkspaceContext(): WorkspaceContextState {
  const [state, setState] = useState<WorkspaceContextState>({ context: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/workspace/context');
        if (!res.ok) {
          if (!cancelled) setState({ context: null, loading: false });
          return;
        }
        const body = (await res.json()) as WorkspaceContextResponse;
        if (!cancelled) setState({ context: body.context ?? null, loading: false });
      } catch {
        // Personal / offline / daemon without the B proxy: stay in the local state.
        if (!cancelled) setState({ context: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * One shared read of the caller's Vela billing summary for the nav shell
 * (`GET /api/workspace/billing`, A-lane data via the vela CLI 收口). Null until
 * it loads, or when the CLI / billing session is unavailable — the credits chip
 * then falls back to the plan-tier hint the workspace context already carries.
 */
export function useWorkspaceBilling(): WorkspaceBillingSummary | null {
  const [summary, setSummary] = useState<WorkspaceBillingSummary | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadBilling = useCallback(async (clearOnFailure: boolean) => {
    try {
      const res = await fetch('/api/workspace/billing', { cache: 'no-store' });
      if (!res.ok) {
        if (clearOnFailure && mountedRef.current) setSummary(null);
        return;
      }
      const body = (await res.json()) as WorkspaceBillingResponse;
      if (mountedRef.current) setSummary(body.summary ?? null);
    } catch {
      if (clearOnFailure && mountedRef.current) setSummary(null);
    }
  }, []);

  useEffect(() => {
    void loadBilling(true);
  }, [loadBilling]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadBilling(false);
    }, WORKSPACE_BILLING_POLL_MS);
    return () => clearInterval(interval);
  }, [loadBilling]);

  useEffect(() => {
    const refresh = () => {
      void loadBilling(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === WORKSPACE_BILLING_REFRESH_STORAGE_KEY) refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener(WORKSPACE_BILLING_REFRESH_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener(WORKSPACE_BILLING_REFRESH_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadBilling]);

  return summary;
}

const WORKSPACE_BILLING_POLL_MS = 30_000;
export const WORKSPACE_BILLING_REFRESH_EVENT = 'od:workspace-billing-refresh';
const WORKSPACE_BILLING_REFRESH_STORAGE_KEY = 'od.workspaceBilling.refreshAt';

export function notifyWorkspaceBillingRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WORKSPACE_BILLING_REFRESH_EVENT));
  try {
    window.localStorage.setItem(WORKSPACE_BILLING_REFRESH_STORAGE_KEY, String(Date.now()));
  } catch {
    // The in-window event is enough when localStorage is unavailable.
  }
}

export interface TeamProjectsState {
  projects: TeamProject[];
  loading: boolean;
  /** Re-fetch the team-shared project list (e.g. after a member pulls one). */
  reload: () => void;
}

/**
 * Team-wide shared-project discovery for the "全部项目" view
 * (`GET /api/workspace/projects/team`, resource-hub data behind the daemon).
 * A member's own `/api/projects` list is only their LOCAL projects; the projects
 * the owner shared to the team live on the hub until pulled, and this read
 * surfaces them so a member can discover + open them. Empty off-team or when the
 * hub is not configured — the daemon degrades to `{ projects: [] }` there.
 */
// Poll cadence for the team-shared list. Match the foreground collab cadence so
// a teammate sees a newly shared project within a few seconds, while focus and
// visibility changes still refresh immediately.
const TEAM_PROJECTS_POLL_MS = 5_000;
export const TEAM_PROJECTS_CHANGED_EVENT = 'od:team-projects-changed';
const TEAM_PROJECTS_CHANGED_STORAGE_KEY = 'od.teamProjects.changedAt';

export function notifyTeamProjectsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TEAM_PROJECTS_CHANGED_EVENT));
  try {
    window.localStorage.setItem(TEAM_PROJECTS_CHANGED_STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage can be unavailable in restricted contexts; the in-window event
    // already refreshed the current client.
  }
}

export function useTeamProjects(): TeamProjectsState {
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch the full list. Shared by the initial load, manual reload(), and the
  // poll. Never flips `loading` (only the initial/reload effect does) so a
  // background refresh has no spinner.
  const loadFull = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/projects/team');
      if (!res.ok) {
        if (mountedRef.current) {
          setProjects([]);
          setLoading(false);
        }
        return;
      }
      const body = (await res.json()) as WorkspaceTeamProjectsResponse;
      if (mountedRef.current) {
        setProjects(body.projects ?? []);
        setLoading(false);
      }
    } catch {
      // Personal / offline / daemon without the hub: no team-shared projects.
      if (mountedRef.current) {
        setProjects([]);
        setLoading(false);
      }
    }
  }, []);

  // Initial load + manual reload (nonce bump).
  useEffect(() => {
    setLoading(true);
    void loadFull();
  }, [nonce, loadFull]);

  // Lightweight polling so teammates see each other's shares without refreshing.
  // A daemon-local read is cheap enough to just refetch; offline errors keep the
  // last snapshot until the next tick.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadFull();
    }, TEAM_PROJECTS_POLL_MS);
    return () => clearInterval(interval);
  }, [loadFull]);

  // Demo and real team usage often switch between two browser windows after a
  // teammate shares a project. Refresh immediately on focus/visibility instead
  // of making the member wait for the next poll tick.
  useEffect(() => {
    const onFocus = () => {
      void loadFull();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadFull();
    };
    const onTeamProjectsChanged = () => {
      void loadFull();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEAM_PROJECTS_CHANGED_STORAGE_KEY) void loadFull();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener(TEAM_PROJECTS_CHANGED_EVENT, onTeamProjectsChanged);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(TEAM_PROJECTS_CHANGED_EVENT, onTeamProjectsChanged);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadFull]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { projects, loading, reload };
}
