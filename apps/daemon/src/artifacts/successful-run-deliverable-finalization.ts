import type {
  DeliverableSyntaxMetrics,
  DeliverableSyntaxRepairState,
  ProjectMetadata,
} from '@open-design/contracts';

import { resolveProjectDir } from '../projects.js';
import {
  validateRunDeliverable,
  type RunDeliverableValidationResult,
} from '../run-deliverable-validation.js';
import {
  finalizeDeliverableSyntax,
  type DeliverableSyntaxFinalizationOutcome,
} from './deliverable-syntax-finalization.js';

export interface SuccessfulRunDeliverableFinalizationResult {
  deliverable: RunDeliverableValidationResult;
  syntax: DeliverableSyntaxFinalizationOutcome;
}

export function deliverableSyntaxFinalizerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.OD_DELIVERABLE_SYNTAX_FINALIZER?.trim().toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'no' && value !== 'off';
}

/**
 * Resolve the canonical output and run the syntax finalizer for every
 * successful physical Run. Strategy protocol state is intentionally absent
 * from this boundary: a complete HTML artifact is sufficient evidence.
 */
export async function finalizeSuccessfulRunDeliverable(input: {
  artifactCount: number;
  previousMetrics?: DeliverableSyntaxMetrics;
  processTreeQuiescent: boolean;
  projectId: string | null;
  projectMetadata?: Partial<ProjectMetadata> | Record<string, unknown> | null;
  projectsRoot: string;
  relatedPaths?: readonly string[];
  repairState?: DeliverableSyntaxRepairState;
  touchedPaths?: string[];
  syntaxFinalizerEnabled?: boolean;
}): Promise<SuccessfulRunDeliverableFinalizationResult> {
  const deliverable = await validateRunDeliverable({
    projectsRoot: input.projectsRoot,
    projectId: input.projectId,
    ...(input.projectMetadata !== undefined
      ? { projectMetadata: input.projectMetadata }
      : {}),
    runStatus: 'succeeded',
    artifactCount: input.artifactCount,
    ...(input.touchedPaths ? { touchedPaths: input.touchedPaths } : {}),
  });
  if (
    !deliverable.valid
    || !input.projectId
    || input.syntaxFinalizerEnabled === false
  ) {
    return { deliverable, syntax: { action: 'skip' } };
  }

  const syntax = await finalizeDeliverableSyntax({
    artifactKind: deliverable.artifactKind,
    projectRoot: resolveProjectDir(
      input.projectsRoot,
      input.projectId,
      input.projectMetadata,
    ),
    entryFile: deliverable.entryFile,
    relatedPaths: input.relatedPaths ?? [],
    processTreeQuiescent: input.processTreeQuiescent,
    ...(input.repairState ? { repairState: input.repairState } : {}),
    ...(input.previousMetrics ? { previousMetrics: input.previousMetrics } : {}),
  });
  return { deliverable, syntax };
}
