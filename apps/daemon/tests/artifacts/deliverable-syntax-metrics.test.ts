import { describe, expect, it } from 'vitest';

import {
  recordDeliverableSyntaxCheck,
  recordDeliverableSyntaxDelivery,
} from '../../src/artifacts/deliverable-syntax-metrics.js';

const repairable = {
  status: 'repairable' as const,
  checker: 'web-syntax@1' as const,
  candidateHash: 'broken',
  checkedFiles: ['index.html'],
  diagnostics: [{
    code: 'JS_PARSE_ERROR',
    file: 'index.html',
    line: 1,
    column: 1,
    message: 'not exported',
    source: 'inline_script' as const,
  }],
};

const pass = {
  status: 'pass' as const,
  checker: 'web-syntax@1' as const,
  candidateHash: 'fixed',
  checkedFiles: ['index.html'],
  diagnostics: [],
};

describe('deliverable syntax timing metrics', () => {
  it('records the first repairable-to-pass window without moving its endpoints', () => {
    const first = recordDeliverableSyntaxCheck({
      result: repairable,
      durationMs: 4,
      checkedAtMs: 1_000,
    });
    const second = recordDeliverableSyntaxCheck({
      previous: first,
      result: repairable,
      durationMs: 5,
      checkedAtMs: 1_200,
    });
    const passed = recordDeliverableSyntaxCheck({
      previous: second,
      result: pass,
      durationMs: 6,
      checkedAtMs: 1_650,
    });
    const checkedAgain = recordDeliverableSyntaxCheck({
      previous: passed,
      result: pass,
      durationMs: 7,
      checkedAtMs: 1_900,
    });

    expect(checkedAgain).toMatchObject({
      firstRepairableAtMs: 1_000,
      repairPassedAtMs: 1_650,
      repairWindowDurationMs: 650,
      checkCount: 4,
      checkerDurationMs: 22,
    });
  });

  it('records repair-to-delivery for repaired and exhausted Runs only', () => {
    const started = recordDeliverableSyntaxCheck({
      result: repairable,
      durationMs: 4,
      checkedAtMs: 2_000,
    });
    expect(recordDeliverableSyntaxDelivery({
      previous: started,
      terminalAtMs: 2_900,
    })).toMatchObject({
      repairToDeliveryDurationMs: 900,
    });

    const neverTriggered = recordDeliverableSyntaxCheck({
      result: pass,
      durationMs: 2,
      checkedAtMs: 3_000,
    });
    expect(recordDeliverableSyntaxDelivery({
      previous: neverTriggered,
      terminalAtMs: 3_100,
    }).repairToDeliveryDurationMs).toBeUndefined();
  });
});
