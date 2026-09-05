// Parse-only validation for the canonical Web deliverable. These DTOs are
// shared by the run-scoped HTTP tool, CLI/MCP wrappers, run status, and SSE so
// evaluators do not have to infer the repair lifecycle from daemon internals.

export const DELIVERABLE_SYNTAX_TOOL_SCHEMA =
  'open-design.deliverable-syntax-tool/v1' as const;
export const DELIVERABLE_SYNTAX_REPAIR_SCHEMA =
  'open-design.deliverable-syntax-repair/v1' as const;
export const DELIVERABLE_SYNTAX_METRICS_SCHEMA =
  'open-design.deliverable-syntax-metrics/v1' as const;
export const DELIVERABLE_SYNTAX_CHECKER = 'web-syntax@1' as const;

export type DeliverableSyntaxChecker = typeof DELIVERABLE_SYNTAX_CHECKER;

export const DELIVERABLE_SYNTAX_SAFE_FIX_RULES = [
  'insert_missing_closing_delimiter',
  'close_unterminated_block_comment',
  'close_unterminated_string',
  'close_unterminated_template',
] as const;

export type DeliverableSyntaxSafeFixRule =
  typeof DELIVERABLE_SYNTAX_SAFE_FIX_RULES[number];

/**
 * Low-cardinality, content-free measurements accumulated across checker calls
 * in one physical Run. Diagnostic text and file paths deliberately stay out
 * of this projection so it is safe to export as telemetry.
 */
export interface DeliverableSyntaxMetrics {
  schema: typeof DELIVERABLE_SYNTAX_METRICS_SCHEMA;
  checkCount: number;
  checkerDurationMs: number;
  repairableCheckCount: number;
  initialDiagnosticCount: number;
  latestDiagnosticCount: number;
  /** Wall-clock instant when this Run first observed a repairable candidate. */
  firstRepairableAtMs?: number;
  /** Wall-clock instant when the first later check passed. */
  repairPassedAtMs?: number;
  /** Time from the first repairable result to the first later passing result. */
  repairWindowDurationMs?: number;
  /** Time from the first repairable result to the physical Run terminal. */
  repairToDeliveryDurationMs?: number;
  /** Executor that performed the bounded repair, when one was attempted. */
  repairExecutor?: 'agent' | 'host_safe_fixer';
  /** Time spent applying deterministic file patches, excluding parser time. */
  repairDurationMs?: number;
  /** Fixed-cardinality rules that produced at least one accepted patch. */
  appliedRepairRules?: DeliverableSyntaxSafeFixRule[];
}

export interface DeliverableSyntaxDiagnostic {
  code: string;
  file: string;
  line: number | null;
  column: number | null;
  message: string;
  source: 'file' | 'html' | 'inline_script';
}

/** Persisted host-owned state. `attempt` counts accepted repair patches. */
export interface DeliverableSyntaxRepairState {
  schema: typeof DELIVERABLE_SYNTAX_REPAIR_SCHEMA;
  mode?: 'agent_tool' | 'host_safe_fixer';
  attempt: number;
  maxAttempts: number;
  checker: DeliverableSyntaxChecker;
  candidateHash: string;
}

export type DeliverableSyntaxRepairDirective =
  | { action: 'none'; attempt: number; maxAttempts: number }
  | { action: 'repair'; attempt: number; maxAttempts: number }
  | {
      action: 'stop';
      attempt: number;
      maxAttempts: number;
      reason: 'attempt_limit_reached' | 'no_progress';
    };

interface DeliverableSyntaxCheckBase {
  checker: DeliverableSyntaxChecker;
  candidateHash: string | null;
  checkedFiles: string[];
  diagnostics: DeliverableSyntaxDiagnostic[];
}

export type DeliverableSyntaxIncompleteReason =
  | 'checker_error'
  | 'file_unreadable'
  | 'limit_exceeded'
  | 'path_outside_project';

export type DeliverableSyntaxCheckResult =
  | (DeliverableSyntaxCheckBase & {
      status: 'skipped';
      reason: 'non_web_deliverable';
      candidateHash: null;
    })
  | (DeliverableSyntaxCheckBase & {
      status: 'pass';
      candidateHash: string;
    })
  | (DeliverableSyntaxCheckBase & {
      status: 'repairable';
      candidateHash: string;
    })
  | (DeliverableSyntaxCheckBase & {
      status: 'incomplete';
      reason: DeliverableSyntaxIncompleteReason;
      candidateHash: string;
    });

type NoRepairDirective = Extract<
  DeliverableSyntaxRepairDirective,
  { action: 'none' }
>;
type RepairDirective = Extract<
  DeliverableSyntaxRepairDirective,
  { action: 'repair' }
>;
type StopRepairDirective = Extract<
  DeliverableSyntaxRepairDirective,
  { action: 'stop' }
>;

export type DeliverableSyntaxCanonicalReason = `canonical_${
  | 'not_succeeded'
  | 'no_artifact'
  | 'project_missing'
  | 'entry_missing'
  | 'entry_not_touched'
  | 'entry_unreadable'
  | 'type_mismatch'}`;

type DeliverableSyntaxToolEnvelope = {
  schema: typeof DELIVERABLE_SYNTAX_TOOL_SCHEMA;
};

/** Response returned by POST /api/tools/deliverable-syntax/check. */
export type DeliverableSyntaxToolResponse = DeliverableSyntaxToolEnvelope & (
  | (Extract<DeliverableSyntaxCheckResult, { status: 'skipped' | 'pass' | 'incomplete' }> & {
      repair: NoRepairDirective;
    })
  | (Extract<DeliverableSyntaxCheckResult, { status: 'repairable' }> & {
      repair: RepairDirective;
      /** Narrow instruction for the active Agent turn. */
      agentMessage: string;
    })
  | (Omit<Extract<DeliverableSyntaxCheckResult, { status: 'repairable' }>, 'status'> & {
      status: 'exhausted';
      repair: StopRepairDirective;
    })
  | {
      status: 'incomplete';
      reason: DeliverableSyntaxCanonicalReason;
      checker: null;
      candidateHash: null;
      checkedFiles: [];
      diagnostics: [];
      repair: NoRepairDirective;
    }
);

/** Durable evidence exposed by run status and the terminal SSE frame. */
export type DeliverableSyntaxValidationEvidence =
  | (DeliverableSyntaxToolResponse & {
      source: 'agent_tool';
      checkedAt: number;
      metrics?: DeliverableSyntaxMetrics;
    })
  | (DeliverableSyntaxToolEnvelope & DeliverableSyntaxCheckResult & {
      source: 'run_finalizer';
      checkedAt: number;
      repairState?: DeliverableSyntaxRepairState;
      metrics?: DeliverableSyntaxMetrics;
    })
  | (DeliverableSyntaxToolEnvelope & {
      status: 'incomplete';
      reason: 'process_tree_not_quiescent';
      source: 'run_finalizer';
      checkedAt: number;
      repairState?: DeliverableSyntaxRepairState;
      metrics?: DeliverableSyntaxMetrics;
    });

export type DeliverableSyntaxToolCliSuccess = {
  ok: true;
} & DeliverableSyntaxToolResponse;

export interface DeliverableSyntaxToolCliFailure {
  ok: false;
  status?: number;
  error: {
    code?: string;
    message: string;
    details?: unknown;
  };
}

export type DeliverableSyntaxToolCliEnvelope =
  | DeliverableSyntaxToolCliSuccess
  | DeliverableSyntaxToolCliFailure;
