import {
  DELIVERABLE_SYNTAX_TOOL_SCHEMA,
  type DeliverableSyntaxMetrics,
  type DeliverableSyntaxRepairState,
  type DeliverableSyntaxValidationEvidence,
} from '@open-design/contracts';
import { performance } from 'node:perf_hooks';

import { checkDeliverableSyntax } from './deliverable-syntax.js';
import {
  recordDeliverableSyntaxCheck,
  recordDeliverableSyntaxSafeFix,
} from './deliverable-syntax-metrics.js';
import {
  DEFAULT_DELIVERABLE_SYNTAX_REPAIR_MAX_ATTEMPTS,
  decideDeliverableSyntaxRepair,
} from './deliverable-syntax-repair.js';
import { applyDeliverableSyntaxSafeFix } from './deliverable-syntax-safe-fix.js';

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
      reason: 'attempt_limit_reached' | 'no_progress' | 'no_safe_fix';
    };

/**
 * OD Next terminal syntax gate. It never executes the artifact or starts a
 * model turn; it checks, applies only whitelisted deterministic patches, and
 * verifies each patch before terminal success may be published.
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
  /** Test seam for repair-window wall-clock timestamps. */
  wallNow?: () => number;
}): Promise<DeliverableSyntaxFinalizationOutcome> {
  if (input.artifactKind !== 'html' || !input.entryFile) {
    return { action: 'skip' };
  }

  const checkedAt = input.checkedAt ?? input.wallNow?.() ?? Date.now();
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

  let metrics = input.previousMetrics;
  let repairState = input.repairState;
  let checkIndex = 0;
  while (true) {
    const currentCheckedAt = checkIndex === 0
      ? checkedAt
      : input.wallNow?.() ?? Date.now();
    checkIndex += 1;
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
    metrics = recordDeliverableSyntaxCheck({
      ...(metrics ? { previous: metrics } : {}),
      result: syntax,
      durationMs: checkerDurationMs,
      checkedAtMs: currentCheckedAt,
    });
    const validation: DeliverableSyntaxValidationEvidence = {
      schema: DELIVERABLE_SYNTAX_TOOL_SCHEMA,
      ...syntax,
      source: 'run_finalizer',
      checkedAt: currentCheckedAt,
      ...(repairState ? { repairState } : {}),
      metrics,
    };
    if (syntax.status !== 'repairable') {
      return { action: 'allow', validation };
    }

    const first = syntax.diagnostics[0];
    const location = first
      ? `${first.file}:${first.line ?? '?'}:${first.column ?? '?'}`
      : input.entryFile;
    const decision = decideDeliverableSyntaxRepair({
      result: syntax,
      previous: repairState,
      maxAttempts: DEFAULT_DELIVERABLE_SYNTAX_REPAIR_MAX_ATTEMPTS,
    });
    if (decision.action === 'block') {
      return { action: 'fail', validation, location, reason: decision.reason };
    }
    if (decision.action !== 'retry') {
      throw new TypeError('Repairable syntax result produced an invalid accept decision.');
    }

    const repairStartedAt = input.monotonicNow?.() ?? performance.now();
    const repair = await applyDeliverableSyntaxSafeFix({
      projectRoot: input.projectRoot,
      result: syntax,
    });
    const repairDurationMs = Math.max(
      0,
      (input.monotonicNow?.() ?? performance.now()) - repairStartedAt,
    );
    if (repair.action !== 'applied') {
      return { action: 'fail', validation, location, reason: 'no_safe_fix' };
    }
    repairState = {
      ...decision.next,
      mode: 'host_safe_fixer',
    };
    metrics = recordDeliverableSyntaxSafeFix({
      previous: metrics,
      durationMs: repairDurationMs,
      rule: repair.rule,
    });
  }
}
