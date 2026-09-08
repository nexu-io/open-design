import { describe, expect, it } from 'vitest';

import { SafeDeliverableSyntaxTelemetryV1Schema } from '../src/observability/normalized-agent-observation-v1.js';

const legacy = {
  schemaVersion: 'deliverable-syntax-telemetry-v1', applicable: true,
  status: 'pass', source: 'run_finalizer', checker: 'web-syntax@1',
  checkedFileCount: 1, checkCount: 2, checkerDurationMs: 8,
  repairWindowDurationMs: 20, repairToDeliveryDurationMs: 30,
  repairableCheckCount: 1, initialDiagnosticCount: 1, latestDiagnosticCount: 0,
  repairTriggered: true, repairAttempts: 1, maxRepairAttempts: 8,
  repairOutcome: 'unresolved', recoveredDeliveryCount: 0, blockedBrokenDeliveryCount: 0,
};

const finalization = {
  action: 'allow', summaryVersion: 1, initialStatus: 'repairable',
  repairEngine: 'host-safe-fixer@2', stagedPatchCount: 6, committedPatchCount: 6,
  committedRepairRules: ['normalize_mismatched_string_quote', 'normalize_html_attribute_quotes'],
};

describe('content-free syntax terminal summary', () => {
  it('accepts legacy evidence without inventing missing summary fields', () => {
    const parsed = SafeDeliverableSyntaxTelemetryV1Schema.parse(legacy);
    expect(parsed).not.toHaveProperty('finalization');
    expect(parsed).not.toHaveProperty('terminalRunStatus');
  });

  it('accepts the additive commit summary, proposal timing and terminal alias', () => {
    expect(SafeDeliverableSyntaxTelemetryV1Schema.parse({
      ...legacy, finalization, terminalRunStatus: 'succeeded',
      repairToTerminalDurationMs: 30, safeFixProposalCount: 6, safeFixProposalDurationMs: 14,
    })).toMatchObject({ finalization, safeFixProposalCount: 6, repairToTerminalDurationMs: 30 });
  });

  it.each([
    { source: '<script>private</script>' },
    { path: '/private/index.html' },
    { committedRepairRules: ['arbitrary-code-or-path'] },
    { committedPatchCount: -1 },
    { reason: 'diagnostic text' },
    { repairEngine: 'unbounded-agent' },
  ])('rejects unsafe or out-of-contract summary values: %j', (extra) => {
    expect(SafeDeliverableSyntaxTelemetryV1Schema.safeParse({
      ...legacy, finalization: { ...finalization, ...extra },
    }).success).toBe(false);
  });
});
