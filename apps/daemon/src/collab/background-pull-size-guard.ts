// Size guardrail for BACKGROUND shared-project content pulls (issue #6518,
// incident #6512): when a teammate publishes a project version, every member
// daemon proactively materializes the whole tree — hub push lane and catch-up
// sweep lane alike — with no upper bound. One 7442-file project put its full
// tree on every workspace member's disk. This guard sits in front of the
// background lanes only (`assessBackgroundContentPull` in
// proactive-content-pull.ts): it reads the version's manifest entry count
// through an authorize-only Vela probe — BEFORE any blob download — and
// defers versions above the threshold to the foreground open-project lane,
// which never consults it.
//
// Fail-closed direction (deliberately inverted relative to the other collab
// guards): "closed" here is PULL AS BEFORE. Deferring is the new behavior, so
// every uncertain answer — probe capability missing (old packaged CLI), no
// count in the output (old server), probe transport failure — degrades to the
// pre-guard pull. A project must never be left permanently unmaterialized
// because the CLI shipped inside an older client.
//
// Dedup model (mirrors the in-memory cursor/cooldown conventions of
// proactive-content-pull.ts): one probe per exact scope + version. A deferred
// version is remembered per scope, so repeated sweep rounds never re-issue
// the authorize call against the cloud; only a NEWER version re-probes. The
// marker never needs explicit retirement: once the foreground lane
// materializes the version, the durable cursor satisfies later background
// rounds before this guard is even consulted.

import type { AuthorizedTeamProjectPullInspection } from './authorized-team-project-pull.js';

export const DEFAULT_BACKGROUND_PULL_MAX_ENTRIES = 2000;
export const BACKGROUND_PULL_MAX_ENTRIES_ENV =
  'OD_COLLAB_BACKGROUND_PULL_MAX_ENTRIES';

/**
 * Threshold resolution: a non-negative integer from
 * `OD_COLLAB_BACKGROUND_PULL_MAX_ENTRIES`; `0` disables the guard entirely
 * (every background pull proceeds, probe never runs); anything invalid falls
 * back to the default so a typo can never silently disable the guardrail.
 */
export function backgroundPullMaxEntriesFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[BACKGROUND_PULL_MAX_ENTRIES_ENV]?.trim();
  if (!raw || !/^\d+$/u.test(raw)) return DEFAULT_BACKGROUND_PULL_MAX_ENTRIES;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_BACKGROUND_PULL_MAX_ENTRIES;
}

export interface BackgroundPullSizeGuardScope {
  projectId: string;
  workspaceId: string;
  resourceTeamId: string;
  viewerMemberId: string;
  ownerMemberId: string;
}

export interface BackgroundPullSizeGuardDeps {
  /** Entries above this count defer; `0` disables the guard. */
  maxEntries: number;
  /** Authorize-only manifest probe — must never download blobs. */
  inspect: (
    scope: BackgroundPullSizeGuardScope,
    version: number,
  ) => Promise<AuthorizedTeamProjectPullInspection>;
  /** Secret-free observation of a deferral decision. */
  onDeferred?: (info: {
    projectId: string;
    workspaceId: string;
    version: number;
    entryCount: number;
    maxEntries: number;
  }) => void;
  onError?: (error: unknown) => void;
}

export interface BackgroundPullSizeGuard {
  /**
   * Decide whether the background lane may materialize this exact
   * scope + version. 'defer' leaves content to the foreground lane; every
   * uncertainty resolves to 'pull' (the pre-guard status quo).
   */
  assess(
    scope: BackgroundPullSizeGuardScope,
    version: number,
  ): Promise<'pull' | 'defer'>;
}

export function createBackgroundPullSizeGuard(
  deps: BackgroundPullSizeGuardDeps,
): BackgroundPullSizeGuard {
  /** Exact resource scope — the same tuple proactive-content-pull keys its
   *  cursors by. Two scopes may never share a decision. */
  const scopeKey = (scope: BackgroundPullSizeGuardScope) =>
    JSON.stringify([
      scope.projectId,
      scope.workspaceId,
      scope.resourceTeamId,
      scope.viewerMemberId,
      scope.ownerMemberId,
    ]);
  /** Highest version deferred per scope. Same or older versions re-defer
   *  WITHOUT a probe; a newer version gets a fresh count. */
  const deferredVersions = new Map<string, number>();
  /** Exact version whose probe last said 'pull', per scope. Retry loops for
   *  the same version must not re-authorize against the cloud. */
  const allowedVersions = new Map<string, number>();
  /** Once the CLI proves it lacks the probe, stop probing for this daemon's
   *  lifetime — every decision is 'pull' (status quo) from then on. */
  let probeUnavailable = false;
  /** Concurrent lanes assessing the same scope+version share one probe. */
  const probesInFlight = new Map<string, Promise<'pull' | 'defer'>>();

  const decide = async (
    scope: BackgroundPullSizeGuardScope,
    key: string,
    version: number,
  ): Promise<'pull' | 'defer'> => {
    let inspection: AuthorizedTeamProjectPullInspection;
    try {
      inspection = await deps.inspect(scope, version);
    } catch (error) {
      // Transient probe failure: fail open into the pull and do NOT cache,
      // so the next round may still discover an oversized version.
      deps.onError?.(error);
      return 'pull';
    }
    if (inspection.kind === 'unavailable') {
      probeUnavailable = true;
      return 'pull';
    }
    if (inspection.kind === 'uncounted') {
      allowedVersions.set(key, version);
      return 'pull';
    }
    if (inspection.entryCount > deps.maxEntries) {
      const previous = deferredVersions.get(key);
      if (previous == null || version > previous) {
        deferredVersions.set(key, version);
      }
      try {
        deps.onDeferred?.({
          projectId: scope.projectId,
          workspaceId: scope.workspaceId,
          version,
          entryCount: inspection.entryCount,
          maxEntries: deps.maxEntries,
        });
      } catch {
        // Observation must never affect the decision.
      }
      return 'defer';
    }
    allowedVersions.set(key, version);
    return 'pull';
  };

  return {
    async assess(scope, version) {
      if (
        deps.maxEntries <= 0 ||
        probeUnavailable ||
        !Number.isSafeInteger(version) ||
        version < 0
      ) {
        return 'pull';
      }
      const key = scopeKey(scope);
      const deferred = deferredVersions.get(key);
      if (deferred != null && version <= deferred) return 'defer';
      if (allowedVersions.get(key) === version) return 'pull';
      const probeKey = `${key}#${version}`;
      const existing = probesInFlight.get(probeKey);
      if (existing) return existing;
      const probe = decide(scope, key, version);
      probesInFlight.set(probeKey, probe);
      const clear = () => {
        if (probesInFlight.get(probeKey) === probe) {
          probesInFlight.delete(probeKey);
        }
      };
      void probe.then(clear, clear);
      return probe;
    },
  };
}
