import type { DeliverableSyntaxMetrics, DeliverableSyntaxRepairState, ProjectMetadata } from '@open-design/contracts';
import { resolveProjectDir } from '../projects.js';
import { validateRunDeliverable, type RunDeliverableValidationResult } from '../run-deliverable-validation.js';
import { finalizeDeliverableSyntax, DeliverableSyntaxInternalError, type DeliverableSyntaxFinalizationOutcome } from './deliverable-syntax-finalization.js';

export interface PrototypeFinalizerInput {
  artifactCount: number; processTreeQuiescent: boolean; projectId: string | null; projectsRoot: string;
  projectMetadata?: Partial<ProjectMetadata> | Record<string, unknown> | null;
  previousMetrics?: DeliverableSyntaxMetrics; repairState?: DeliverableSyntaxRepairState;
  relatedPaths?: readonly string[]; touchedPaths?: string[]; baselineEntryFile?: string;
  syntaxFinalizerEnabled?: boolean;
  deadlineAtMs?: number;
}
export interface PrototypeFinalizerResult {
  deliverable: RunDeliverableValidationResult; syntax: DeliverableSyntaxFinalizationOutcome;
}
/** Run the existing canonical resolver and guarded syntax fixer within the worker. */
export async function collectPrototypeFinalizer(input: PrototypeFinalizerInput): Promise<PrototypeFinalizerResult> {
  const deliverable = await validateRunDeliverable({
    projectsRoot: input.projectsRoot, projectId: input.projectId, runStatus: 'succeeded', artifactCount: input.artifactCount,
    ...(input.projectMetadata !== undefined ? { projectMetadata: input.projectMetadata } : {}),
    ...(input.touchedPaths ? { touchedPaths: input.touchedPaths } : {}),
    ...(input.baselineEntryFile ? { baselineEntryFile: input.baselineEntryFile } : {}),
  });
  if (!deliverable.valid || !input.projectId || input.syntaxFinalizerEnabled === false) return { deliverable, syntax: { action: 'skip' } };
  try {
    return { deliverable, syntax: await finalizeDeliverableSyntax({
      artifactKind: deliverable.artifactKind,
      projectRoot: resolveProjectDir(input.projectsRoot, input.projectId, input.projectMetadata),
      entryFile: deliverable.linkedPage ?? deliverable.entryFile,
      relatedPaths: input.relatedPaths ?? [], processTreeQuiescent: input.processTreeQuiescent,
      ...(input.previousMetrics ? { previousMetrics: input.previousMetrics } : {}),
      ...(input.repairState ? { repairState: input.repairState } : {}),
      commitSynchronously: true,
      ...(input.deadlineAtMs !== undefined ? { commitDeadlineAtMs: input.deadlineAtMs } : {}),
    }) };
  } catch (error) {
    if (!(error instanceof DeliverableSyntaxInternalError)) throw error;
    return { deliverable, syntax: error.outcome };
  }
}
