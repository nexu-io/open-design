import {
  DELIVERABLE_SYNTAX_REPAIR_SCHEMA,
  type DeliverableSyntaxRepairState as ContractDeliverableSyntaxRepairState,
} from '@open-design/contracts';
import type { DeliverableSyntaxResult } from './deliverable-syntax.js';

export const DEFAULT_DELIVERABLE_SYNTAX_REPAIR_MAX_ATTEMPTS = 3;

export type DeliverableSyntaxRepairState = ContractDeliverableSyntaxRepairState;

export type DeliverableSyntaxRepairDecision =
  | { action: 'accept'; next: DeliverableSyntaxRepairState | undefined }
  | { action: 'retry'; next: DeliverableSyntaxRepairState }
  | {
      action: 'block';
      next: DeliverableSyntaxRepairState | undefined;
      reason: 'attempt_limit_reached' | 'no_progress';
    };

function normalizedMaxAttempts(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_DELIVERABLE_SYNTAX_REPAIR_MAX_ATTEMPTS;
  }
  return value;
}

/**
 * Decide the host-owned repair loop without spending a retry for a passing,
 * skipped, or inconclusive check. `attempt` counts accepted repair patches,
 * not validator executions: the initial validation is attempt zero.
 */
export function decideDeliverableSyntaxRepair(input: {
  result: DeliverableSyntaxResult;
  previous: DeliverableSyntaxRepairState | undefined;
  maxAttempts?: number;
}): DeliverableSyntaxRepairDecision {
  if (input.result.status !== 'repairable') {
    return { action: 'accept', next: input.previous };
  }

  const maxAttempts = normalizedMaxAttempts(
    input.maxAttempts ?? DEFAULT_DELIVERABLE_SYNTAX_REPAIR_MAX_ATTEMPTS,
  );
  if (
    input.previous
    && input.previous.checker === input.result.checker
    && input.previous.candidateHash === input.result.candidateHash
  ) {
    return { action: 'block', next: input.previous, reason: 'no_progress' };
  }
  const completedAttempts = input.previous?.attempt ?? 0;
  if (completedAttempts >= maxAttempts) {
    return {
      action: 'block',
      next: input.previous,
      reason: 'attempt_limit_reached',
    };
  }

  return {
    action: 'retry',
    next: {
      schema: DELIVERABLE_SYNTAX_REPAIR_SCHEMA,
      attempt: completedAttempts + 1,
      maxAttempts,
      checker: input.result.checker,
      candidateHash: input.result.candidateHash,
    },
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Render only the host-confirmed syntax facts; never replay the whole file. */
export function renderDeliverableSyntaxRepairPrompt(input: {
  result: Extract<DeliverableSyntaxResult, { status: 'repairable' }>;
  attempt: number;
  maxAttempts: number;
}): string {
  const diagnostics = input.result.diagnostics
    .map((diagnostic) => (
      `- ${diagnostic.file}:${diagnostic.line ?? '?'}:${diagnostic.column ?? '?'} `
      + `[${diagnostic.source}] ${diagnostic.message}`
    ))
    .join('\n');
  return [
    `<open_design_deliverable_syntax_repair schema="v1" attempt="${input.attempt}" max_attempts="${input.maxAttempts}">`,
    'The host syntax validator found a parse error in the final Web deliverable.',
    'Fix only the diagnosed syntax error in the existing deliverable. Do not redesign, rewrite unrelated content, or create a second deliverable.',
    'Do not perform a self-review, inspect unrelated files, or run manual checks, tests, node --check, or custom validation scripts.',
    'After that single edit, invoke the designated deliverable-syntax wrapper exactly once. If it passes, stop immediately.',
    '',
    escapeXml(diagnostics),
    '</open_design_deliverable_syntax_repair>',
  ].join('\n');
}
