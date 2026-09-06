import {
  DELIVERABLE_SYNTAX_METRICS_SCHEMA,
  type DeliverableSyntaxCheckResult,
  type DeliverableSyntaxMetrics,
  type DeliverableSyntaxSafeFixRule,
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
  checkedAtMs: number;
}): DeliverableSyntaxMetrics {
  const previous = input.previous;
  const diagnosticCount = input.result.diagnostics.length;
  const repairable = input.result.status === 'repairable';
  const firstRepairableAtMs = previous?.firstRepairableAtMs
    ?? (repairable ? finiteNonNegative(input.checkedAtMs) : undefined);
  const repairPassedAtMs = previous?.repairPassedAtMs
    ?? (
      input.result.status === 'pass' && firstRepairableAtMs !== undefined
        ? finiteNonNegative(input.checkedAtMs)
        : undefined
    );
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
    ...(firstRepairableAtMs !== undefined ? { firstRepairableAtMs } : {}),
    ...(repairPassedAtMs !== undefined ? { repairPassedAtMs } : {}),
    ...(firstRepairableAtMs !== undefined && repairPassedAtMs !== undefined
      ? {
          repairWindowDurationMs: Math.max(
            0,
            repairPassedAtMs - firstRepairableAtMs,
          ),
        }
      : {}),
    ...(previous?.repairToDeliveryDurationMs !== undefined
      ? { repairToDeliveryDurationMs: previous.repairToDeliveryDurationMs }
      : {}),
    ...(previous?.repairExecutor ? { repairExecutor: previous.repairExecutor } : {}),
    ...(previous?.repairDurationMs !== undefined
      ? { repairDurationMs: previous.repairDurationMs }
      : {}),
    ...(previous?.appliedRepairRules
      ? { appliedRepairRules: previous.appliedRepairRules }
      : {}),
  };
}

/** Add one staged deterministic patch to the persisted per-Run aggregate. */
export function recordDeliverableSyntaxSafeFix(input: {
  previous: DeliverableSyntaxMetrics;
  durationMs: number;
  rule: DeliverableSyntaxSafeFixRule;
}): DeliverableSyntaxMetrics {
  return {
    ...input.previous,
    repairExecutor: 'host_safe_fixer',
    repairDurationMs:
      finiteNonNegative(input.previous.repairDurationMs)
      + finiteNonNegative(input.durationMs),
    appliedRepairRules: [...new Set([
      ...(input.previous.appliedRepairRules ?? []),
      input.rule,
    ])],
  };
}

/** Freeze the repair-to-terminal window at the physical Run terminal boundary. */
export function recordDeliverableSyntaxDelivery(input: {
  previous: DeliverableSyntaxMetrics;
  terminalAtMs: number;
}): DeliverableSyntaxMetrics {
  const firstRepairableAtMs = input.previous.firstRepairableAtMs;
  if (firstRepairableAtMs === undefined) return input.previous;
  return {
    ...input.previous,
    repairToDeliveryDurationMs: Math.max(
      0,
      finiteNonNegative(input.terminalAtMs) - firstRepairableAtMs,
    ),
  };
}
