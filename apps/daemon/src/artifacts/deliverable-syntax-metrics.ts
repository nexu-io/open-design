import {
  DELIVERABLE_SYNTAX_METRICS_SCHEMA,
  type DeliverableSyntaxCheckResult,
  type DeliverableSyntaxMetrics,
} from '@open-design/contracts';

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

/** Add one actual parser invocation to the persisted per-Run aggregate. */
export function recordDeliverableSyntaxCheck(input: {
  previous?: DeliverableSyntaxMetrics;
  result: DeliverableSyntaxCheckResult;
  durationMs: number;
}): DeliverableSyntaxMetrics {
  const previous = input.previous;
  const diagnosticCount = input.result.diagnostics.length;
  const repairable = input.result.status === 'repairable';
  return {
    schema: DELIVERABLE_SYNTAX_METRICS_SCHEMA,
    checkCount: (previous?.checkCount ?? 0) + 1,
    checkerDurationMs:
      finiteNonNegative(previous?.checkerDurationMs)
      + finiteNonNegative(input.durationMs),
    repairableCheckCount: (previous?.repairableCheckCount ?? 0) + (repairable ? 1 : 0),
    initialDiagnosticCount:
      previous && previous.repairableCheckCount > 0
        ? previous.initialDiagnosticCount
        : repairable
          ? diagnosticCount
          : 0,
    latestDiagnosticCount: diagnosticCount,
  };
}
