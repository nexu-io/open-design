/**
 * The ONE live project-run-status feed every glyph surface reads.
 *
 * Exists because `Project.status` is unreadable in a workspace-scoped session:
 * only the unscoped `GET /api/projects` attaches it, and that endpoint lists
 * unbound projects only — none, once every project belongs to a workspace. So
 * the status has to be derived from the runs feed instead.
 *
 * Asks per project id rather than for the whole catalogue: the unscoped
 * `GET /api/runs` answers 400 `PROJECT_SCOPE_REQUIRED` as soon as one run
 * belongs to a workspace-bound project. See `listRunsForProject`.
 *
 * The feed is identity-agnostic on purpose (OPEND-3140): a surface without a
 * cloud identity subscribes with a null context, the read goes out without
 * Workspace headers, and the daemon's headerless branch answers for an
 * unbound local project. The local shell's 最近项目 rows therefore get the
 * same statuses, the same ✓-spending and the same hover preview as the
 * cloud shell's — one store, one display mapping, no local-only copy.
 *
 * Why a module-level store rather than per-hook state (OPEND-2795 /
 * OPEND-2762): the rail's 最近项目 rows and the workspace tab switcher each
 * used to keep their own copy, polling their own id set from a blank start.
 * Two copies meant two answers for one project (the rail had spent a ✓ the
 * switcher still drew), and a surface that remounted — Home, after leaving a
 * project — painted its rows first and their statuses a round trip later.
 * Here every surface subscribes to one cache: a project asked for by two
 * surfaces costs one request, a remount reads the last known answer in its
 * first render (and revalidates), and the one display mapping —
 * `displayStatusForSummary`, ✓-spending included — applies everywhere.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ProjectDisplayStatus, WorkspaceCollabContext } from '@open-design/contracts';
import { listRunsForProject, RUNS_CHANGED_EVENT } from '../providers/daemon';
import {
  displayStatusForSummary,
  foldRunsToProjectRunSummaries,
  readStoredAcknowledgedRuns,
  writeStoredAcknowledgedRuns,
  type AcknowledgedRuns,
  type ProjectRunSummary,
} from '../state/projectRunStatus';

/**
 * Backstop only — `RUNS_CHANGED_EVENT` is what makes a change this client
 * caused feel immediate; the poll catches runs started elsewhere (the CLI,
 * another window). One timer for every subscribed surface together.
 */
const POLL_MS = 4000;

const EMPTY_SUMMARIES: ReadonlyMap<string, ProjectRunSummary> = new Map();
const EMPTY_STATUSES: ReadonlyMap<string, ProjectDisplayStatus> = new Map();

export interface UseProjectRunStatusesOptions {
  enabled?: boolean;
  workspaceContext?: WorkspaceCollabContext | null;
}

interface Subscription {
  ids: readonly string[];
  /** Read at request time: the context object is rebuilt on unrelated renders. */
  contextRef: { readonly current: WorkspaceCollabContext | null };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Last known summary per project. `null` records an answer of "no runs", so a
 * project asked about and found quiet is not re-treated as unknown. Absent
 * means never answered. A failed read never writes here: it says nothing about
 * the project, and blanking the row would flash the default mark and back.
 */
const summaries = new Map<string, ProjectRunSummary | null>();
let acknowledged: AcknowledgedRuns | null = null;
const subscriptions = new Set<Subscription>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
/** Bumped by a reset so a read started before it cannot land afterwards. */
let generation = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let listeningForRunsChanged = false;

function acknowledgedRuns(): AcknowledgedRuns {
  if (acknowledged === null) acknowledged = readStoredAcknowledgedRuns();
  return acknowledged;
}

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribeToStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion(): number {
  return version;
}

function sameSummary(a: ProjectRunSummary | null | undefined, b: ProjectRunSummary | null): boolean {
  if (!a || !b) return (a ?? null) === b;
  return a.status === b.status
    && a.latestTerminalRunId === b.latestTerminalRunId
    && a.latestTerminalUpdatedAt === b.latestTerminalUpdatedAt;
}

async function readProject(projectId: string, context: WorkspaceCollabContext | null): Promise<void> {
  const startedIn = generation;
  const result = await listRunsForProject(projectId, context);
  if (startedIn !== generation) return;
  // An unreadable project yields null; keeping whatever was known leaves the
  // row as it was rather than asserting a status nobody verified.
  if (!result) return;
  const next = foldRunsToProjectRunSummaries(result.runs, result.awaitingInputProjectIds)
    .get(projectId) ?? null;
  const previous = summaries.get(projectId);
  summaries.set(projectId, next);
  // Nothing drawn changes between "unknown" and "no runs", so no re-render.
  if (previous === undefined && next === null) return;
  if (!sameSummary(previous, next)) emit();
}

/** Ask about each id not already being asked about. Answers land as they come. */
function refresh(ids: Iterable<string>, contextFor: (projectId: string) => WorkspaceCollabContext | null): void {
  for (const projectId of ids) {
    if (inFlight.has(projectId)) continue;
    inFlight.add(projectId);
    void readProject(projectId, contextFor(projectId)).finally(() => {
      inFlight.delete(projectId);
    });
  }
}

function contextForSubscribed(projectId: string): WorkspaceCollabContext | null {
  for (const subscription of subscriptions) {
    if (subscription.ids.includes(projectId)) return subscription.contextRef.current;
  }
  return null;
}

/** Every subscribed surface's ids together, each once. */
function refreshAll(): void {
  const union = new Set<string>();
  for (const subscription of subscriptions) {
    for (const projectId of subscription.ids) union.add(projectId);
  }
  refresh(union, contextForSubscribed);
}

function startFeed(): void {
  if (typeof window === 'undefined') return;
  if (pollTimer === null) pollTimer = setInterval(refreshAll, POLL_MS);
  if (!listeningForRunsChanged) {
    window.addEventListener(RUNS_CHANGED_EVENT, refreshAll);
    listeningForRunsChanged = true;
  }
}

function stopFeed(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (listeningForRunsChanged) {
    window.removeEventListener(RUNS_CHANGED_EVENT, refreshAll);
    listeningForRunsChanged = false;
  }
}

function addSubscription(subscription: Subscription): void {
  subscriptions.add(subscription);
  // Always revalidate on subscribe — a surface that comes back shows its last
  // known answer at once and catches up on whatever moved meanwhile — but
  // never blank: the cache is only ever replaced, not cleared.
  refresh(subscription.ids, () => subscription.contextRef.current);
  startFeed();
}

function removeSubscription(subscription: Subscription): void {
  subscriptions.delete(subscription);
  if (subscriptions.size === 0) stopFeed();
}

/**
 * Opening a project is what spends its ✓ (per product). Recorded once, for the
 * finished run currently shown, and announced to every surface at once — the
 * rail and the tab switcher drop the mark in the same moment (OPEND-2795).
 * A project whose live status is not `succeeded` has nothing to spend.
 */
export function acknowledgeProjectCompletion(projectId: string): void {
  const summary = summaries.get(projectId);
  if (!summary || summary.status !== 'succeeded' || !summary.latestTerminalRunId) return;
  const runId = summary.latestTerminalRunId;
  const current = acknowledgedRuns();
  if (current[projectId] === runId) return;
  acknowledged = { ...current, [projectId]: runId };
  writeStoredAcknowledgedRuns(acknowledged);
  emit();
}

/**
 * Forget every cached status, acknowledgement and in-flight read. Test seam,
 * following `resetCoalescedGet`: the cache is module-level on purpose (it must
 * survive a surface remount), so a test boundary has to clear it explicitly.
 */
export function resetProjectRunStatusStore(): void {
  generation += 1;
  summaries.clear();
  acknowledged = null;
  inFlight.clear();
  subscriptions.clear();
  stopFeed();
  version += 1;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Live `Map<projectId, ProjectRunSummary>`: the status plus the newest
 * finished run's identity, for a consumer that needs the run behind a ✓.
 * Glyph surfaces want {@link useProjectRunStatuses} instead.
 */
export function useProjectRunSummaries(
  projectIds: readonly string[],
  options?: UseProjectRunStatusesOptions,
): ReadonlyMap<string, ProjectRunSummary> {
  const enabled = options?.enabled ?? true;
  // One subscription per id set, so the effect must not re-run just because
  // the caller rebuilt the array. Sorted + joined is the identity that matters.
  const idsKey = useMemo(() => [...projectIds].sort().join(' '), [projectIds]);
  const contextRef = useRef<WorkspaceCollabContext | null>(options?.workspaceContext ?? null);
  contextRef.current = options?.workspaceContext ?? null;
  const storeVersion = useSyncExternalStore(subscribeToStore, getVersion, getVersion);

  useEffect(() => {
    if (!enabled || !idsKey) return undefined;
    const subscription: Subscription = { ids: idsKey.split(' '), contextRef };
    addSubscription(subscription);
    return () => removeSubscription(subscription);
  }, [idsKey, enabled]);

  return useMemo(() => {
    if (!enabled || !idsKey) return EMPTY_SUMMARIES;
    const result = new Map<string, ProjectRunSummary>();
    for (const projectId of idsKey.split(' ')) {
      const summary = summaries.get(projectId);
      if (summary) result.set(projectId, summary);
    }
    return result;
    // storeVersion is the cache's change counter: the map is rebuilt when it
    // moves, and only then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, enabled, storeVersion]);
}

/**
 * Live `Map<projectId, ProjectDisplayStatus>` — what a glyph surface should
 * DRAW per project, the one display mapping every surface shares
 * (`displayStatusForSummary`). A project absent from the map shows its default
 * mark: unknown, quiet, or a ✓ the user has already spent.
 */
export function useProjectRunStatuses(
  projectIds: readonly string[],
  options?: UseProjectRunStatusesOptions,
): ReadonlyMap<string, ProjectDisplayStatus> {
  const runSummaries = useProjectRunSummaries(projectIds, options);
  return useMemo(() => {
    if (runSummaries.size === 0) return EMPTY_STATUSES;
    const seen = acknowledgedRuns();
    const statuses = new Map<string, ProjectDisplayStatus>();
    for (const [projectId, summary] of runSummaries) {
      const status = displayStatusForSummary(projectId, summary, seen);
      if (status) statuses.set(projectId, status);
    }
    return statuses;
  }, [runSummaries]);
}
