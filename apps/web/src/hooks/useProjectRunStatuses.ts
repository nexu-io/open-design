/**
 * Live `Map<projectId, ProjectDisplayStatus>` for a known set of projects.
 *
 * Exists because `Project.status` is unreadable in a workspace-scoped session:
 * only the unscoped `GET /api/projects` attaches it, and that endpoint lists
 * unbound projects only — none, once every project belongs to a workspace. So
 * the status has to be derived from the runs feed instead.
 *
 * Asks per project id rather than for the whole catalogue: the unscoped
 * `GET /api/runs` answers 400 `PROJECT_SCOPE_REQUIRED` as soon as one run
 * belongs to a workspace-bound project. See `listRunsForProject`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectDisplayStatus, WorkspaceCollabContext } from '@open-design/contracts';
import { listRunsForProject, RUNS_CHANGED_EVENT } from '../providers/daemon';
import {
  foldRunsToProjectRunSummaries,
  type ProjectRunSummary,
} from '../state/projectRunStatus';

/** Backstop only — `RUNS_CHANGED_EVENT` is what makes this feel immediate. */
const POLL_MS = 4000;

const EMPTY: ReadonlyMap<string, ProjectRunSummary> = new Map();

export interface UseProjectRunStatusesOptions {
  enabled?: boolean;
  workspaceContext?: WorkspaceCollabContext | null;
}

/**
 * Live `Map<projectId, ProjectRunSummary>`: the status plus the newest
 * finished run's identity, for a consumer that acknowledges notices per run.
 */
export function useProjectRunSummaries(
  projectIds: readonly string[],
  options?: UseProjectRunStatusesOptions,
): ReadonlyMap<string, ProjectRunSummary> {
  const enabled = options?.enabled ?? true;
  const workspaceContext = options?.workspaceContext ?? null;
  const [summaries, setSummaries] = useState<ReadonlyMap<string, ProjectRunSummary>>(EMPTY);

  // One request per id, so the effect must not re-run just because the caller
  // rebuilt the array. Sorted + joined is the identity that actually matters.
  const idsKey = useMemo(() => [...projectIds].sort().join('\u0000'), [projectIds]);
  // Read inside the effect without making it a dependency: the context object
  // is rebuilt on unrelated renders and would restart polling each time.
  const workspaceContextRef = useRef(workspaceContext);
  workspaceContextRef.current = workspaceContext;

  useEffect(() => {
    const ids = idsKey ? idsKey.split('\u0000') : [];
    if (!enabled || ids.length === 0) {
      setSummaries(EMPTY);
      return undefined;
    }
    let cancelled = false;

    const refresh = async () => {
      const results = await Promise.all(
        ids.map((id) => listRunsForProject(id, workspaceContextRef.current)),
      );
      if (cancelled) return;
      // An unreadable project yields null; skipping it leaves that row blank
      // rather than asserting a status nobody verified.
      const runs = results.flatMap((result) => result?.runs ?? []);
      const awaiting = results.flatMap((result) => result?.awaitingInputProjectIds ?? []);
      setSummaries(foldRunsToProjectRunSummaries(runs, awaiting));
    };

    void refresh();
    const onRunsChanged = () => void refresh();
    window.addEventListener(RUNS_CHANGED_EVENT, onRunsChanged);
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, onRunsChanged);
      window.clearInterval(timer);
    };
  }, [idsKey, enabled]);

  return summaries;
}

/** The status half of {@link useProjectRunSummaries}, for glyph-only consumers. */
export function useProjectRunStatuses(
  projectIds: readonly string[],
  options?: UseProjectRunStatusesOptions,
): ReadonlyMap<string, ProjectDisplayStatus> {
  const summaries = useProjectRunSummaries(projectIds, options);
  return useMemo(() => {
    const statuses = new Map<string, ProjectDisplayStatus>();
    for (const [projectId, summary] of summaries) statuses.set(projectId, summary.status);
    return statuses;
  }, [summaries]);
}
