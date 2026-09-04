import {
  DELIVERABLE_SYNTAX_TOOL_SCHEMA,
  type DeliverableSyntaxMetrics,
  type DeliverableSyntaxRepairState,
  type DeliverableSyntaxValidationEvidence,
} from '@open-design/contracts';
import { performance } from 'node:perf_hooks';

import { checkDeliverableSyntax } from './deliverable-syntax.js';
import { recordDeliverableSyntaxCheck } from './deliverable-syntax-metrics.js';

export type DeliverableSyntaxFinalizationOutcome =
  | { action: 'skip' }
  | {
      action: 'allow';
      validation: DeliverableSyntaxValidationEvidence;
    }
  | {
      action: 'fail';
      validation: DeliverableSyntaxValidationEvidence;
      location: string;
    };

/**
 * Read-only OD Next terminal backstop. It never executes the artifact and it
 * does not start a repair turn; it only decides whether terminal success may
 * be published after the bounded in-turn loop has ended.
 */
export async function finalizeDeliverableSyntax(input: {
  artifactKind: string | null | undefined;
  projectRoot: string;
  entryFile: string | null | undefined;
  relatedPaths?: readonly string[];
  processTreeQuiescent: boolean;
  repairState?: DeliverableSyntaxRepairState;
  previousMetrics?: DeliverableSyntaxMetrics;
  checkedAt?: number;
  /** Test seam for measuring parser wall time without changing checkedAt. */
  monotonicNow?: () => number;
}): Promise<DeliverableSyntaxFinalizationOutcome> {
  if (input.artifactKind !== 'html' || !input.entryFile) {
    return { action: 'skip' };
  }

  const checkedAt = input.checkedAt ?? Date.now();
  if (!input.processTreeQuiescent) {
    return {
      action: 'allow',
      validation: {
        schema: DELIVERABLE_SYNTAX_TOOL_SCHEMA,
        status: 'incomplete',
        reason: 'process_tree_not_quiescent',
        source: 'run_finalizer',
        checkedAt,
        ...(input.repairState ? { repairState: input.repairState } : {}),
        ...(input.previousMetrics ? { metrics: input.previousMetrics } : {}),
      },
    };
  }

  const checkerStartedAt = input.monotonicNow?.() ?? performance.now();
  const syntax = await checkDeliverableSyntax({
    projectRoot: input.projectRoot,
    entryFile: input.entryFile,
    relatedPaths: input.relatedPaths ?? [],
  });
  const checkerDurationMs = Math.max(
    0,
    (input.monotonicNow?.() ?? performance.now()) - checkerStartedAt,
  );
  const validation: DeliverableSyntaxValidationEvidence = {
    schema: DELIVERABLE_SYNTAX_TOOL_SCHEMA,
    ...syntax,
    source: 'run_finalizer',
    checkedAt,
    ...(input.repairState ? { repairState: input.repairState } : {}),
    metrics: recordDeliverableSyntaxCheck({
      ...(input.previousMetrics ? { previous: input.previousMetrics } : {}),
      result: syntax,
      durationMs: checkerDurationMs,
      checkedAtMs: checkedAt,
    }),
  };
  if (syntax.status !== 'repairable') {
    return { action: 'allow', validation };
  }

  const first = syntax.diagnostics[0];
  return {
    action: 'fail',
    validation,
    location: first
      ? `${first.file}:${first.line ?? '?'}:${first.column ?? '?'}`
      : input.entryFile,
  };
}
