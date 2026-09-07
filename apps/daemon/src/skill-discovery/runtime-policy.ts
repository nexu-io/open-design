import {
  isSkillDiscoveryWrapperBlocked,
  renderSkillDiscoveryLifecycleCapsule,
  type SkillDiscoveryState,
} from './state.js';

const ALLOWED_BEFORE_RESOLUTION = new Set([
  'connectors:list',
  'design-systems:read',
  'library:search',
  'live-artifacts:list',
  'skills:deactivate',
  'skills:load',
  'skills:resolve',
  'skills:search',
  'skills:status',
]);

/**
 * The daemon can enforce discovery ordering only for its run-scoped wrapper
 * capabilities. While discovery is unresolved, only explicitly reviewed
 * read/discovery operations are allowed; unknown future operations fail
 * closed. Native Agent filesystem and shell tools remain outside this boundary;
 * this module neither blocks nor observes those native operations.
 */
export function skillDiscoveryBlocksToolOperation(
  state: Pick<SkillDiscoveryState, 'status'> | null | undefined,
  operation: string,
): boolean {
  return isSkillDiscoveryWrapperBlocked(state)
    && !ALLOWED_BEFORE_RESOLUTION.has(operation);
}

/** Fail closed when a wrapper grant no longer owns the persisted active run. */
export function scopeSkillDiscoveryStateForRun(
  state: SkillDiscoveryState | null | undefined,
  scope: { runId: string; projectId: string },
): SkillDiscoveryState | { status: 'pending' } {
  if (
    !state
    || state.activeRunId !== scope.runId
    || state.projectId !== scope.projectId
  ) {
    return { status: 'pending' };
  }
  return state;
}

export type SkillDiscoveryLifecyclePrompt =
  | { discoveryBootstrapMarkdown: string }
  | { compactLifecycleCapsuleMarkdown: string }
  | Record<string, never>;

/**
 * `isResuming` is the only host-provided continuity signal available here. A
 * first physical discovery attempt still gets the full bootstrap, durable
 * state capsule, and catalog, even when an earlier non-discovery turn created
 * a resumable native session.
 * Later resumed attempts add no lifecycle text unless the catalog revision
 * changed; a revision change refreshes both the full policy and catalog. Cold
 * retries and later Runs receive the compact durable state capsule plus the
 * complete candidate metadata catalog. This does not claim that the host can
 * detect native context compaction.
 */
export function resolveSkillDiscoveryLifecyclePrompt(input: {
  state: SkillDiscoveryState | null | undefined;
  runId: string;
  bootstrapMarkdown: string;
  catalogMarkdown: string;
  catalogRevisionChanged?: boolean;
  isResuming: boolean;
  retryAttemptCount?: number | null;
  manualResumeAttemptCount?: number | null;
}): SkillDiscoveryLifecyclePrompt {
  if (!input.state) return {};
  const isFirstPhysicalAttempt = input.state.bootstrapRunId === input.runId
    && (input.retryAttemptCount ?? 0) === 0
    && (input.manualResumeAttemptCount ?? 0) === 0;
  if (input.isResuming && !isFirstPhysicalAttempt && input.catalogRevisionChanged !== true) {
    return {};
  }
  const catalog = input.catalogMarkdown.trim();
  if (!catalog) throw new TypeError('Skill discovery catalog metadata must not be empty.');
  if (isFirstPhysicalAttempt || input.catalogRevisionChanged === true) {
    const bootstrap = input.bootstrapMarkdown.trim();
    if (!bootstrap) throw new TypeError('Skill discovery bootstrap must not be empty.');
    return {
      discoveryBootstrapMarkdown: [
        bootstrap,
        renderSkillDiscoveryLifecycleCapsule(input.state),
        catalog,
      ].join('\n\n---\n\n'),
    };
  }
  return {
    compactLifecycleCapsuleMarkdown: [
      renderSkillDiscoveryLifecycleCapsule(input.state),
      catalog,
    ].join('\n\n---\n\n'),
  };
}
