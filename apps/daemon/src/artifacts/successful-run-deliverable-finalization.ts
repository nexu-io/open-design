import { DELIVERABLE_QUALITY_SCHEMA, DELIVERABLE_QUALITY_CHECKER } from '@open-design/contracts';
import type {
  DeliverableQualityEvidence,
  DeliverableSyntaxMetrics,
  DeliverableSyntaxRepairState,
  ProjectMetadata,
} from '@open-design/contracts';

import { checkPrototypeQuality, PROTOTYPE_HOST_BUDGET_MS } from './prototype-quality.js';

import { runPrototypeFinalizer } from './prototype-quality-static-service.js';

import { resolveProjectDir } from '../projects.js';
import {
  validateRunDeliverable,
  type RunDeliverableValidationResult,
} from '../run-deliverable-validation.js';
import {
  finalizeDeliverableSyntax,
  DeliverableSyntaxInternalError,
  type DeliverableSyntaxFinalizationOutcome,
} from './deliverable-syntax-finalization.js';

export interface SuccessfulRunDeliverableFinalizationResult {
  deliverable: RunDeliverableValidationResult;
  syntax: DeliverableSyntaxFinalizationOutcome;
  quality?: DeliverableQualityEvidence;
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
  baselineEntryFile?: string;
  syntaxFinalizerEnabled?: boolean;
  prototypeQuality?: { userBrief: string; remainingBudgetMs?: number; signal?: AbortSignal };
}): Promise<SuccessfulRunDeliverableFinalizationResult> {
  const startedAt = performance.now();
  const deadlineAtMs = Date.now() + Math.max(0, input.prototypeQuality?.remainingBudgetMs ?? PROTOTYPE_HOST_BUDGET_MS);
  let deliverable: RunDeliverableValidationResult;
  let workerSyntax: DeliverableSyntaxFinalizationOutcome | undefined;
  if (input.prototypeQuality) {
    try {
      const { prototypeQuality: _quality, ...workerInput } = input;
      const settled = await runPrototypeFinalizer({ ...workerInput, deadlineAtMs,
        ...(input.prototypeQuality.signal ? { signal: input.prototypeQuality.signal } : {}) });
      deliverable = settled.deliverable;
      workerSyntax = settled.syntax;
    } catch (error) {
      const reason = error instanceof Error && ['canceled', 'host_budget_exhausted'].includes(error.message)
        ? error.message : 'finalization_incomplete';
      return { deliverable: { valid: false, validation: 'validation_incomplete' }, syntax: { action: 'skip' },
        quality: { schema: DELIVERABLE_QUALITY_SCHEMA, checker: DELIVERABLE_QUALITY_CHECKER,
          status: 'incomplete', candidateHash: '', entryFile: '', checkedAt: Date.now(),
          durationMs: Math.max(0, performance.now() - startedAt),
          coverage: { expected: 0, checked: 0, complete: false },
          checks: [{ id: 'settled-candidate', kind: 'static', status: 'incomplete', reason }],
        } };
    }
  } else {
    deliverable = await validateRunDeliverable({
      projectsRoot: input.projectsRoot,
      projectId: input.projectId,
      ...(input.projectMetadata !== undefined
        ? { projectMetadata: input.projectMetadata }
        : {}),
      runStatus: 'succeeded',
      artifactCount: input.artifactCount,
      ...(input.touchedPaths ? { touchedPaths: input.touchedPaths } : {}),
      ...(input.baselineEntryFile ? { baselineEntryFile: input.baselineEntryFile } : {}),
    });
  }
  if (
    !deliverable.valid
    || !input.projectId
  ) {
    const quality: DeliverableQualityEvidence | undefined = input.prototypeQuality ? {
      schema: DELIVERABLE_QUALITY_SCHEMA, checker: DELIVERABLE_QUALITY_CHECKER,
      status: deliverable.validation === 'entry_not_touched' ? 'incomplete' : 'fail',
      candidateHash: '', entryFile: deliverable.entryFile ?? '', checkedAt: Date.now(),
      durationMs: Math.max(0, performance.now() - startedAt),
      coverage: { expected: 0, checked: 0, complete: false },
      checks: [{ id: 'canonical-entry', kind: 'static',
        status: deliverable.validation === 'entry_not_touched' ? 'incomplete' : 'fail',
        reason: deliverable.validation }],
    } : undefined;
    return { deliverable, syntax: { action: 'skip' }, ...(quality ? { quality } : {}) };
  }

  const syntaxInput = {
    artifactKind: deliverable.artifactKind,
    projectRoot: resolveProjectDir(
      input.projectsRoot,
      input.projectId,
      input.projectMetadata,
    ),
    entryFile: deliverable.linkedPage ?? deliverable.entryFile,
    relatedPaths: input.relatedPaths ?? [],
    processTreeQuiescent: input.processTreeQuiescent,
    ...(input.repairState ? { repairState: input.repairState } : {}),
    ...(input.previousMetrics ? { previousMetrics: input.previousMetrics } : {}),
  };
  let syntax: DeliverableSyntaxFinalizationOutcome;
  try {
    syntax = workerSyntax ?? (input.syntaxFinalizerEnabled === false
      ? { action: 'skip' }
      : await finalizeDeliverableSyntax(syntaxInput));
  } catch (error) {
    if (!(error instanceof DeliverableSyntaxInternalError)) throw error;
    // The product's non-blocking delivery policy must not hide an engine defect.
    // Never log the cause: it may contain generated source or local paths.
    console.error('[deliverable-syntax] internal_error');
    syntax = error.outcome;
  }
  if (input.prototypeQuality && !input.processTreeQuiescent) {
    return { deliverable, syntax, quality: { schema: DELIVERABLE_QUALITY_SCHEMA,
      checker: DELIVERABLE_QUALITY_CHECKER, status: 'incomplete', candidateHash: '',
      entryFile: syntaxInput.entryFile ?? '', checkedAt: Date.now(), durationMs: Math.max(0, performance.now() - startedAt),
      coverage: { expected: 1, checked: 0, complete: false },
      checks: [{ id: 'settled-candidate', kind: 'static', status: 'incomplete', reason: 'process_tree_not_quiescent' }],
    } };
  }
  const quality = input.prototypeQuality && deliverable.artifactKind === 'html'
    ? await checkPrototypeQuality({
        projectRoot: syntaxInput.projectRoot,
        entryFile: syntaxInput.entryFile ?? 'index.html',
        userBrief: input.prototypeQuality.userBrief,
        relatedPaths: input.relatedPaths ?? [],
        remainingBudgetMs: Math.max(0, deadlineAtMs - Date.now()),
        ...(input.prototypeQuality.signal ? { signal: input.prototypeQuality.signal } : {}),
      })
    : undefined;
  if (quality) {
    quality.durationMs = Math.max(0, performance.now() - startedAt);
    if (syntax.action !== 'skip' && syntax.validation.finalization?.initialStatus === 'repairable') quality.initialStatus = 'fail';
  }
  return { deliverable, syntax, ...(quality ? { quality } : {}) };
}
