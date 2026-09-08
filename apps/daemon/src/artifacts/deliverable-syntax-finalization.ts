import {
  DELIVERABLE_SYNTAX_TOOL_SCHEMA,
  type DeliverableSyntaxMetrics,
  type DeliverableSyntaxRepairState,
  type DeliverableSyntaxValidationEvidence,
  type DeliverableSyntaxFinalizationReason,
  type DeliverableSyntaxSafeFixRefusal,
  type DeliverableSyntaxFinalization,
  type DeliverableSyntaxSafeFixRule,
} from '@open-design/contracts';
import { performance } from 'node:perf_hooks';

import { checkDeliverableSyntax } from './deliverable-syntax.js';
import {
  recordDeliverableSyntaxCheck,
  recordDeliverableSyntaxSafeFix,
} from './deliverable-syntax-metrics.js';
import {
  decideDeliverableSyntaxRepair,
} from './deliverable-syntax-repair.js';
import {
  commitDeliverableSyntaxSafeFix,
  type DeliverableSyntaxSafeFixPatch,
  proposeDeliverableSyntaxSafeFix,
} from './deliverable-syntax-safe-fix.js';

// Program-only budgets. The Agent tool's separate three-turn limit is unchanged.
export const HOST_SYNTAX_MAX_PATCHES = 8;
export const HOST_SYNTAX_MAX_EDITED_CHARACTERS = 32;
export const HOST_SYNTAX_REPAIR_BUDGET_MS = 1000;

type HostSummary = Required<Pick<DeliverableSyntaxFinalization,
  'summaryVersion' | 'initialStatus' | 'repairEngine' | 'stagedPatchCount'
  | 'committedPatchCount' | 'committedRepairRules'>>;

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
      reason: DeliverableSyntaxFinalizationReason;
      refusal?: DeliverableSyntaxSafeFixRefusal;
    };

/**
 * Host-owned terminal syntax gate. It never executes the artifact or starts a
 * model turn. Patches stay in memory until the complete candidate parses, then
 * a guarded atomic replacement publishes the verified bytes.
 */
async function finalizeCandidate(input: {
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
}, summary: HostSummary): Promise<DeliverableSyntaxFinalizationOutcome> {
  if (input.artifactKind !== 'html' || !input.entryFile) {
    return { action: 'skip' };
  }

  const checkedAt = input.checkedAt ?? input.wallNow?.() ?? Date.now();
  if (!input.processTreeQuiescent) {
    return {
      action: 'fail',
      reason: 'check_incomplete',
      location: input.entryFile,
      validation: {
        schema: DELIVERABLE_SYNTAX_TOOL_SCHEMA,
        status: 'incomplete',
        reason: 'process_tree_not_quiescent',
        source: 'run_finalizer',
        checkedAt,
        ...(input.previousMetrics ? { metrics: input.previousMetrics } : {}),
      },
    };
  }

  let metrics = input.previousMetrics;
  // The Agent-tool budget/hash belongs to a different executor. Even an
  // exhausted Agent candidate receives this independent program-only budget.
  let repairState: DeliverableSyntaxRepairState | undefined;
  let stagedPatch: DeliverableSyntaxSafeFixPatch | undefined;
  const stagedRules = new Set<DeliverableSyntaxSafeFixRule>();
  const contentOverrides = new Map<string, string>();
  let checkIndex = 0;
  let repairBudgetStartedAt: number | undefined;
  let editedCharacters = 0;

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
      ...(contentOverrides.size > 0 ? { contentOverrides } : {}),
    });
    const checkerFinishedAt = input.monotonicNow?.() ?? performance.now();
    if (checkIndex === 1) summary.initialStatus = syntax.status;
    const checkerDurationMs = Math.max(0, checkerFinishedAt - checkerStartedAt);
    metrics = recordDeliverableSyntaxCheck({
      ...(metrics ? { previous: metrics } : {}),
      result: syntax,
      durationMs: checkerDurationMs,
      checkedAtMs: currentCheckedAt,
    });
    let validation: DeliverableSyntaxValidationEvidence = {
      schema: DELIVERABLE_SYNTAX_TOOL_SCHEMA,
      ...syntax,
      source: 'run_finalizer',
      checkedAt: currentCheckedAt,
      ...(repairState ? { repairState } : {}),
      metrics,
    };

    // Cooperative stop points, not preemption of synchronous parsers or fsync.
    // Normal checks without repair do not acquire this repair-only deadline.
    if (repairBudgetStartedAt !== undefined
      && checkerFinishedAt - repairBudgetStartedAt >= HOST_SYNTAX_REPAIR_BUDGET_MS) {
      return { action: 'fail', validation, location: input.entryFile, reason: 'repair_budget_exceeded' };
    }

    if (syntax.status !== 'repairable') {
      if (syntax.status === 'incomplete') {
        return { action: 'fail', validation, location: input.entryFile, reason: 'check_incomplete' };
      }
      if (!stagedPatch) return { action: 'allow', validation };
      if (syntax.status !== 'pass') {
        return {
          action: 'fail',
          validation,
          location: stagedPatch.file,
          reason: 'verification_failed',
        };
      }
      const commitStartedAt = input.monotonicNow?.() ?? performance.now();
      const committed = await commitDeliverableSyntaxSafeFix(stagedPatch);
      const commitDurationMs = Math.max(
        0,
        (input.monotonicNow?.() ?? performance.now()) - commitStartedAt,
      );
      metrics = recordDeliverableSyntaxSafeFix({
        previous: metrics,
        durationMs: commitDurationMs,
        rule: stagedPatch.rule,
      });
      validation = { ...validation, metrics };
      if (committed.action === 'committed') {
        summary.committedPatchCount = summary.stagedPatchCount;
        summary.committedRepairRules = [...stagedRules];
        return { action: 'allow', validation };
      }
      return {
        action: 'fail',
        validation,
        location: stagedPatch.file,
        reason: committed.reason === 'concurrent_modification'
          ? 'commit_conflict'
          : 'commit_failed',
      };
    }

    const first = syntax.diagnostics[0];
    repairBudgetStartedAt ??= checkerFinishedAt;
    const location = first
      ? `${first.file}:${first.line ?? '?'}:${first.column ?? '?'}`
      : input.entryFile;
    const decision = decideDeliverableSyntaxRepair({
      result: syntax,
      previous: repairState,
      maxAttempts: HOST_SYNTAX_MAX_PATCHES,
    });
    if (decision.action === 'block') {
      return { action: 'fail', validation, location, reason: decision.reason };
    }
    if (decision.action !== 'retry') {
      throw new TypeError('Repairable syntax result produced an invalid accept decision.');
    }

    const repairStartedAt = input.monotonicNow?.() ?? performance.now();
    const proposal = await proposeDeliverableSyntaxSafeFix({
      projectRoot: input.projectRoot,
      result: syntax,
      ...(stagedPatch ? { previousPatch: stagedPatch } : {}),
      ...(contentOverrides.size > 0 ? { contentOverrides } : {}),
    });
    const repairDurationMs = Math.max(
      0,
      (input.monotonicNow?.() ?? performance.now()) - repairStartedAt,
    );
    metrics = {
      ...metrics,
      safeFixProposalCount: (metrics.safeFixProposalCount ?? 0) + 1,
      safeFixProposalDurationMs: (metrics.safeFixProposalDurationMs ?? 0) + repairDurationMs,
    };
    validation = { ...validation, metrics };
    if ((input.monotonicNow?.() ?? performance.now()) - repairBudgetStartedAt >= HOST_SYNTAX_REPAIR_BUDGET_MS) {
      return { action: 'fail', validation, location, reason: 'repair_budget_exceeded' };
    }
    if (proposal.action !== 'proposed') {
      return { action: 'fail', validation, location, reason: 'no_safe_fix', refusal: proposal.reason };
    }
    if (stagedPatch && stagedPatch.file !== proposal.patch.file) {
      return { action: 'fail', validation, location, reason: 'no_safe_fix', refusal: 'multiple_files' };
    }
    editedCharacters += proposal.patch.editCount;
    if (editedCharacters > HOST_SYNTAX_MAX_EDITED_CHARACTERS) {
      return { action: 'fail', validation, location, reason: 'repair_budget_exceeded' };
    }
    stagedPatch = {
      ...proposal.patch,
      expectedDiskContent:
        stagedPatch?.expectedDiskContent ?? proposal.patch.expectedDiskContent,
    };
    contentOverrides.set(stagedPatch.file, stagedPatch.content);
    summary.stagedPatchCount += 1;
    stagedRules.add(stagedPatch.rule);
    repairState = {
      ...decision.next,
      mode: 'host_safe_fixer',
    };
    metrics = recordDeliverableSyntaxSafeFix({
      previous: metrics,
      durationMs: repairDurationMs,
      rule: stagedPatch.rule,
    });
  }
}

export async function finalizeDeliverableSyntax(
  input: Parameters<typeof finalizeCandidate>[0],
): Promise<DeliverableSyntaxFinalizationOutcome> {
  const summary: HostSummary = {
    summaryVersion: 1, initialStatus: 'incomplete', repairEngine: 'host-safe-fixer@2',
    stagedPatchCount: 0, committedPatchCount: 0, committedRepairRules: [],
  };
  const result = await finalizeCandidate(input, summary);
  if (result.action === 'skip') return result;
  return {
    ...result,
    validation: {
      ...result.validation,
      finalization: result.action === 'fail'
        ? { ...summary, action: 'fail', reason: result.reason, ...(result.refusal ? { refusal: result.refusal } : {}) }
        : { ...summary, action: 'allow' },
    },
  };
}
