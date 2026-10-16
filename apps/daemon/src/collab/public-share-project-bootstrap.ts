import type { ApiFailureReason, PublicShareProjectRegistration, TeamProject } from '@open-design/contracts';
import { isUnmaterializedSharedPlaceholder } from './shared-project-placeholder.js';
import type { runVelaCommand } from '../integrations/vela-command.js';
import type { ResourceHubPrincipal } from './resource-principal.js';
import { ensurePrivateVelaTeamProject } from './vela-cli-team-projects.js';
import { classifyVelaCommandFailure, type PublicShareBootstrapStage } from './public-file-failure.js';

class PublicShareProjectBootstrapError extends Error {
  constructor(readonly stage: PublicShareBootstrapStage, readonly failure: { reason: ApiFailureReason; upstreamStatus?: number }) {
    super('PUBLIC_SHARE_PROJECT_BOOTSTRAP_FAILED');
  }
}

/** Emit only bounded stage/reason tokens; arbitrary child errors never cross the logging boundary. */
export function publicShareProjectBootstrapDiagnostic(error: unknown) {
  return error instanceof PublicShareProjectBootstrapError
    ? { stage: error.stage, failure: error.failure }
    : { stage: 'bootstrap' as const, failure: { reason: 'unknown' as const } };
}

/** Establish creator identity without uploading local metadata or root bytes.
 * Existing team policy and the server-generated root are never replaced. */
export async function ensurePublicShareProject(input: {
  projectId: string;
  principal: ResourceHubPrincipal;
  run: typeof runVelaCommand;
  describeProject(projectId: string): Record<string, unknown> | null;
  retainRoot?(registration: PublicShareProjectRegistration): void;
}): Promise<TeamProject & Omit<PublicShareProjectRegistration, 'createdAt'>> {
  const { projectId, principal, run } = input;
  let stage: PublicShareBootstrapStage = 'bootstrap_content_preflight';
  try {
    const metadata = input.describeProject(projectId);
    if (!metadata || isUnmaterializedSharedPlaceholder({ metadata: metadata.metadata })) {
      throw new PublicShareProjectBootstrapError(stage, { reason: 'local_file' });
    }
    stage = 'bootstrap_catalog_upsert';
    const registered = await ensurePrivateVelaTeamProject(projectId, principal, run);
    input.retainRoot?.(registered);
    return { ...registered, createdAt: Date.parse(registered.createdAt), sharedAt: registered.createdAt };
  } catch (error) {
    if (error instanceof PublicShareProjectBootstrapError) throw error;
    const { reason, upstreamStatus } = classifyVelaCommandFailure('push', error);
    throw new PublicShareProjectBootstrapError(stage, { reason, ...(upstreamStatus !== undefined ? { upstreamStatus } : {}) });
  }
}
